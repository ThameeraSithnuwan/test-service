
import 'reflect-metadata';
import { Body, Get, InternalServerError, JsonController, Param, Post, QueryParams, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Events } from '../../common/contstants/events';
import { AgentOutput } from '../../common/interfaces/outputs';
import { SocketService } from '../services/socketService';
import logger from '../../common/services/loggerService';


@JsonController('/healthz')
export class HealthzController {


    @Get('/')
    async pingCluster(@Req() request: Request, @Res() response: Response): Promise<any> {
        const data = await SocketService.getSocket()?.timeout(5000).emitWithAck(Events.PING, {})
        // logger.info(`Ping recieved`, { clusterId: request.clusterId, event: Events.PING })
        return data
    }
}


