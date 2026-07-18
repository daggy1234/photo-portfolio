import 'dotenv/config';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const dataset = process.env.ANALYTICS_DATASET || 'photo_portfolio_page_views';
const requestedDays = Number.parseInt(process.env.ANALYTICS_DAYS || '30', 10);
const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, requestedDays)) : 30;

if (!accountId || !apiToken) {
  console.error(
    'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics: Read), then run npm run analytics.',
  );
  process.exit(1);
}

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(dataset)) {
  console.error('ANALYTICS_DATASET must contain only letters, numbers, and underscores.');
  process.exit(1);
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;
const since = `timestamp >= NOW() - INTERVAL '${days}' DAY`;

const reports = [
  {
    title: `Daily human page views — last ${days} days`,
    sql: `
      SELECT
        toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
        SUM(_sample_interval) AS views
      FROM ${dataset}
      WHERE ${since} AND blob7 = 'human'
      GROUP BY day
      ORDER BY day DESC`,
  },
  {
    title: 'Top pages',
    sql: `
      SELECT blob1 AS path, SUM(_sample_interval) AS views
      FROM ${dataset}
      WHERE ${since} AND blob7 = 'human'
      GROUP BY path
      ORDER BY views DESC
      LIMIT 20`,
  },
  {
    title: 'Countries',
    sql: `
      SELECT blob2 AS country, SUM(_sample_interval) AS views
      FROM ${dataset}
      WHERE ${since} AND blob7 = 'human'
      GROUP BY country
      ORDER BY views DESC
      LIMIT 20`,
  },
  {
    title: 'Referrers',
    sql: `
      SELECT blob3 AS referrer, SUM(_sample_interval) AS views
      FROM ${dataset}
      WHERE ${since} AND blob7 = 'human'
      GROUP BY referrer
      ORDER BY views DESC
      LIMIT 20`,
  },
  {
    title: 'Devices and browsers',
    sql: `
      SELECT blob4 AS device, blob5 AS browser, SUM(_sample_interval) AS views
      FROM ${dataset}
      WHERE ${since} AND blob7 = 'human'
      GROUP BY device, browser
      ORDER BY views DESC`,
  },
  {
    title: 'Human vs bot traffic',
    sql: `
      SELECT blob7 AS audience, SUM(_sample_interval) AS views
      FROM ${dataset}
      WHERE ${since}
      GROUP BY audience
      ORDER BY views DESC`,
  },
  {
    title: 'Average edge document time',
    sql: `
      SELECT
        SUM(_sample_interval * double1) / SUM(_sample_interval) AS average_ms
      FROM ${dataset}
      WHERE ${since} AND blob7 = 'human'`,
  },
];

async function runReport(report) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}` },
    body: report.sql,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.errors?.map((error) => error.message).join('; ') || response.statusText;
    throw new Error(`${report.title}: ${detail}`);
  }
  return { title: report.title, rows: body?.data ?? [] };
}

try {
  const results = await Promise.all(reports.map(runReport));
  for (const { title, rows } of results) {
    console.log(`\n${title}`);
    console.table(rows);
  }
} catch (error) {
  console.error(`Analytics query failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
