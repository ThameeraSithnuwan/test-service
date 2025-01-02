import axios, { AxiosRequestConfig } from "axios";
import { ClusterEntity } from "../entities/cluster.entity";
import configData from "../configs/config";
import { Repository } from "typeorm";
import logger from "../../common/services/loggerService";
import { AgentSecretResolveRequest } from "../../common/interfaces/events";


export interface CreateSecretRequest {
    value: string;
    metadata: any;
    projectId: string;
    organizationId: string;
    clusterId: string;
}

export interface CreateSecretResponse {

    data: {
        success: boolean;
        data: string;
        message: string;
    }

}




export interface GetSecretResponse {
    data: {
        success: boolean;
        data: string;
        message: string;
    }
}

export interface GetAuthTokenResponse {
    data: {
        success: boolean;
        data: {
            jwt: string;
        }
    }
}


export interface GetSecretRequest {
    key: string;
    clusterId: string;
    projectId: string;
    organizationId: string;
}

export async function SaveClusterKey(req: CreateSecretRequest, cluster: ClusterEntity, clusterRepository: Repository<ClusterEntity>, traceId: string): Promise<CreateSecretResponse> {

    const config: AxiosRequestConfig = {
        headers: {
            'x-trace-id': traceId,
            'x-organization-id': req.organizationId,
            'x-project-id': req.projectId,
        },
    };

    const body = { secret: btoa(req.value) }


    const res: CreateSecretResponse = await axios.post(configData.secretServiceUrl + '/secret', body, config)
    logger.info(`Cluster Key Saved ${cluster.id} created successfully`, { clusterId: cluster.id, traceId: traceId })
    return res

}

export async function GetClusterKey(req: GetSecretRequest, traceId: string) {

    const config: AxiosRequestConfig = {
        headers: {
            'x-trace-id': traceId,
            'x-organization-id': req.organizationId,
            'x-project-id': req.projectId,
        }
    };
    const res: GetSecretResponse = await axios.get(configData.secretServiceUrl + '/secret/' + req.key, config)
    res.data.data = atob(res.data.data)
    return res.data
}

export async function GetSecretFromKey(req: AgentSecretResolveRequest, traceId: string) {

    const headers: any = {
        'x-trace-id': traceId,
        'x-organization-id': req.organizationId,
        'x-project-id': req.projectId,
        'x-scope': req.scope,

    }
    if (req.environmentId && req.environmentId !== '') {
        headers['x-environment-id'] = req.environmentId
    }
    const config: AxiosRequestConfig = {
        headers: headers
    };

    const res: GetSecretResponse = await axios.get(configData.secretServiceUrl + '/secret/' + req.secretId, config)
    res.data.data = atob(res.data.data)
    return res.data
}


export async function GenerateTokenForCluster(cluster: ClusterEntity, traceId: string) {

    const headers: any = {
        'x-trace-id': traceId,
        'x-organization-id': cluster.organizationId,
        'x-project-id': cluster.projectId
    }


    const organizationRole: any = {
        roles: ["member"],
        projects: {}
    }

    organizationRole.projects[cluster.projectId] = {
        roles: ["owner"],
        environments: {}
    }
    const body: any = {
        "name": `cluster-${cluster.name}-service-account`,
        "serviceAccountData": {
            "serviceAccount": true,
            "authData": {}
        }
    }
    body.serviceAccountData.authData[cluster.organizationId] = organizationRole

    const config: AxiosRequestConfig = {
        headers: headers
    };

    const res: GetAuthTokenResponse = await axios.post(configData.authServiceUrl + '/service-account', body, config)
   
    
    return res.data.data.jwt
}



export interface ClusterSecretMap {
    [key: string]: string;
}

export class ClusterSecrets {
    private static secrets: ClusterSecretMap = {};


    private constructor() { }

    public static async GetSecret(clusterId: string, projectId: string, organizationId: string, clusterSecretKeyRef: string, traceId: string): Promise<string> {
        if (this.secrets[clusterId]) {
            return this.secrets[clusterId];
        }
        const res = await GetClusterKey({ key: clusterSecretKeyRef, clusterId: clusterId, projectId: projectId, organizationId: organizationId }, traceId)
        this.secrets[clusterId] = res.data;
        return res.data;
    }
}
