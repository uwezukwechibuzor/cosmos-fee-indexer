-- Create blocks table to store indexed block data
CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    block_number BIGINT NOT NULL,
    chain_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    total_fees VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(block_number, chain_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_blocks_chain_id ON blocks(chain_id);
CREATE INDEX IF NOT EXISTS idx_blocks_block_number ON blocks(block_number);
CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp);
CREATE INDEX IF NOT EXISTS idx_blocks_chain_block ON blocks(chain_id, block_number);

-- Create table to track indexing progress
CREATE TABLE IF NOT EXISTS indexing_state (
    id SERIAL PRIMARY KEY,
    chain_id VARCHAR(100) NOT NULL UNIQUE,
    last_indexed_height BIGINT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for blocks table
DROP TRIGGER IF EXISTS update_blocks_updated_at ON blocks;
CREATE TRIGGER update_blocks_updated_at
    BEFORE UPDATE ON blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for indexing_state table
DROP TRIGGER IF EXISTS update_indexing_state_updated_at ON indexing_state;
CREATE TRIGGER update_indexing_state_updated_at
    BEFORE UPDATE ON indexing_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

