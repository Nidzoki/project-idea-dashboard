import { describe, expect, it } from 'vitest';
import { assertNoSecrets } from './run-pipeline';

describe('pipeline safety guards', () => {
  it('accepts ordinary generated metadata', () => {
    expect(() => assertNoSecrets('source=https://api.example.test and license=CC BY')).not.toThrow();
  });

  it('rejects common token formats', () => {
    expect(() => assertNoSecrets('token=ghp_123456789012345678901234567890')).toThrow(/secret/i);
    expect(() => assertNoSecrets('api_key=abcdefghijklmnopqrstuvwxyz')).toThrow(/secret/i);
  });
});

