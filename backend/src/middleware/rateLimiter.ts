import { Request, Response, NextFunction } from 'express';
import { redisService } from '../services/redisService';

const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_UPLOADS_PER_HOUR = 100;
const MAX_FILE_SIZE_PER_HOUR = 1024 * 1024 * 1024; // 1GB

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  try {
    // Get user's upload stats for the current window
    const stats = await redisService.getUploadStats();
    
    // Check upload count limit
    if (stats.totalUploads >= MAX_UPLOADS_PER_HOUR) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Maximum uploads per hour reached'
      });
    }

    // Check total size limit
    if (stats.totalSize >= MAX_FILE_SIZE_PER_HOUR) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Maximum upload size per hour reached'
      });
    }

    // Check concurrent uploads
    if (stats.activeUploads >= 5) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many concurrent uploads'
      });
    }

    next();
  } catch (error) {
    console.error('Rate limiter error:', error);
    next(error);
  }
}; 