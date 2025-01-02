import { APIForwardRequest, PrometheusRequest } from "../../common/interfaces/events";
import axios, { AxiosResponse, AxiosError, AxiosRequestConfig } from 'axios';
import { AgentOutput } from "../../common/interfaces/outputs";
import { executeKubectl } from "./kubectlController";

export const ApiRequestForwarder = async (data: APIForwardRequest): Promise<AgentOutput> => {

    const res = await makeApiCall(data.method, data.url, data.body, data.headers)
    return res as AgentOutput;

}

export const PrometheusRequestForwarder = async (data: PrometheusRequest): Promise<AgentOutput> => {

    const output = await executeKubectl(['get', 'svc', '-A', '|', 'grep', 'prometheus', '|', 'grep', '9090', '|', 'grep', '8080'], undefined, true);


    if (output.code !== 0) {
        return output;
    }
    const text = output.data;

    const lines = text.trim().split('\n');

    console.log(lines)

    if (lines.length === 0) {
        return { code: 404, error: 'Prometheus service not found' };
    }

    const prometheusEndPoint = lines.map((line: string) => {
        const prometheusEndPointLine = line.trim().split(/\s+/).filter(Boolean);
        return {
            namespace: prometheusEndPointLine[0],
            name: prometheusEndPointLine[1],
            clusterIp: prometheusEndPointLine[3],
            externalIp: prometheusEndPointLine[4]
        };
    })[0];

    let timequery = '';
    if (data.start && data.end) {
        timequery = `start=${data.start}&end=${data.end}&step=${data.step || 172}`
    }

    const validUTF16StringDecoded = new TextDecoder().decode(base64ToBytes(data.query));


    const url = `http://${prometheusEndPoint.name}.${prometheusEndPoint.namespace}.svc:9090/api/v1/${data.queryType}?query=${encodeURIComponent(validUTF16StringDecoded)}&${timequery}`;
   
    const res = await makeApiCall('get', url, null, null)

    return res as AgentOutput;
}

async function makeApiCall<T>(method: 'get' | 'post' | 'put' | 'delete', url: string, data?: any, headers?: any): Promise<T> {

    const config: AxiosRequestConfig = {
        method: method,
        url: url,
        data: data,
        headers: headers,
        responseEncoding: 'utf-8',
    };

    try {
        const response = await axios(config);
        return { code: 0, data: response.data } as T;
    } catch (error) {
        console.log('debug log for api request - config:', config)
        // Handle any errors that occurred during the API call
        if (axios.isAxiosError(error)) {

            const err = error as AxiosError;
            console.log('debug log for api request - axios error', err.response?.data || err.message || `${err}`)
            return { code: err.response?.status || 500, error: err.response?.data || err.message || `${err}` } as T;
            // The request was made, but the server responded with an error status code (e.g., 4xx, 5xx)

        } else {
            console.log('debug log for api request - uncaught error', error)
            return { code: 400, error: `${error}` } as T;
        }
    }
}

function base64ToBytes(base64: any) {
    // base64 = base64.trim().replace(/ /g, '+');
    const binString = atob(base64);
    const byteArray = Array.from(binString, (m) => m.charCodeAt(0));
    return new Uint8Array(byteArray);
}