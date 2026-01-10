import { CosmosRPCClient } from './cosmos-rpc.js';
import { BlockModel } from '../db/models.js';
import { ChainConfig } from '../types/config.js';
import { BlockData } from '../types/cosmos.js';
import { extractFeesFromBlock } from '../utils/fee-parser.js';
import { logger } from '../utils/logger.js';

export class CosmosFeeIndexer {
  private rpcClient: CosmosRPCClient;
  private blockModel: BlockModel;
  public readonly chainId: string;
  private chainConfig: ChainConfig;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;

  constructor(
    chainId: string,
    chainConfig: ChainConfig,
    blockModel: BlockModel,
    rpcClient: CosmosRPCClient
  ) {
    this.chainId = chainId;
    this.chainConfig = chainConfig;
    this.blockModel = blockModel;
    this.rpcClient = rpcClient;
  }

  /**
   * Start indexing blocks
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Indexer is already running');
      return;
    }

    this.isRunning = true;
    this.shouldStop = false;

    logger.info(
      {
        chainId: this.chainId,
        startHeight: this.chainConfig.start_height,
        batchSize: this.chainConfig.batch_size || 100,
      },
      'Starting Cosmos fee indexer'
    );

    try {
      await this.indexBlocks();
    } catch (error) {
      logger.error({ error, chainId: this.chainId }, 'Indexer encountered an error');
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop indexing
   */
  stop(): void {
    logger.info('Stopping indexer...');
    this.shouldStop = true;
  }

  /**
   * Main indexing loop
   */
  private async indexBlocks(): Promise<void> {
    // Get last indexed height or use start_height
    const lastHeight = await this.blockModel.getLastIndexedHeight(this.chainId);
    let currentHeight: number = lastHeight !== null ? lastHeight : this.chainConfig.start_height - 1;

    const batchSize = this.chainConfig.batch_size || 100;
    const retryAttempts = this.chainConfig.retry_attempts || 3;
    const retryDelay = this.chainConfig.retry_delay_ms || 1000;

    while (!this.shouldStop) {
      try {
        // Get latest block height
        const latestHeight = await this.rpcClient.getLatestBlockHeight();

        if (currentHeight >= latestHeight) {
          logger.debug(
            { currentHeight, latestHeight },
            'Caught up to latest block, waiting...'
          );
          await this.sleep(5000); // Wait 5 seconds before checking again
          continue;
        }

        // Calculate batch range
        const batchEnd = Math.min(currentHeight + batchSize, latestHeight);
        const batchStart = currentHeight + 1;

        logger.info(
          {
            chainId: this.chainId,
            batchStart,
            batchEnd,
            totalBlocks: batchEnd - batchStart + 1,
          },
          'Processing batch'
        );

        // Process batch
        const blocks = await this.processBatch(batchStart, batchEnd, retryAttempts, retryDelay);

        if (blocks.length > 0) {
          // Save to database
          console.log('blocks', blocks)
          await this.blockModel.insertBlocksBatch(blocks);
          await this.blockModel.updateIndexingState(this.chainId, batchEnd);

          const totalBlocks = await this.blockModel.getBlockCount(this.chainId);
          logger.info(
            {
              chainId: this.chainId,
              indexedBlocks: blocks.length,
              currentHeight: batchEnd,
              totalBlocks,
            },
            'Batch indexed successfully'
          );
        }

        currentHeight = batchEnd;
      } catch (error) {
        logger.error({ error, chainId: this.chainId }, 'Error in indexing loop');
        await this.sleep(5000); // Wait before retrying
      }
    }

    logger.info('Indexer stopped');
  }

  /**
   * Process a batch of blocks
   */
  private async processBatch(
    startHeight: number,
    endHeight: number,
    retryAttempts: number,
    retryDelay: number
  ): Promise<BlockData[]> {
    const blocks: BlockData[] = [];

    // Process multiple blocks in parallel
    const concurrency = 10;
    for (let height = startHeight; height <= endHeight; height += concurrency) {
      const batchPromises: Promise<void>[] = [];

      for (
        let i = 0;
        i < concurrency && height + i <= endHeight && !this.shouldStop;
        i++
      ) {
        const blockHeight = height + i;
        batchPromises.push(
          this.processBlock(blockHeight, retryAttempts, retryDelay)
            .then((block) => {
              if (block) {
                blocks.push(block);
              }
            })
            .catch((error) => {
              logger.error({ error, height: blockHeight }, 'Failed to process block');
            })
        );
      }

      await Promise.all(batchPromises);
    }

    // Sort blocks by height
    blocks.sort((a, b) => a.block_number - b.block_number);

    return blocks;
  }

  /**
   * Process a single block with retry logic
   */
  private async processBlock(
    height: number,
    retryAttempts: number,
    retryDelay: number
  ): Promise<BlockData | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        // Fetch block results and block info in parallel for better performance
        const [blockResults, blockInfo] = await Promise.all([
          this.rpcClient.getBlockResults(height),
          this.rpcClient.getBlock(height),
        ]);

        // Extract fees
        const totalFees = extractFeesFromBlock(blockResults, this.chainConfig.denom);

        // Parse timestamp
        const timestamp = new Date(blockInfo.timestamp);

        return {
          block_number: height,
          chain_id: this.chainId,
          timestamp,
          total_fees: totalFees,
        };
      } catch (error) {
        lastError = error as Error;

        // If block not found, skip it
        if (error instanceof Error && error.message.includes('not found')) {
          logger.warn({ height }, 'Block not found, skipping');
          return null;
        }

        if (attempt < retryAttempts - 1) {
          logger.warn(
            {
              height,
              attempt: attempt + 1,
              retryAttempts,
              error: (error as Error).message,
            },
            'Retrying block processing'
          );
          await this.sleep(retryDelay * (attempt + 1)); // Exponential backoff
        }
      }
    }

    logger.error(
      { height, error: lastError?.message },
      `Failed to process block after ${retryAttempts} attempts`
    );
    throw lastError || new Error(`Failed to process block ${height}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

