export async function checkUrl(url, timeoutMs = 10000) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    return {
      url,
      status: res.ok ? 'ok' : 'error',
      http_status: res.status,
      response_time_ms: elapsed,
      checked_at: new Date().toISOString()
    };
  } catch (e) {
    return {
      url,
      status: 'unreachable',
      error: e.message,
      response_time_ms: Date.now() - start,
      checked_at: new Date().toISOString()
    };
  }
}
