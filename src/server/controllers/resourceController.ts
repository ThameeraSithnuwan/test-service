
import 'reflect-metadata';
import { BadRequestError, Body, Delete, Get, InternalServerError, JsonController, Param, Post, QueryParams, Req, Res, UseBefore, } from 'routing-controllers';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApplyResourceRequest, CreateJobFromCronRequest, GetResourceRequest, KAppDeleteRequest, RedeployRequest } from '../../common/interfaces/events';
import { Events } from '../../common/contstants/events';
import { AgentOutput } from '../../common/interfaces/outputs';
import { AgentService } from '../services/agentService';
import { AgentRequestResponse } from "../../common/interfaces/events";
import { getErrorMessage } from './handleErrors';
import { ClusterIdVerifyMiddleware } from '../middlewares/clusterIdVerifyMiddleware';
import { getClusterById } from './clusterController';
const yaml = require('js-yaml');


@JsonController('/resource')
@UseBefore(ClusterIdVerifyMiddleware)
export class APIResourceController {
  @Post('/')
  async applyResource(@Req() request: Request, @Res() response: Response, @Body() payload: ApplyResourceRequest): Promise<any> {


    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)


    if (!payload.resourceId || !payload.kind || !payload.namespace || !payload.name) {

      if (typeof payload.data === 'string') {
        try {
          const data = yaml.load(payload.data);
          if (Array.isArray(data)) {
            payload.kind = 'Mixed YAML List'
            payload.message = payload.message || 'Mixed YAML Resource list applied'

          } else if (typeof data === 'object' && data !== null) {
            payload.kind = payload.kind || data?.metadata?.kind
            payload.name = payload.name || data?.metadata?.name
            payload.namespace = payload.namespace || data?.metadata?.namespace
            payload.message = payload.message || 'YAML Resource applied'
          }
        } catch (error) {
          console.error(error)
        }
      } else {
        payload.kind = payload.kind || payload?.data?.metadata?.kind
        payload.name = payload.name || payload?.data?.metadata?.name
        payload.namespace = payload.namespace || payload?.data?.metadata?.namespace
        payload.message = payload.message || 'JSON Resource applied'
      }
    }

    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.APPLY_RESOURCE,
      uuid: uuidv4(),
      projectId: request.projectId as string,
      organizationId: request.organizationId as string,
      clusterSecretKeyRef: cluster.clusterSecretKey,
      cacheMetadata: {
        resourceId: payload.resourceId,
        name: payload.name,
        kind: payload.kind,
        namespace: payload.namespace,
        message: payload.message
      }
    }


    try {
      const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
      return res;
    } catch (error) {
      throw new InternalServerError(getErrorMessage(error, request.traceId as string));
    }
  }


  @Post('/job-from-cron')
  async createJobFromCron(@Req() request: Request, @Res() response: Response, @Body() payload: CreateJobFromCronRequest): Promise<any> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    payload.jobName = payload.jobName || `${payload.cronJobName}-manual-${uuidv4()}`

    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.CREATE_JOB_FROM_CRON,
      uuid: uuidv4(),
      projectId: request.projectId as string,
      organizationId: request.organizationId as string,
      clusterSecretKeyRef: cluster.clusterSecretKey,
      // cacheMetadata: {
      //   resourceId: payload.resourceId,
      //   name: payload.name,
      //   kind: payload.kind,
      //   namespace: payload.namespace,
      //   message: payload.message
      // }
    }


    try {
      const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
      return res;
    } catch (error) {
      throw new InternalServerError(getErrorMessage(error, request.traceId as string));
    }
  }

  @Get('/:type')
  async getResource(@Req() request: Request, @Res() response: Response, @Param('type') type: string, @QueryParams() queryParams: any): Promise<AgentOutput> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    // check if queryParams.labels is an array and if its not convert to array
    if (queryParams.label && !Array.isArray(queryParams.label)) {
      queryParams.label = [queryParams.label]
    }

    if (queryParams.name && queryParams.label) {
      throw new BadRequestError(`Cannot use name and label at the same time`)
    }

    const payload: GetResourceRequest = {
      resource: type,
      namespace: queryParams.namespace,
      name: queryParams.name,
      labels: queryParams.label
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_RESOURCE,
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

  @Get('/pods/unhealthy')
  async getUnhealthyPods(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<AgentOutput> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    const payload: GetResourceRequest = {
      resource: 'pods',
      namespace: queryParams.namespace,
    }

    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_UNHEALTHY_PODS,
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

  @Get('/pods/list')
  async getPodList(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<AgentOutput> {


    if (queryParams.name && queryParams.label) {
      throw new BadRequestError(`Cannot use name and label at the same time`)
    }

    // check if queryParams.labels is an array and if its not convert to array
    if (queryParams.label && !Array.isArray(queryParams.label)) {
      queryParams.label = [queryParams.label]
    }


    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    const payload: GetResourceRequest = {
      resource: 'pods',
      namespace: queryParams.namespace,
      name: queryParams.name,
      labels: queryParams.label
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_PODS,
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


  @Post('/deploy/redeploy')
  async redeploy(@Req() request: Request, @Res() response: Response, @Body() payload: RedeployRequest): Promise<AgentOutput> {


    if (!payload.deploymentName || !payload.namespace) {
      throw new BadRequestError(`deploymentName and namespace is required`)
    }


    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.REDEPLOY,
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


  @Get('/service/list')
  async getServiceList(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<AgentOutput> {



    if (queryParams.name && queryParams.label) {
      throw new BadRequestError(`Cannot use name and label at the same time`)
    }

    // check if queryParams.labels is an array and if its not convert to array
    if (queryParams.label && !Array.isArray(queryParams.label)) {
      queryParams.label = [queryParams.label]
    }


    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    const payload: GetResourceRequest = {
      resource: 'service',
      namespace: queryParams.namespace,
      name: queryParams.name,
      labels: queryParams.label
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_SERVICE,
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


  @Get('/namespace/list')
  async getNamespaceList(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<AgentOutput> {



    if (queryParams.name && queryParams.label) {
      throw new BadRequestError(`Cannot use name and label at the same time`)
    }

    // check if queryParams.labels is an array and if its not convert to array
    if (queryParams.label && !Array.isArray(queryParams.label)) {
      queryParams.label = [queryParams.label]
    }

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    const payload: GetResourceRequest = {
      resource: 'namespace',
      name: queryParams.name,
      labels: queryParams.label
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_NAMESPACES,
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




  @Get('/nodes/list')
  async getNodeList(@Req() request: Request, @Res() response: Response, @QueryParams() queryParams: any): Promise<AgentOutput> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    const payload: GetResourceRequest = {
      resource: 'nodes'
    }

    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.GET_NODES,
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



  @Delete('/:type')
  async deleteResource(@Req() request: Request, @Res() response: Response, @Param('type') type: string, @QueryParams() queryParams: any): Promise<AgentOutput> {

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


    const payload: GetResourceRequest = {
      resource: type,
      namespace: queryParams.namespace,
      name: queryParams.name,
      labels: queryParams.label
    }


    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.DELETE_RESOURCE,
      uuid: uuidv4(),
      projectId: request.projectId as string,
      organizationId: request.organizationId as string,
      clusterSecretKeyRef: cluster.clusterSecretKey,
      cacheMetadata: {
        labels: queryParams.label,
        name: payload.name,
        kind: type,
        namespace: payload.namespace,
        message: payload.name? 'Single Resource deleted by name' : 'Multiple Resources deleted by label'
      }
    }

    try {
      const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
      return res;
    } catch (error) {
      throw new InternalServerError(getErrorMessage(error, request.traceId as string));
    }
  }


  @Delete('/kapp/:id')
  async deleteApp(@Req() request: Request, @Res() response: Response, @Param('id') id: string, @QueryParams() queryParams: any): Promise<AgentOutput> {

    const cluster = await getClusterById(request.clusterId as string, request.projectId as string, request.organizationId as string)

    // if labels is not provided then throw error
    if (!queryParams.label) {
      throw new BadRequestError(`Labels required`)
    }
    // check if queryParams.labels is an array and if its not convert to array
    if (queryParams.label && !Array.isArray(queryParams.label)) {
      queryParams.label = [queryParams.label]
    }

    const payload: KAppDeleteRequest = {
      resourceId: id,
      namespace: queryParams.namespace,
      labels: queryParams.label
    }

    const agentRequest: AgentRequestResponse = {
      clusterId: request.clusterId as string,
      data: payload,
      traceId: request.traceId as string,
      event: Events.KAPP_DELETE,
      uuid: uuidv4(),
      projectId: request.projectId as string,
      organizationId: request.organizationId as string,
      clusterSecretKeyRef: cluster.clusterSecretKey,
      cacheMetadata: {
        resourceId: id,
        namespace: payload.namespace,
        labels: queryParams.label,
        message: 'App deleted by labels'
      }
    }

    try {
      const res = await AgentService.communicateWithCluster(agentRequest, agentRequest.traceId);
      return res;
    } catch (error) {
      throw new InternalServerError(getErrorMessage(error, request.traceId as string));
    }
  }
}
