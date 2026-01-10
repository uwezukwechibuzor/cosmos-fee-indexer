export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  pool_size?: number;
}

export interface ServerConfig {
  port: string;
}

export interface ChainConfig {
  name: string;
  start_height: number;
  rpc_base_url: string[];
  denom: string;
  batch_size?: number;
  retry_attempts?: number;
  retry_delay_ms?: number;
}

export interface AppConfig {
  postgres: PostgresConfig;
  server: ServerConfig;
  chains: Record<string, ChainConfig>;
}

