import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { DatabaseClient } from './client.js';
import { loadConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const config = loadConfig();
  const db = new DatabaseClient(config.postgres);

  try {
    logger.info('Running database migrations...');

    // Check connection
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    await db.query(schema);
    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    process.exit(1);
  } finally {
    await db.close();
  }
}

migrate();

