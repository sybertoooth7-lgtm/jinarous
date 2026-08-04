import db from '../db.js';

export class PostgresRateLimitStore {
  constructor(windowMs) {
    this.windowMs = windowMs;
  }

  async _increment(key) {
    const result = await db.query(
      `INSERT INTO rate_limits (key, count, reset_time)
       VALUES ($1, 1, NOW() + INTERVAL '1 millisecond' * $2)
       ON CONFLICT (key)
       DO UPDATE SET count = rate_limits.count + 1
       RETURNING count, reset_time`,
      [key, this.windowMs]
    );
    return result.rows[0];
  }

  incr(key, cb) {
    this._increment(key)
      .then((row) => cb(null, row.count, new Date(row.reset_time)))
      .catch((err) => cb(err, 0));
  }

  decrement(key) {
    db.query(
      'UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1',
      [key]
    ).catch(() => {});
  }

  resetKey(key) {
    db.query('DELETE FROM rate_limits WHERE key = $1', [key]).catch(() => {});
  }
}
