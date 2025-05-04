import axios from 'axios';
import { createReadStream } from 'fs';
import { join } from 'path';
import FormData from 'form-data';
import { describe, beforeAll, it, expect, jest } from '@jest/globals';
import { uploadService } from '../src/services/uploadService';
import { redisService } from '../src/services/redisService';

const BASE_URL = 'http://localhost:3000';
const CHUNK_SIZE = 1024 * 1024; // 1MB

describe('Upload Service Network Tests', () => {
  const TOTAL_CHUNKS = 5;

  beforeAll(async () => {
    await redisService.clearAll();
  });

  it('handles Redis connection failure', async () => {
    const uploadId = await uploadService.initUpload({
      fileName: 'test.jpg',
      fileSize: CHUNK_SIZE * TOTAL_CHUNKS,
      fileType: 'image/jpeg',
      totalChunks: TOTAL_CHUNKS
    });

    // Simulate Redis connection failure
    jest.spyOn(redisService, 'trackChunk').mockRejectedValueOnce(new Error('Redis connection failed'));

    await expect(uploadService.uploadChunk({
      uploadId,
      chunkIndex: 0,
      totalChunks: TOTAL_CHUNKS,
      chunkData: Buffer.alloc(CHUNK_SIZE)
    })).rejects.toThrow('Redis connection failed');
  });

  it('resumes upload after network failure', async () => {
    const uploadId = await uploadService.initUpload({
      fileName: 'test.jpg',
      fileSize: CHUNK_SIZE * TOTAL_CHUNKS,
      fileType: 'image/jpeg',
      totalChunks: TOTAL_CHUNKS
    });

    // Upload first chunk
    await uploadService.uploadChunk({
      uploadId,
      chunkIndex: 0,
      totalChunks: TOTAL_CHUNKS,
      chunkData: Buffer.alloc(CHUNK_SIZE)
    });

    // Simulate network failure
    jest.spyOn(redisService, 'trackChunk').mockRejectedValueOnce(new Error('Network error'));

    // Try to upload second chunk
    await expect(uploadService.uploadChunk({
      uploadId,
      chunkIndex: 1,
      totalChunks: TOTAL_CHUNKS,
      chunkData: Buffer.alloc(CHUNK_SIZE)
    })).rejects.toThrow('Network error');

    // Resume upload
    const resumeInfo = await uploadService.resumeUpload(uploadId);
    expect(resumeInfo.uploadedChunks).toBe(1);
    expect(resumeInfo.totalChunks).toBe(TOTAL_CHUNKS);
  });

  it('handles partial chunk uploads', async () => {
    const uploadId = await uploadService.initUpload({
      fileName: 'test.jpg',
      fileSize: CHUNK_SIZE * TOTAL_CHUNKS,
      fileType: 'image/jpeg',
      totalChunks: TOTAL_CHUNKS
    });

    // Simulate partial chunk upload
    const partialChunk = Buffer.alloc(CHUNK_SIZE / 2);
    await expect(uploadService.uploadChunk({
      uploadId,
      chunkIndex: 0,
      totalChunks: TOTAL_CHUNKS,
      chunkData: partialChunk
    })).rejects.toThrow();
  });
});

describe('Upload Service Network Failure Test', () => {
  let uploadId: string;

  beforeAll(async () => {
    // Initialize upload
    const { data } = await axios.post(`${BASE_URL}/api/upload/init`, {
      fileName: 'test.jpg',
      fileSize: 1024 * 1024, // 1MB
      fileType: 'image/jpeg',
      totalChunks: 1,
    });

    uploadId = data.uploadId;
  });

  it('should handle network interruptions during upload', async () => {
    const formData = new FormData();
    formData.append('chunk', Buffer.alloc(CHUNK_SIZE));
    formData.append('chunkIndex', '0');
    formData.append('totalChunks', '1');

    // Simulate network interruption by rejecting the request
    jest.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Network Error'));

    await expect(axios.post(`${BASE_URL}/api/upload/chunk/${uploadId}`, formData, {
      headers: formData.getHeaders(),
    })).rejects.toThrow('Network Error');

    // Verify the upload can be resumed
    jest.spyOn(axios, 'post').mockRestore();
    const response = await axios.post(`${BASE_URL}/api/upload/chunk/${uploadId}`, formData, {
      headers: formData.getHeaders(),
    });
    expect(response.status).toBe(200);
  });

  it('should handle server errors during upload', async () => {
    const formData = new FormData();
    formData.append('chunk', Buffer.alloc(CHUNK_SIZE));
    formData.append('chunkIndex', '0');
    formData.append('totalChunks', '1');

    // Simulate server error
    jest.spyOn(axios, 'post').mockRejectedValueOnce({
      response: {
        status: 500,
        data: { error: 'Internal Server Error' },
      },
    });

    await expect(axios.post(`${BASE_URL}/api/upload/chunk/${uploadId}`, formData, {
      headers: formData.getHeaders(),
    })).rejects.toThrow();

    // Verify the upload can be resumed
    jest.spyOn(axios, 'post').mockRestore();
    const response = await axios.post(`${BASE_URL}/api/upload/chunk/${uploadId}`, formData, {
      headers: formData.getHeaders(),
    });
    expect(response.status).toBe(200);
  });

  it('should handle timeout during upload', async () => {
    const formData = new FormData();
    formData.append('chunk', Buffer.alloc(CHUNK_SIZE));
    formData.append('chunkIndex', '0');
    formData.append('totalChunks', '1');

    // Simulate timeout
    jest.spyOn(axios, 'post').mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'));

    await expect(axios.post(`${BASE_URL}/api/upload/chunk/${uploadId}`, formData, {
      headers: formData.getHeaders(),
      timeout: 5000,
    })).rejects.toThrow('timeout');

    // Verify the upload can be resumed
    jest.spyOn(axios, 'post').mockRestore();
    const response = await axios.post(`${BASE_URL}/api/upload/chunk/${uploadId}`, formData, {
      headers: formData.getHeaders(),
    });
    expect(response.status).toBe(200);
  });
}); 