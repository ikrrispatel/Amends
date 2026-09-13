type Entry = {
  windowStart: number; // epoch ms
  count: number;
};

// In-memory IP rate limiter suitable only for local single-instance demos.
// Not distributed — do not use in production.

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30; // sensible default for demo
const CLEANUP_INTERVAL_MS = 5 * 60_000; // remove stale entries every 5 minutes

const store = new Map<string, Entry>();

function normalizeIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  // Basic normalization: strip port and IPv6 zone
  return ip.replace(/:\d+$/, '').replace(/%.*$/, '');
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.windowStart + WINDOW_MS * 2 < now) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref?.();

export function consume(ipRaw: string | undefined) {
  const ip = normalizeIp(ipRaw);
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(ip, { windowStart: now, count: 1 });
    return {
      remaining: MAX_REQUESTS - 1,
      resetAfter: WINDOW_MS / 1000,
      limited: false,
    };
  }

  entry.count += 1;
  const elapsed = now - entry.windowStart;
  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((WINDOW_MS - elapsed) / 1000);
    return { remaining: 0, retryAfter, limited: true };
  }

  return {
    remaining: Math.max(0, MAX_REQUESTS - entry.count),
    resetAfter: Math.ceil((WINDOW_MS - elapsed) / 1000),
    limited: false,
  };
}
