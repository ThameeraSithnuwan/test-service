export interface ApplyResourceRequest {
    data: any;
    resourceId?: string;
    kind?: string;
    namespace?: string;
    name?: string;
    message?: string;
}

export interface CreateJobFromCronRequest {
    namespace: string;
    cronJobName?: string;
    jobName?: string;
}

export interface GetResourceRequest {
    resource: string;
    namespace?: string;
    name?: string;
    labels?: string[];
}

export interface KAppDeleteRequest {
    namespace?: string;
    resourceId: string;
    labels: string[];
}

export interface RedeployRequest {
    deploymentName: string;
    namespace: string;
}

export interface PluginRequestCommand {
    cli: string;
    commandInputs?: string[];
}

export interface GetLogRequest {
    namespace?: string;
    name?: string;
    labels?: string[];
    container?: string;
    sinceSeconds?: number;
    previous?: boolean;
}

export interface GetK8sGPTRequest {
    namespace?: string;
    filters?: string[];
    aiKey: string;
}

export interface GetK8sGPTRequestQuery {
    namespace?: string;
    filters?: string[];
}

export interface GetEventRequest {
    namespace?: string;
    name?: string;
    resource?: string;
    type?: string;

}

export interface GetMetricsRequest {
    resource: string;
    namespace?: string;
    name?: string;
    labels?: string[];
}


export interface APIForwardRequest {
    url: string;
    ignoreSSL: boolean;
    body: any;
    headers: { [key: string]: string };
    method: 'get' | 'post' | 'put' | 'delete';
}

export interface PrometheusRequest {
    query: string;
    start?: string;
    end?: string;
    step?: string;
    queryType: string;
}

export interface AgentRequestResponse {
    clusterId: string;
    data: any; // payload
    uuid: string;
    traceId: string;
    event: string;
    projectId: string;
    organizationId: string;
    clusterSecretKeyRef: string;
    cacheMetadata?: {
        resourceId?: string;
        namespace?: string;
        name?: string;
        kind?: string;
        message?: string;
        labels?: string[];
    };
}

export interface RedisResponse {
    status: string;
    encryptedResponse: string;
    msg: string;
    traceId: string;
}


export interface AgentSecretResolveRequest {
    clusterId: string;
    projectId: string;
    organizationId: string;
    traceId: string;
    secretId: string;
    apiKey: string;
    environmentId: string;
    version: string;
    scope: string;
}
