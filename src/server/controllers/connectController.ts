
import 'reflect-metadata';
import { Body, Controller, Delete, Get, Header, JsonController, NotFoundError, Post, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';


import { ClusterIdVerifyMiddleware } from '../middlewares/clusterIdVerifyMiddleware';
import configData from '../configs/config';
import connectTemplate from '../configs/connectTemplate';
import { ClusterSecrets, GetClusterKey } from '../services/secretService';
import { getClusterById } from './clusterController';
import agentVersion from '../configs/agentVersion';
import { ClusterEntity } from '../entities/cluster.entity';
import configOperatorInstallYaml from '../configs/configOperatorInstall';



@Controller('/connect')
export class ConnectController {

    @Get('/')
    @UseBefore(ClusterIdVerifyMiddleware)
    @Header('Content-Type', 'application/x-yaml')
    async connect(@Req() request: Request, @Res() response: Response): Promise<any> {

        const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

        const filledTemplate = await GetAgentConfigurationYaml(cluster, request.traceId as string)
        // return without json
        return filledTemplate
    }

}


export async function GetAgentConfigurationYaml(cluster: ClusterEntity, traceId: string): Promise<string> {
    try {
        const secretKey = await ClusterSecrets.GetSecret(cluster.id as string, cluster.projectId as string, cluster.organizationId as string, cluster.clusterSecretKey, traceId);
        const jwtkey = await GetClusterKey({ key: cluster.clusterJwtKeyRef, clusterId: cluster.id, projectId: cluster.projectId, organizationId: cluster.organizationId }, traceId);

        const operatorYaml = configOperatorInstallYaml

        const filledTemplate = connectTemplate
            .replace(/\$\{\{clusterId\}\}/g, cluster.id as string)
            .replace(/\$\{\{sanitizedClusterId\}\}/g, cluster.id.replace(/_/g, "-") as string)
            .replace(/\$\{\{projectId\}\}/g, cluster.projectId as string)
            .replace(/\$\{\{organizationId\}\}/g, cluster.organizationId as string)
            .replace(/\$\{\{serverUrl\}\}/g, configData.serverUrl)
            .replace(/\$\{\{socketUrl\}\}/g, configData.socketUrl)
            .replace(/\$\{\{agentImage\}\}/g, `${configData.agentRegistryUrl}:${agentVersion.trim()}`)
            .replace(/\$\{\{agentVersion\}\}/g, agentVersion.trim())
            .replace(/\$\{\{agentSecretConfig\}\}/g, GetAgentSecretConfig(jwtkey.data, secretKey)) // todo: get api token
            .replace(/\$\{\{cpu\}\}/g, `${cluster.agent?.cpu}m`)
            .replace(/\$\{\{memory\}\}/g, `${cluster.agent?.memory}Mi`)
            .replace(/\$\{\{replicas\}\}/g, `${cluster.agent?.replicas}`)
            .replace(/\$\{\{apiToken\}\}/g, btoa(jwtkey.data))
            .replace(/\$\{\{clusterType\}\}/g, cluster.type)

        // return without json
return `${operatorYaml}
---
${filledTemplate}`

    } catch (e) {
        console.log(e)
        return `error: ${e}`
    } 

}

function GetAgentSecretConfig(apiToken: string, secretKey: string) {
    return btoa('{ "API_TOKEN":"' + apiToken + '", "SECRET_KEY": "' + secretKey + '"}')
}

