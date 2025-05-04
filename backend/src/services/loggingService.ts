import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import winston from 'winston';
import 'winston-daily-rotate-file';

const redisClient = createClient();
redisClient.connect();

const LOG_DIR = path.join(__dirname, '../../logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info'
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error'
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export class LoggingService {
  private static instance: LoggingService;
  private uploadStats: {
    total: number;
    success: number;
    failed: number;
    active: number;
  };

  private constructor() {
    this.uploadStats = {
      total: 0,
      success: 0,
      failed: 0,
      active: 0
    };
  }

  public static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  public logRequest(req: any, res: any, next: any) {
    const start = Date.now();
    const { method, url, ip, headers } = req;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;

      logger.info('Request completed', {
        method,
        url,
        ip,
        userAgent: headers['user-agent'],
        statusCode,
        duration
      });
    });

    next();
  }

  public logUploadStart(uploadId: string, metadata: any) {
    this.uploadStats.total++;
    this.uploadStats.active++;

    logger.info('Upload started', {
      uploadId,
      ...metadata
    });

    this.updateStats();
  }

  public logUploadComplete(uploadId: string, success: boolean) {
    this.uploadStats.active--;
    if (success) {
      this.uploadStats.success++;
    } else {
      this.uploadStats.failed++;
    }

    logger.info('Upload completed', {
      uploadId,
      success
    });

    this.updateStats();
  }

  public logError(error: Error, context: any = {}) {
    logger.error('Error occurred', {
      error: error.message,
      stack: error.stack,
      ...context
    });
  }

  private async updateStats() {
    try {
      await redisClient.set('upload:stats', JSON.stringify(this.uploadStats));
    } catch (error) {
      this.logError(error as Error, { context: 'updateStats' });
    }
  }

  public async getStats() {
    try {
      const stats = await redisClient.get('upload:stats');
      return stats ? JSON.parse(stats) : this.uploadStats;
    } catch (error) {
      this.logError(error as Error, { context: 'getStats' });
      return this.uploadStats;
    }
  }
} 