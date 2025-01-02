import { Middleware, ExpressMiddlewareInterface, HttpError } from 'routing-controllers';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Middleware({ type: 'before' })
export class ExtractHeadersMiddleware implements ExpressMiddlewareInterface {
  use(request: Request, response: Response, next: NextFunction): void {
    const traceIdHeader = 'x-trace-id';
    const organizationIdHeader = 'x-organization-id';
    const projectIdHeader = 'x-project-id';

    request.organizationId = request.header(organizationIdHeader);
    request.projectId = request.header(projectIdHeader);

    if (!request.organizationId && request.path !== '/healthz') {
      response.status(403).json({ error: 'Organization id not found. Please provide x-organization-id header' });
      return;
    }

    let traceId = request.header(traceIdHeader);

    if (!traceId) {
      traceId = uuidv4();
      // If the 'x-trace-id' header is not provided in the request, generate a new trace ID using uuidv4().
      // You can then choose to include it in the response as well.
      response.setHeader(traceIdHeader, traceId);
    }

    request.traceId = traceId;

    next();
  }
}



