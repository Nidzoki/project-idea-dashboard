export const RECENCY_WINDOW_DAYS = 7;
export const RETENTION_WINDOW_DAYS = 42;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function cutoffTimestamp(collectedAt: string, days: number): number {
  const timestamp = Date.parse(collectedAt);
  if (Number.isNaN(timestamp)) throw new Error('collectedAt must be a valid date.');
  return timestamp - days * DAY_MS;
}

export function isWithinRetentionWindow(dateValue: string | undefined, collectedAt: string): boolean {
  if (!dateValue) return false;
  const timestamp = Date.parse(dateValue);
  return !Number.isNaN(timestamp) && timestamp >= cutoffTimestamp(collectedAt, RETENTION_WINDOW_DAYS);
}
