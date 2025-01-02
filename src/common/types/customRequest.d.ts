import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      clusterId?: string;
      organizationId?: string;
      projectId?: string;
    }
  }
}