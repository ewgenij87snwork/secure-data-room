// Existing Cloudflare Worker: deploy as an ES module; no secrets or bindings.
const PROJECT = 'secure-data-room-keepalive';
const HEALTH_URL = 'https://secure-data-room-api.vercel.app/v1/health/ready';
const IS_DEALS = false;
const MAX_ATTEMPTS = 3;

class ProbeError extends Error {}

async function checkHealth(controller) {
  const scheduledTime = new Date(controller.scheduledTime).toISOString();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const time = new Date().toISOString();
    try {
      const url = new URL(HEALTH_URL);
      url.searchParams.set('_keepalive', `${Date.now()}-${attempt}`);
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'cache-control': 'no-cache, no-store',
          pragma: 'no-cache',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (response.status !== 200) throw new ProbeError(`HTTP_${response.status}`);
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new ProbeError('INVALID_CONTENT_TYPE');
      }
      const cache = response.headers.get('x-vercel-cache') ?? 'UNKNOWN';
      if (/HIT|STALE/i.test(cache) || Number(response.headers.get('age') ?? 0) > 0) {
        throw new ProbeError('CACHED_RESPONSE');
      }
      let body;
      try {
        body = await response.json();
      } catch {
        throw new ProbeError('INVALID_JSON');
      }
      const build = IS_DEALS ? body?.sha : body?.commit;
      if (body?.status !== 'ok' || !/^[a-f0-9]{40}$/i.test(build ?? '')) {
        throw new ProbeError('INVALID_HEALTH_PAYLOAD');
      }
      if (IS_DEALS) {
        if (body.database !== 'reachable' || body.service !== 'deals-marketplace-prototype') {
          throw new ProbeError('DATABASE_NOT_REACHABLE');
        }
        const age = Date.now() - Date.parse(body.time);
        if (!Number.isFinite(age) || age < -30000 || age > 120000) {
          throw new ProbeError('STALE_HEALTH_PAYLOAD');
        }
      }
      console.log(
        JSON.stringify({
          event: 'keepalive',
          project: PROJECT,
          time,
          scheduledTime,
          cron: controller.cron,
          result: 'success',
          attempt,
          httpStatus: response.status,
          cache,
          build,
        }),
      );
      return;
    } catch (error) {
      const errorCode =
        error instanceof ProbeError
          ? error.message
          : error?.name === 'TimeoutError'
            ? 'TIMEOUT'
            : 'NETWORK_FAILURE';
      const finalAttempt = attempt === MAX_ATTEMPTS;
      const record = JSON.stringify({
        event: 'keepalive',
        project: PROJECT,
        time,
        scheduledTime,
        cron: controller.cron,
        result: finalAttempt ? 'failure' : 'retry',
        attempt,
        errorCode,
      });
      if (finalAttempt) {
        console.error(record);
        throw new Error(`KEEPALIVE_UNAVAILABLE: ${PROJECT}`);
      }
      console.warn(record);
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1000 : 4000));
    }
  }
}

export default {
  async scheduled(controller) {
    await checkHealth(controller);
  },
};
