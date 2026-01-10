import {
  CosmosRPCResponse,
  CosmosBlockResponse,
  CosmosStatusResponse,
  BlockResult,
} from '../types/cosmos.js';
import { logger } from '../utils/logger.js';

interface FetchError extends Error {
  status?: number;
  code?: string;
}

export class CosmosRPCClient {
  private rpcUrls: string[];
  private currentClientIndex: number = 0;
  private timeout: number = 30000; // 30 seconds timeout
  private workingRpcIndex: number | null = null; // Track which RPC is currently working

  constructor(rpcUrls: string[]) {
    // Filter out invalid URLs
    const validUrls = rpcUrls.filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        logger.warn({ url }, 'Invalid RPC URL, skipping');
        return false;
      }
    });

    if (validUrls.length === 0) {
      throw new Error('No valid RPC URLs provided');
    }

    this.rpcUrls = validUrls;
  }

  /**
   * Get the current RPC URL
   */
  private getCurrentUrl(): string {
    const index = this.workingRpcIndex !== null ? this.workingRpcIndex : this.currentClientIndex;
    return this.rpcUrls[index];
  }

  /**
   * Rotate to next RPC client (only called on failure)
   */
  private rotateClient(): void {
    const currentIndex = this.workingRpcIndex !== null ? this.workingRpcIndex : this.currentClientIndex;
    this.workingRpcIndex = null; // Reset working RPC since current one failed
    this.currentClientIndex = (currentIndex + 1) % this.rpcUrls.length;
    logger.warn(
      { oldIndex: currentIndex, newIndex: this.currentClientIndex },
      'RPC failed, rotating to next endpoint'
    );
  }

  /**
   * Mark current RPC as working 
   */
  private markRpcAsWorking(): void {
    if (this.workingRpcIndex === null) {
      this.workingRpcIndex = this.currentClientIndex;
      logger.debug(
        { rpcIndex: this.workingRpcIndex, url: this.rpcUrls[this.workingRpcIndex] },
        'Marked RPC as working'
      );
    }
  }


  /**
   * Make a fetch request with timeout and error handling
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      const fetchError = error as FetchError;
      
      if (fetchError.name === 'AbortError') {
        const timeoutError: FetchError = new Error('Request timeout');
        timeoutError.code = 'ETIMEDOUT';
        throw timeoutError;
      }
      throw error;
    }
  }

  /**
   * Fetch block results for a specific height
   */
  async getBlockResults(height: number): Promise<BlockResult> {
    let lastError: Error | null = null;
    const maxAttempts = this.rpcUrls.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const baseUrl = this.getCurrentUrl();
        const url = new URL('/block_results', baseUrl);
        url.searchParams.set('height', height.toString());

        const response = await this.fetchWithTimeout(url.toString());

        // Handle HTTP errors
        if (!response.ok) {
          const status = response.status;

          // Handle 404
          if (status === 404) {
            throw new Error(`Block ${height} not found`);
          }

          throw new Error(`HTTP ${status}: ${response.statusText}`);
        }

        const data = (await response.json()) as CosmosRPCResponse;

        if (data.error) {
          throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
        }

        if (!data.result) {
          throw new Error('No result in RPC response');
        }

        // Mark this RPC as working since request succeeded
        this.markRpcAsWorking();
        return data.result;
      } catch (error) {
        lastError = error as Error;
        const fetchError = error as FetchError;

        logger.warn(
          {
            attempt: attempt + 1,
            maxAttempts,
            height,
            error: fetchError.message,
            status: fetchError.status,
            code: fetchError.code,
          },
          'Failed to fetch block results, trying next RPC'
        );

        // Rotate to next client for retry
        this.rotateClient();

        // If it's a network error or timeout, continue to next client
        if (fetchError.code === 'ECONNREFUSED' || fetchError.code === 'ETIMEDOUT') {
          continue;
        }

        // If it's a 404 or block not found, don't retry
        if (fetchError.message.includes('not found')) {
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
    const maxAttempts = this.rpcUrls.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const baseUrl = this.getCurrentUrl();
        const url = new URL('/block', baseUrl);
        url.searchParams.set('height', height.toString());

        const response = await this.fetchWithTimeout(url.toString());

        // Handle HTTP errors
        if (!response.ok) {
          const status = response.status;

          // Handle 404
          if (status === 404) {
            throw new Error(`Block ${height} not found`);
          }

          throw new Error(`HTTP ${status}: ${response.statusText}`);
        }

        const data = (await response.json()) as CosmosBlockResponse;

        if (data.error) {
          throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
        }

        if (!data.result?.block?.header?.time) {
          throw new Error('No timestamp in block response');
        }

        // Mark this RPC as working since request succeeded
        this.markRpcAsWorking();
        return {
          timestamp: data.result.block.header.time,
        };
      } catch (error) {
        lastError = error as Error;
        const fetchError = error as FetchError;

        logger.warn(
          {
            attempt: attempt + 1,
            maxAttempts,
            height,
            error: fetchError.message,
            code: fetchError.code,
          },
          'Failed to fetch block, trying next RPC'
        );

        this.rotateClient();

        if (fetchError.code === 'ECONNREFUSED' || fetchError.code === 'ETIMEDOUT') {
          continue;
        }

        if (fetchError.message.includes('not found')) {
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
    const maxAttempts = this.rpcUrls.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const baseUrl = this.getCurrentUrl();
        const url = new URL('/status', baseUrl);

        const response = await this.fetchWithTimeout(url.toString());

        // Handle HTTP errors
        if (!response.ok) {
          const status = response.status;
          throw new Error(`HTTP ${status}: ${response.statusText}`);
        }

        const data = (await response.json()) as CosmosStatusResponse;

        if (data.error) {
          throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
        }

        const height = parseInt(data.result?.sync_info?.latest_block_height || '0', 10);

        if (height === 0) {
          throw new Error('Invalid block height received');
        }

        // Mark this RPC as working since request succeeded
        this.markRpcAsWorking();
        return height;
      } catch (error) {
        lastError = error as Error;
        const fetchError = error as FetchError;

        logger.warn(
          {
            attempt: attempt + 1,
            maxAttempts,
            error: fetchError.message,
            code: fetchError.code,
          },
          'Failed to fetch latest block height, trying next RPC'
        );

        this.rotateClient();

        if (fetchError.code === 'ECONNREFUSED' || fetchError.code === 'ETIMEDOUT') {
          continue;
        }
      }
    }

    throw new Error(
      `Failed to fetch latest block height after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }
}
