
import logger from "../../common/services/loggerService";


export function getErrorMessage(error: any, traceId: string) {
   
    if (typeof error === 'string') {
        // If the error is a string, throw the HttpError with the error message
        logger.error("Error occured in the routing controller", { traceId: traceId, error });
        
        return error;

    } else if (error instanceof Error) {
        // If the error is a string, throw the HttpError with the error message

        logger.error("Error occured in the routing controller", { traceId: traceId, error: error.message });
        return error.message;

    } else {
        logger.error("Error occured in the routing controller", { traceId: traceId, error });
        return 'An unexpected error occurred';
        
    }
}

import { Middleware, ExpressErrorMiddlewareInterface, HttpError } from 'routing-controllers';

@Middleware({ type: 'after' })
export class CustomErrorHandler implements ExpressErrorMiddlewareInterface {
  error(error: any, request: any, response: any, next: (err?: any) => any): any {
    // Check if the error is an instance of HttpError (the base class for exceptions in routing-controllers)
    // If it's an HttpError, the framework has already handled the exception, so we don't need to do anything
    if (error instanceof HttpError) {
      return next(error);
    }

    // Handle the error silently without logging
    // Optionally, you can send a custom response to the client
    response.status(500).json({ message: 'Internal Server Error' });

    // Call next() without an argument to avoid logging the error
    return next();
  }
}
