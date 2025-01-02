// subscriber.js
import agentConfig from './config/config'
import io, { Socket } from 'socket.io-client';
import { ApplyKubectl, CreateJobFromCronJob, DeleteKubectl, GetKubectl, GetKubectlEvents, GetKubectlLogs, GetKubectlNamespaces, GetKubectlNodes, GetKubectlPods, GetKubectlService, GetUnhealthyPods, GetVersion, RestartDeployment, RunKubectlAndGetRawOutput } from './controllers/kubectlController';
import { APIForwardRequest, AgentRequestResponse, ApplyResourceRequest, GetResourceRequest, GetLogRequest, GetEventRequest, PluginRequestCommand, CreateJobFromCronRequest, PrometheusRequest, GetK8sGPTRequest, RedeployRequest, KAppDeleteRequest } from '../common/interfaces/events';
import { EncryptDecryptService } from '../common/services/encryptDecryptService';
import { Events } from '../common/contstants/events';
import { AgentOutput } from '../common/interfaces/outputs';
import { ApiRequestForwarder, PrometheusRequestForwarder } from './controllers/requestController';
import logger from '../common/services/loggerService';
import 'reflect-metadata';
import { createExpressServer } from 'routing-controllers';
import { HealthzController } from './controllers/healthController';
import { SocketService } from './services/socketService';
import { SecretController } from './controllers/secretController';
import { RunFluxCommandsRaw } from './controllers/fluxcdController';
import { CLIBasedPlugins } from '../common/contstants/plugins';
import { InstallTrivyOperator, RunK8sGPTCommands } from './controllers/k8sgptController';
import { RunDeleteKappCommand } from './controllers/kappController';

const { exec } = require('child_process');



exec('cat /proc/version', async (error: any, stdout: any, stderr: any) => {
  if (error) {
    console.error(`/proc/version ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`/proc/version ${stderr}`);
    return;
  }

  console.log(`Kernel version information:\n${stdout}`);

  // Extract the kernel version string from the output
  const versionMatch = stdout.match(/Linux version\s+(\S+)/);
  if (!versionMatch || !versionMatch[1]) {
    console.error('Unable to parse the kernel version');
    return;
  }

  // Extract the kernel version number from the matched string
  const kernelVersion = versionMatch[1];
  console.log('Kernel version:', kernelVersion);

  // Extract major and minor version numbers
  const [major, minor] = kernelVersion.split('.').slice(0, 2).map(Number);

  // Check if the kernel version is 5.10 or higher
  const isSupported = major > 5 || (major === 5 && minor >= 10) || stdout.toLowerCase().includes('bpf');;
  console.log('eBPF support:', isSupported);

  console.log('eBPF support:', isSupported);
  if (isSupported) {
    const res = await RunKubectlAndGetRawOutput(['get', 'crd', 'podmonitors.monitoring.coreos.com'])
    if (!res.error) {
      console.log('PodMonitor CRD already installed. Installing skyu-network-scraper plugin')
      RunKubectlAndGetRawOutput(['apply', '-f', 'https://raw.githubusercontent.com/skyu-io/plugin-yamls/main/skyu-network-scraper.yaml'])
    } else {
      console.log('PodMonitor CRD not found. Skipping skyu-network-scraper plugin installation. Please Install Prometheus Operator first')
    }
  } else {
    console.log('eBPF not supported. Skipping skyu-network-scraper plugin installation')
  }
});



const clusterID = process.env.CLUSTER_ID || 'cluster_98e06edb-bead-4f06-85c4-91ba40427ebe'
const connectionString = process.env.SOCKET_URL || 'https://ws.dev.skyu.io'

const deploymentName = process.env.DEPLOYMENT_NAME || 'skyu-agent-deployment'

const restrictedResources = ['secrets', 'sec', 'secret']

export const secretKey = agentConfig.SECRET_KEY;

const app = createExpressServer({
  controllers: [HealthzController, SecretController],
  middlewares: [],
});

app.listen(8080, () => { })

async function main() {


  let k8sGPTResponse: AgentOutput = {} as AgentOutput;
  let openaiKey = ''






  const k8sVersion = await GetVersion();
  const deploymentResult = await GetKubectl({ resource: 'deployment', namespace: 'skyu-system', name: deploymentName })
  if (deploymentResult.code !== 0) {
    logger.error(`Deployment not found`, { clusterId: clusterID })
  }

  const version = getImageVersionFromDeployment(deploymentResult.data)
  const serverVersion = k8sVersion.data.serverVersion.gitVersion;

  // check plugins and install if not installed

  // Iterate over CLIBasedPlugins
  Object.keys(CLIBasedPlugins).forEach(async (pluginKey) => {
    const plugin = CLIBasedPlugins[pluginKey];
    let response;


    const statusAvailable = !!plugin.statusCommand
    if (!statusAvailable) {
      // install plugin
      logger.info("installing plugin:" + pluginKey)
      const commandInputs = plugin[process.env.CLUSTER_TYPE || 'command']?.commandInputs || plugin['command'].commandInputs as Array<string>
      const installResponse = await RunKubectlAndGetRawOutput(commandInputs)
      logger.info("installed plugin:" + pluginKey + "\n" + installResponse.data)
      return
    }

    // check if plugin is installed
    switch (plugin.statusCommand.cli) {
      case 'kubectl':
        response = await RunKubectlAndGetRawOutput(plugin.statusCommand.commandInputs as Array<string>)
        if (response.data === '') {
          // install plugin
          logger.info("installing plugin:" + pluginKey)
          const commandInputs = plugin[process.env.CLUSTER_TYPE || 'command']?.commandInputs || plugin['command'].commandInputs as Array<string>
          const installResponse = await RunKubectlAndGetRawOutput(commandInputs)
          logger.info("installed plugin:" + pluginKey + "\n" + installResponse.data)
        } else {
          logger.info("plugin already installed:" + pluginKey)
        }
        break;
      case 'flux':
        response = await RunFluxCommandsRaw(plugin.statusCommand.commandInputs as Array<string>)

        if (response.code !== 0) {
          // install plugin
          logger.info("installing plugin:" + pluginKey)
          const commandInputs = plugin[process.env.CLUSTER_TYPE || 'command']?.commandInputs || plugin['command'].commandInputs as Array<string>
          const installResponse = await RunFluxCommandsRaw(commandInputs)
          logger.info("installed plugin:" + pluginKey + "\n" + installResponse.data)
        } else {
          logger.info("plugin already installed:" + pluginKey)
        }
        break;
      default:
        logger.error("cli not supported:" + plugin.statusCommand.cli)
        break;
    }
  });


  const res = await InstallTrivyOperator()
  console.log("installing trivy Operator", res)

  try {



    const socket = io(connectionString, { query: { clusterID: clusterID, agentVersion: version, serverVersion }, transports: ["websocket"] });

    SocketService.setSocket(socket)

    logger.info(`Connecting to server: ${connectionString}`, { clusterId: clusterID })

    socket.on('connect', () => {
      logger.info(`Connected to server`, { clusterId: clusterID, sokcetId: socket.id })
    });

    socket.on('connect_error', (err) => {
      console.log(err.message)
      logger.error(`Connection error`, { clusterId: clusterID, error: err })
    });





    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`Disconnected from the server`, { clusterId: clusterID, reason: reason })
    });

    socket.on('reconnect', (attemptNumber) => {
      logger.info(`Reconnected to the server`, { clusterId: clusterID, attemptNumber: attemptNumber })
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      logger.info(`Reconnect attempt`, { clusterId: clusterID, attemptNumber: attemptNumber })
    });

    socket.on('reconnecting', (attemptNumber) => {
      logger.info(`Reconnecting to the server`, { clusterId: clusterID, attemptNumber: attemptNumber })
    });

    socket.on('reconnect_error', (error) => {
      logger.error(`Reconnect error`, { clusterId: clusterID, error: error })
    });

    socket.on('reconnect_failed', () => {
      logger.error(`Reconnect failed`, { clusterId: clusterID })
    });

    socket.on('error', (error) => {
      logger.error(`Socket error`, { clusterId: clusterID, error: error })
    });

    socket.on('connect_timeout', (timeout) => {
      logger.error(`Socket connect timeout`, { clusterId: clusterID, timeout: timeout })
    });



    socket.on(Events.GET_NODES, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_NODES, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetResourceRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_NODES, traceId: request.traceId })
      let output: AgentOutput;
      output = await GetKubectlNodes()
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_NODES, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });

    socket.on(Events.K8SGPT, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.K8SGPT, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetK8sGPTRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.K8SGPT, traceId: request.traceId })
      let output: AgentOutput;
      if (k8sGPTResponse?.code !== 0) {
        openaiKey = parsedData.aiKey
        output = await RunK8sGPTCommands(parsedData, false)
        k8sGPTResponse = output
      } else {
        output = k8sGPTResponse
      }
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.K8SGPT, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });


    // apply any yaml
    socket.on(Events.APPLY_RESOURCE, async (data, callback) => {

      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.APPLY_RESOURCE, traceId: request.traceId })
      try {

        const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
        const parsedData: ApplyResourceRequest = JSON.parse(decryptedData)
        logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.APPLY_RESOURCE, traceId: request.traceId })
        console.log(parsedData)
        const resource = await ApplyKubectl(parsedData)
        console.log(resource)

        const encryptData = EncryptDecryptService.encrypt(JSON.stringify(resource), secretKey)
        logger.info(`Event sent`, { clusterId: clusterID, event: Events.APPLY_RESOURCE, traceId: request.traceId })
        request.data = encryptData

      } catch (e) {
        console.log("error occured", e, data)

      }
      callback(JSON.stringify(request))
    });


    socket.on(Events.SHELL, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.SHELL, traceId: request.traceId })
      try {
        const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
        const parsedData = JSON.parse(decryptedData)
        logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.SHELL, traceId: request.traceId })
        const resource = await ApplyKubectl({ data: parsedData })
        const encryptData = EncryptDecryptService.encrypt(JSON.stringify(resource), secretKey)
        logger.info(`Event sent`, { clusterId: clusterID, event: Events.SHELL, traceId: request.traceId })
        request.data = encryptData

      } catch (e) {
        console.log("error occured", e, data)

      }
      callback(JSON.stringify(request))
    });



    socket.on(Events.CREATE_JOB_FROM_CRON, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.CREATE_JOB_FROM_CRON, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: CreateJobFromCronRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.CREATE_JOB_FROM_CRON, traceId: request.traceId })
      const resource = await CreateJobFromCronJob(parsedData)
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(resource), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.CREATE_JOB_FROM_CRON, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });



    // get resource except for secrets
    socket.on(Events.GET_RESOURCE, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_RESOURCE, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetResourceRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_RESOURCE, traceId: request.traceId })
      let output: AgentOutput;
      if (restrictedResources.includes(parsedData.resource) && !!parsedData.name) {
        output = { code: 1, error: `not allowed to get ${parsedData.resource}` }
      } else {
        output = await GetKubectl(parsedData)
      }

      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_RESOURCE, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });

    socket.on(Events.GET_UNHEALTHY_PODS, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_UNHEALTHY_PODS, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetResourceRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_UNHEALTHY_PODS, traceId: request.traceId })
      let output: AgentOutput;
      output = await GetUnhealthyPods(parsedData.namespace as string, parsedData.labels)
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_UNHEALTHY_PODS, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });


    socket.on(Events.GET_LOGS, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_LOGS, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetLogRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_LOGS, traceId: request.traceId })
      let output: AgentOutput;

      output = await GetKubectlLogs(parsedData)


      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_LOGS, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });

    socket.on(Events.GET_EVENTS, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_EVENTS, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetEventRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_EVENTS, traceId: request.traceId })
      let output: AgentOutput;

      output = await GetKubectlEvents(parsedData)
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_EVENTS, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });


    socket.on(Events.DELETE_RESOURCE, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.DELETE_RESOURCE, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetResourceRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.DELETE_RESOURCE, traceId: request.traceId })
      let output: AgentOutput;

      output = await DeleteKubectl(parsedData)


      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.DELETE_RESOURCE, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });

    socket.on(Events.KAPP_DELETE, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.KAPP_DELETE, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: KAppDeleteRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.KAPP_DELETE, traceId: request.traceId })
      let output: AgentOutput;
      output = await RunDeleteKappCommand(parsedData)
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.DELETE_RESOURCE, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });


    socket.on(Events.FORWARD_REQUEST, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.FORWARD_REQUEST, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: APIForwardRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.FORWARD_REQUEST, traceId: request.traceId })
      let output: AgentOutput;

      if (parsedData.url.includes('kubernetes')) {
        output = { code: 1, error: `not allowed to forward request to kubernetes api` }
      } else {
        output = await ApiRequestForwarder(parsedData)
      }
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.FORWARD_REQUEST, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });


    socket.on(Events.PING, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.PING })
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(Events.PONG), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.PING })
      request.data = encryptData
      callback(JSON.stringify(request))
    });



    socket.on(Events.GET_PODS, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_PODS, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetResourceRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_PODS, traceId: request.traceId })
      let output: AgentOutput;
      if (restrictedResources.includes(parsedData.resource) && !!parsedData.name) {
        output = { code: 1, error: `not allowed to get ${parsedData.resource}` }
      } else {
        output = await GetKubectlPods(parsedData)
      }

      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_PODS, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });

    socket.on(Events.GET_PROMETHEUS_METRICS, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_PROMETHEUS_METRICS, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: PrometheusRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_PROMETHEUS_METRICS, traceId: request.traceId })
      let output: AgentOutput;
      output = await PrometheusRequestForwarder(parsedData)
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_PROMETHEUS_METRICS, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    })

    socket.on(Events.GET_SERVICE, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_SERVICE, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetResourceRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_SERVICE, traceId: request.traceId })
      let output: AgentOutput;
      if (restrictedResources.includes(parsedData.resource) && !!parsedData.name) {
        output = { code: 1, error: `not allowed to get ${parsedData.resource}` }
      } else {
        output = await GetKubectlService(parsedData)
      }

      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_SERVICE, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });

    socket.on(Events.REDEPLOY, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.REDEPLOY, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: RedeployRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.REDEPLOY, traceId: request.traceId })
      const output: AgentOutput = await RestartDeployment(parsedData)
      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.REDEPLOY, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });



    socket.on(Events.GET_NAMESPACES, async (data, callback) => {
      const request = JSON.parse(data) as AgentRequestResponse
      logger.info(`Event received`, { clusterId: clusterID, event: Events.GET_NAMESPACES, traceId: request.traceId })
      const decryptedData = EncryptDecryptService.decrypt(request.data, secretKey)
      const parsedData: GetResourceRequest = JSON.parse(decryptedData)
      logger.info(`Event data decrypted `, { clusterId: clusterID, event: Events.GET_NAMESPACES, traceId: request.traceId })
      let output: AgentOutput;
      if (restrictedResources.includes(parsedData.resource) && !!parsedData.name) {
        output = { code: 1, error: `not allowed to get ${parsedData.resource}` }
      } else {
        output = await GetKubectlNamespaces({} as GetResourceRequest)
      }

      const encryptData = EncryptDecryptService.encrypt(JSON.stringify(output), secretKey)
      logger.info(`Event sent`, { clusterId: clusterID, event: Events.GET_NAMESPACES, traceId: request.traceId })
      request.data = encryptData
      callback(JSON.stringify(request))
    });


    try {
      const data = await SocketService.getSocket()?.timeout(10000).emitWithAck(Events.GET_OPEN_AI_KEY, JSON.stringify({}))
      openaiKey = JSON.parse(data).data as string

      await RunK8sGPTCommands({ aiKey: openaiKey }, true)

      setTimeout(async () => {
        setK8sGPTResponse()
      }, 1000 * 60 * 2)

      setInterval(async () => {
        if (openaiKey !== '') {
          await RunK8sGPTCommands({ aiKey: openaiKey }, true)
          setTimeout(async () => {
            setK8sGPTResponse()
          }, 1000 * 60 * 2)
        }
      }, 1000 * 60 * 60 * 24)

      const setK8sGPTResponse = async () => {
        console.log("setting k8sGPTResponse")
        const res = await RunK8sGPTCommands({ aiKey: openaiKey }, false)
        if (res.code === 0) {
          console.log("k8sGPTResponse set")
          k8sGPTResponse = res
        } else {
          setTimeout(async () => {
            console.log("retrying to set k8sGPTResponse. Previous Error:", JSON.stringify(res))
            setK8sGPTResponse()
          }, 1000 * 60);
        }
      }
    } catch (e) {
      logger.error("Error in getting openai key", e)
    }

  } catch (err) {
    logger.error("main function error occured. Restart will occur now. Error: ", err)
    process.exit(1);

  }
}

main().catch((err) => { });


function getImageVersion(image: string): string {
  const imageParts = image.split(':');
  if (imageParts.length === 2) {
    return imageParts[1];
  }
  return 'latest';
}

function getImageVersionFromDeployment(deployment: any): string {
  if (deployment?.spec?.template?.spec?.containers?.length > 0) {
    for (const container of deployment.spec.template.spec.containers) {
      if (container.name === 'skyu-agent') {
        return getImageVersion(container.image);
      }
    }
  }
  return 'not-found'
}



