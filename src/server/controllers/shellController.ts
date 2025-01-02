
import 'reflect-metadata';
import { Body, Controller, Delete, Get, Header, InternalServerError, JsonController, NotFoundError, Post, Put, QueryParams, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';

import { ClusterEntity } from '../entities/cluster.entity';
import yaml from 'js-yaml';

import { ClusterIdVerifyMiddleware } from '../middlewares/clusterIdVerifyMiddleware';
import configData from '../configs/config';
import { AgentRequestResponse } from '../../common/interfaces/events';
import { Events } from '../../common/contstants/events';
import { AgentService } from '../services/agentService';
import { getErrorMessage } from './handleErrors';
import { v4 as uuidv4 } from 'uuid';
import shellJobYaml from '../configs/shellJob';
import { getClusterById } from './clusterController';
import { AuthRBACResponse, GetUserPermissions } from '../services/authService';


@JsonController('/shell')
@UseBefore(ClusterIdVerifyMiddleware)
export class ShellController {

    @Post('/')
    async retry(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<any> {


        // get cluster

        const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

        // generate a shell id
        const shellId = uuidv4()


        // send auth service a request with auth header and get the permissions. k8s permissions.
        const permissions = await GetUserPermissions(request.headers, request.traceId as string)

        if (!permissions.success) {
            throw new NotFoundError('User not found')
        }

        if (!permissions.data?.project?.permission || permissions.data.environments.length === 0) {
            throw new NotFoundError('User does not have access to any project or environment for shell access')
        }

        const username = permissions.data.userId
        // get rbac permissions
        const rbacYaml = GenerateRBACYAML({
            userId: username,
            project: permissions.data.project,
            environments: permissions.data.environments
        }, 'skyu-system', cluster, request.traceId as string)
        // create a shell pod with the same name as shell id

        const shellYAML = await GetShellJobYAML(cluster, shellId, username, request.traceId as string, 'skyu-system')

        const rbacPayload = `${rbacYaml}`
        const shellPayload = `${shellYAML}`

        console.log('rbac-payload', request.traceId, rbacPayload)
        console.log('shell-payload', request.traceId, shellPayload)


        try {
            const agentRequest: AgentRequestResponse = {
                clusterId: cluster.id as string,
                data: rbacPayload,
                traceId: request.traceId as string,
                event: Events.SHELL,
                uuid: uuidv4(),
                projectId: request.projectId as string,
                organizationId: request.organizationId as string,
                clusterSecretKeyRef: cluster.clusterSecretKey
            }

            setTimeout(async () => {
                try {
                    const agentRequest: AgentRequestResponse = {
                        clusterId: cluster.id as string,
                        data: shellPayload,
                        traceId: request.traceId as string,
                        event: Events.SHELL,
                        uuid: uuidv4(),
                        projectId: request.projectId as string,
                        organizationId: request.organizationId as string,
                        clusterSecretKeyRef: cluster.clusterSecretKey
                    }
                    const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
                } catch (error) {
                    console.log(request.traceId, JSON.stringify(error))
                }
            }, 2000)


            const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
            
            // return shell id
            return { shellId: shellId };
        } catch (error) {
            console.log(request.traceId, JSON.stringify(error))
        }
    }

}


export async function GetShellJobYAML(cluster: ClusterEntity, shellId: string, username: string, traceId: string, namespace: string): Promise<string> {

    const filledTemplate = shellJobYaml
        .replace(/\$\{\{clusterId\}\}/g, cluster.id as string)
        .replace(/\$\{\{projectId\}\}/g, cluster.projectId as string)
        .replace(/\$\{\{organizationId\}\}/g, cluster.organizationId as string)
        .replace(/\$\{\{socketUrl\}\}/g, configData.socketUrl)
        .replace(/\$\{\{shellId\}\}/g, shellId)
        .replace(/\$\{\{traceId\}\}/g, traceId)
        .replace(/\$\{\{username\}\}/g, username)
        .replace(/\$\{\{clusterName\}\}/g, cluster.name)
        .replace(/\$\{\{shellImage\}\}/g, configData.shellImage)
        .replace(/\$\{\{namespace\}\}/g, namespace)
    // return without json
    return `${filledTemplate}`

}
// eg: https://github.com/FairwindsOps/rbac-manager/blob/master/examples/rbacdefinition-everything.yaml
export interface RBACDefinition {
    name: string;
    subjects: {
        kind: string;
        name: string;
        namespace: string;
        automountServiceAccountToken: boolean;
    }[];
    clusterRoleBindings?: {
        clusterRole: string;
    }[];
    roleBindings?: {
        clusterRole: string;
        namespace?: string;
        namespaceSelector: {
            matchLabels?: {
                [key: string]: string;
            };
            matchExpressions?: {
                key: string;
                operator: string;
                values: string[];
            }[];
        };
    }[];
}



export function GenerateRBACYAML(rbac: AuthRBACResponse, namespace: string, cluster: ClusterEntity, traceId: string): string {
    const rbacDefinition: RBACDefinition = {
        name: `user-${rbac.userId}`,
        subjects: [{
            kind: 'ServiceAccount',
            name: rbac.userId,
            namespace: namespace,
            automountServiceAccountToken: true,
        }],
        clusterRoleBindings: [
            {
                clusterRole: rbac.project.permission,
            }
        ],
        roleBindings: rbac.environments.map(env => {
            return {
                clusterRole: env.permission,
                namespaceSelector: {
                    matchLabels: {
                        'environmentId': env.id
                    }
                }
            }
        })
    }

    const rbacYAML = {
        apiVersion: 'rbacmanager.reactiveops.io/v1beta1',
        kind: 'RBACDefinition',
        metadata: {
            name: rbac.userId,
            namespace: namespace,
        },
        rbacBindings: [
            rbacDefinition
        ]
    }

    return yaml.dump(rbacYAML)
}
