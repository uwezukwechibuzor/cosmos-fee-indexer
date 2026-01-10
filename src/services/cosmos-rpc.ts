import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  CosmosRPCResponse,
  CosmosBlockResponse,
  CosmosStatusResponse,
  BlockResult,
} from '../types/cosmos.js';
import { logger } from '../utils/logger.js';

export class CosmosRPCClient {
  private clients: AxiosInstance[];
  private currentClientIndex: number = 0;

  constructor(rpcUrls: string[]) {
    this.clients = rpcUrls.map((url) =>
      axios.create({
        baseURL: url,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
  }

  /**
   * Get the current RPC client
   */
  private getCurrentClient(): AxiosInstance {
    return this.clients[this.currentClientIndex];
  }

  /**
   * Rotate to next RPC client
   */
  private rotateClient(): void {
    this.currentClientIndex = (this.currentClientIndex + 1) % this.clients.length;
    logger.debug(
      { clientIndex: this.currentClientIndex },
      'Rotated to next RPC client'
    );
  }

  /**
   * Fetch block results for a specific height
   */
  async getBlockResults(height: number): Promise<BlockResult> {
    let lastError: Error | null = null;
    const maxAttempts = this.clients.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const client = this.getCurrentClient();
        const response = await client.get<CosmosRPCResponse>('/block_results', {
          params: { height },
        });

        if (response.data.error) {
          throw new Error(`RPC error: ${JSON.stringify(response.data.error)}`);
        }

        if (!response.data.result) {
          throw new Error('No result in RPC response');
        }

        return response.data.result;
      } catch (error) {
        lastError = error as AxiosError;
        const axiosError = error as AxiosError;

        logger.warn(
          {
            attempt: attempt + 1,
            maxAttempts,
            height,
            error: axiosError.message,
            status: axiosError.response?.status,
          },
          'Failed to fetch block results, trying next RPC'
        );

        // Rotate to next client for retry
        this.rotateClient();

        // If it's a network error or timeout, continue to next client
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          continue;
        }

        // If it's a 404 or block not found, don't retry
        if (axiosError.response?.status === 404) {
          throw new Error(`Block ${height} not found`);
        }
      }
    }

    throw new Error(
      `Failed to fetch block ${height} after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Fetch block info to get timestamp
   */
  async getBlock(height: number): Promise<{ timestamp: string }> {
    let lastError: Error | null = null;
    const maxAttempts = this.clients.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const client = this.getCurrentClient();
        const response = await client.get<CosmosBlockResponse>('/block', {
          params: { height },
        });

        if (response.data.error) {
          throw new Error(`RPC error: ${JSON.stringify(response.data.error)}`);
        }

        if (!response.data.result?.block?.header?.time) {
          throw new Error('No timestamp in block response');
        }

        return {
          timestamp: response.data.result.block.header.time,
        };
      } catch (error) {
        lastError = error as AxiosError;
        const axiosError = error as AxiosError;

        logger.warn(
          {
            attempt: attempt + 1,
            maxAttempts,
            height,
            error: axiosError.message,
          },
          'Failed to fetch block, trying next RPC'
        );

        this.rotateClient();

        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          continue;
        }

        if (axiosError.response?.status === 404) {
          throw new Error(`Block ${height} not found`);
        }
      }
    }

    throw new Error(
      `Failed to fetch block ${height} after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Get latest block height
   */
  async getLatestBlockHeight(): Promise<number> {
    let lastError: Error | null = null;
    const maxAttempts = this.clients.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const client = this.getCurrentClient();
        const response = await client.get<CosmosStatusResponse>('/status');

        if (response.data.error) {
          throw new Error(`RPC error: ${JSON.stringify(response.data.error)}`);
        }

        const height = parseInt(response.data.result?.sync_info?.latest_block_height || '0', 10);

        if (height === 0) {
          throw new Error('Invalid block height received');
        }

        return height;
      } catch (error) {
        lastError = error as AxiosError;
        const axiosError = error as AxiosError;

        logger.warn(
          {
            attempt: attempt + 1,
            maxAttempts,
            error: axiosError.message,
          },
          'Failed to fetch latest block height, trying next RPC'
        );

        this.rotateClient();

        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          continue;
        }
      }
    }

    throw new Error(
      `Failed to fetch latest block height after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }
}

