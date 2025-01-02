
import 'reflect-metadata';
import { Body, Controller, Delete, Get, Header, InternalServerError, JsonController, NotFoundError, Post, Put, QueryParams, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';
import { AppDataSource } from '../configs/ormconfig';
import { ClusterEntity } from '../entities/cluster.entity';
import fs from 'fs';

import logger from '../../common/services/loggerService';
import { SaveClusterKey } from '../services/secretService';
import { EncryptDecryptService } from '../../common/services/encryptDecryptService';
import { ClusterIdVerifyMiddleware } from '../middlewares/clusterIdVerifyMiddleware';
import configData from '../configs/config';
import connectTemplate from '../configs/connectTemplate';
import { Cluster } from 'ioredis';
import { GetAgentConfigurationYaml } from './connectController';
import { AgentRequestResponse } from '../../common/interfaces/events';
import { Events } from '../../common/contstants/events';
import { AgentService } from '../services/agentService';
import { getErrorMessage } from './handleErrors';
import { v4 as uuidv4 } from 'uuid';
import { CacheEntity } from '../entities/cache.entity';
import { REDIS_SUBSCRIPTION_TIMEOUT } from '../services/redisService';


@JsonController('/cache')
@UseBefore(ClusterIdVerifyMiddleware)
export class CacheController {


    @Get('/')
    async get(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<any> {

        const cacheRepository = AppDataSource.getRepository(CacheEntity)

        // findy projectid and organization id or organization id and is global
        const cacheItems = await cacheRepository.find({
            where: [{
                projectId: request.projectId,
                organizationId: request.organizationId,
                resourceId: queryParams.resourceId,
                // status: 'error',
                clusterId: request.clusterId
            }]
        })

        return cacheItems;
    }

    @Post('/:id/retry')
    async retry(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<any> {

        const cacheRepository = AppDataSource.getRepository(CacheEntity)

        const cacheItem = await cacheRepository.findOneBy({
            projectId: request.projectId,
            organizationId: request.organizationId,
            resourceId: queryParams.resourceId,
            status: 'error',
            clusterId: request.clusterId,
            id: request.params.id
        })

        if (!cacheItem) {
            throw new NotFoundError(`Cache Entry ${request.params.id} not found`)
        }

        try {
            const res = await AgentService.communicateWithCluster(cacheItem.agentRequestEncrypted, request.traceId as string, REDIS_SUBSCRIPTION_TIMEOUT, true);
            cacheRepository.update(cacheItem.id, { status: 'synced' })
            // cacheRepository.delete(cacheItem.id); // todo: see if this can be avoided and status could be updated instead
            return res;
        } catch (error) {
            throw new InternalServerError(getErrorMessage(error, request.traceId as string));
        }
    }

    @Post('/retry-all')
    async retryAll(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<any> {

        const cacheRepository = AppDataSource.getRepository(CacheEntity)
        const cacheItems = await cacheRepository.find({
            where: [{
                projectId: request.projectId,
                organizationId: request.organizationId,
                status: 'error',
                clusterId: request.clusterId
            }]
        })

        if (!cacheItems) {
            throw new NotFoundError(`Cache Entries for cluster ${request.clusterId} not found`)
        }

        for (const cacheItem of cacheItems) {
            try {
                const res = await AgentService.communicateWithCluster(cacheItem.agentRequestEncrypted, request.traceId as string, REDIS_SUBSCRIPTION_TIMEOUT, true);
                cacheRepository.update(cacheItem.id, { status: 'synced' })
            } catch (error) {
                cacheRepository.update(cacheItem.id, { status: 'error', error: error as string || 'Error communicating with cluster', lastTried: new Date() })
                console.log("Error in retryAll: ", error, JSON.stringify(cacheItem.agentRequestEncrypted, null, 2))
            }
        }

        return cacheItems;
    }
}