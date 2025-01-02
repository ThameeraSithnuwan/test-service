import axios, { AxiosRequestConfig } from "axios";
import { ClusterEntity } from "../entities/cluster.entity";
import configData from "../configs/config";
import logger from "../../common/services/loggerService";

export interface GetAWSContainerLogsRequest {
    namespace?: string;
    containerName?: string;
    podName?: string;
    labels?: { key: string, value: string }[]

}
export async function GetAWSContainerLogsQuery(cluster: ClusterEntity, logRequest: GetAWSContainerLogsRequest, traceId: string): Promise<{
    success: boolean;
    data: string; // query id
}> {
    const config: AxiosRequestConfig = {
        headers: {
            'x-trace-id': traceId,
            'x-organization-id': cluster.organizationId,
            'x-project-id': cluster.projectId,
            'x-credential-id': cluster.aws?.credentialId,
        },
        params: {
            provider: 'aws',
            clusterName: cluster.name,
            region: cluster.aws?.region,
            ...logRequest
        }
    };

    const res = await axios.get(configData.credentialServiceUrl + '/kubernetes/clusters/logs/performance/query', config)
    return res.data
}

