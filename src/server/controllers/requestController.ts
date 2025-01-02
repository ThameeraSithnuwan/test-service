
import 'reflect-metadata';
import { Body, InternalServerError, JsonController, Post, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { APIForwardRequest } from '../../common/interfaces/events';
import { Events } from '../../common/contstants/events';
import { AgentService } from '../services/agentService';
import { AgentRequestResponse } from "../../common/interfaces/events";

import {  getErrorMessage } from './handleErrors';
import { ClusterIdVerifyMiddleware } from '../middlewares/clusterIdVerifyMiddleware';
import { getClusterById } from './clusterController';


@JsonController('/request')
@UseBefore(ClusterIdVerifyMiddleware)
export class ManifestController {
    @Post('/')
    async applyResource(@Req() request: Request, @Res() response: Response, @Body() payload: APIForwardRequest): Promise<any> {

        const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

        const agentRequest: AgentRequestResponse = {
            clusterId: request.clusterId as string,
            data: payload,
            traceId: request.traceId as string,
            event: Events.FORWARD_REQUEST,
            uuid: uuidv4(),
            projectId: request.projectId as string,
            organizationId: request.organizationId as string,
            clusterSecretKeyRef: cluster.clusterSecretKey
        }
        try {
            const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
            return res;
        } catch (error) {
            throw new InternalServerError(getErrorMessage(error,request.traceId as string));
        }
    }
}


