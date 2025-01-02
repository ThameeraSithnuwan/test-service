import { Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import RedisService, { REDIS_SUBSCRIPTION_TIMEOUT } from "./redisService";
import logger from "../../common/services/loggerService";
import configData from "../configs/config";
import { AgentOutput } from "../../common/interfaces/outputs";
import { EncryptDecryptService } from "../../common/services/encryptDecryptService";
import { AgentRequestResponse } from "../../common/interfaces/events";
import { ClusterSecrets } from "./secretService";
import { AppDataSource } from "../configs/ormconfig";
import { Events } from "../../common/contstants/events";
import CacheService from "./cacheService";


export const AGENT_SOCKET_TIMEOUT = configData.AGENT_SOCKET_TIMEOUT || 20000;
logger.info(`Agent socket timeout: ${AGENT_SOCKET_TIMEOUT}`)


export interface AgentConnection {
    clusterId: string;
    socketId: string;
    connectTime?: string;
    disconnectTime?: string;
    status: boolean;
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
}

export interface AgentConnectionStringMap {
    [key: string]: AgentConnection[];
}

export class AgentService {
    private static instance: AgentConnectionStringMap = {};


    private constructor() { }

    public static getInstance(): AgentConnectionStringMap {
        if (!AgentService.instance) {
            AgentService.instance = {};
        }
        return AgentService.instance;
    }

    public static addConnection(clusterId: string, socketId: string, socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>): AgentConnectionStringMap {
        if (!AgentService.instance[clusterId]) {
            AgentService.instance[clusterId] = [];
        }
        AgentService.instance[clusterId].push({ clusterId: clusterId, socketId: socketId, status: true, socket });
        RedisService.SubscribeToChannelWithLock(clusterId, AgentService.sendAgentRequest); // background process //
        return AgentService.instance;
    }

    public static removeConnection(clusterId: string, socketId: string): AgentConnectionStringMap {
        if (AgentService.instance[clusterId]) {
            AgentService.instance[clusterId] = AgentService.instance[clusterId].filter((connection) => {
                return connection.socketId !== socketId;
            });
            if (AgentService.instance[clusterId].length === 0) {
                delete AgentService.instance[clusterId];
                const redisClient = RedisService.getClient();
                redisClient.unsubscribe(clusterId);
            }
        }
        return AgentService.instance;
    }

    public static getConnection(clusterId: string): AgentConnection {
        const connections = AgentService.instance[clusterId];

        for (const connection of connections) {
            if (connection.socket.connected) {
                return connection;
            }
        }
        throw new Error(`No connection found for clusterId ${clusterId}`);
    }


    public static async sendAgentRequest(parsedPayload: AgentRequestResponse, traceId: string) {

        try {
            // no point of checking the connection here as already the redis lock is aquired at this point
            const agent = AgentService.getConnection(parsedPayload.clusterId);
            logger.info(`Sending agent request`, { traceId, clusterId: parsedPayload.clusterId, uuid: parsedPayload.uuid, event: parsedPayload.event })
            // const encryptData = EncryptDecryptService.encrypt(parsedPayload.data,)
            // sent to agent and recieved response 
            // socket by default sends to the specific agent
            const encryptedResponse = await agent.socket.timeout(AGENT_SOCKET_TIMEOUT).emitWithAck(parsedPayload.event, JSON.stringify(parsedPayload));
            if (!encryptedResponse) {
                logger.error(`No response from agent`, { traceId, clusterId: parsedPayload.clusterId, uuid: parsedPayload.uuid, event: parsedPayload.event });
                RedisService.PublishMessage(`${parsedPayload.clusterId}-${parsedPayload.uuid}`, JSON.stringify({ status: 'error', msg: 'No response from agent', traceId }), traceId);
                return;
            }

            logger.info(`agent response recieved`, { traceId, clusterId: parsedPayload.clusterId, uuid: parsedPayload.uuid, event: parsedPayload.event })
            RedisService.PublishMessage(`${parsedPayload.clusterId}-${parsedPayload.uuid}`, JSON.stringify({ status: 'success', encryptedResponse: encryptedResponse }), traceId);

        } catch (error: any) {
            logger.error(`Error sending agent request`, { error: error?.message || error, traceId });
            RedisService.PublishMessage(`${parsedPayload.clusterId}-${parsedPayload.uuid}`, JSON.stringify({ status: 'error', msg: `Error sending agent request. ${error?.message}`, traceId }), traceId);
        }
    }


    public static async communicateWithCluster(agentRequest: AgentRequestResponse, traceId: string, timeout = REDIS_SUBSCRIPTION_TIMEOUT, dataEncrypted: boolean = false): Promise<AgentOutput> {



        const secretKey = await ClusterSecrets.GetSecret(agentRequest.clusterId, agentRequest.projectId, agentRequest.organizationId, agentRequest.clusterSecretKeyRef, traceId);

        if (!dataEncrypted) {
            agentRequest.data = EncryptDecryptService.encrypt(JSON.stringify(agentRequest.data), secretKey);
        }
        try {
            // check if agentRequest.data can be parsed by json or not

            if (dataEncrypted && agentRequest.data?.data) {
                return Promise.resolve(agentRequest.data);
            }

            // check if agent is connected
            try {
                const agent = AgentService.getConnection(agentRequest.clusterId);
                logger.info(`Agent Connection found on recieving node. Sending agent request`, { traceId, clusterId: agentRequest.clusterId, uuid: agentRequest.uuid, event: agentRequest.event })
                const encryptedResponse = await agent.socket.timeout(AGENT_SOCKET_TIMEOUT).emitWithAck(agentRequest.event, JSON.stringify(agentRequest));

                if (!encryptedResponse) {
                    logger.error(`No response from agent`, { traceId, clusterId: agentRequest.clusterId, uuid: agentRequest.uuid, event: agentRequest.event });
                    throw new Error(`No response from agent`);
                }

                logger.info(`agent response recieved`, { traceId, clusterId: agentRequest.clusterId, uuid: agentRequest.uuid, event: agentRequest.event })
                const response = JSON.parse(encryptedResponse) as AgentRequestResponse
                const decryptData = EncryptDecryptService.decrypt(response.data, secretKey)

                const agentResponse: AgentOutput = JSON.parse(decryptData);
                if ([Events.APPLY_RESOURCE, Events.DELETE_RESOURCE, Events.KAPP_DELETE].includes(agentRequest.event)) {
                    CacheService.upsert({
                        projectId: agentRequest.projectId,
                        organizationId: agentRequest.organizationId,
                        clusterId: agentRequest.clusterId,
                        error: '',
                        lastTried: new Date(),
                        resourceId: agentRequest.cacheMetadata?.resourceId as string,
                        namespace: agentRequest.cacheMetadata?.namespace as string,
                        name: agentRequest.cacheMetadata?.name as string,
                        kind: agentRequest.cacheMetadata?.kind as string,
                        agentRequestEncrypted: agentRequest,
                        message: agentRequest.cacheMetadata?.message as string,
                        action: agentRequest.event,
                        labels: agentRequest.cacheMetadata?.labels as string[],
                        status: 'synced'
                    })
                }

                return agentResponse;
            } catch (error) {
                logger.info(`Agent Connection not found on recieving node`, { traceId, clusterId: agentRequest.clusterId, uuid: agentRequest.uuid, event: agentRequest.event })
                await RedisService.insertDataWithExpiration(agentRequest.uuid, JSON.stringify(agentRequest), agentRequest.traceId);
                await RedisService.PublishMessage(agentRequest.clusterId, agentRequest.uuid, agentRequest.traceId);
                const res = await RedisService.SubscribeToChannelAndRecieveFirstResponse(`${agentRequest.clusterId}-${agentRequest.uuid}`, agentRequest.traceId, timeout);
                const agentResponse: AgentOutput = JSON.parse(res);

                if ([Events.APPLY_RESOURCE, Events.DELETE_RESOURCE, Events.KAPP_DELETE].includes(agentRequest.event)) {
                    CacheService.upsert({
                        projectId: agentRequest.projectId,
                        organizationId: agentRequest.organizationId,
                        clusterId: agentRequest.clusterId,
                        error: `Agent Connection not found on recieving node ${error}`,
                        lastTried: new Date(),
                        resourceId: agentRequest.cacheMetadata?.resourceId as string,
                        namespace: agentRequest.cacheMetadata?.namespace as string,
                        name: agentRequest.cacheMetadata?.name as string,
                        kind: agentRequest.cacheMetadata?.kind as string,
                        agentRequestEncrypted: agentRequest,
                        message: agentRequest.cacheMetadata?.message as string,
                        action: agentRequest.event,
                        labels: agentRequest.cacheMetadata?.labels as string[],
                        status: 'error'
                    })
                }
                return agentResponse;
            }
        } catch (error) {
            logger.error(`Error communicating with cluster`, { error, traceId });


            if ([Events.APPLY_RESOURCE, Events.DELETE_RESOURCE, Events.KAPP_DELETE].includes(agentRequest.event)) {
                CacheService.upsert({
                    projectId: agentRequest.projectId,
                    organizationId: agentRequest.organizationId,
                    clusterId: agentRequest.clusterId,
                    error: `Error communicating with cluster: ${error}`,
                    lastTried: new Date(),
                    resourceId: agentRequest.cacheMetadata?.resourceId as string,
                    namespace: agentRequest.cacheMetadata?.namespace as string,
                    name: agentRequest.cacheMetadata?.name as string,
                    kind: agentRequest.cacheMetadata?.kind as string,
                    agentRequestEncrypted: agentRequest,
                    message: agentRequest.cacheMetadata?.message as string,
                    action: agentRequest.event,
                    labels: agentRequest.cacheMetadata?.labels as string[],
                    status: 'error'
                })
            }

            throw error;
        }
    }


}