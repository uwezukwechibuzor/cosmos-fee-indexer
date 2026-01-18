# Cosmos Fee Indexer

An ndexer for Cosmos blockchains that indexes transaction fees data from every block to PostgreSQL database.

## Features

- ✅ Batch processing of blocks for efficient indexing
- ✅ PostgreSQL database with proper schema and indexes
- ✅ Automatic retry logic with exponential backoff
- ✅ RPC failover support (multiple RPC endpoints)
- ✅ Graceful shutdown handling
- ✅ Comprehensive logging
- ✅ State tracking (resume from last indexed height)
- ✅ Error handling

## Prerequisites

- Node.js >= 18.0.0
- pnpm (package manager)
- PostgreSQL database

## Installation

1. Install dependencies:
```bash
pnpm install
```

2. Set up PostgreSQL database:

**Option A: Using Docker Compose (Recommended)**
```bash
docker-compose up -d
```

**Option B: Manual Setup**
```bash
# Create database
createdb cosmos_fees

# Or using psql
psql -U postgres -c "CREATE DATABASE cosmos_fees;"
```

3. Run migrations:
```bash
pnpm migrate
```

4. Configure the indexer by editing `config.yaml`:
```yaml
postgres:
  host: "localhost"
  port: 5432
  database: "cosmos_fees"
  username: "postgres"
  password: "your_password"

chains:
  cosmoshub-4:
    name: "cosmos"
    start_height: 29248000  # Starting block height
    rpc_base_url:
      - "https://cosmos-rpc.highstakes.ch"
      - "https://cosmos-rpc.ibs.team"
    batch_size: 100
```

## Usage

### Development Mode
```bash
pnpm dev
```

### Production Mode
```bash
# Build
pnpm build

# Start
pnpm start
```

## Configuration

The indexer uses `config.yaml` for configuration. You can override database settings using environment variables:

- `POSTGRES_HOST` - Database host
- `POSTGRES_PORT` - Database port
- `POSTGRES_DATABASE` - Database name
- `POSTGRES_USERNAME` - Database username
- `POSTGRES_PASSWORD` - Database password
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `CONFIG_PATH` - Path to config file (default: ./config.yaml)

## Database Schema

The indexer creates two tables:

### `blocks`
Stores indexed block data:
- `block_number` - Block height
- `chain_id` - Chain identifier
- `timestamp` - Block timestamp
- `total_fees` - Sum of all fees and tips in the block
- `created_at` - Record creation timestamp
- `updated_at` - Record update timestamp

### `indexing_state`
Tracks indexing progress:
- `chain_id` - Chain identifier
- `last_indexed_height` - Last successfully indexed block height
- `updated_at` - Last update timestamp

## How It Works

1. **Initialization**: The indexer loads configuration and connects to PostgreSQL
2. **State Recovery**: Checks `indexing_state` table for last indexed height, or uses `start_height` from config
3. **Batch Processing**: Fetches blocks in batches (configurable via `batch_size`)
4. **Fee Extraction**: For each block:
   - Fetches block results from RPC endpoint
   - Extracts all `fee` and `tip` attributes from transaction events
   - Sums up all fees for the block
   - Fetches block timestamp from block endpoint
5. **Database Storage**: Saves block data (height, timestamp, total fees) to PostgreSQL
6. **State Update**: Updates `indexing_state` with latest indexed height
7. **Continuous Operation**: Continues until stopped, automatically catching up to latest blocks

## Error Handling

- **RPC Failover**: Automatically rotates between multiple RPC endpoints on failure
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Database Errors**: Proper transaction handling with rollback on errors

## Monitoring

The indexer logs comprehensive information:
- Batch processing progress
- Block indexing status
- Error details with context
- Performance metrics

## License

MIT

