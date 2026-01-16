import express, { Request, Response } from 'express';
import { BlockModel } from '../db/models.js';
import { aggregateFeesByDenom } from '../utils/fee-parser.js';
import { logger } from '../utils/logger.js';
import { AppConfig } from '../types/config.js';

export class ApiServer {
  private app: express.Application;
  private blockModel: BlockModel;
  private config: AppConfig;
  private server: any;

  constructor(blockModel: BlockModel, config: AppConfig) {
    this.blockModel = blockModel;
    this.config = config;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Fees endpoint
    this.app.get('/fees', async (req: Request, res: Response) => {
      try {
        const { startTime, endTime, startHeight, endHeight, chainId } = req.query;

        // Validate that either time range or block range is provided
        const hasTimeRange = startTime && endTime;
        const hasBlockRange = startHeight && endHeight;

        if (!hasTimeRange && !hasBlockRange) {
          return res.status(400).json({
            error: 'Either time range (startTime, endTime) or block range (startHeight, endHeight) must be provided',
          });
        }

        if (hasTimeRange && hasBlockRange) {
          return res.status(400).json({
            error: 'Cannot specify both time range and block range. Please use either time range or block range.',
          });
        }

        // Get chainId from query or use first chain from config
        const targetChainId = (chainId as string) || Object.keys(this.config.chains)[0];
        if (!targetChainId || !this.config.chains[targetChainId]) {
          return res.status(400).json({
            error: `Invalid chainId: ${targetChainId}. Available chains: ${Object.keys(this.config.chains).join(', ')}`,
          });
        }

        let totalFeesStrings: string[];

        if (hasTimeRange) {
          const start = parseInt(startTime as string, 10);
          const end = parseInt(endTime as string, 10);

          if (isNaN(start) || isNaN(end)) {
            return res.status(400).json({
              error: 'startTime and endTime must be valid numbers (Unix timestamps in seconds)',
            });
          }

          if (start > end) {
            return res.status(400).json({
              error: 'startTime must be less than or equal to endTime',
            });
          }

          totalFeesStrings = await this.blockModel.getFeesByTimeRange(
            targetChainId,
            start,
            end
          );
        } else {
          // hasBlockRange
          const start = parseInt(startHeight as string, 10);
          const end = parseInt(endHeight as string, 10);

          if (isNaN(start) || isNaN(end)) {
            return res.status(400).json({
              error: 'startHeight and endHeight must be valid numbers',
            });
          }

          if (start > end) {
            return res.status(400).json({
              error: 'startHeight must be less than or equal to endHeight',
            });
          }

          totalFeesStrings = await this.blockModel.getFeesByBlockRange(
            targetChainId,
            start,
            end
          );
        }

        // Aggregate fees by denom
        const feesByDenom = aggregateFeesByDenom(totalFeesStrings);

        // Format response
        const response: Record<string, string | number> = {};
        for (const [denom, amount] of Object.entries(feesByDenom)) {
          response[denom] = amount;
        }

        res.json({
          chainId: targetChainId,
          fees: response,
        });
      } catch (error) {
        logger.error({ error }, 'Error in /fees endpoint');
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  async start(port?: number): Promise<void> {
    // Handle port from config (might be ":8080" format or just "8080")
    let serverPort = port;
    if (!serverPort && this.config.server?.port) {
      const portStr = this.config.server.port.replace(':', '');
      serverPort = parseInt(portStr, 10);
    }
    serverPort = serverPort || 3000;

    return new Promise((resolve) => {
      this.server = this.app.listen(serverPort, () => {
        logger.info({ port: serverPort }, 'API server started');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

