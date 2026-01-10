import { DatabaseClient } from './client.js';
import { BlockData } from '../types/cosmos.js';
import { logger } from '../utils/logger.js';

export class BlockModel {
  constructor(private db: DatabaseClient) {}

  async insertBlock(blockData: BlockData): Promise<void> {
    const query = `
      INSERT INTO blocks (block_number, chain_id, timestamp, total_fees)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (block_number, chain_id) 
      DO UPDATE SET 
        timestamp = EXCLUDED.timestamp,
        total_fees = EXCLUDED.total_fees,
        updated_at = CURRENT_TIMESTAMP
    `;

    await this.db.query(query, [
      blockData.block_number,
      blockData.chain_id,
      blockData.timestamp,
      blockData.total_fees,
    ]);
  }

  async insertBlocksBatch(blocks: BlockData[]): Promise<void> {
    if (blocks.length === 0) return;

    await this.db.transaction(async (client) => {
      for (const block of blocks) {
        await client.query(
          `
          INSERT INTO blocks (block_number, chain_id, timestamp, total_fees)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (block_number, chain_id) 
          DO UPDATE SET 
            timestamp = EXCLUDED.timestamp,
            total_fees = EXCLUDED.total_fees,
            updated_at = CURRENT_TIMESTAMP
        `,
          [block.block_number, block.chain_id, block.timestamp, block.total_fees]
        );
      }
    });

    logger.debug({ count: blocks.length }, 'Inserted blocks batch');
  }

  async getLastIndexedHeight(chainId: string): Promise<number | null> {
    const query = `
      SELECT last_indexed_height 
      FROM indexing_state 
      WHERE chain_id = $1
    `;

    const result = await this.db.query<{ last_indexed_height: number }>(query, [chainId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].last_indexed_height;
  }

  async updateIndexingState(chainId: string, height: number): Promise<void> {
    const query = `
      INSERT INTO indexing_state (chain_id, last_indexed_height)
      VALUES ($1, $2)
      ON CONFLICT (chain_id)
      DO UPDATE SET 
        last_indexed_height = EXCLUDED.last_indexed_height,
        updated_at = CURRENT_TIMESTAMP
    `;

    await this.db.query(query, [chainId, height]);
  }

  async getBlockCount(chainId: string): Promise<number> {
    const query = `SELECT COUNT(*) as count FROM blocks WHERE chain_id = $1`;
    const result = await this.db.query<{ count: string }>(query, [chainId]);
    return parseInt(result.rows[0].count, 10);
  }
}

