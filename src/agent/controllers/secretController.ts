
import 'reflect-metadata';
import { Body, Get, InternalServerError, JsonController, Param, Post, QueryParams, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Events } from '../../common/contstants/events';
import { AgentOutput } from '../../common/interfaces/outputs';
import { SocketService } from '../services/socketService';
import logger from '../../common/services/loggerService';



@JsonController('/secret')
export class SecretController {


    @Get('/')
    async resolve(@Req() request: Request, @Res() response: Response): Promise<any> {

        const req = {
            secretId: request.query.secretId,
            version: request.query.version,
            clusterId: request.clusterId,
            projectId: request.headers['x-project-id'],
            organizationId: request.headers['x-organization-id'],
            environmentId: request.headers['x-environment-id'],
            traceId: request.headers['x-trace-id'] || uuidv4(),
            scope: request.headers['x-scope'], 
            apiKey: request.query.apiKey
        }

        const data = await SocketService.getSocket()?.timeout(10000).emitWithAck(Events.SECRET_RESOLVE, JSON.stringify(req))

        const res = JSON.parse(data);

        if (res.status === 201) {
            return res
        } else {
            throw new InternalServerError(res.error)
        }
    }
}


