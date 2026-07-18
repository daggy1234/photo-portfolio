// Static document delivery plus privacy-conscious, first-party page analytics.
// Successful HTML navigations emit one structured `page_view` Worker log. The
// log contains aggregate request context only: no cookies, raw IP, or raw UA.

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

      console.log(
        JSON.stringify({
          event: 'page_view',
          path: normalizedPath(url.pathname),
          country,
          referrer: referrerGroup(request, url.hostname),
          device: deviceClass(userAgent, bot),
          browser: browserFamily(userAgent, bot),
          colo,
          audience: bot ? 'bot' : 'human',
          language,
          hostname: url.hostname,
          edge_ms: Math.round((performance.now() - startedAt) * 100) / 100,
        }),
      );
    } catch (error) {
      // Analytics must never make the portfolio unavailable.
      console.error(
        JSON.stringify({
          message: 'page analytics log failed',
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    return documentResponse;
  },
} satisfies ExportedHandler<Env>;
