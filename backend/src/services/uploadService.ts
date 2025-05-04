import { logger } from '../utils/logger';
import { redisService } from './redisService';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

interface UploadInitParams {
  fileName: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
}

interface UploadChunkParams {
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkData: any;
}

class UploadService {
  private readonly CHUNK_SIZE = 1024 * 1024; // 1MB
  private readonly UPLOAD_DIR = path.join(process.cwd(), 'uploads');
  private readonly CHUNK_DIR = path.join(this.UPLOAD_DIR, 'chunks');
  private readonly COMPLETED_DIR = path.join(this.UPLOAD_DIR, 'completed');

  constructor() {
    this.initializeDirectories();
  }

  private async initializeDirectories() {
    try {
      await mkdir(this.UPLOAD_DIR, { recursive: true });
      await mkdir(this.CHUNK_DIR, { recursive: true });
      await mkdir(this.COMPLETED_DIR, { recursive: true });
    } catch (error) {
      logger.error('Failed to initialize directories:', error);
      throw error;
    }
  }

  async initUpload(params: UploadInitParams): Promise<string> {
    const { fileName, fileSize, fileType, totalChunks } = params;
    const uploadId = uuidv4();

    // Store upload metadata in Redis
    await redisService.trackUploadMetadata(uploadId, {
      fileName,
      fileSize,
      fileType,
      totalChunks,
      status: 'initialized',
      uploadedChunks: 0
    });

    // Track upload progress
    await redisService.trackUploadProgress(uploadId, 0);

    // Update stats
    await redisService.incrementUploadStats({
      activeUploads: 1
    });

    return uploadId;
  }

  async uploadChunk(params: UploadChunkParams): Promise<void> {
    const { uploadId, chunkIndex, totalChunks, chunkData } = params;

    // Get upload metadata
    const metadata = await redisService.getUploadMetadata(uploadId);
    if (!metadata) {
      throw new Error('Upload not found');
    }

    // Save chunk to Redis
    await redisService.trackChunk(uploadId, chunkIndex, chunkData);

    // Update progress
    const uploadedChunks = metadata.uploadedChunks + 1;
    const progress = (uploadedChunks / totalChunks) * 100;

    await redisService.trackUploadProgress(uploadId, progress);
    await redisService.trackUploadMetadata(uploadId, {
      ...metadata,
      uploadedChunks
    });

    // If all chunks are uploaded, assemble the file
    if (uploadedChunks === totalChunks) {
      await this.assembleFile(uploadId, metadata);
    }
  }

  private async assembleFile(uploadId: string, metadata: any): Promise<void> {
    const { fileName, totalChunks } = metadata;
    const finalPath = path.join(this.COMPLETED_DIR, `${uploadId}-${fileName}`);
    const writeStream = fs.createWriteStream(finalPath);

    try {
      // Write all chunks to the final file
      for (let i = 0; i < totalChunks; i++) {
        const chunkData = await redisService.getChunk(uploadId, i);
        if (!chunkData) {
          throw new Error(`Missing chunk ${i}`);
        }
        writeStream.write(chunkData);
      }

      writeStream.end();

      // Update metadata
      await redisService.trackUploadMetadata(uploadId, {
        ...metadata,
        status: 'completed',
        path: finalPath
      });

      // Update stats
      await redisService.incrementUploadStats({
        activeUploads: -1,
        totalUploads: 1,
        totalSize: metadata.fileSize
      });

    } catch (error) {
      logger.error('Failed to assemble file:', error);
      await redisService.trackUploadMetadata(uploadId, {
        ...metadata,
        status: 'failed'
      });
      await redisService.incrementUploadStats({
        activeUploads: -1,
        failedUploads: 1
      });
      throw error;
    }
  }

  async getUploadStatus(uploadId: string): Promise<any> {
    const metadata = await redisService.getUploadMetadata(uploadId);
    if (!metadata) {
      throw new Error('Upload not found');
    }

    const progress = await redisService.getUploadProgress(uploadId);

    return {
      ...metadata,
      progress
    };
  }

  async resumeUpload(uploadId: string): Promise<{
    uploadedChunks: number;
    totalChunks: number;
    progress: number;
  }> {
    const metadata = await redisService.getUploadMetadata(uploadId);
    if (!metadata) {
      throw new Error('Upload not found');
    }

    const progress = await redisService.getUploadProgress(uploadId);

    return {
      uploadedChunks: metadata.uploadedChunks,
      totalChunks: metadata.totalChunks,
      progress
    };
  }
}

export const uploadService = new UploadService(); 