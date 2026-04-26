import { describe, it, expect, vi } from 'vitest';
import retryModule from '../../utils/retry.js';

const { retryWithBackoff } = retryModule;

describe('retryWithBackoff', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const out = await retryWithBackoff(fn, { maxRetries: 3, initialDelay: 1, maxDelay: 2 });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries retryable errors and eventually returns success', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error('boom');
        err.code = 'ECONNRESET';
        throw err;
      }
      return 'recovered';
    });

    const out = await retryWithBackoff(fn, {
      maxRetries: 3,
      initialDelay: 1,
      maxDelay: 2,
    });

    expect(out).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors and rethrows', async () => {
    const err = new Error('client error');
    err.response = { status: 400 };
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, initialDelay: 1, maxDelay: 2 })
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting retries', async () => {
    const err = new Error('persistent timeout');
    err.code = 'ETIMEDOUT';
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      retryWithBackoff(fn, { maxRetries: 2, initialDelay: 1, maxDelay: 2 })
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('treats undici-style cause codes as retryable', async () => {
    const err = new Error('socket');
    err.cause = { code: 'UND_ERR_SOCKET' };
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw err;
      return 'after-retry';
    });

    const out = await retryWithBackoff(fn, { maxRetries: 1, initialDelay: 1, maxDelay: 2 });
    expect(out).toBe('after-retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
