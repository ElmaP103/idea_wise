import { createClient } from 'redis';
import { logger } from '../utils/logger';

class RedisService {
  private client;
  private readonly CHUNK_EXPIRY = 24 * 60 * 60; // 24 hours in seconds

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.client.on('error', (err) => logger.error('Redis Client Error', err));
    this.client.connect();
  }

  async trackChunk(uploadId: string, chunkIndex: number, chunkData: any): Promise<void> {
    const key = `chunk:${uploadId}:${chunkIndex}`;
    await this.client.set(key, JSON.stringify(chunkData));
    await this.client.expire(key, this.CHUNK_EXPIRY);
  }

  async getChunk(uploadId: string, chunkIndex: number): Promise<any> {
    const key = `chunk:${uploadId}:${chunkIndex}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async trackUploadProgress(uploadId: string, progress: number): Promise<void> {
    const key = `upload:${uploadId}:progress`;
    await this.client.set(key, progress.toString());
    await this.client.expire(key, this.CHUNK_EXPIRY);
  }

  async getUploadProgress(uploadId: string): Promise<number> {
    const key = `upload:${uploadId}:progress`;
    const progress = await this.client.get(key);
    return progress ? parseFloat(progress) : 0;
  }

  async trackUploadMetadata(uploadId: string, metadata: any): Promise<void> {
    const key = `upload:${uploadId}:metadata`;
    await this.client.set(key, JSON.stringify(metadata));
    await this.client.expire(key, this.CHUNK_EXPIRY);
  }

  async getUploadMetadata(uploadId: string): Promise<any> {
    const key = `upload:${uploadId}:metadata`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async incrementUploadStats(stats: {
    totalUploads?: number;
    activeUploads?: number;
    failedUploads?: number;
    totalSize?: number;
  }): Promise<void> {
    const multi = this.client.multi();
    
    if (stats.totalUploads) multi.incrBy('stats:total_uploads', stats.totalUploads);
    if (stats.activeUploads) multi.incrBy('stats:active_uploads', stats.activeUploads);
    if (stats.failedUploads) multi.incrBy('stats:failed_uploads', stats.failedUploads);
    if (stats.totalSize) multi.incrBy('stats:total_size', stats.totalSize);

    await multi.exec();
  }

  async getUploadStats(): Promise<any> {
    const stats = await this.client.mGet([
      'stats:total_uploads',
      'stats:active_uploads',
      'stats:failed_uploads',
      'stats:total_size'
    ]);

    return {
      totalUploads: parseInt(stats[0] || '0'),
      activeUploads: parseInt(stats[1] || '0'),
      failedUploads: parseInt(stats[2] || '0'),
      totalSize: parseInt(stats[3] || '0')
    };
  }

  async trackPerformanceMetrics(uploadId: string, metrics: {
    startTime: number;
    endTime: number;
    chunkSize: number;
    totalChunks: number;
    networkSpeed: number;
  }): Promise<void> {
    const key = `metrics:${uploadId}`;
    await this.client.set(key, JSON.stringify(metrics));
    await this.client.expire(key, this.CHUNK_EXPIRY);
  }

  async getPerformanceMetrics(uploadId: string): Promise<any> {
    const key = `metrics:${uploadId}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async getAverageUploadSpeed(): Promise<number> {
    const keys = await this.client.keys('metrics:*');
    if (keys.length === 0) return 0;

    let totalSpeed = 0;
    for (const key of keys) {
      const metrics = await this.client.get(key);
      if (metrics) {
        const { networkSpeed } = JSON.parse(metrics);
        totalSpeed += networkSpeed;
      }
    }
    return totalSpeed / keys.length;
  }

  async clearAll(): Promise<void> {
    await this.client.flushAll();
  }
}

export const redisService = new RedisService(); 