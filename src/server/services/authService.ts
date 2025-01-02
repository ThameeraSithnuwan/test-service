import axios, { AxiosRequestConfig } from "axios";
import { ClusterEntity } from "../entities/cluster.entity";
import configData from "../configs/config";
import logger from "../../common/services/loggerService";

export interface AuthRBACResponse {
    userId: string;
    project: {
        id: string;
        permission: string;
    },
    environments:  {
        id: string;
        permission: string;
    }[];
}
 
export async function GetUserPermissions(headers:any, traceId: string): Promise<{
    success: boolean;
    data: AuthRBACResponse; 
}> {
    const config: AxiosRequestConfig = {
        headers: headers
    };

    const res = await axios.get(configData.authServiceUrl + '/authorizer/shell-access', config)
    return res.data
}

