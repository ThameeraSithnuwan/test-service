
import 'reflect-metadata';
import { Body, Controller, Delete, Get, Header, InternalServerError, JsonController, NotFoundError, Param, Params, Post, Put, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';
import { AppDataSource } from '../configs/ormconfig';
import { ClusterEntity } from '../entities/cluster.entity';
import fs from 'fs';

import logger from '../../common/services/loggerService';
import { GenerateTokenForCluster, SaveClusterKey } from '../services/secretService';
import { EncryptDecryptService } from '../../common/services/encryptDecryptService';
import { ClusterIdVerifyMiddleware } from '../middlewares/clusterIdVerifyMiddleware';
import configData from '../configs/config';
import connectTemplate from '../configs/connectTemplate';
import { Cluster } from 'ioredis';
import { GetAgentConfigurationYaml } from './connectController';
import { AgentRequestResponse, ApplyResourceRequest, PluginRequestCommand } from '../../common/interfaces/events';
import { Events } from '../../common/contstants/events';
import { AgentService } from '../services/agentService';
import { getErrorMessage } from './handleErrors';
import { v4 as uuidv4 } from 'uuid';
import agentVersion from '../configs/agentVersion';
import * as semver from 'semver';
import { ClusterPlugin, ClusterPluginEntity } from '../entities/plugin.entity';
import { CLIBasedPlugins } from '../../common/contstants/plugins';
import { UUID } from 'typeorm/driver/mongodb/bson.typings';



interface ClusterConnectRequest {
    name: string;
    isGlobal: boolean;
    isOrganizationGlobal: boolean;
    aws?: {
        region: string;
        credentialId: string;
    },
    agent?: {
        cpu: string;
        memory: string;
        replicas: number;
    }
    type: string;
    metadata: { [key: string]: any };
    description?: string;
}

interface ClusterEnvRequest {
    addEnvs: { name: string; id: string; }[];
    removeEnvs: { name: string; id: string; }[];
}

interface ClusterPluginResponse {
    plugin: ClusterPluginEntity;
}

interface ClusterResponse {
    cluster: ClusterEntity;
    applyUrl: string;
    shouldAgentUpdate?: boolean;
    latestAgentVersion?: string;
    pluginMetadata?: ClusterPlugin[];
}
@JsonController('/cluster')
export class ClusterController {

    @Post('/')
    async create(@Req() request: Request, @Res() response: Response, @Body() payload: ClusterConnectRequest): Promise<ClusterResponse> {

        const clusterRepository = AppDataSource.getRepository(ClusterEntity)

        const clusterEntity = Object.assign(new ClusterEntity(),
            {
                name: payload.name,
                projectId: request.projectId,
                organizationId: request.organizationId,
                isOrganizationGlobal: !!payload.isOrganizationGlobal,
                isGlobal: !!payload.isGlobal,
                aws: payload.aws,
                agent: {
                    cpu: 400,
                    memory: 800,
                    replicas: 2,
                },
                type: payload.type,
                metadata: payload.metadata || {},
                description: payload.description || '',
                envs: []
            });
        const cluster = await clusterRepository.save(clusterEntity)

        //save cluster key

        const clusterKey = await SaveClusterKey({
            projectId: request.projectId as string,
            organizationId: request.organizationId as string,
            clusterId: cluster.id.toString(),
            value: EncryptDecryptService.generateEncryptionKey(),
            metadata: {}
        }, cluster, clusterRepository, request.traceId as string)


        const jwtKey = await GenerateTokenForCluster(cluster, request.traceId as string)
        const jwtKeyRef = await SaveClusterKey({
            projectId: request.projectId as string,
            organizationId: request.organizationId as string,
            clusterId: cluster.id.toString(),
            value: jwtKey,
            metadata: {}
        }, cluster, clusterRepository, request.traceId as string)

        cluster.clusterSecretKey = clusterKey.data.data;
        cluster.clusterJwtKeyRef = jwtKeyRef.data.data;

        clusterRepository.update(cluster.id, cluster);

        // NOTE: this is now done at env level and not at cluster level
        // RegisterSecretStoreToCluster(cluster.organizationId, cluster.projectId, cluster.id, request.traceId as string)

        logger.info(`Cluster ${cluster.id} created successfully`)

        return { cluster, applyUrl: getApplyUrl(cluster, request.headers['authorization'] as string) };
    }

    @Put('/:id')
    @UseBefore(ClusterIdVerifyMiddleware)
    async update(@Req() request: Request, @Res() response: Response, @Body() payload: ClusterConnectRequest): Promise<ClusterResponse> {

        const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

        const clusterRepository = AppDataSource.getRepository(ClusterEntity)


        cluster.name = payload.name;
        cluster.isOrganizationGlobal = !!payload.isOrganizationGlobal;
        cluster.isGlobal = !!payload.isGlobal;
        cluster.aws = payload.aws;
        cluster.agent = payload.agent;
        cluster.type = payload.type;
        cluster.metadata = payload.metadata || cluster.metadata || {};
        cluster.updatedAt = new Date();
        cluster.description = payload.description || cluster.description || '';

        await clusterRepository.update(cluster.id, cluster);

        logger.info(`Cluster ${cluster.id} updated successfully`)

        // update agent

        const filledTemplate = await GetAgentConfigurationYaml(cluster, request.traceId as string)

        const data: ApplyResourceRequest = {
            data: filledTemplate
        }
        const agentRequest: AgentRequestResponse = {
            clusterId: request.clusterId as string,
            data: data,
            traceId: request.traceId as string,
            event: Events.APPLY_RESOURCE,
            projectId: request.projectId as string,
            organizationId: request.organizationId as string,
            clusterSecretKeyRef: cluster.clusterSecretKey,
            uuid: uuidv4(),
            cacheMetadata: {
                resourceId: cluster.id,
                kind: 'deployment',
                message: `agent version update request to ${agentVersion}`
            }
        }


        try {
            AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
            logger.info(`Agent updated successfully`)
        } catch (error) {
            throw new InternalServerError(getErrorMessage(error, request.traceId as string));
        }


        return { cluster, applyUrl: getApplyUrl(cluster, request.headers['authorization'] as string) };
    }

    @Get('/:id')
    @UseBefore(ClusterIdVerifyMiddleware)
    async getCluster(@Req() request: Request, @Res() response: Response): Promise<ClusterResponse> {


        const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)
        let shouldAgentUpdate = false
        try {
            shouldAgentUpdate = semver.lt(cluster.agentOperatorVersion, agentVersion.trim())
        } catch (error) {
            console.log(error)
        }

        let plugins: ClusterPlugin[] = [];
        try {
            plugins = await getPluginsByClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)
        } catch (error) {
            console.log(error)
        }

        return {
            cluster: cluster as ClusterEntity,
            applyUrl: getApplyUrl(cluster,request.headers['authorization'] as string),
            shouldAgentUpdate: shouldAgentUpdate,
            latestAgentVersion: agentVersion.trim(),
            pluginMetadata: plugins
        };
    }

    @Get('/')
    async get(@Req() request: Request, @Res() response: Response): Promise<any> {

        const clusterRepository = AppDataSource.getRepository(ClusterEntity)

        // findy projectid and organization id or organization id and is global
        const clusters = await clusterRepository.find({ where: [{ projectId: request.projectId, organizationId: request.organizationId }, { organizationId: request.organizationId, isOrganizationGlobal: true }, { isGlobal: true }] })

        return clusters;
    }

    @Delete('/soft')
    async softDelete(@Req() request: Request, @Res() response: Response): Promise<any> {

        const clusterId = request.headers['x-cluster-id']

        const clusterRepository = AppDataSource.getRepository(ClusterEntity)


        const query = clusterRepository
            .createQueryBuilder()
            .softDelete()
            .where('organizationId = :organizationId', { organizationId: request.organizationId });
        if (clusterId) {
            query.andWhere('id = :id', { id: clusterId });
        }
        if (request.projectId) {
            query.andWhere('projectId = :projectId', { projectId: request.projectId });
        }
        const resp = await query.execute();

        return { affected: resp.affected };
    }

    @Delete('/:id')
    @UseBefore(ClusterIdVerifyMiddleware)
    async delete(@Req() request: Request, @Res() response: Response): Promise<any> {

        const clusterRepository = AppDataSource.getRepository(ClusterEntity)

        const cluster = await clusterRepository.findOneBy({ id: request.clusterId, projectId: request.projectId, organizationId: request.organizationId })

        if (!cluster) {
            throw new NotFoundError(`Cluster id ${request.clusterId} not found`)
        }

        await clusterRepository.delete(cluster.id)

        return cluster;
    }

    @Put('/:id/update-agent-version')
    @UseBefore(ClusterIdVerifyMiddleware)
    async updateAgent(@Req() request: Request, @Res() response: Response): Promise<ClusterResponse> {

        const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

        const filledTemplate = await GetAgentConfigurationYaml(cluster, request.traceId as string)

        const data: ApplyResourceRequest = {
            data: filledTemplate
        }
        const agentRequest: AgentRequestResponse = {
            clusterId: request.clusterId as string,
            data: data,
            traceId: request.traceId as string,
            event: Events.APPLY_RESOURCE,
            projectId: request.projectId as string,
            organizationId: request.organizationId as string,
            clusterSecretKeyRef: cluster.clusterSecretKey,
            uuid: uuidv4(),
            cacheMetadata: {
                resourceId: cluster.id,
                kind: 'deployment',
                message: `agent version update request to ${agentVersion}`
            }
        }

        try {
            const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
            logger.info(`Agent updated successfully`)
        } catch (error) {
            throw new InternalServerError(getErrorMessage(error, request.traceId as string));
        }


        return { cluster, applyUrl: getApplyUrl(cluster,request.headers['authorization'] as string) };
    }


    @Put('/:id/update-envs')
    @UseBefore(ClusterIdVerifyMiddleware)
    async updateEnvs(@Req() request: Request, @Res() response: Response, @Body() payload: ClusterEnvRequest): Promise<ClusterResponse> {

        const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

        const clusterRepository = AppDataSource.getRepository(ClusterEntity)

        cluster.updatedAt = new Date();

        cluster.envs = cluster.envs || [];

        let clusterEnvMap: any = {}
        cluster.envs.forEach((env) => {
            clusterEnvMap[env?.id] = env
        })

        if (payload.addEnvs && payload.addEnvs.length > 0) {

            payload.addEnvs.forEach((env) => {
                if (!clusterEnvMap[env.id]) {
                    cluster.envs.push(env)
                }
            })
        }

        if (payload.removeEnvs && payload.removeEnvs.length > 0) {

            payload.removeEnvs.forEach((env) => {
                if (clusterEnvMap[env.id]) {
                    cluster.envs = cluster.envs.filter((e: any) => e.id !== env.id)
                }
            })
        }


        await clusterRepository.update(cluster.id, cluster);

        logger.info(`Cluster ${cluster.id} updated successfully`)


        return { cluster, applyUrl: getApplyUrl(cluster,request.headers['authorization'] as string) };
    }


    @Post('/:id/plugin-metadata')
    async createPlugin(@Req() request: Request, @Res() response: Response, @Body() payload: ClusterPlugin): Promise<ClusterPluginResponse> {

        const pluginRepository = AppDataSource.getRepository(ClusterPluginEntity)

        const pluginEntity = Object.assign(new ClusterPluginEntity(),
            {
                ...payload,
                projectId: request.projectId,
                organizationId: request.organizationId,
                clusterId: request.clusterId,
            });
        const plugin = await pluginRepository.save(pluginEntity)

        logger.info(`Cluster Plugin for ${request.clusterId} created successfully`)

        return { plugin };
    }

    @Put('/:id/plugin-metadata/:pluginId')
    async updatePlugin(@Req() request: Request, @Res() response: Response, @Body() payload: ClusterPlugin, @Param('pluginId') pluginid: string): Promise<ClusterPluginResponse> {

        const pluginRepository = AppDataSource.getRepository(ClusterPluginEntity)
        let plugin = await pluginRepository.findOneBy({ id: pluginid, projectId: request.projectId, organizationId: request.organizationId, clusterId: request.clusterId })

        if (!plugin) {
            throw new NotFoundError(`plugin id ${pluginid} not found`)
        }
        await pluginRepository.update(plugin?.id as string, {
            ...plugin,
            ...payload
        })



        logger.info(`Cluster Plugin for ${request.clusterId} ${plugin?.id} updated successfully`)

        return {
            plugin: {
                ...plugin,
                ...payload
            }
        } as ClusterPluginResponse;
    }

    @Delete('/:id/plugin-metadata/:pluginId')
    @UseBefore(ClusterIdVerifyMiddleware)
    async deletePlugin(@Req() request: Request, @Res() response: Response, @Param('pluginId') pluginid: string): Promise<any> {

        const pluginRepository = AppDataSource.getRepository(ClusterPluginEntity)

        let plugin = await pluginRepository.findOneBy({ id: pluginid, projectId: request.projectId, organizationId: request.organizationId, clusterId: request.clusterId })

        if (!plugin) {
            throw new NotFoundError(`plugin id ${pluginid} not found`)
        }

        await pluginRepository.delete(pluginid)

        return {
            plugin: plugin
        } as ClusterPluginResponse;
    }
}




function getApplyUrl(cluster: ClusterEntity, authHeader: string): string {
    return `curl -s -H 'Authorization': ${authHeader} -H 'x-cluster-id: ${cluster.id.toString()}' -H 'x-project-id: ${cluster.projectId}' -H 'x-organization-id: ${cluster.organizationId}' '${configData.serverUrl}/connect'  | kubectl apply -f -`
}

export async function getClusterById(clusterId: string, projectId: string, organizationId: string): Promise<ClusterEntity> {
    const clusterRepository = AppDataSource.getRepository(ClusterEntity)
    const cluster = await clusterRepository.findOneBy({ id: clusterId, projectId: projectId, organizationId: organizationId })
    if (!cluster) {
        throw new NotFoundError(`Cluster id ${clusterId} not found`)
    }
    return cluster as ClusterEntity
}



export async function getPluginsByClusterById(clusterId: string, projectId: string, organizationId: string): Promise<ClusterPluginEntity[]> {
    const pluginRepository = AppDataSource.getRepository(ClusterPluginEntity)
    const plugins = await pluginRepository.find({ where: [{ projectId: projectId, organizationId: organizationId, clusterId: clusterId }] })

    return plugins
}


