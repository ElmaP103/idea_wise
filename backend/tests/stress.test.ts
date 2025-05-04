import { describe, beforeAll, it, expect } from '@jest/globals';
import { uploadService } from '../src/services/uploadService';
import { redisService } from '../src/services/redisService';

describe('Upload Service Stress Tests', () => {
  const CONCURRENT_UPLOADS = 50;
  const CHUNK_SIZE = 1024 * 1024; // 1MB
  const TOTAL_CHUNKS = 10;

  beforeAll(async () => {
    await redisService.clearAll();
  });

  it('handles concurrent uploads', async () => {
    const uploadPromises = Array(CONCURRENT_UPLOADS).fill(null).map(async (_, index) => {
      const fileName = `test-${index}.jpg`;
      const fileSize = CHUNK_SIZE * TOTAL_CHUNKS;
      
      const uploadId = await uploadService.initUpload({
        fileName,
        fileSize,
        fileType: 'image/jpeg',
        totalChunks: TOTAL_CHUNKS
      });

      // Simulate chunk uploads
      for (let i = 0; i < TOTAL_CHUNKS; i++) {
        await uploadService.uploadChunk({
          uploadId,
          chunkIndex: i,
          totalChunks: TOTAL_CHUNKS,
          chunkData: Buffer.alloc(CHUNK_SIZE)
        });
      }

      return uploadId;
    });

    const results = await Promise.allSettled(uploadPromises);
    const successfulUploads = results.filter(r => r.status === 'fulfilled').length;
    
    expect(successfulUploads).toBe(CONCURRENT_UPLOADS);
  });

  it('handles large file uploads', async () => {
    const LARGE_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    const LARGE_CHUNKS = 100;

    const uploadId = await uploadService.initUpload({
      fileName: 'large-file.jpg',
      fileSize: LARGE_FILE_SIZE,
      fileType: 'image/jpeg',
      totalChunks: LARGE_CHUNKS
    });

    for (let i = 0; i < LARGE_CHUNKS; i++) {
      await uploadService.uploadChunk({
        uploadId,
        chunkIndex: i,
        totalChunks: LARGE_CHUNKS,
        chunkData: Buffer.alloc(CHUNK_SIZE)
      });
    }

    const status = await uploadService.getUploadStatus(uploadId);
    expect(status.status).toBe('completed');
  });
}); 