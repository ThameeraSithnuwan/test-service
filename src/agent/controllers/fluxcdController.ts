import { spawn } from 'child_process';
import { ApplyResourceRequest, GetEventRequest, GetLogRequest, GetResourceRequest, PluginRequestCommand } from '../../common/interfaces/events';
import { AgentOutput } from '../../common/interfaces/outputs';



export const RunFluxCommandsRaw = (data: string[]): Promise<AgentOutput> => {
    return executeFluxcd(data, undefined, true)
}


const executeFluxcd = (args: string[], stdinData?: string, returnRawOutput?: boolean): Promise<AgentOutput> => {
    return new Promise((resolve) => {
        const command = 'flux';

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




