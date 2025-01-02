// socketService.ts
import http, { request } from 'http';
import { Server, Socket } from 'socket.io';
import { AgentService } from './agentService';
import logger from '../../common/services/loggerService';
import configData from '../configs/config';
import { AppDataSource } from '../configs/ormconfig';
import { ClusterEntity } from '../entities/cluster.entity';
import axios, { AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Events } from '../../common/contstants/events';
import cluster from 'ioredis/built/cluster';
import { InternalServerError } from 'routing-controllers';
import { AgentRequestResponse, AgentSecretResolveRequest } from '../../common/interfaces/events';
import { getErrorMessage } from '../controllers/handleErrors';
import { getClusterById } from '../controllers/clusterController';
import { createAdapter } from "@socket.io/redis-adapter";
import { Cluster } from "ioredis";
import RedisService from './redisService';
import { GetSecretFromKey } from './secretService';
import { CacheEntity } from '../entities/cache.entity';
import { SyncClusterCache } from './cacheService';
import { ShellService } from './shellService';





const PING_TIMEOUT = configData.PING_TIMEOUT || 10000;
const PING_INTERVAL = configData.PING_INTERVAL || 10000;
const CLUSTER_PING_RETRY = configData.CLUSTER_PING_RETRY || 3;
export const CLUSTER_PING_TIMEOUT = configData.CLUSTER_PING_TIMEOUT || 8000;

export const createSocketServer = (app: any) => {
  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 1e7,
    pingTimeout: PING_TIMEOUT,
    pingInterval: PING_INTERVAL,
    cookie: true,
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ["websocket"]
  });


  io.adapter(createAdapter(RedisService.getClient(), RedisService.getClient()));

  io.on('connection', async (socket: Socket) => {
    logger.info(`Agent connected`, { socketId: socket.id, cluserId: socket.handshake.query.clusterID });

    AgentService.addConnection(socket.handshake.query.clusterID as string, socket.id, socket);

    const clusterRepository = AppDataSource.getRepository(ClusterEntity)
    const cluster = await clusterRepository.findOneBy({ id: socket.handshake.query.clusterID as string })
    if (!cluster) {
      logger.error("Cluster not found", { clusterId: socket.handshake.query.clusterID })
      socket.disconnect();
      return;
    }


    socket.on(Events.PING, async (data, callback) => {
      // logger.info(`Ping received`, { clusterId: socket.handshake.query.clusterID, event: Events.PING })
      callback(JSON.stringify(Events.PONG))

    });

    socket.on(Events.SECRET_RESOLVE, async (data, callback) => {
      logger.info(`Secret resolve received`, { clusterId: socket.handshake.query.clusterID, event: Events.SECRET_RESOLVE })
      const request = JSON.parse(data) as AgentSecretResolveRequest;
      // TODO: validate API Key
      try {
        const res = await GetSecretFromKey(request, request.traceId)
        callback(JSON.stringify({ data: res.data, status: 201 }))
      } catch (error) {
        callback(JSON.stringify({ error: error, status: 500 }))
      }
    });

    socket.on(Events.GET_OPEN_AI_KEY, async (data, callback) => {
      logger.info(`Open AI Key Request received`, { clusterId: socket.handshake.query.clusterID, event: Events.GET_OPEN_AI_KEY })
      callback(JSON.stringify({ data: configData.aiKey, status: 201 }))
    });

    // Handle disconnect event
    socket.on('disconnect', (reason) => {
      const traceId = uuidv4();
      logger.info(`Agent disconnected. Reason: ${reason}`, { socketId: socket.id, cluserId: socket.handshake.query.clusterID, traceId });

      AgentService.removeConnection(socket.handshake.query.clusterID as string, socket.id);

      setTimeout(() => { pingClusterAndUpdateStatus(socket.handshake.query.clusterID as string, traceId) }, 20000);

    });



    try {
      await clusterRepository.update(socket.handshake.query.clusterID as string, {
        clusterVersion: socket.handshake.query.serverVersion as string,
        agentOperatorVersion: socket.handshake.query.agentVersion as string,
        connected: true,
        agentConnectTime: new Date(),
      });
    } catch (err) {
      logger.error("Error while updating cluster version", err)
    }


    if (!cluster.connected) {
      SyncClusterCache(cluster.projectId, cluster.organizationId, cluster.id, uuidv4())
    }

  });

  // Handle connections from remote clients (your shell client)
  io.of('/shell').on('connection', (socket) => {

    const { clusterID, shellID } = socket.handshake.query;

    // Store the client connection using shellID or clusterID
    ShellService.setRemoteShellClient(shellID as string, socket);
    console.log(`Remote client connected: ShellID ${shellID}`);


    // When the shell sends data, forward it to the frontend
    socket.on('message', (data) => {
      if (ShellService.getFrontendClient(shellID as string)) {
        ShellService.getFrontendClient(shellID as string).emit('message', data);
      }
    });

    // On shell client disconnect
    socket.on('disconnect', () => {
      console.log(`Remote client disconnected: ShellID ${shellID}`);
      ShellService.removeRemoteShellClient(shellID as string);
      if (ShellService.getFrontendClient(shellID as string)) {
        ShellService.getFrontendClient(shellID as string).disconnect();
      }
    });

    // Handle resize events
    socket.on('resize', (size) => {
      if (ShellService.getFrontendClient(shellID as string)) {
        ShellService.getFrontendClient(shellID as string).emit('resize', size);
      }
    });
  });

  // Handle connections from React frontend
  io.of('/frontend').on('connection', (socket) => {
    const { shellID } = socket.handshake.query;


    // check if the shellID is valid in remoteshecllclients if not available then disconnect the frontend
    if (!ShellService.getRemoteShellClient(shellID as string)) {
      console.log(`ShellID: ${shellID} is not connected on this server. Disconnecting frontend`);
      socket.emit('disconnect-message', 'frontend-shell-not-found');
      return;
    } else{
      console.log(`ShellID: ${shellID} is connected on this server. Proceeding`);
    }
    // Store the frontend connection using shellID
    ShellService.setFrontendClient(shellID as string, socket);
    console.log(`Frontend connected: ShellID ${shellID}`);

    // When frontend sends data, forward it to the remote shell client
    socket.on('message', (data) => {
      if (ShellService.getRemoteShellClient(shellID as string)) {
        ShellService.getRemoteShellClient(shellID as string).emit('message', data);
      }
    });

    // On frontend disconnect
    socket.on('disconnect', () => {
      console.log(`Frontend disconnected: ShellID ${shellID}`);
      ShellService.removeFrontendClient(shellID as string);
    });

    // Handle terminal resize event from the frontend
    socket.on('resize', (size) => {
      if (ShellService.getRemoteShellClient(shellID as string)) {
        ShellService.getRemoteShellClient(shellID as string).emit('resize', size);
      }
    });
  });
  return { server, io };
};



async function pingClusterAndUpdateStatus(clusterId: string, traceId: string) {
  let cluster: ClusterEntity | null;
  try {
    const clusterRepository = AppDataSource.getRepository(ClusterEntity)
    cluster = await clusterRepository.findOneBy({ id: clusterId })
    if (!cluster || cluster == null) return;
  } catch (err) {
    logger.error("pingClusterAndUpdateStatus: Error while fetching cluster", err)
    return;
  }

  try {
    const config: AxiosRequestConfig = {
      headers: {
        'x-cluster-id': cluster.id,
        'x-organization-id': cluster.organizationId,
        'x-project-id': cluster.projectId,
        'x-trace-id': traceId.toString(),
      },
      timeout: CLUSTER_PING_TIMEOUT,
    };

    const api = axios.create({
      baseURL: configData.serverUrl,
    });
    const res = await retry(() => api.get(`/healthz/ping`, config), CLUSTER_PING_RETRY);
  } catch (err: any) {
    const clusterRepository = AppDataSource.getRepository(ClusterEntity)
    const lastSeen = new Date();
    clusterRepository.update(clusterId, { connected: false, lastSeen });
    logger.info("Cluster Unreachable. Updated status to disconnect", { error: err, clusterId: clusterId, traceId: traceId })
  }

}

async function retry<T>(fn: () => Promise<T>, n: number): Promise<T> {
  let lastError: any;
  for (let index = 0; index < n; index++) {
    try {
      return await fn();
    }
    catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}


