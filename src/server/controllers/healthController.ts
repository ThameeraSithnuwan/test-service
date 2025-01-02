
import 'reflect-metadata';
import { Body, Get, InternalServerError, JsonController, Param, Post, QueryParams, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Events } from '../../common/contstants/events';
import { AgentOutput } from '../../common/interfaces/outputs';
import { AgentService } from '../services/agentService';
import { AgentRequestResponse } from "../../common/interfaces/events";
import { getErrorMessage } from './handleErrors';
import { ClusterIdVerifyMiddleware } from '../middlewares/clusterIdVerifyMiddleware';
import { CLUSTER_PING_TIMEOUT } from '../services/socketService';
import { getClusterById } from './clusterController';


@JsonController('/healthz')
export class HealthzController {

    @Get('/')
     health(@Req() request: Request, @Res() response: Response):string {
        return "cluster service up and running"
    }   


    @Get('/ping')
    @UseBefore(ClusterIdVerifyMiddleware)
    async getResource(@Req() request: Request, @Res() response: Response): Promise<AgentOutput> {

        const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

        const agentRequest: AgentRequestResponse = {
            clusterId: request.clusterId as string,
            data: Events.PING,
            traceId: request.traceId as string,
            event: Events.PING,
            uuid: uuidv4(),
            projectId: request.projectId as string,
            organizationId: request.organizationId as string,
            clusterSecretKeyRef: cluster.clusterSecretKey
        }

        try {
            const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId, CLUSTER_PING_TIMEOUT);
            return res;
        } catch (error) {
            throw new InternalServerError(getErrorMessage(error, request.traceId as string));
        }
    }
}


