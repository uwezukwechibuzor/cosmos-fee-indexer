import { config } from 'dotenv';
import { loadConfig } from './config/loader.js';
import { DatabaseClient } from './db/client.js';
import { BlockModel } from './db/models.js';
import { CosmosRPCClient } from './services/cosmos-rpc.js';
import { CosmosFeeIndexer } from './services/indexer.js';
import { logger } from './utils/logger.js';

// Load environment variables
config();

async function main() {
  try {
    logger.info('Starting Cosmos Fee Indexer...');

    // Load configuration
    const appConfig = loadConfig();
    logger.info({ chains: Object.keys(appConfig.chains) }, 'Loaded configuration');

    // Initialize database
    const db = new DatabaseClient(appConfig.postgres);

    // Health check
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection established');

    // Initialize models
    const blockModel = new BlockModel(db);

    // Process each chain
    const indexers: CosmosFeeIndexer[] = [];

    for (const [chainId, chainConfig] of Object.entries(appConfig.chains)) {
      logger.info({ chainId, config: chainConfig }, 'Initializing indexer for chain');

      const rpcClient = new CosmosRPCClient(chainConfig.rpc_base_url);
      const indexer = new CosmosFeeIndexer(chainId, chainConfig, blockModel, rpcClient);

      indexers.push(indexer);
    }

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');
      indexers.forEach((indexer) => indexer.stop());
      await db.close();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Start all indexers in parallel with independent error handling
    // Each chain runs independently, so one failure doesn't stop others
    const indexerPromises = indexers.map((indexer) =>
      indexer.start().catch((error) => {
        logger.error({ error, chainId: indexer.chainId }, 'Indexer failed but continuing with other chains');
        // Don't throw - let other chains continue
      })
    );

    await Promise.all(indexerPromises);
  } catch (error) {
    logger.error({ error }, 'Fatal error in main');
    process.exit(1);
  }
}

main();

