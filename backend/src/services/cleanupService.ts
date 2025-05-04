import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const redisClient = createClient();
redisClient.connect();

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const CHUNK_DIR = path.join(UPLOAD_DIR, 'chunks');
const FILE_RETENTION_DAYS = 30;
const CHUNK_RETENTION_MINUTES = 30;

interface UploadMetadata {
  status: string;
  createdAt: number;
  lastModified: number;
}

export class CleanupService {
  private static instance: CleanupService;
  private scanInterval: NodeJS.Timeout;

  private constructor() {
    // Start cleanup scan every 5 minutes
    this.scanInterval = setInterval(() => this.scanAndCleanup(), 5 * 60 * 1000);
  }

  public static getInstance(): CleanupService {
    if (!CleanupService.instance) {
      CleanupService.instance = new CleanupService();
    }
    return CleanupService.instance;
  }

  private async scanAndCleanup() {
    try {
      await this.cleanupIncompleteUploads();
      await this.cleanupOldFiles();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  private async cleanupIncompleteUploads() {
    try {
      const keys = await redisClient.keys('upload:*');
      const now = Date.now();

      for (const key of keys) {
        const metadataStr = await redisClient.get(key);
        if (!metadataStr) continue;

        const metadata: UploadMetadata = JSON.parse(metadataStr);
        const ageInMinutes = (now - metadata.lastModified) / (60 * 1000);

        if (ageInMinutes > CHUNK_RETENTION_MINUTES && metadata.status !== 'completed') {
          // Delete incomplete upload
          await this.deleteUpload(key.split(':')[1]);
        }
      }
    } catch (error) {
      console.error('Error cleaning up incomplete uploads:', error);
    }
  }

  private async cleanupOldFiles() {
    try {
      const files = fs.readdirSync(UPLOAD_DIR);
      const now = Date.now();
      const retentionMs = FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file === 'chunks') continue; // Skip chunks directory

        const filePath = path.join(UPLOAD_DIR, file);
        const stats = fs.statSync(filePath);
        const ageInDays = (now - stats.mtime.getTime()) / (24 * 60 * 60 * 1000);

        if (ageInDays > FILE_RETENTION_DAYS) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old files:', error);
    }
  }

  private async deleteUpload(uploadId: string) {
    try {
      // Delete chunks
      const chunkFiles = fs.readdirSync(CHUNK_DIR)
        .filter(file => file.startsWith(uploadId));

      for (const file of chunkFiles) {
        fs.unlinkSync(path.join(CHUNK_DIR, file));
      }

      // Delete metadata from Redis
      await redisClient.del(`upload:${uploadId}`);
    } catch (error) {
      console.error(`Error deleting upload ${uploadId}:`, error);
    }
  }

  public stop() {
    clearInterval(this.scanInterval);
  }
} 