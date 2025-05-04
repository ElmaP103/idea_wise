import { Router } from 'express';
import { uploadService } from '../services/uploadService';
import { logger } from '../utils/logger';
import multer from 'multer';
import {
  rateLimiterMiddleware,
  fileTypeValidator,
  fileSizeValidator,
  chunkSizeValidator,
  uploadSessionValidator
} from '../middleware/security';

const router = Router();

// Configure multer for chunk uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 // 1MB
  }
});

// Initialize a new upload
router.post('/init',
  rateLimiterMiddleware,
  fileTypeValidator,
  fileSizeValidator,
  async (req, res) => {
    try {
      const { fileName, fileSize, fileType, totalChunks } = req.body;

      if (!fileName || !fileSize || !fileType || !totalChunks) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const uploadId = await uploadService.initUpload({
        fileName,
        fileSize,
        fileType,
        totalChunks
      });

      res.json({ uploadId });
    } catch (error) {
      logger.error('Failed to initialize upload:', error);
      res.status(500).json({ error: 'Failed to initialize upload' });
    }
  }
);

// Upload a chunk
router.post('/chunk',
  rateLimiterMiddleware,
  uploadSessionValidator,
  upload.single('chunk'),
  chunkSizeValidator,
  async (req, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks } = req.body;
      const chunkData = req.file?.buffer;

      if (!uploadId || chunkIndex === undefined || !totalChunks || !chunkData) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      await uploadService.uploadChunk({
        uploadId,
        chunkIndex,
        totalChunks,
        chunkData
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to upload chunk:', error);
      res.status(500).json({ error: 'Failed to upload chunk' });
    }
  }
);

// Get upload status
router.get('/status/:uploadId',
  rateLimiterMiddleware,
  uploadSessionValidator,
  async (req, res) => {
    try {
      const { uploadId } = req.params;
      const status = await uploadService.getUploadStatus(uploadId);
      res.json(status);
    } catch (error) {
      logger.error('Failed to get upload status:', error);
      res.status(500).json({ error: 'Failed to get upload status' });
    }
  }
);

// Resume an upload
router.get('/resume/:uploadId',
  rateLimiterMiddleware,
  uploadSessionValidator,
  async (req, res) => {
    try {
      const { uploadId } = req.params;
      const resumeInfo = await uploadService.resumeUpload(uploadId);
      res.json(resumeInfo);
    } catch (error) {
      logger.error('Failed to resume upload:', error);
      res.status(500).json({ error: 'Failed to resume upload' });
    }
  }
);

export default router; 