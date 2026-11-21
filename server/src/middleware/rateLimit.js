/**
 * Tiny in-memory, fixed-window rate limiter.
 *
 * The public auth and code-execution endpoints are the only unauthenticated
 * ways to make the server do expensive work. This is not a distributed
 * solution (use Redis / an API gateway for real multi-instance deployments),
 * but it stops accidental floods and simple abuse on a single-node project.
 */
const buckets = new Map(); // key -> { count, resetAt }

/** Lazily drop expired buckets so the map cannot grow without bound. */
function sweepExpired(now) {
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

/**
 * @param {{ windowMs: number, max: number, prefix: string, message?: string }} options
 */
export function createRateLimiter({ windowMs, max, prefix, message }) {
  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (buckets.size > 2000) sweepExpired(now);

    const key = `${prefix}:${req.ip ?? req.socket?.remoteAddress ?? 'unknown'}`;
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({
        error: message ?? 'Too many requests. Please try again later.',
      });
    }

    return next();
  };
}

/** Test helper: clear all counters between suites. */
export function resetRateLimits() {
  buckets.clear();
}
