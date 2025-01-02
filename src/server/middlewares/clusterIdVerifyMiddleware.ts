import { Middleware, ExpressMiddlewareInterface, HttpError } from 'routing-controllers';
import { Request, Response, NextFunction } from 'express';


@Middleware({ type: 'before' })
export class ClusterIdVerifyMiddleware implements ExpressMiddlewareInterface {
    use(request: Request, response: Response, next: NextFunction): void {
        const clusterId = request.header('x-cluster-id');

        if (!clusterId) {
            response.status(403).json({ error: 'Cluster id not found. Please provide x-cluster-id header' });
            return;
        }

        request.clusterId = clusterId;
        next();
    }
}


