import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import redis from '../config/redis';

const CHUNKS_DIR = path.join(__dirname, '../../uploads/chunks');

export const cleanupIncompleteUploads = async () => {
  try {
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    const files = await fs.promises.readdir(CHUNKS_DIR);
    
    for (const file of files) {
      const filePath = path.join(CHUNKS_DIR, file);
      const stats = await fs.promises.stat(filePath);
      
      if (stats.mtimeMs < thirtyMinutesAgo) {
        await fs.promises.unlink(filePath);
        const uploadId = file.split('-')[0];
        await redis.del(`upload:${uploadId}`);
        logger.info('Cleaned up incomplete upload', { file });
      }
    }
  } catch (error) {
    logger.error('Cleanup failed:', error);
  }
}; 