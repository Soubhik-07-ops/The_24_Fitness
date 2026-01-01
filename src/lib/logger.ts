// Production-safe logging utility
// Only logs in development mode to avoid exposing sensitive data in production

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
    log: (...args: any[]) => {
        if (isDev) {
            console.log(...args);
        }
    },
    error: (...args: any[]) => {
        // Always log errors, but sanitize in production
        if (isDev) {
            console.error(...args);
        } else {
            // In production, only log error messages, not full objects
            const sanitized = args.map(arg => {
                if (arg instanceof Error) {
                    return arg.message;
                }
                if (typeof arg === 'object') {
                    return '[Object]';
                }
                return arg;
            });
            console.error(...sanitized);
        }
    },
    warn: (...args: any[]) => {
        if (isDev) {
            console.warn(...args);
        }
    },
    info: (...args: any[]) => {
        if (isDev) {
            console.info(...args);
        }
    },
    debug: (...args: any[]) => {
        if (isDev) {
            console.debug(...args);
        }
    }
};

