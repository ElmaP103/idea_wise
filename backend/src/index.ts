import { app } from './server';
import logger from './logger';
import { cleanupIncompleteUploads } from './server';

const port = process.env.PORT || 3000;

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
  // Start cleanup job
  setInterval(cleanupIncompleteUploads, 30 * 60 * 1000);
}); 