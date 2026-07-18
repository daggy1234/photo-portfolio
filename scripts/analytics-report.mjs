import 'dotenv/config';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const workerName = process.env.ANALYTICS_WORKER || 'photo-portfolio';
const requestedDays = Number.parseInt(process.env.ANALYTICS_DAYS || '7', 10);
const days = Number.isFinite(requestedDays) ? Math.min(7, Math.max(1, requestedDays)) : 7;
const pageSize = 2000;

if (!accountId || !apiToken) {
  console.error(
    'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Workers Observability: Read), then run npm run analytics.',
  );
  process.exit(1);
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`;
const to = Date.now();
const from = to - days * 24 * 60 * 60 * 1000;

async function fetchPage(offset) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queryId: `photo-portfolio-page-views-${to}`,
      timeframe: { from, to },
      view: 'events',
      dry: true,
      limit: pageSize,
      ...(offset ? { offset, offsetDirection: 'next' } : {}),
      parameters: {
        datasets: ['cloudflare-workers'],
        filterCombination: 'and',
        filters: [
          {
            key: '$metadata.service',
            operation: 'eq',
            type: 'string',
            value: workerName,
          },
        ],
        needle: { value: 'page_view', matchCase: true },
      },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.errors?.map((error) => error.message).join('; ') || response.statusText;
    throw new Error(detail);
  }
  return body?.result?.events?.events ?? [];
}

async function fetchEvents() {
  const events = [];
  let offset;

  for (;;) {
    const page = await fetchPage(offset);
    events.push(...page);
    if (page.length < pageSize) break;

    const nextOffset = page.at(-1)?.$metadata?.id;
    if (!nextOffset || nextOffset === offset) break;
    offset = nextOffset;
  }

  return events;
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function pageViewFrom(event) {
  for (const candidate of [event?.source, event?.$metadata?.message]) {
    const value = parseJson(candidate);
    if (value && typeof value === 'object' && value.event === 'page_view') return value;
  }
  return null;
}

function counts(values, keyName) {
  const totals = new Map();
  for (const value of values) {
    const key = String(value ?? 'unknown');
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  return [...totals]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, views]) => ({ [keyName]: key, views }));
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.table(rows);
}

try {
  const events = await fetchEvents();
  const pageViews = events
    .map((event) => ({ event, view: pageViewFrom(event) }))
    .filter(({ view }) => view !== null);

  if (pageViews.length === 0) {
    console.log(
      `No page_view logs found for ${workerName} in the last ${days} days. Deploy this version and visit the site once, then retry.`,
    );
    process.exit(0);
  }

  const humans = pageViews.filter(({ view }) => view.audience === 'human');
  const edgeTimes = humans.map(({ view }) => Number(view.edge_ms)).filter(Number.isFinite);
  const averageEdgeMs = edgeTimes.length
    ? Math.round((edgeTimes.reduce((sum, value) => sum + value, 0) / edgeTimes.length) * 100) / 100
    : null;

  printTable(
    `Daily human page views — last ${days} days (UTC)`,
    counts(
      humans.map(({ event }) => new Date(event.timestamp).toISOString().slice(0, 10)),
      'day',
    ).sort((left, right) => right.day.localeCompare(left.day)),
  );
  printTable('Top pages', counts(humans.map(({ view }) => view.path), 'path').slice(0, 20));
  printTable('Countries', counts(humans.map(({ view }) => view.country), 'country').slice(0, 20));
  printTable('Referrers', counts(humans.map(({ view }) => view.referrer), 'referrer').slice(0, 20));
  printTable(
    'Devices and browsers',
    counts(humans.map(({ view }) => `${view.device ?? 'unknown'} / ${view.browser ?? 'unknown'}`), 'device_browser'),
  );
  printTable('Human vs bot traffic', counts(pageViews.map(({ view }) => view.audience), 'audience'));
  printTable('Average edge document time', [{ average_ms: averageEdgeMs, samples: edgeTimes.length }]);
} catch (error) {
  console.error(`Analytics query failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
