import { BlockResult } from '../types/cosmos.js';

/**
 * Extracts fee and tip values from transaction events
 * Looks for attributes with key "fee" or "tip" in events
 */
export function extractFeesFromBlock(blockResult: BlockResult, denom: string): string {
  if (!blockResult.txs_results || blockResult.txs_results.length === 0) {
    return '0' + denom;
  }

  let totalFeeAmount = 0;

  for (const txResult of blockResult.txs_results) {
    if (txResult.code !== 0) {
      // Skip failed transactions
      continue;
    }

    for (const event of txResult.events || []) {
      for (const attr of event.attributes || []) {
        if (attr.key === 'fee' || attr.key === 'tip') {
          const feeValue = parseFeeValue(attr.value, denom);
          totalFeeAmount += feeValue;
        }
      }
    }
  }

  return totalFeeAmount + denom;
}

/**
 * Parses fee value like "427uatom" and returns the numeric amount
 * Handles cases where value might contain multiple amounts separated by commas
 */
function parseFeeValue(value: string, denom: string): number {
  if (!value || typeof value !== 'string') {
    return 0;
  }

  // Handle multiple amounts separated by commas (e.g., "427uatom,198uatom")
  const amounts = value.split(',').map((v) => v.trim());
  let total = 0;

  for (const amountStr of amounts) {
    // Remove the denom suffix and parse the number
    const numericPart = amountStr.replace(denom, '').trim();
    const amount = parseFloat(numericPart);

    if (!isNaN(amount) && amount > 0) {
      total += amount;
    }
  }

  return total;
}
