import { spawn } from 'child_process';
import { ApplyResourceRequest, GetEventRequest, GetLogRequest, GetResourceRequest, KAppDeleteRequest, PluginRequestCommand } from '../../common/interfaces/events';
import { AgentOutput } from '../../common/interfaces/outputs';



export const RunDeleteKappCommand = (data:KAppDeleteRequest): Promise<AgentOutput> => {
    // kapp delete -a label:app=test-batch-cron-job-1 -y --json

    const args = ['delete', '-a', `label:${data.labels.join(',')}`, '-y', '--json']

    return executeKapp(args)
}


const executeKapp = (args: string[], stdinData?: string, returnRawOutput?: boolean): Promise<AgentOutput> => {
    return new Promise((resolve) => {
        const command = 'kapp';

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
                try {
                    if (returnRawOutput) {
                        // for some reason data is empty and stderrOutput has the output
                        return resolve({ code: code, data: stderrOutput });
                    }
                    const parsedOutput = JSON.parse(rawOutput);
                    resolve({ code: code, data: parsedOutput });
                } catch (error) {
                    resolve({ code: code, error: 'Error parsing flux output as JSON' });
                }
            } else {
                resolve({ code: code, error: stderrOutput });
            }
        });

        process.on('error', (err) => {
            resolve({ code: -1, error: `Error executing flux: ${err.message}` });
        });
    });
};




