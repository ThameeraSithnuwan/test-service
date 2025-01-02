export const Events = {
    APPLY_RESOURCE: 'apply-resource',
    SHELL: 'shell',
    CREATE_JOB_FROM_CRON: 'create-job-from-cron',
    GET_RESOURCE: 'get-resource',
    GET_UNHEALTHY_PODS: 'get-unhealthy-pods',
    GET_PODS: 'get-pods',
    GET_SERVICE: 'get-service',
    GET_NODES: 'get-nodes',
    GET_NAMESPACES: 'get-namespaces',
    GET_LOGS: 'get-logs',
    GET_EVENTS: 'get-events',
    GET_PROMETHEUS_METRICS: 'get-prometheus-metrics',
    DELETE_RESOURCE: 'delete-resource',
    KAPP_DELETE: 'kapp-delete',
    FORWARD_REQUEST: 'request-forward',
    PONG: 'pong-test',
    PING: 'ping-test',
    SECRET_RESOLVE: 'secret-resolve',
    GET_OPEN_AI_KEY: 'get-open-ai-key',
    K8SGPT: 'k8sgpt',
    REDEPLOY: 'restart-deployment',
}