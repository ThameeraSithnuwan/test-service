
import 'reflect-metadata';
import { BadRequestError, Body, Delete, Get, InternalServerError, JsonController, Param, Post, QueryParams, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApplyResourceRequest, GetResourceRequest, GetLogRequest, GetEventRequest, PrometheusRequest, GetK8sGPTRequestQuery, GetK8sGPTRequest } from '../../common/interfaces/events';
import { Events } from '../../common/contstants/events';
import { AgentOutput } from '../../common/interfaces/outputs';
import { AgentService } from '../services/agentService';
import { AgentRequestResponse } from "../../common/interfaces/events";
import { getErrorMessage } from './handleErrors';
import { ClusterIdVerifyMiddleware } from '../middlewares/clusterIdVerifyMiddleware';
import { getClusterById } from './clusterController';
import { GetAWSContainerLogsQuery } from '../services/credentialService';
import configData from '../configs/config';

export interface LogRequest {
  namespace: string;
  name: string;
  label: string[];
  container: string;
  sinceSeconds: number;
  previous: boolean | string;
  cloudProviderLogs: boolean | string;
}

export interface LogResponse {
  status: string;
  data?: any;
  error?: any;
  queryId?: string;
  cloudProvider?: string;
}


@JsonController('/observability')
@UseBefore(ClusterIdVerifyMiddleware)
export class ObservabilityController {

  @Get('/logs')
  async getLogs(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: LogRequest): Promise<LogResponse> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    // check if queryParams.labels is an array and if its not convert to array
    if (queryParams.label && !Array.isArray(queryParams.label)) {
      queryParams.label = [queryParams.label]
    }

    if (!queryParams.namespace) {
      throw new BadRequestError(`Namespace is required`)
    }

    if (queryParams.name && queryParams.label) {
      throw new BadRequestError(`Cannot use name and label at the same time`)
    }

    if (queryParams.cloudProviderLogs === 'true') {

      if (cluster.type === 'aws') {
        let labels: { key: string, value: string }[] = [];
        if (queryParams.label) {
          labels = queryParams.label.map((label: string) => {
            const [key, value] = label.split('=');
            return { key, value }
          })
        }
        const res = await GetAWSContainerLogsQuery(cluster, {
          labels,
          containerName: queryParams.container,
          podName: queryParams.name,
          namespace: queryParams.namespace
        }, request.traceId as string)
        return {
          status: 'queued',
          queryId: res.data,
          cloudProvider: 'aws'
        }
      }
    }

    const payload: GetLogRequest = {
      namespace: queryParams.namespace,
      name: queryParams.name,
      labels: queryParams.label,
      container: queryParams.container,
      sinceSeconds: queryParams.sinceSeconds,
      previous: queryParams.previous === 'true'
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_LOGS,
      uuid: uuidv4(),
      projectId: request.projectId as string,
      organizationId: request.organizationId as string,
      clusterSecretKeyRef: cluster.clusterSecretKey
    }

    try {
      const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
      return {
        status: 'completed',
        data: res.data,
        error: res.error
      }
    } catch (error) {
      throw new InternalServerError(getErrorMessage(error, request.traceId as string));
    }
  }


  @Get('/events')
  async getEvents(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<AgentOutput> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)
    // check if queryParams.labels is an array and if its not convert to array
    if (queryParams.label && !Array.isArray(queryParams.label)) {
      queryParams.label = [queryParams.label]
    }


    const payload: GetEventRequest = {
      namespace: queryParams.namespace,
      name: queryParams.name,
      resource: queryParams.resource,
      type: queryParams.type,
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_EVENTS,
      uuid: uuidv4(),
      projectId: request.projectId as string,
      organizationId: request.organizationId as string,
      clusterSecretKeyRef: cluster.clusterSecretKey
    }

    try {
      const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
      return res;
    } catch (error) {
      throw new InternalServerError(getErrorMessage(error, request.traceId as string));
    }
  }

  @Get('/prometheus')
  async getPrometheus(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: PrometheusRequest): Promise<AgentOutput> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    const payload: PrometheusRequest = {
      query: queryParams.query,
      start: queryParams.start,
      end: queryParams.end,
      step: queryParams.step,
      queryType: queryParams.queryType
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_PROMETHEUS_METRICS,
      uuid: uuidv4(),
      projectId: request.projectId as string,
      organizationId: request.organizationId as string,
      clusterSecretKeyRef: cluster.clusterSecretKey
    }

    try {
      const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
      return res;
    } catch (error) {
      throw new InternalServerError(getErrorMessage(error, request.traceId as string));
    }
  }

  @Get('/ai-k8s')
  async getK8sGpt(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: GetK8sGPTRequestQuery): Promise<AgentOutput> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    const payload: GetK8sGPTRequest = {
      namespace: queryParams.namespace,
      filters: queryParams.filters,
      aiKey: configData.aiKey
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.K8SGPT,
      uuid: uuidv4(),
      projectId: request.projectId as string,
      organizationId: request.organizationId as string,
      clusterSecretKeyRef: cluster.clusterSecretKey
    }

    try {
      const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
      return res;
    } catch (error) {
      throw new InternalServerError(getErrorMessage(error, request.traceId as string));
    }
  }

}



