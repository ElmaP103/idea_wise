import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { promisify } from 'util';
import logger, { requestLogger, errorLogger } from './logger';
import { 
  rateLimiterMiddleware, 
  fileTypeValidator, 
  fileSizeValidator, 
  maliciousFileDetector,
  uploadLimiter,
  monitoringLimiter
} from './middleware/security';
import redis from './config/redis';
import monitoringRouter from './routes/monitoring';

export const app = express();
const port = process.env.PORT || 3000;

// Ensure upload directories exist
const UPLOAD_DIR = path.join(__dirname, '../uploads');
const CHUNKS_DIR = path.join(UPLOAD_DIR, 'chunks');
const FINAL_DIR = path.join(UPLOAD_DIR, 'final');

// Create directories if they don't exist
[UPLOAD_DIR, CHUNKS_DIR, FINAL_DIR].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created directory:', { dir });
    }
    
    // Check if directory is writable
    fs.accessSync(dir, fs.constants.W_OK);
    logger.info('Directory is writable:', { dir });
  } catch (error) {
    logger.error('Directory setup failed:', {
      dir,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
});

// In-memory storage instead of Redis
const uploadStore: Record<string, any> = {};

// Track upload progress
const trackUploadProgress = async (uploadId: string) => {
  try {
    const uploadKey = `upload:${uploadId}`;
    const uploadInfo = uploadStore[uploadKey];
    
    if (!uploadInfo) {
      logger.warn('Upload not found for tracking', { uploadId });
      return;
    }

    const { fileName, totalChunks, uploadedChunks } = uploadInfo;
    
    logger.info('Upload progress check', {
      uploadId,
      fileName,
      uploadedChunks,
      totalChunks
    });
    
    // Check if upload is complete
    if (uploadedChunks === totalChunks) {
      const endTime = Date.now();
      const durationSeconds = (endTime - uploadInfo.startTime) / 1000;
      const uploadSpeed = durationSeconds > 0 ? (uploadInfo.fileSize / durationSeconds) / (1024 * 1024) : 0;
      
      // Update upload store with completed status
      uploadStore[uploadKey] = {
        ...uploadInfo,
        status: 'completed',
        endTime,
        uploadSpeed
      };
      
      logger.info('Upload marked as completed', {
        uploadId,
        fileName,
        speed: uploadSpeed,
        duration: durationSeconds
      });
    }
  } catch (error) {
    logger.error('Failed to track upload progress', { error });
  }
};

// Start tracking job
setInterval(async () => {
  const uploads = Object.values(uploadStore);
  for (const upload of uploads) {
    if (upload.status === 'in_progress') {
      await trackUploadProgress(upload.uploadId);
    }
  }
}, 5000); // Check every 5 seconds

// Initialize upload store from existing files in FINAL_DIR
const initializeUploadStore = async () => {
  try {
    const files = await fs.promises.readdir(FINAL_DIR);
    for (const file of files) {
      const filePath = path.join(FINAL_DIR, file);
      const stats = await fs.promises.stat(filePath);
      const uploadId = file.split('.')[0]; // Assuming filename format is uploadId.extension
      
      uploadStore[`upload:${uploadId}`] = {
        fileName: file,
        fileSize: stats.size,
        status: 'completed',
        startTime: stats.ctimeMs,
        endTime: stats.mtimeMs,
        uploadSpeed: stats.size / ((stats.mtimeMs - stats.ctimeMs) / 1000) / (1024 * 1024) // MB/s
      };
    }
    logger.info('Upload store initialized', { 
      totalFiles: files.length,
      uploadStore: Object.keys(uploadStore).length
    });
  } catch (error) {
    logger.error('Failed to initialize upload store:', error);
  }
};

// Initialize upload store on server start
initializeUploadStore();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestLogger);
app.use(rateLimiterMiddleware);
app.use(uploadLimiter);

// Configure multer for chunk uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per chunk
    fieldSize: 50 * 1024 * 1024 // 50MB for other fields
  },
  fileFilter: (req, file, cb) => {
    // Log the file details
    logger.info('Multer file filter:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // Accept all files for chunks
    cb(null, true);
  }
});

// Helper functions
const calculateMD5 = async (filePath: string): Promise<string> => {
  const fileBuffer = await fs.promises.readFile(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
};

export const cleanupIncompleteUploads = async () => {
  const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
  const files = await fs.promises.readdir(CHUNKS_DIR);
  
  for (const file of files) {
    const filePath = path.join(CHUNKS_DIR, file);
    const stats = await fs.promises.stat(filePath);
    
    if (stats.mtimeMs < thirtyMinutesAgo) {
      await fs.promises.unlink(filePath);
      logger.info('Cleaned up incomplete upload', { file });
    }
  }
};

// Routes
app.post('/api/upload/init', async (req, res) => {
  try {
    const { fileName, fileSize, totalChunks } = req.body;
    const uploadId = crypto.randomUUID();
    
    uploadStore[`upload:${uploadId}`] = {
      fileName,
      fileSize: Number(fileSize),
      totalChunks,
      uploadedChunks: 0,
      status: 'in_progress',
      startTime: Date.now(),
      endTime: null,
      uploadSpeed: 0
    };
    
    logger.info('Upload initialized', { uploadId, fileName, fileSize, totalChunks });
    res.json({ uploadId });
  } catch (error) {
    logger.error('Failed to initialize upload:', error);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
});

app.post('/api/upload/chunk/:uploadId', 
  upload.single('chunk'),
  fileTypeValidator,
  fileSizeValidator,
  maliciousFileDetector,
  async (req, res) => {
    try {
      if (!req.file) {
        logger.error('No file received in chunk upload');
        return res.status(400).json({ error: 'No file received' });
      }

      const { uploadId } = req.params;
      const { chunkIndex, totalChunks, fileType } = req.body;
      const file = req.file;
      
      // Save the chunk
      const chunkPath = path.join(CHUNKS_DIR, `${uploadId}-${chunkIndex}`);
      await fs.promises.writeFile(chunkPath, file.buffer);
      
      // Update progress
      const uploadKey = `upload:${uploadId}`;
      if (!uploadStore[uploadKey]) {
        uploadStore[uploadKey] = {
          uploadId,
          fileName: file.originalname,
          fileSize: file.size,
          totalChunks: parseInt(totalChunks),
          uploadedChunks: 0,
          status: 'in_progress',
          startTime: Date.now(),
          endTime: null,
          uploadSpeed: 0
        };
      }
      
      // Update the store entry
      const storeEntry = uploadStore[uploadKey];
      if (storeEntry) {
        storeEntry.uploadedChunks += 1;
        
        logger.info('Chunk uploaded', {
          uploadId,
          chunkIndex,
          uploadedChunks: storeEntry.uploadedChunks,
          totalChunks: storeEntry.totalChunks
        });
        
        // Check if upload is complete
        if (storeEntry.uploadedChunks === storeEntry.totalChunks) {
          await trackUploadProgress(uploadId);
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Chunk upload failed:', error);
      res.status(500).json({ error: 'Internal server error during chunk upload' });
    }
  }
);

app.post('/api/upload/complete/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const uploadKey = `upload:${uploadId}`;
    const uploadInfo = uploadStore[uploadKey];
    
    if (!uploadInfo) {
      logger.warn('Upload not found', { uploadId });
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    const { fileName, totalChunks } = uploadInfo;
    const chunks = await fs.promises.readdir(CHUNKS_DIR);
    const relevantChunks = chunks.filter(chunk => chunk.startsWith(uploadId));
    
    if (relevantChunks.length !== parseInt(totalChunks)) {
      logger.warn('Incomplete upload', { uploadId, expected: totalChunks, received: relevantChunks.length });
      return res.status(400).json({ error: 'Incomplete upload' });
    }
    
    // Reassemble file
    const finalPath = path.join(FINAL_DIR, fileName);
    const writeStream = fs.createWriteStream(finalPath);
    
    for (let i = 0; i < parseInt(totalChunks); i++) {
      const chunkPath = path.join(CHUNKS_DIR, `${uploadId}-${i}`);
      const chunkData = await fs.promises.readFile(chunkPath);
      writeStream.write(chunkData);
    }
    
    writeStream.end();
    
    // Cleanup chunks
    for (const chunk of relevantChunks) {
      await fs.promises.unlink(path.join(CHUNKS_DIR, chunk));
    }
    
    // Set endTime and calculate speed
    const endTime = Date.now();
    const durationSeconds = (endTime - uploadInfo.startTime) / 1000;
    const uploadSpeed = durationSeconds > 0 ? (uploadInfo.fileSize / durationSeconds) / (1024 * 1024) : 0; // MB/s
    
    // Update the upload store with completed status
    uploadStore[uploadKey] = {
      ...uploadInfo,
      status: 'completed',
      endTime,
      uploadSpeed,
      uploadedChunks: parseInt(totalChunks)
    };
    
    // Verify the status was updated
    logger.info('Upload completed - status check', { 
      uploadId, 
      fileName, 
      speed: uploadSpeed,
      fileSize: uploadInfo.fileSize,
      duration: durationSeconds,
      status: uploadStore[uploadKey].status,
      uploadStore: uploadStore[uploadKey]
    });
    
    res.json({ 
      success: true,
      uploadSpeed,
      status: 'completed'
    });
  } catch (error) {
    logger.error('Failed to complete upload', { error });
    res.status(500).json({ error: 'Failed to complete upload' });
  }
});

app.get('/api/upload/status/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const uploadInfo = uploadStore[`upload:${uploadId}`];
    
    if (!uploadInfo) {
      logger.warn('Upload not found', { uploadId });
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    res.json({
      status: uploadInfo.status,
      uploadedChunks: uploadInfo.uploadedChunks,
      totalChunks: uploadInfo.totalChunks,
      progress: (uploadInfo.uploadedChunks / uploadInfo.totalChunks) * 100
    });
  } catch (error) {
    logger.error('Failed to get upload status', { error });
    res.status(500).json({ error: 'Failed to get upload status' });
  }
});

// Stats and recent uploads routes
app.get('/api/upload/stats', async (req, res) => {
  try {
    const stats = {
      totalUploads: Object.keys(uploadStore).length,
      activeUploads: Object.values(uploadStore).filter(u => u.status === 'in_progress').length,
      failedUploads: 0,
      totalSize: Object.values(uploadStore).reduce((sum, u) => sum + parseInt(u.fileSize), 0),
      averageSpeed: 0
    };
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get upload stats' });
  }
});

interface RecentUpload {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  timestamp: string;
  uploadSpeed: number;
}

app.get('/api/upload/recent', async (req, res) => {
  try {
    const recentUploads: RecentUpload[] = Object.entries(uploadStore).map(([key, value]) => ({
      id: key.replace('upload:', ''),
      fileName: value.fileName,
      fileSize: parseInt(value.fileSize),
      status: value.status,
      timestamp: new Date().toISOString(),
      uploadSpeed: value.uploadSpeed || 0
    }));
    res.json(recentUploads);
  } catch (error) {
    logger.error('Failed to get recent uploads', { error });
    res.status(500).json({ error: 'Failed to get recent uploads' });
  }
});

// Add middleware
app.use('/api/monitoring', monitoringLimiter);

// Error handling middleware
app.use(errorLogger);

// Start cleanup job
setInterval(cleanupIncompleteUploads, 30 * 60 * 1000);

app.get('/api/monitoring/stats', async (req, res) => {
  try {
    const uploads = Object.values(uploadStore);
    
    // Debug log to see what's in the upload store
    logger.info('Upload store contents:', {
      uploads: uploads.map(u => ({
        status: u.status,
        uploadSpeed: u.uploadSpeed,
        fileName: u.fileName,
        endTime: u.endTime,
        uploadedChunks: u.uploadedChunks,
        totalChunks: u.totalChunks
      }))
    });
    
    const completedUploads = uploads.filter(u => 
      u.status === 'completed' && 
      u.uploadSpeed !== undefined && 
      u.uploadSpeed !== null &&
      u.endTime !== null &&
      u.uploadedChunks === u.totalChunks
    );
    
    logger.info('Stats calculation', {
      totalUploads: uploads.length,
      completedUploads: completedUploads.length,
      uploadSpeeds: completedUploads.map(u => u.uploadSpeed),
      timestamp: new Date().toISOString()
    });
    
    const averageSpeed = completedUploads.length > 0
      ? completedUploads.reduce((sum, u) => sum + (u.uploadSpeed || 0), 0) / completedUploads.length
      : 0;

    const stats = {
      totalUploads: uploads.length,
      activeUploads: uploads.filter(u => u.status === 'in_progress').length,
      failedUploads: uploads.filter(u => u.status === 'error').length,
      totalSize: uploads.reduce((sum, u) => sum + parseInt(u.fileSize), 0),
      averageSpeed,
      completedUploadsCount: completedUploads.length,
      timestamp: new Date().toISOString()
    };
    
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get upload stats' });
  }
});

app.delete('/api/upload/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const uploadKey = `upload:${uploadId}`;
    const uploadInfo = uploadStore[uploadKey];
    if (!uploadInfo) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Delete all chunk files for this upload
    const chunks = await fs.promises.readdir(CHUNKS_DIR);
    const relevantChunks = chunks.filter(chunk => chunk.startsWith(uploadId));
    for (const chunk of relevantChunks) {
      await fs.promises.unlink(path.join(CHUNKS_DIR, chunk));
    }

    // Remove from store
    delete uploadStore[uploadKey];

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete upload', { error });
    res.status(500).json({ error: 'Failed to delete upload' });
  }
});

app.patch('/api/upload/:uploadId/speed', async (req, res) => {
  try {
    const { uploadId } = req.params;
    let { uploadSpeed } = req.body;
    const uploadKey = `upload:${uploadId}`;
    if (!uploadStore[uploadKey]) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    uploadSpeed = Number(uploadSpeed) || 0;
    uploadStore[uploadKey].uploadSpeed = uploadSpeed;
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update upload speed', { error });
    res.status(500).json({ error: 'Failed to update upload speed' });
  }
}); 