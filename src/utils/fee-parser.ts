import { BlockResult } from '../types/cosmos.js';

/**
 * Extracts fee and tip values from transaction events
 * Looks for attributes with key "fee" or "tip" in events
 * Handles multiple denoms and returns a comma-separated string of amounts with their denoms
 */
export function extractFeesFromBlock(blockResult: BlockResult): string {
  if (!blockResult.txs_results || blockResult.txs_results.length === 0) {
    return '0';
  }

  // Map to accumulate amounts by denom
  const feesByDenom = new Map<string, number>();

  for (const txResult of blockResult.txs_results) {
    if (txResult.code !== 0) {
      // Skip failed transactions
      continue;
    }

    for (const event of txResult.events || []) {
      for (const attr of event.attributes || []) {
        if (attr.key === 'fee' || attr.key === 'tip') {
          parseFeeValue(attr.value, feesByDenom);
        }
      }
    }
  }

  // Convert map to comma-separated string
  const feeStrings: string[] = [];
  for (const [denom, amount] of feesByDenom.entries()) {
    if (amount > 0) {
      feeStrings.push(`${amount}${denom}`);
    }
  }

  return feeStrings.length > 0 ? feeStrings.join(',') : '0';
}

/**
 * Parses fee value like "427uatom" or "427uatom,198ibc/..." and accumulates amounts by denom
 * Extracts denom from the value itself (denom is the suffix after the numeric part)
 */
function parseFeeValue(value: string, feesByDenom: Map<string, number>): void {
  if (!value || typeof value !== 'string') {
    return;
  }

  // Handle multiple amounts separated by commas (e.g., "427uatom,198ibc/...")
  const amounts = value.split(',').map((v) => v.trim());

  for (const amountStr of amounts) {
    // Extract numeric part and denom
    // Pattern: numbers followed by non-numeric characters (the denom)
    const match = amountStr.match(/^(\d+(?:\.\d+)?)(.+)$/);
    if (match) {
      const numericPart = match[1];
      const denom = match[2];
      const amount = parseFloat(numericPart);

      if (!isNaN(amount) && amount > 0 && denom) {
        const currentAmount = feesByDenom.get(denom) || 0;
        feesByDenom.set(denom, currentAmount + amount);
      }
    }
  }
}
