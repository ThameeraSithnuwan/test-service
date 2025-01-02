import io, { Socket } from 'socket.io-client';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const config = {
    clusterID: process.env.CLUSTER_ID || 'cluster_25fb8d07-f999-4bc9-9391-59491c2af4a',
    shellID: process.env.SHELL_ID || '123',
    socketURL: process.env.SOCKET_URL || 'http://localhost:4001',
    clusterName: process.env.CLUSTER_NAME || 'kubernetes',
    username: process.env.USERNAME || 'admin',
};


const connectionString = `${config.socketURL}/shell`;



const socket = io(connectionString, { query: { clusterID: config.clusterID, shellID: config.shellID, type: 'shell' }, transports: ["websocket"], reconnectionAttempts: 1 });

loadKubeconfig();

socket.on('connect', () => {
    console.log('connected to server');
    const term = pty.spawn(
        '/bin/bash',
        [],
        {
            handleFlowControl: true,
            name: 'xterm-256color',
            cwd: process.env.HOME,
            env: process.env as { [key: string]: string },
            cols: 200,
            rows: 60,
        }
    );

    term.on('data', (data) => socket.emit('message', data));
    socket.on('message', (data) => term.write(data));
    socket.on('resize', ({ cols, rows }) => {
        try {
            term.resize(parseInt(cols), parseInt(rows));
        } catch (err) {
            return;
        }
    });
});

socket.on('error', (err) => {
    console.error(err);
    process.exit(1);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    process.exit(0);
});

function loadKubeconfig() {
    const kubedir = path.join(os.homedir(), '.kube');
    const kubeconfigPath = path.join(kubedir, 'config');
    if (!fs.existsSync(kubedir)) {
        fs.mkdirSync(kubedir, { recursive: true });
        fs.writeFileSync(kubeconfigPath, '');
    }

    process.env['KUBECONFIG'] = kubeconfigPath;
    process.env['CLUSTER_NAME'] = config.clusterName;
    process.env['USER'] = config.username;

    execSync(`kubectl config set-cluster $CLUSTER_NAME \
		--server=https://$KUBERNETES_SERVICE_HOST:$KUBERNETES_SERVICE_PORT \
		--certificate-authority=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`);

    // if user is set properly, load the user token 
    execSync(
        `kubectl config set-credentials $USER --token=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)`,
    );
    execSync(
        `kubectl config set-context $CLUSTER_NAME --cluster $CLUSTER_NAME --user=$USER --namespace=default`,
    );
    execSync(`kubectl config use-context $CLUSTER_NAME`);
}
