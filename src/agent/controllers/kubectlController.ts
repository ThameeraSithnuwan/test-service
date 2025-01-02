import { spawn } from 'child_process';
import { ApplyResourceRequest, CreateJobFromCronRequest, GetEventRequest, GetLogRequest, GetResourceRequest, PluginRequestCommand, RedeployRequest } from '../../common/interfaces/events';
import { AgentOutput } from '../../common/interfaces/outputs';


export const RunKubectlAndGetRawOutput = (data: string[]): Promise<AgentOutput> => {
  return executeKubectl(data, undefined, true);
}

export const ApplyKubectl = (data: ApplyResourceRequest): Promise<AgentOutput> => {

  if (typeof data.data === 'string') {
    return executeKubectl(['apply', '-f', '-'], data.data, true);
  }
  const stdinData = JSON.stringify(data.data);

  return executeKubectl(['apply', '-o', 'json', '-f', '-'], stdinData);
}

export const CreateJobFromCronJob = (data: CreateJobFromCronRequest): Promise<AgentOutput> => {
  return executeKubectl(['create', 'job', '--from', `cronjob/${data.cronJobName}`, '-n', data.namespace, data.jobName as string]);
}

export const DeleteKubectl = (data: GetResourceRequest): Promise<AgentOutput> => {

  const args = ['delete', data.resource]

  if (data.labels) {
    for (const label of data.labels) {
      args.push('-l', label)
    }
  }

  if (data.name) {
    args.push(data.name)
  }
  if (data.namespace) {
    args.push('-n', data.namespace);
  }

  return executeKubectl(args, undefined, true);
}

export const GetKubectlLogs = async (data: GetLogRequest): Promise<AgentOutput> => {

  const args = ['logs', '--timestamps=true']

  if (data.labels) {
    for (const label of data.labels) {
      args.push('-l', label)
    }
  }

  if (data.name) {
    args.push(data.name)
  }
  if (data.namespace) {
    args.push('-n', data.namespace);
  }

  if (data.container) {
    args.push('-c', data.container);
  } else {
    args.push('--all-containers');
  }

  if (!data.previous && data.sinceSeconds) {
    args.push('--since', `${data.sinceSeconds}s`);
  }

  if (data.previous) {
    args.push('--previous', '--tail=1000');
  }

  const rawLogs = await executeKubectl(args, undefined, true);
  if (rawLogs.code !== 0) {
    return rawLogs;
  }
  const logLineList = rawLogs.data?.trim().split('\n') || [];
  const logs = logLineList.map((line: string) => {
    const timestamp = line.slice(0, 31);
    const log = line.slice(31);
    return { timestamp, log };
  });

  return { code: rawLogs.code, data: logs };

}

export const GetKubectlEvents = async (data: GetEventRequest): Promise<AgentOutput> => {

  const args = ['get', 'events', '-o', 'json']

  if (data.name && data.resource) {
    args.push('--for', `${data.resource}/${data.name}`)
  }
  if (data.namespace) {
    args.push('-n', data.namespace);
  } else {
    args.push('--all-namespaces');
  }

  let output = await executeKubectl(args);


  if (data.type) {
    output.data.items = output.data?.items.filter((item: any) => {
      return item.type.toLowerCase() === data?.type?.toLowerCase()
    })
  }

  if (data.name && !data.resource) {
    output.data.items = output.data?.items.filter((item: any) => {
      return item.involvedObject.name.includes(data.name)
    })
  }


  output.data.items = output?.data?.items.map((item: any) => {
    delete item.apiVersion;
    delete item.source;
    delete item.reportingInstance;
    delete item.involvedObject.resourceVersion;
    delete item.involvedObject.uid;
    delete item.involvedObject.apiVersion;
    delete item.metadata.resourceVersion;
    delete item.metadata.uid;
    return item;
  })
  return output;

}

export const GetKubectlPods = async (data: GetResourceRequest, allNamespaces: boolean = false): Promise<AgentOutput> => {

  const getPodArgs = ['get', 'pods', '-o',
    "custom-columns='NAMESPACE:.metadata.namespace,TIMESTAMP:.metadata.creationTimestamp,NODE:.spec.nodeName,IP:.status.hostIP,NAME:.metadata.name,STATUS:.status.phase,RESTARTS:.status.containerStatuses[*].restartCount,LIMITS_CPU:.spec.containers[*].resources.limits.cpu,LIMITS_MEM:.spec.containers[*].resources.limits.memory,REQUESTS_CPU:.spec.containers[*].resources.requests.cpu,REQUESTS_MEM:.spec.containers[*].resources.requests.memory,APPLICATION_ID:.metadata.labels.applicationId,ENV_ID:.metadata.labels.environmentId,VERSION:.metadata.labels.version'"]



  const additionalArgs = [];

  if (data.labels) {
    for (const label of data.labels) {
      additionalArgs.push('-l', label)
    }
    additionalArgs.push('--selector', data.labels.join(','))
  }


  if (data.namespace) {

    additionalArgs.push('-n', data.namespace);
  }

  if (allNamespaces || !data.namespace) {

    additionalArgs.push('--all-namespaces');
  }

  let lineIndex = 0
  if (allNamespaces) {
    lineIndex = 1
  }


  const getPodListPromise = executeKubectl([...getPodArgs, ...additionalArgs], undefined, true);
  const getPodMetricsPromise = executeKubectl(['top', 'pods', ...additionalArgs], undefined, true);
  const getGenericPodListPromise = executeKubectl(['get', 'pods', ...additionalArgs], undefined, true);



  const [podList, podMetrics, genericPodList] = await Promise.all([getPodListPromise, getPodMetricsPromise, getGenericPodListPromise]);



  if (podList.code !== 0) {
    return podList;
  }

  const podListLines = podList.data.trim().split('\n');
  podListLines.shift(); // Remove the header line


  const podListResult = podListLines.map((line: string) => {
    const lineList = line.trim().split(/\s+/).filter(Boolean);

    return {
      namespace: lineList[0],
      timestamp: lineList[1],
      node: lineList[2],
      ip: lineList[3],
      name: lineList[4],
      status: lineList[5],
      restarts: parseInt(lineList[6]),
      limits_cpu: convertCpuToCores(lineList[7]),
      limits_mem: convertMemoryToMB(lineList[8]),
      requests_cpu: convertCpuToCores(lineList[9]),
      requests_mem: convertMemoryToMB(lineList[10]),
      applicationId: lineList[11],
      environmentId: lineList[12],
      version: lineList[13]
    };
  });
  podList.data = podListResult;

  const genericPodListMap: any = {};
  if (genericPodList.code === 0) {
    const genericPodListLines = genericPodList.data.trim().split('\n');
    genericPodListLines.shift(); // Remove the header line

    genericPodListLines.map((line: string) => {
      const lineList = line.trim().split(/\s+/).filter(Boolean);
      let stardardLineIndex = 0
      if (allNamespaces || !data.namespace) {
        stardardLineIndex = -1
      }
      genericPodListMap[lineList[stardardLineIndex + 2]] = {
        namespace: lineList[stardardLineIndex + 1],
        name: lineList[stardardLineIndex + 2],
        ready: lineList[stardardLineIndex + 3],
        status: lineList[stardardLineIndex + 4],
        restarts:  parseInt(lineList[stardardLineIndex + 5]),
      }
    })
  }

  if (podMetrics.code !== 0) {
    console.log('Error getting metrics', podMetrics); ``
    return podList;
  }

  const metricText = podMetrics.data;

  const Metriclines = metricText.trim().split('\n');
  Metriclines.shift(); // Remove the header line

  const metricResultMap: any = {};
  Metriclines.map((line: string) => {
    let stardardLineIndex = 0
    if (allNamespaces || !data.namespace) {
      stardardLineIndex = -1
    }
    const lineList = line.trim().split(/\s+/).filter(Boolean);
    const namespace = lineList[0 + stardardLineIndex]
    const name = lineList[1 + lineIndex]
    const cpu = convertCpuToCores(lineList[2 + lineIndex])
    const memory = convertMemoryToMB(lineList[3 + lineIndex])

    metricResultMap[name] = {
      namespace, name, cpu, memory
    }
    return
  });


  podList.data.forEach((pod: any, index: any) => {
    const metric = metricResultMap[pod.name];
    if (metric) {
      podList.data[index].usage_cpu = metric.cpu;
      podList.data[index].usage_memory = metric.memory;
    }
    const genericPod = genericPodListMap[pod.name];
    if (genericPod) {
      podList.data[index].ready = genericPod.ready;
      podList.data[index].status = genericPod.status;
      podList.data[index].restarts = parseInt(genericPod.restarts);
    }
  });

  return podList;
}

export const GetKubectlService = async (data: GetResourceRequest, allNamespaces: boolean = false): Promise<AgentOutput> => {

  const getSvcArgs = ['get', 'svc']

  const additionalArgs = [];
  if (data.labels) {
    for (const label of data.labels) {
      additionalArgs.push('-l', label)
    }
  }

  if (data.namespace) {
    additionalArgs.push('-n', data.namespace);
  }
  allNamespaces = data.namespace === undefined;
  if (allNamespaces) {
    additionalArgs.push('--all-namespaces');
  }

  let lineIndex = 0
  if (allNamespaces) {
    lineIndex = 1
  }


  const svcList = await executeKubectl([...getSvcArgs, ...additionalArgs], undefined, true);


  const listLines = svcList.data.trim().split('\n');
  listLines.shift(); // Remove the header line


  const podListResult = listLines.map((line: string) => {
    const lineList = line.trim().split(/\s+/).filter(Boolean);

    return {
      namespace: allNamespaces ? lineList[0] : data.namespace,
      name: lineList[lineIndex],
      type: lineList[lineIndex + 1],
      clusterIP: lineList[lineIndex + 2],
      externalIP: lineList[lineIndex + 3],
      ports: lineList.slice(lineIndex + 4, lineList.length - 1).join(' '),
      age: lineList[lineList.length - 1],
    };
  });

  return podListResult;
}
export const GetKubectlNamespaces = async (data: GetResourceRequest): Promise<AgentOutput> => {

  const getArgs = ['get', 'namespaces', '-o', 'json']
  const additionalArgs = [];
  if (data.labels) {
    for (const label of data.labels) {
      additionalArgs.push('-l', label)
    }
  } else {
    additionalArgs.push('--all-namespaces');
  }

  const getResourceListPromise = executeKubectl([...getArgs, ...additionalArgs]);
  const getPodPromise = GetKubectlPods({ resource: 'pods' }, true);
  // const getMetricsPromise = executeKubectl(['top', 'pods', ...additionalArgs], undefined, true); 

  const [list, metrics] = await Promise.all([getResourceListPromise, getPodPromise]);

  if (list.code !== 0) {
    return list;
  }

  list.data = list.data.items;

  const resourceMap: { [key: string]: any } = {};
  list.data.map((resource: any) => {
    resourceMap[resource.metadata.name] = {
      labels: resource.metadata.labels,
      metrics: [],
      annotations: resource.metadata.annotations,
      name: resource.metadata.name
    };
  });

  metrics.data.map((pod: any) => {
    resourceMap[pod.namespace].metrics.push(pod)
  })

  list.data = Object.values(resourceMap);
  return list;
}

export const GetKubectlNodes = async (): Promise<AgentOutput> => {

  const getArgs = ['get', 'nodes', '-o', 'json']


  const getNodeList = executeKubectl([...getArgs]);
  const getNodeMetricsPromise = executeKubectl(['top', 'nodes'], undefined, true);

  const [list, metrics] = await Promise.all([getNodeList, getNodeMetricsPromise]);


  if (list.code !== 0) {
    return list;
  }

  list.data = list.data.items;

  const nodeMap: { [key: string]: any } = {};
  list.data.map((node: any) => {
    delete node.status.images;
    nodeMap[node.metadata.name] = node;
  });

  const metricText = metrics.data;

  const Metriclines = metricText.trim().split('\n');
  Metriclines.shift(); // Remove the header line

  const metricResultMap: any = {};
  Metriclines.map((line: string) => {
    const lineList = line.trim().split(/\s+/).filter(Boolean);
    const name = lineList[0]
    const cpu = convertCpuToCores(lineList[1])
    const cpuPercent = lineList[2]
    const memory = convertMemoryToMB(lineList[3])
    const memoryPercent = lineList[4]

    nodeMap[name].usage_cpu = cpu;
    nodeMap[name].usage_cpu_percent = parseInt(cpuPercent, 10);
    nodeMap[name].usage_memory = memory;
    nodeMap[name].usage_memory_percent = parseInt(memoryPercent, 10);

    return
  });

  list.data = Object.values(nodeMap);
  return list;
}

export const GetKubectl = (data: GetResourceRequest): Promise<AgentOutput> => {

  const args = ['get', '-o', 'json', data.resource]

  if (data.labels) {
    for (const label of data.labels) {
      args.push('-l', label)
    }
    args.push('--selector', data.labels.join(','))
  }
   

  if (data.name) {
    args.push(data.name)
  }
  if (data.namespace) {
    args.push('-n', data.namespace);
  } else {
    args.push('--all-namespaces');
  }

  return executeKubectl(args);
}

export const GetVersion = (): Promise<AgentOutput> => {
  return executeKubectl(['version', '-o', 'json']);
}

export const GetUnhealthyPods = async (namespace?: string, labels?: string[]): Promise<AgentOutput> => {
  const additionalArgs = namespace ? ['-n', namespace] : ['--all-namespaces'];
  if (labels) {
    for (const label of labels) {
      additionalArgs.push('-l', label)
    }
  }
  const output = await executeKubectl(['get', 'pods', ...additionalArgs, '-o', 'wide', '|', 'gawk', "'!/(Running|Succeeded|Completed)/'"], undefined, true);


  if (output.code !== 0) {
    return output;
  }
  const text = output.data;

  const lines = text.trim().split('\n');
  lines.shift(); // Remove the header line

  const result = lines.map((line: string) => {
    const lineList = line.trim().split(/\s+/).filter(Boolean);
    return {
      namespace: lineList[0],
      name: lineList[1],
      ready: lineList[2],
      status: lineList[3],
      restarts:  parseInt(lineList[4]),
      age: lineList[lineList.length - 5],
      ip: lineList[lineList.length - 4],
      node: lineList[lineList.length - 3],
    };
  });
  output.data = result;
  return output;
}


export const GetMetrics = (): Promise<AgentOutput> => {
  return executeKubectl(['top', '-o', 'json']);
}

export const RestartDeployment = (data: RedeployRequest): Promise<AgentOutput> => {
  return executeKubectl(['rollout', 'restart', 'deployment', data.deploymentName, '-n', data.namespace]);
}

export const executeKubectl = (args: string[], stdinData?: string, returnRawOutput?: boolean): Promise<AgentOutput> => {
  return new Promise((resolve) => {
    const kubectlCommand = 'kubectl';



    const kubectlProcess = spawn(kubectlCommand, args, { shell: true });

    let rawOutput = '';
    let stderrOutput = '';

    if (stdinData !== undefined) {
      kubectlProcess.stdin.write(stdinData);
      kubectlProcess.stdin.end();
    }
    console.log('Executing kubectl', kubectlCommand, args.join(' '), stdinData);

    kubectlProcess.stdout.on('data', (data) => {
      console.log('Data', data.toString());
      rawOutput += data.toString();
    });

    kubectlProcess.stderr.on('data', (data) => {
      console.log('Error', data.toString());
      stderrOutput += data.toString();
    });

    kubectlProcess.on('close', (code) => {
      if (code === 0) {
        try {
          if (returnRawOutput) {
            console.log('Raw output', rawOutput);
            return resolve({ code: code, data: rawOutput });
          }
          const parsedOutput = JSON.parse(rawOutput);
          resolve({ code: code, data: parsedOutput });
        } catch (error) {
          console.log('Error parsing kubectl output as JSON', error);
          resolve({ code: code, error: 'Error parsing kubectl output as JSON' });
        }
      } else {
        console.log('Error executing kubectl', stderrOutput);
        resolve({ code: code, error: stderrOutput });
      }
    });

    kubectlProcess.on('error', (err) => {
      console.log('Error executing kubectl', err);

      resolve({ code: -1, error: `Error executing kubectl: ${err.message}` });
    });
  });
};



function convertMemoryToMB(memoryString: string) {
  const units: any = {
    'Ki': 1024,
    'Mi': 1024 * 1024,
    'Gi': 1024 * 1024 * 1024,
    'Ti': 1024 * 1024 * 1024 * 1024,
  };

  const match = memoryString?.match(/^(\d+(\.\d+)?)\s*([KMG]i?)?$/);
  if (!match) {
    return 0;
  }

  const value = parseFloat(match[1]);
  const unit = match[3] || 'Mi'; // Default to Mi if no unit specified

  if (!units[unit]) {
    console.log('Invalid memory unit: ' + memoryString);
    return 0;
  }

  return value * units[unit] / (1024 * 1024); // Convert from MiB to MB
}


function convertCpuToCores(cpuString: string) {
  const units: any = {
    'm': 0.001,
  };

  const match = cpuString?.match(/^(\d+(\.\d+)?)\s*([m]?)$/);
  if (!match) {
    return 0;
  }

  const value = parseFloat(match[1]);
  const unit = match[3] || ''; // Default to millicores if no unit specified

  if (!units[unit] && parseInt(unit, 10)) {

    console.log('Invalid CPU unit: ' + cpuString);
    return 0;
  }

  return value * units[unit];
}
