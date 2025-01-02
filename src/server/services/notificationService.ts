import axios, { AxiosRequestConfig } from "axios";
import { ClusterEntity } from "../entities/cluster.entity";
import configData from "../configs/config";
import logger from "../../common/services/loggerService";

export interface PostNotificationRequest {
    organizationId: string;
    projectId: string;
    messageTitle: string;
    message: string;
    clusterId: string;
    severity: string;
    status?: string;

}
export async function FireNotification(data: PostNotificationRequest, traceId: string): Promise<{
    success: boolean;
    data: string; // query id
}> {
    const config: AxiosRequestConfig = {
        headers: {
            'x-trace-id': traceId,
            'x-organization-id': data.organizationId,
            'x-project-id': data.projectId,
        },
        params: {
            organizationId: data.organizationId,
            projectId: data.projectId,
        }
    };

    const body = {message: data.message, messageTitle: data.message, labels: {clusterId: data.clusterId, severity: data.severity, "alertname": "clusterDisconnected"}}
    const res = await axios.post(configData.notificationServiceUrl + '/alerts/fire', body, config)
    return res.data
}


 
