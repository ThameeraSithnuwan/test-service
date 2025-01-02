import { RedisOptions } from 'ioredis';
import fs from 'fs';

interface ConfigData {
    redisOptions: RedisOptions;
    serverUrl: string;
    socketUrl: string;
    agentRegistryUrl: string;
    shellImage: string;
    LOCK_TIMEOUT: number;
    REDIS_SUBSCRIPTION_TIMEOUT: number;
    AGENT_SOCKET_TIMEOUT: number;
    PING_TIMEOUT: number;
    PING_INTERVAL: number;
    REDIS_DATA_EXPIRATION_SECONDS: number;
    CLUSTER_PING_RETRY: number;
    CLUSTER_PING_TIMEOUT: number;
    postgres: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
    },
    secretServiceUrl: string;
    credentialServiceUrl: string;
    authServiceUrl: string;
    aiKey: string;
    notificationServiceUrl: string;

}



const configFile = './config.json'; // Update the path if necessary

// Read and parse the config file synchronously
const configData: ConfigData = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
configData.secretServiceUrl = (process.env.SECRET_SERVICE_URL || configData.secretServiceUrl) as string
configData.serverUrl = (process.env.SERVER_URL || configData.serverUrl) as string
configData.agentRegistryUrl = (process.env.AGENT_REGISTRY || configData.agentRegistryUrl) as string
configData.socketUrl = (process.env.SOCKET_URL || configData.socketUrl) as string

if (process.env.ENABLE_REDIS_TLS === "true") {
  configData.redisOptions.tls = {}
}
export default configData;