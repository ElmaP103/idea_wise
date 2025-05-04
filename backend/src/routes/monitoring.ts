import express from 'express';
import { logger } from '../utils/logger';
import redis from '../config/redis';

const router = express.Router();

router.get('/stats', async (req, res) => {
  try {
    const stats = {
      activeUploads: await redis.scard('active_uploads'),
      successRate: await redis.get('upload_success_rate'),
      systemLoad: process.cpuUsage(),
      memoryUsage: process.memoryUsage()
    };
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get monitoring stats:', error);
    res.status(500).json({ error: 'Failed to get monitoring stats' });
  }
});

export default router;
