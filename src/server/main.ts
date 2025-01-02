import 'reflect-metadata';
import { createExpressServer, useExpressServer } from 'routing-controllers';
import { APIResourceController } from './controllers/resourceController';
import WinstonLoggerMiddleware from './middlewares/loggerMiddleware';
import { ExtractHeadersMiddleware } from './middlewares/extractHeadersMiddleware';
import { createSocketServer } from './services/socketService';
import logger from '../common/services/loggerService';
import { AppDataSource } from './configs/ormconfig';
import { ClusterController } from './controllers/clusterController';
import { ManifestController } from './controllers/requestController';
import { HealthzController } from './controllers/healthController';
import { CustomErrorHandler } from './controllers/handleErrors';
import { ConnectController } from './controllers/connectController';
import cors from 'cors';
import express from 'express';
import { ObservabilityController } from './controllers/observabilityController';
import agentVersion from './configs/agentVersion';
import configData from './configs/config';
import RedisService from './services/redisService';
import { cli } from 'winston/lib/winston/config';
import { CacheController } from './controllers/cacheController';
import { ShellController } from './controllers/shellController';

const httpServer = express();
const socketApp = express();

// Apply CORS middleware globally
httpServer.use(cors());
socketApp.use(cors());

// Create Express app and register the ApiController
useExpressServer(httpServer, {
  controllers: [ManifestController, ClusterController, APIResourceController, HealthzController, ConnectController, ObservabilityController, CacheController, ShellController],
  middlewares: [ExtractHeadersMiddleware, WinstonLoggerMiddleware, CustomErrorHandler],
});


logger.info("latest agent version:", agentVersion.trim())
const { server, io } = createSocketServer(socketApp);

AppDataSource.initialize()
  .then(() => {
    logger.info("Data Source has been initialized!")
  })
  .catch((err) => {
    logger.error("Error during Data Source initialization", { error: err })
    process.exit(1)
  })


const redis = RedisService.getClient();

redis.on('error', (err) => {
  logger.error('Redis connection error:', { error: err });
  process.exit(1);
  // You can add custom error handling logic here, such as retrying or exiting the application.
});

// Check the connection status
redis.ping((err, result) => {
  if (err) {
    logger.error('Error pinging Redis:', { error: err });
    process.exit(1);
  } else {
    logger.info(`Connected to Redis: ${result}`);
  }

});

const HTTP_PORT = 3000;
const SOCKET_PORT = 3001;

httpServer.listen(HTTP_PORT, () => {

  logger.info(`agentRegistry: ${configData.agentRegistryUrl}`)
  logger.info(`secretServiceUrl: ${configData.secretServiceUrl}`)
  logger.info(`serverUrl: ${configData.serverUrl}`)
  logger.info(`agentVersion: ${agentVersion}`)
  

  logger.info(`Server is running on http://localhost:${HTTP_PORT}`);
});

server.listen(SOCKET_PORT, () => {
  logger.info(`Socket server is running on http://localhost:${SOCKET_PORT}`);
});


setTimeout(() => {}); 