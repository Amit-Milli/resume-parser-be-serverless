import { MAX_DYNAMODB_ITEM_SIZE } from '../constants/tableName.constants';

export default function TruncateItem(text) {
  // Convert to Buffer to get byte size (handles Unicode)
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= MAX_DYNAMODB_ITEM_SIZE) {
    return { text, isTruncated: false };
  }
  // Truncate to max allowed bytes
  const truncatedBuffer = buffer.slice(0, MAX_DYNAMODB_ITEM_SIZE);
  // Convert back to string (may cut off multi-byte char, so fix)
  let truncated = truncatedBuffer.toString('utf8');
  // Ensure no partial multi-byte char at end
  while (Buffer.from(truncated, 'utf8').length > MAX_DYNAMODB_ITEM_SIZE) {
    truncated = truncated.slice(0, -1);
  }
  return { text: truncated, isTruncated: true };
}
