// Static document delivery plus privacy-conscious, first-party page analytics.
// Analytics Engine schema (photo_portfolio_page_views):
//   blob1 path, blob2 country, blob3 referrer, blob4 device, blob5 browser,
//   blob6 colo, blob7 audience, blob8 language, blob9 hostname
//   double1 time spent fetching the static document at the edge (milliseconds)

function isBot(userAgent: string): boolean {
  return /bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|discordbot|telegrambot|headless/i.test(
    userAgent,
  );
}

function deviceClass(userAgent: string, bot: boolean): string {
  if (bot) return 'crawler';
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function browserFamily(userAgent: string, bot: boolean): string {
  if (bot) return 'bot';
  if (/instagram|fban|fbav|line\//i.test(userAgent)) return 'in-app';
  if (/edg\//i.test(userAgent)) return 'edge';
  if (/firefox\//i.test(userAgent)) return 'firefox';
  if (/chrome\//i.test(userAgent)) return 'chrome';
  if (/safari\//i.test(userAgent)) return 'safari';
  return 'other';
}

function referrerGroup(request: Request, hostname: string): string {
  const referrer = request.headers.get('referer');
  if (!referrer) return 'direct';
  try {
    const referrerHost = new URL(referrer).hostname.toLowerCase();
    return referrerHost === hostname.toLowerCase() ? 'internal' : referrerHost;
  } catch {
    return 'unknown';
  }
}

function normalizedPath(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '');
}

function isTrackableDocument(request: Request, response: Response): boolean {
  if (request.method !== 'GET' || !response.ok) return false;
  if (!request.headers.get('accept')?.includes('text/html')) return false;
  if (!response.headers.get('content-type')?.includes('text/html')) return false;
  const purpose = `${request.headers.get('purpose') ?? ''} ${request.headers.get('sec-purpose') ?? ''}`;
  return !purpose.toLowerCase().includes('prefetch');
}

function withDocumentHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const startedAt = performance.now();
    let response: Response;

    try {
      response = await env.ASSETS.fetch(request);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'static asset fetch failed',
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return new Response('Internal server error', { status: 500 });
    }

    if (!response.headers.get('content-type')?.includes('text/html')) return response;

    const documentResponse = withDocumentHeaders(response);
    if (!isTrackableDocument(request, documentResponse)) return documentResponse;

    try {
      const url = new URL(request.url);
      const userAgent = request.headers.get('user-agent') ?? '';
      const bot = isBot(userAgent);
      const language = (request.headers.get('accept-language') ?? 'unknown')
        .split(',', 1)[0]
        .trim()
        .toLowerCase()
        .slice(0, 16) || 'unknown';
      const country = typeof request.cf?.country === 'string' ? request.cf.country : 'XX';
      const colo = typeof request.cf?.colo === 'string' ? request.cf.colo : 'local';

      // writeDataPoint is intentionally synchronous/non-blocking; the Workers
      // runtime commits the point after the response without a network fetch.
      env.PAGE_VIEWS.writeDataPoint({
        indexes: [url.hostname.slice(0, 96)],
        blobs: [
          normalizedPath(url.pathname),
          country,
          referrerGroup(request, url.hostname),
          deviceClass(userAgent, bot),
          browserFamily(userAgent, bot),
          colo,
          bot ? 'bot' : 'human',
          language,
          url.hostname,
        ],
        doubles: [performance.now() - startedAt],
      });
    } catch (error) {
      // Analytics must never make the portfolio unavailable.
      console.error(
        JSON.stringify({
          message: 'page analytics write failed',
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    return documentResponse;
  },
} satisfies ExportedHandler<Env>;
