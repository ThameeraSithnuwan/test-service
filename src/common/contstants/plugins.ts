import { PluginRequestCommand } from "../interfaces/events"

export const CLIBasedPlugins: {
    [key: string]: {
        [key: string]: PluginRequestCommand
    }
} = {
    "fluxcd": {
        command: {
            cli: 'flux',
            commandInputs: ['install', '--components=helm-controller,source-controller']
        },
        statusCommand:
        {
            cli: 'flux',
            commandInputs: ['check']
        },
    },
    "metrics-server": {
        command: {
            cli: 'kubectl',
            commandInputs: ['apply', '-f', 'https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml']
        },
        local: {
            cli: 'kubectl',
            commandInputs: ['apply', '-f', 'https://raw.githubusercontent.com/skyu-io/plugin-yamls/main/metrics-server-insecure-tls.yaml']
        },
        statusCommand: {
            cli: 'kubectl',
            commandInputs: ['get', 'pods', '-n', 'kube-system', '-l', 'k8s-app=metrics-server']
        }
    },
    "replicator-rbac": {
        command: {
            cli: 'kubectl',
            commandInputs: ['apply', '-f', 'https://raw.githubusercontent.com/mittwald/kubernetes-replicator/master/deploy/rbac.yaml']
        }
    },
    "replicator-deployment": {
        command: {
            cli: 'kubectl',
            commandInputs: ['apply', '-f', 'https://raw.githubusercontent.com/mittwald/kubernetes-replicator/master/deploy/deployment.yaml']
        }
    },
    "reloader": {
        command: {
            cli: 'kubectl',
            commandInputs: ['apply', '-f', 'https://raw.githubusercontent.com/stakater/Reloader/master/deployments/kubernetes/reloader.yaml']
        }
    },
    "rbac": {
        command: {
            cli: 'kubectl',
            commandInputs: ['apply', '-f', 'https://raw.githubusercontent.com/skyu-io/plugin-yamls/refs/heads/main/rbac.yaml']
        }
    }
}