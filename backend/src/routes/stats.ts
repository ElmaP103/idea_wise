import { Router } from 'express';
import { uploadService } from '../services/uploadService';
import { logger } from '../utils/logger';

const router = Router();

// Get overall upload statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await uploadService.getUploadStatus(req.query.uploadId as string);
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get upload stats', { error });
    res.status(500).json({ error: 'Failed to get upload statistics' });
  }
});

// Get recent uploads
router.get('/uploads/recent', async (req, res) => {
  try {
    const recentUploads = await uploadService.getUploadStatus(req.query.uploadId as string);
    res.json(recentUploads);
  } catch (error) {
    logger.error('Failed to get recent uploads', { error });
    res.status(500).json({ error: 'Failed to get recent uploads' });
  }
});

export default router; 