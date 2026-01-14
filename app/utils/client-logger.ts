/**
 * Client-side logger utility for structured logging in the browser
 * 
 * This logger provides a consistent interface for logging across the application
 * with support for different log levels, context data, and production-safe configuration.
 * 
 * @example
 * import { logger } from '@/utils/client-logger';
 * 
 * logger.debug('Component mounted', { componentName: 'Dashboard' });
 * logger.error('Failed to fetch data', error, { endpoint: '/api/data' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
}

/**
 * Configuration for the logger
 */
const config = {
    // In production, suppress debug and info logs
    minLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    // Enable/disable console output
    enableConsole: true,
    // Add timestamps to logs
    includeTimestamp: true,
};

const logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Format log message with timestamp and context
 */
function formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
): string {
    const parts: string[] = [];

    if (config.includeTimestamp) {
        parts.push(`[${new Date().toISOString()}]`);
    }

    parts.push(`[${level.toUpperCase()}]`);
    parts.push(message);

    if (context && Object.keys(context).length > 0) {
        parts.push(JSON.stringify(context, null, 2));
    }

    return parts.join(' ');
}

/**
 * Check if log level should be output based on configuration
 */
function shouldLog(level: LogLevel): boolean {
    const minLevelValue = logLevels[config.minLevel as LogLevel] || 0;
    const currentLevelValue = logLevels[level];
    return currentLevelValue >= minLevelValue;
}

/**
 * Client-side logger with structured logging support
 */
export const logger = {
    /**
     * Debug level logging - for detailed debugging information
     * Suppressed in production by default
     */
    debug(message: string, context?: LogContext): void {
        if (!shouldLog('debug')) return;

        if (config.enableConsole) {
            console.debug(formatMessage('debug', message, context));
        }
    },

    /**
     * Info level logging - for general informational messages
     * Suppressed in production by default
     */
    info(message: string, context?: LogContext): void {
        if (!shouldLog('info')) return;

        if (config.enableConsole) {
            console.info(formatMessage('info', message, context));
        }
    },

    /**
     * Warning level logging - for warning messages
     * Always shown in all environments
     */
    warn(message: string, context?: LogContext): void {
        if (!shouldLog('warn')) return;

        if (config.enableConsole) {
            console.warn(formatMessage('warn', message, context));
        }
    },

    /**
     * Error level logging - for error messages with optional Error object
     * Always shown in all environments
     */
    error(message: string, error?: Error | unknown, context?: LogContext): void {
        if (!shouldLog('error')) return;

        const errorContext: LogContext = { ...context };

        if (error instanceof Error) {
            errorContext.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        } else if (error) {
            errorContext.error = error;
        }

        if (config.enableConsole) {
            console.error(formatMessage('error', message, errorContext));

            // Also log the raw error for better stack traces in dev tools
            if (error instanceof Error) {
                console.error(error);
            }
        }
    },
};

/**
 * Update logger configuration at runtime
 */
export function configureLogger(newConfig: Partial<typeof config>): void {
    Object.assign(config, newConfig);
}

export default logger;
