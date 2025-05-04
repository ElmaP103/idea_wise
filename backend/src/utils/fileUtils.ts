import crypto from 'crypto';
import fs from 'fs';
import redis from '../config/redis';

export const calculateFileHash = async (filePath: string): Promise<string> => {
  const fileBuffer = await fs.promises.readFile(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
};

export const checkFileExists = async (hash: string): Promise<string | null> => {
  return await redis.get(`file:${hash}`);
};
