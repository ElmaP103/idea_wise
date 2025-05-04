import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from './server';
import fs from 'fs';
import path from 'path';

describe('Upload Server', () => {
  const testFile = path.join(__dirname, '../test/test.jpg');
  const chunkSize = 1024 * 1024; // 1MB

  beforeAll(() => {
    // Create test file
    if (!fs.existsSync(path.dirname(testFile))) {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
    }
    fs.writeFileSync(testFile, Buffer.alloc(chunkSize));
  });

  afterAll(() => {
    // Cleanup test file
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  it('should initialize upload', async () => {
    const response = await request(app)
      .post('/api/upload/init')
      .send({
        fileName: 'test.jpg',
        fileSize: chunkSize,
        totalChunks: 1
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('uploadId');
  });

  it('should upload chunk', async () => {
    const initResponse = await request(app)
      .post('/api/upload/init')
      .send({
        fileName: 'test.jpg',
        fileSize: chunkSize,
        totalChunks: 1
      });

    const uploadId = initResponse.body.uploadId;

    const response = await request(app)
      .post(`/api/upload/chunk/${uploadId}`)
      .attach('chunk', testFile)
      .field('chunkIndex', 0)
      .field('totalChunks', 1);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });

  it('should complete upload', async () => {
    const initResponse = await request(app)
      .post('/api/upload/init')
      .send({
        fileName: 'test.jpg',
        fileSize: chunkSize,
        totalChunks: 1
      });

    const uploadId = initResponse.body.uploadId;

    await request(app)
      .post(`/api/upload/chunk/${uploadId}`)
      .attach('chunk', testFile)
      .field('chunkIndex', 0)
      .field('totalChunks', 1);

    const response = await request(app)
      .post(`/api/upload/complete/${uploadId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });
}); 