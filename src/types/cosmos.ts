export interface BlockResult {
  height: string;
  txs_results?: TransactionResult[];
}

export interface TransactionResult {
  code: number;
  events: Event[];
}

export interface Event {
  type: string;
  attributes: Attribute[];
}

export interface Attribute {
  key: string;
  value: string;
  index?: boolean;
}

export interface BlockData {
  block_number: number;
  timestamp: Date;
  total_fees: string;
  chain_id: string;
}

export interface CosmosRPCResponse {
  jsonrpc: string;
  id: number;
  result?: BlockResult;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface CosmosBlockResponse {
  jsonrpc: string;
  id: number;
  result?: {
    block: {
      header: {
        time: string;
      };
    };
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface CosmosStatusResponse {
  jsonrpc: string;
  id: number;
  result?: {
    sync_info: {
      latest_block_height: string;
    };
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

