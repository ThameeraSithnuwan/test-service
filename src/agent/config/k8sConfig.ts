import { KubeConfig } from '@kubernetes/client-node';
import { readFileSync } from 'fs';

export class K8sConfig {
    private static instance: K8sConfig | null = null;
    private kc: KubeConfig;

    private constructor() {
        this.kc = new KubeConfig();
        try {
            // Load the token and CA certificate from the mounted files
            const token = readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8');
            const caCert = readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8');

            // Set the token and caCert data
            this.kc.loadFromOptions({
                clusters: [{
                    name: 'default',
                    server: 'https://kubernetes.default.svc',
                    skipTLSVerify: false,
                    caData: Buffer.from(caCert).toString('base64'),
                }],
                users: [{
                    name: 'default',
                    token: Buffer.from(token).toString('base64'),
                }],
                contexts: [{
                    name: 'default',
                    cluster: 'default',
                    user: 'default',
                }],
                currentContext: 'default',
            });
        } catch (e) {
            console.log(e)
            this.kc.loadFromDefault()
        }
    }

    public static getInstance(): K8sConfig {
        if (!K8sConfig.instance) {
            K8sConfig.instance = new K8sConfig();
        }
        return K8sConfig.instance;
    }

    public getKubeConfig(): KubeConfig {
        return this.kc;
    }

}


