import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: 'thaiserkit-next', environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local' },
  redact: {
    paths: ['req.headers.authorization', 'password', '*.password', 'token', '*.token', 'secret', '*.secret'],
    censor: '[REDACTED]',
  },
});
