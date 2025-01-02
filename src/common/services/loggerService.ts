import winston from 'winston';

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};


// Custom format for logging as JSON
const jsonFormat = winston.format.printf(({ timestamp, level, message, traceid, ...metadata }) => {
  const logObject = {
    timestamp,
    level,
    message,
    traceid,
    ...metadata,
  };
  return JSON.stringify(logObject);
});

// Configure Winston logger
const logger = winston.createLogger({
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.splat(), // Allows string interpolation (e.g., logger.info('Hello %s', 'world'))
    winston.format.errors({ stack: true }), // Prints error stack trace
    jsonFormat // Use the custom JSON format
  ),
  transports: [
    new winston.transports.Console({ level: 'debug' }), // Output to console
    // Add more transports if needed (e.g., writing logs to a file)
  ],
});

// Export the logger instance
export default logger;
