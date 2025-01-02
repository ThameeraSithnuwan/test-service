import { spawn } from 'child_process';
import { ApplyResourceRequest, GetEventRequest, GetK8sGPTRequest, GetLogRequest, GetResourceRequest, PluginRequestCommand } from '../../common/interfaces/events';
import { AgentOutput } from '../../common/interfaces/outputs';
import fs from 'fs';

export const RunK8sGPTCommands = (data: GetK8sGPTRequest, enableRaw: boolean): Promise<AgentOutput> => {

    if (data.aiKey === undefined) {
        return Promise.resolve({ code: -1, error: 'No AI key provided' });
    }

    // write the config to a file and pass it to k8sgpt

    try {
        fs.writeFileSync('/.config/k8sgpt.yaml', generateK8sgptConfig(data.aiKey));
        // file written successfully
    } catch (err) {
        console.log("Error writing k8sgpt config file", err)
        return Promise.resolve({ code: -1, error: err });
    }

    const dataArgs = []
    if (data.namespace !== undefined) {
        dataArgs.push('--namespace', data.namespace)
    }
    if (data.filters !== undefined) {
        dataArgs.push('--filters', data.filters.join(','))
    }

    let rawArgs: string[] = []

    if (!enableRaw) {
        rawArgs = ['-o', 'json']
    }
    const args = ['--config', '/.config/k8sgpt.yaml', 'analyze', '--explain', ...dataArgs, '--anonymize', ...rawArgs]

    return executeK8sGpt(args, undefined, false)
}

export const InstallTrivyOperator = (): Promise<AgentOutput> => {

    const args = ['integration', 'activate', 'trivy']

    return executeK8sGpt(args, undefined, true)
}

const generateK8sgptConfig = (key: string): string => {
    return `
active_filters:
    - ConfigAuditReport
    - ReplicaSet
    - ValidatingWebhookConfiguration
    - VulnerabilityReport
    - Service
    - Ingress
    - StatefulSet
    - MutatingWebhookConfiguration
    - Pod
    - Deployment
    - PersistentVolumeClaim
    - CronJob
    - Node
ai:
    defaultprovider: openai
    providers:
      - maxtokens: 2048
        model: gpt-3.5-turbo
        name: openai
        password: ${key}
        temperature: 0.7
        topp: 0.5
kubeconfig: ""
kubecontext: ""
`
}

const executeK8sGpt = (args: string[], stdinData?: string, returnRawOutput?: boolean): Promise<AgentOutput> => {
    return new Promise((resolve) => {
        const command = 'k8sgpt';

        const process = spawn(command, args, { shell: true });

        let rawOutput = '';
        let stderrOutput = '';

        if (stdinData !== undefined) {
            process.stdin.write(stdinData);
            process.stdin.end();
        }

        process.stdout.on('data', (data) => {
            rawOutput += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderrOutput += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                console.log("k8sgpt output code === 0", args, rawOutput, stderrOutput)
                try {
                    if (returnRawOutput) {
                        // for some reason data is empty and stderrOutput has the output
                        return resolve({ code: code, data: stderrOutput });
                    }
                    const parsedOutput = JSON.parse(rawOutput);
                    resolve({ code: code, data: parsedOutput });
                } catch (error) {
                    resolve({ code: code, error: 'Error parsing k8sgpt output as JSON' });
                }
            } else {
                console.log("k8sgpt output code !== 0", args, rawOutput, stderrOutput)
                resolve({ code: code, error: stderrOutput });
            }
        });

        process.on('error', (err) => {
            console.log("k8sgpt output process error", args, rawOutput, stderrOutput, err)
            resolve({ code: -1, error: `Error executing k8sgpt: ${err.message}` });
        });
    });
};




