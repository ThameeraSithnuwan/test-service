import { Redis, RedisOptions } from 'ioredis';
import { AgentService } from './agentService';
import { AgentRequestResponse, RedisResponse } from "../../common/interfaces/events";
import logger from '../../common/services/loggerService';
import configData from '../configs/config';
import { EncryptDecryptService } from '../../common/services/encryptDecryptService';
import { ClusterSecrets } from './secretService';

// Redis configuration

const LOCK_TIMEOUT = configData.LOCK_TIMEOUT || 10000;
export const REDIS_SUBSCRIPTION_TIMEOUT = configData.REDIS_SUBSCRIPTION_TIMEOUT || 1000 * 60; // 1 minutes in milliseconds
const REDIS_DATA_EXPIRATION_SECONDS = configData.REDIS_DATA_EXPIRATION_SECONDS || 120;

logger.info(`Redis configuration: LOCK_TIMEOUT: ${LOCK_TIMEOUT}, REDIS_SUBSCRIPTION_TIMEOUT: ${REDIS_SUBSCRIPTION_TIMEOUT}`)

class RedisService {

    public static getClient(): Redis {
        return new Redis(configData.redisOptions);
    }


    public static async SubscribeToChannelWithLock(channel: string, callback: (key: AgentRequestResponse, traceId: string) => Promise<void>) {
        // Access the Redis client from the singleton
        const redisClient = RedisService.getClient();
        try {
            await redisClient.subscribe(channel);

            redisClient.on('message', async (subscribedChannel, message) => {
                logger.info(`SubscribeToChannelWithLock: Received message from channel ${subscribedChannel}:`, { clusterId: subscribedChannel, message });

                // check if cluster connection is available before aquiring lock

                try {
                    AgentService.getConnection(subscribedChannel)

                    const redisClientLock = RedisService.getClient();
                    // Try to obtain the lock
                    const lockKey = `lock:${message}`;
                    const lockAcquired = await redisClientLock.set(lockKey, 'locked', 'PX', LOCK_TIMEOUT, 'NX');

                    if (lockAcquired) {


                        const payload = await RedisService.getData(message);


                        const parsedPayload: AgentRequestResponse = JSON.parse(payload as string);

                        logger.info(`SubscribeToChannelWithLock: Lock acquired for message: ${message} }`, { message, subscribedChannel, clusterId: parsedPayload.clusterId, traceId: parsedPayload.traceId, uuid: parsedPayload.uuid });

                        // executes dynamic function on what to do with recieved msg
                        await callback(parsedPayload, parsedPayload.traceId);



                        // Release the lock after processing is done
                        await redisClientLock.del(lockKey);
                        logger.info(`SubscribeToChannelWithLock: Lock released for message: ${message} }`, { traceId: parsedPayload.traceId, message, clusterId: parsedPayload.clusterId, uuid: parsedPayload.uuid });

                    } else {
                        logger.info(`SubscribeToChannelWithLock: Message ${message} is already being processed by another subscriber.`, { message, subscribedChannel });
                    }
                } catch (error) {
                    logger.error(`SubscribeToChannelWithLock: Didn't aquire lock as agent connection wasn't established`, { error, message, subscribedChannel });
                }
            });
        } catch (error) {
            logger.error('SubscribeToChannelWithLock: Error subscribing to channel:', { error, channel });
        }
    }

    public static async SubscribeToChannelAndRecieveFirstResponse(channel: string, traceId: string, timeout = REDIS_SUBSCRIPTION_TIMEOUT): Promise<string> {
        const redisClient = RedisService.getClient();

        return new Promise<string>((resolve, reject) => {
            try {
                logger.info(`SubscribeToChannelAndRecieveFirstResponse: Subscribing to channel ${channel}`, { traceId });
                redisClient.subscribe(channel);


                const timeoutId = setTimeout(() => {
                    // If the timeout is reached, unsubscribe and reject the promise with a timeout error
                    redisClient.unsubscribe(channel);
                    redisClient.disconnect();
                    reject(new Error(`SubscribeToChannelAndRecieveFirstResponse:Timeout occurred. No message received within ${timeout} milliseconds`));
                }, timeout);

                redisClient.on('message', async (subscribedChannel, message) => {
                    clearTimeout(timeoutId);
                    // Stop subscribing after receiving the first message
                    redisClient.unsubscribe(channel);
                    redisClient.disconnect();
                    logger.info(`SubscribeToChannelAndRecieveFirstResponse: Received message from channel ${subscribedChannel}`, { traceId })
                    const redisResponse = JSON.parse(message) as RedisResponse
                    if (redisResponse.status === 'error') {
                        reject(new Error(`SubscribeToChannelAndRecieveFirstResponse: Error recieved from agent: ${redisResponse.msg}. TraceID: ${redisResponse.traceId}`));
                        return;
                    }

                    const response = JSON.parse(redisResponse.encryptedResponse) as AgentRequestResponse
                    const secretKey = await ClusterSecrets.GetSecret(response.clusterId, response.projectId, response.organizationId, response.clusterSecretKeyRef, traceId);

                    const decryptData = EncryptDecryptService.decrypt(response.data, secretKey)
                    resolve(decryptData); // Resolve the promise with the first message
                });
            } catch (error) {
                logger.error(`SubscribeToChannelAndRecieveFirstResponse: Error subscribing to channel ${channel}`, { error, channel, traceId });
                redisClient.disconnect();
                reject(new Error(`Error subscribing to channel ${channel}. Error: ${error}. TraceID: ${traceId}`)); // Reject the promise in case of an error
            }
        });
    }


    public static async PublishMessage(channel: string, message: string, traceId: string) {
        const redisClient = RedisService.getClient();
        try {
            logger.info(`Publishing message to channel ${channel}`, { traceId });
            await redisClient.publish(channel, message);
            redisClient.disconnect();
        } catch (error) {
            redisClient.disconnect();
            logger.error(`Error publishing message to channel ${channel}`, { traceId, error });
            throw error;
        }

    }

    public static async insertDataWithExpiration(key: string, value: string, traceId: string) {
        const redisClient = RedisService.getClient();
        await redisClient.set(key, value, 'EX', REDIS_DATA_EXPIRATION_SECONDS);
        logger.info(`Inserted data with expiration ${key}`, { traceId });
        redisClient.disconnect();
    }

    public static async getData(key: string, traceId?: string): Promise<string> {

        const redisClient = RedisService.getClient();
        try {

            const response = await redisClient.get(key);
            redisClient.disconnect();
            return response as string;
        } catch (error) {
            logger.error(`Error getting data for key: ${key}`, { traceId, error });
            redisClient.disconnect();
            throw error;
        }
    }

}

export default RedisService;
