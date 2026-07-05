// Fixed-window rate-limit counters in auth.otp_rate_limits. A bucket is (key, window_start); the
// window_start is `now` floored to the window size, so all hits in the same window share a row.
// Enforced in OtpService so both HTTP and CLI/service callers are throttled.

import type pg from "pg";

export class RateLimitRepo {
  constructor(private readonly pool: pg.Pool) {}

  /** Increment the current window's counter for `bucketKey` and return the new count. */
  async hit(bucketKey: string, now: Date, windowSec: number): Promise<number> {
    const windowStart = floorToWindow(now, windowSec);
    const { rows } = await this.pool.query(
      `INSERT INTO auth.otp_rate_limits (bucket_key, window_start, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket_key, window_start)
       DO UPDATE SET count = auth.otp_rate_limits.count + 1
       RETURNING count`,
      [bucketKey, windowStart],
    );
    return Number(rows[0].count);
  }

  /** Current window count without incrementing. */
  async count(bucketKey: string, now: Date, windowSec: number): Promise<number> {
    const windowStart = floorToWindow(now, windowSec);
    const { rows } = await this.pool.query(
      `SELECT count FROM auth.otp_rate_limits WHERE bucket_key = $1 AND window_start = $2`,
      [bucketKey, windowStart],
    );
    return rows[0] ? Number(rows[0].count) : 0;
  }
}

function floorToWindow(now: Date, windowSec: number): Date {
  const windowMs = windowSec * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}
