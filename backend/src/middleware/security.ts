import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import rateLimit from 'express-rate-limit';

// Create rate limiter using memory instead of Redis
const rateLimiter = new RateLimiterMemory({
  points: 100, // Number of points
  duration: 60, // Per 60 seconds
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // allow 1000 requests per minute per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

export const monitoringLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500, // allow 500 requests per minute per IP
  message: 'Too many monitoring requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// File type validation
export const fileTypeValidator = (req: Request, res: Response, next: NextFunction) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'video/mp4',
    'video/webm',
    'application/pdf',
    'text/plain',
    'application/octet-stream' // Allow binary data for chunks
  ];

  const fileType = req.body.fileType || req.file?.mimetype;
  
  logger.info('File type validation:', {
    fileType,
    bodyFileType: req.body.fileType,
    fileMimetype: req.file?.mimetype,
    allowedTypes
  });
  
  if (!fileType) {
    logger.error('No file type provided');
    return res.status(400).json({ error: 'No file type provided' });
  }

  if (!allowedTypes.includes(fileType)) {
    logger.error('Invalid file type:', { fileType, allowedTypes });
    return res.status(400).json({ error: 'Invalid file type' });
  }

  next();
};

// File size validation
export const fileSizeValidator = (req: Request, res: Response, next: NextFunction) => {
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const fileSize = req.body.fileSize || req.file?.size;

  if (!fileSize || fileSize > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File size exceeds limit' });
  }

  next();
};

// Rate limiting middleware
export const rateLimiterMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await rateLimiter.consume(req.ip || 'unknown');
    next();
  } catch (error) {
    logger.error('Rate limit exceeded', { ip: req.ip || 'unknown' });
    res.status(429).json({ error: 'Too many requests' });
  }
};

// Chunk size validation
export const chunkSizeValidator = (req: Request, res: Response, next: NextFunction) => {
  const MAX_CHUNK_SIZE = 1024 * 1024; // 1MB
  const chunkSize = req.file?.size;

  if (!chunkSize || chunkSize > MAX_CHUNK_SIZE) {
    return res.status(400).json({ error: 'Chunk size exceeds limit' });
  }

  next();
};

// Upload session validation
export const uploadSessionValidator = async (req: Request, res: Response, next: NextFunction) => {
  const uploadId = req.body.uploadId || req.params.uploadId;
  
  if (!uploadId) {
    return res.status(400).json({ error: 'Missing upload ID' });
  }

  // For development, we'll just check if the uploadId exists
  if (!uploadId.startsWith('upload_')) {
    return res.status(404).json({ error: 'Invalid upload ID format' });
  }
  
  next();
};

// Basic malicious file detection
export const maliciousFileDetector = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next();
  }

  const buffer = req.file.buffer;
  const magicNumbers = {
    jpeg: Buffer.from([0xFF, 0xD8, 0xFF]),
    png: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
    gif: Buffer.from([0x47, 0x49, 0x46, 0x38]),
    mp4: Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
    webm: Buffer.from([0x1A, 0x45, 0xDF, 0xA3])
  };

  const fileType = req.file.mimetype.split('/')[1];
  const expectedMagicNumber = magicNumbers[fileType as keyof typeof magicNumbers];

  if (expectedMagicNumber && !buffer.slice(0, expectedMagicNumber.length).equals(expectedMagicNumber)) {
    logger.warn('Malicious file detected', { 
      type: req.file.mimetype,
      ip: req.ip 
    });
    return res.status(400).json({ error: 'Invalid file format' });
  }

  next();
}; 