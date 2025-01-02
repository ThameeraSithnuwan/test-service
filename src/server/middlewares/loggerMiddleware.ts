// loggerMiddleware.ts
import express from 'express';
import { Middleware, ExpressMiddlewareInterface } from 'routing-controllers';
import logger from '../../common/services/loggerService';


// Winston logger middleware
@Middleware({ type: 'before' })
export class WinstonLoggerMiddleware implements ExpressMiddlewareInterface {
    use(request: express.Request, response: express.Response, next: express.NextFunction): void {
        // Log the request details with body size and traceId (if available)
        const { method, url, query, body, headers } = request;
        const traceId = request.traceId;

        // Log the request info using the Winston logger
        logger.debug("request recieved", {
            traceId,
            method,
            url,
            query,
            headers,
        },);

        next();
    }
}

export default WinstonLoggerMiddleware;
