import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { AppConfig } from '../types/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../../config.yaml');
  const fileContents = readFileSync(configPath, 'utf8');
  const config = parse(fileContents) as AppConfig;

  // Override with environment variables if present
  if (process.env.POSTGRES_HOST) config.postgres.host = process.env.POSTGRES_HOST;
  if (process.env.POSTGRES_PORT) config.postgres.port = parseInt(process.env.POSTGRES_PORT);
  if (process.env.POSTGRES_DATABASE) config.postgres.database = process.env.POSTGRES_DATABASE;
  if (process.env.POSTGRES_USERNAME) config.postgres.username = process.env.POSTGRES_USERNAME;
  if (process.env.POSTGRES_PASSWORD) config.postgres.password = process.env.POSTGRES_PASSWORD;

  return config;
}

