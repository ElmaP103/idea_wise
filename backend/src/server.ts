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
      const { uploadId } = req.params;
      const { chunkIndex, totalChunks, fileType } = req.body;
      
      logger.info('Chunk upload request received:', {
        uploadId,
        chunkIndex,
        totalChunks,
        fileType,
        headers: req.headers,
        body: req.body
      });

      if (!req.file) {
        logger.error('No file received in chunk upload');
        return res.status(400).json({ error: 'No file received' });
      }

      logger.info('File details:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        bufferLength: req.file.buffer?.length
      });

      if (!uploadStore[`upload:${uploadId}`]) {
        logger.error('Upload session not found', { uploadId });
        return res.status(404).json({ error: 'Upload session not found' });
      }

      // Set the file type if not already set
      if (!req.file.mimetype && fileType) {
        req.file.mimetype = fileType;
      }

      // Save the chunk
      const chunkPath = path.join(CHUNKS_DIR, `${uploadId}-${chunkIndex}`);
      logger.info('Preparing to save chunk:', { chunkPath });
      
      try {
        // Ensure the chunks directory exists
        await fs.promises.mkdir(CHUNKS_DIR, { recursive: true });
        
        // Validate buffer
        if (!req.file.buffer || !Buffer.isBuffer(req.file.buffer)) {
          logger.error('Invalid file buffer:', {
            buffer: req.file.buffer,
            isBuffer: Buffer.isBuffer(req.file.buffer)
          });
          return res.status(400).json({ error: 'Invalid file buffer' });
        }

        // Check available disk space
        const stats = await fs.promises.statfs(CHUNKS_DIR);
        const availableSpace = stats.bfree * stats.bsize;
        if (availableSpace < req.file.buffer.length) {
          logger.error('Insufficient disk space:', {
            availableSpace,
            requiredSpace: req.file.buffer.length
          });
          return res.status(507).json({ error: 'Insufficient disk space' });
        }

        // Write the chunk file
        await fs.promises.writeFile(chunkPath, req.file.buffer);
        logger.info('Chunk saved successfully', { 
          chunkPath,
          size: req.file.buffer.length
        });

        // Verify the file was written
        const fileStats = await fs.promises.stat(chunkPath);
        logger.info('Chunk file verified:', {
          size: fileStats.size,
          path: chunkPath
        });
      } catch (writeError: unknown) {
        logger.error('Failed to write chunk file:', {
          error: writeError,
          chunkPath,
          bufferSize: req.file.buffer?.length,
          errorMessage: writeError instanceof Error ? writeError.message : 'Unknown error',
          errorStack: writeError instanceof Error ? writeError.stack : undefined
        });
        return res.status(500).json({ 
          error: 'Failed to save chunk file',
          details: writeError instanceof Error ? writeError.message : 'Unknown error'
        });
      }

      // Update progress
      uploadStore[`upload:${uploadId}`].uploadedChunks += 1;
      
      logger.info('Chunk uploaded successfully', { 
        uploadId, 
        chunkIndex, 
        totalChunks,
        uploadedChunks: uploadStore[`upload:${uploadId}`].uploadedChunks
      });
      
      await redis.sadd('active_uploads', uploadId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Chunk upload failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        uploadId: req.params.uploadId,
        chunkIndex: req.body.chunkIndex
      });
      res.status(500).json({ 
        error: 'Internal server error during chunk upload',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

app.post('/api/upload/complete/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const uploadInfo = uploadStore[`upload:${uploadId}`];
    
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
    uploadInfo.endTime = Date.now();
    const durationSeconds = (uploadInfo.endTime - uploadInfo.startTime) / 1000;
    uploadInfo.uploadSpeed = durationSeconds > 0 ? (uploadInfo.fileSize / durationSeconds) / (1024 * 1024) : 0;
    console.log(uploadInfo.uploadSpeed, 'upload speed----------');
    // Update store
    uploadInfo.status = 'completed';
    
    logger.info('Upload completed', { uploadId, fileName, speed: uploadInfo.uploadSpeed });
    res.json({ success: true });
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
    const completedUploads = uploads.filter(u => u.status === 'completed');
    uploads.filter(u => u.uploadSpeed, 'speed--------')
    const averageSpeed =
      completedUploads.length > 0
        ? completedUploads.reduce((sum, u) => sum + (typeof u.uploadSpeed === 'number' ? u.uploadSpeed : 0), 0) / completedUploads.length
        : 0;

    const stats = {
      totalUploads: uploads.length,
      activeUploads: uploads.filter(u => u.status === 'in_progress').length,
      failedUploads: uploads.filter(u => u.status === 'error').length,
      totalSize: uploads.reduce((sum, u) => sum + parseInt(u.fileSize), 0),
      averageSpeed
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