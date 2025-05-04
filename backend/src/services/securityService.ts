import { createReadStream } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export class SecurityService {
  private static readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain'
  ];

  private static readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  static async validateFile(filePath: string, mimeType: string, fileSize: number): Promise<void> {
    // Check file size
    if (fileSize > this.MAX_FILE_SIZE) {
      throw new Error('File size exceeds maximum limit');
    }

    // Check MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error('File type not allowed');
    }

    // Check for malicious content using ClamAV
    try {
      const { stdout } = await execAsync(`clamscan "${filePath}"`);
      if (stdout.includes('Infected files: 0')) {
        logger.info('File scan completed successfully');
      } else {
        throw new Error('Malicious content detected');
      }
    } catch (error) {
      logger.error('File scan failed:', error);
      throw new Error('File scan failed');
    }

    // Check magic numbers
    const magicNumbers = await this.checkMagicNumbers(filePath, mimeType);
    if (!magicNumbers) {
      throw new Error('File type mismatch detected');
    }
  }

  private static async checkMagicNumbers(filePath: string, mimeType: string): Promise<boolean> {
    const stream = createReadStream(filePath, { end: 10 });
    const chunks: Buffer[] = [];
    
    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    
    const buffer = Buffer.concat(chunks);

    // Check magic numbers based on MIME type
    switch (mimeType) {
      case 'image/jpeg':
        return buffer[0] === 0xFF && buffer[1] === 0xD8;
      case 'image/png':
        return buffer[0] === 0x89 && buffer[1] === 0x50;
      case 'application/pdf':
        return buffer[0] === 0x25 && buffer[1] === 0x50;
      default:
        return true;
    }
  }
} 