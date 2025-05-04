import { config } from 'dotenv';
import { jest } from '@jest/globals';

// Load environment variables from .env.test
config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.UPLOAD_DIR = './test-uploads';
process.env.MAX_FILE_SIZE = '104857600'; // 100MB
process.env.CHUNK_SIZE = '1048576'; // 1MB
process.env.RETENTION_DAYS = '30';

// Mock Redis client for tests
jest.mock('../src/utils/redis', () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    multi: jest.fn().mockReturnThis(),
    exec: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    incrby: jest.fn(),
    lpush: jest.fn(),
    lrange: jest.fn(),
    ltrim: jest.fn(),
  },
}));

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs') as object,
  promises: {
    ...(jest.requireActual('fs') as any).promises,
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    readdir: jest.fn(),
  },
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
})); 