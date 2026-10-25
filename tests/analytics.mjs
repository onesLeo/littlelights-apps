// Daily analytics history: rows <-> Cloudflare shapes, the snapshot job, and /api/insights merging
// stored past days with live Cloudflare numbers. No network: fetch is mocked.
import { readFileSync } from 'node:fs';
import { toRows, rowsToAcct, snapshotRows, storedDays, addDays, dayOf } from '../lib/site-analytics.mjs';
import { insights } from '../functions/api/insights.js';
import { run } from '../workers/analytics-snapshot/index.js';

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; };

const cfDay = (date, views = 10, visits = 4) => ({
  daily: [{ count: views, sum: { visits }, dimensions: { date } }],
  paths: [{ count: views, sum: { visits }, dimensions: { date, requestPath: '/read/a' } }],
  countries: [{ count: views, dimensions: { date, requestPath: '/read/a', countryName: 'SG' } }],
  referers: [{ count: views, dimensions: { date, requestPath: '/read/a', refererHost: 'www.google.com' } }],
  vitals: [{ count: 2, dimensions: { date }, quantiles: { largestContentfulPaintP75: 1500000, cumulativeLayoutShiftP75: 0.05 } }]
});

// ---------- rows ----------
{
  const rows = toRows(cfDay('2026-10-01'));
  check(rows.every((r) => Object.keys(r).sort().join() === 'day,dimension,key,metric,value'), 'rows: only day/metric/dimension/key/value');
  check(!JSON.stringify(rows).match(/ip|userAgent|cookie/i), 'rows: nothing about the visitor');
  const acct = rowsToAcct(toRows({ ...cfDay('2026-10-01'), ...{} }).concat(toRows(cfDay('2026-10-02', 6, 2))), '2026-10-01', '2026-10-03');
  check(acct.total[0].count === 16 && acct.total[0].sum.visits === 6 && acct.daily.length === 2, 'rows: totals add up over days');
  check(acct.countries[0].count === 16 && acct.referers[0].dimensions.refererHost === 'www.google.com', 'rows: countries and referrers per path survive');
  check(Math.abs(acct.vitals[0].quantiles.largestContentfulPaintP75 - 1500000) < 1 && Math.abs(acct.vitals[0].quantiles.cumulativeLayoutShiftP75 - 0.05) < 1e-9, 'rows: vitals round-trip');
  const quiet = snapshotRows({ daily: [] }, '2026-10-05');
  check(quiet.length === 1 && storedDays(quiet).has('2026-10-05'), 'snapshot: a quiet day is still marked stored');
}

// ---------- migration ----------
{
  const sql = readFileSync(new URL('../supabase/migrations/20261025180000_site_daily_stats.sql', import.meta.url), 'utf8');
  check(/enable row level security/.test(sql) && /for select using \(private\.is_team\(\)\)/.test(sql) && !/for (insert|update|delete|all)/.test(sql), 'migration: RLS on, team-only read, no write policies');
  check(/revoke all on public\.site_daily_stats from anon, authenticated/.test(sql) && /security definer/.test(sql) && /secret_hash = extensions\.digest/.test(sql), 'migration: writes only via the secret-checked function');
  check(!/\b(ip|ip_address|user_agent|cookie)\b/i.test(sql.replace(/--.*$/gm, '')), 'migration: no visitor columns');
}

// ---------- snapshot job ----------
{
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    if (url.includes('graphql')) return new Response(JSON.stringify({ data: { viewer: { accounts: [cfDay(body.variables.filter.AND[1].datetime_geq.slice(0, 10))] } } }));
    return new Response('5');
  };
  await run({ CF_ANALYTICS_TOKEN: 'cf-test', ANALYTICS_INGEST_SECRET: 's'.repeat(40) }, Date.parse('2026-10-25T00:15:00Z'), f);
  const saves = calls.filter((c) => c.url.endsWith('/rpc/save_site_daily_stats'));
  check(saves.map((c) => c.body.p_day).join() === '2026-10-23,2026-10-24', 'snapshot: stores yesterday (and re-takes the day before)');
  check(saves[0].body.p_secret.length === 40 && !saves[0].auth.includes('service_role') && saves[0].body.p_rows.every((r) => !('day' in r)), 'snapshot: uses the secret RPC, not a service role key');
  const gq = calls.find((c) => c.url.includes('graphql')).body.variables.filter.AND;
  check(gq[1].datetime_geq === '2026-10-23T00:00:00Z' && gq[2].datetime_lt === '2026-10-24T00:00:00Z', 'snapshot: exact UTC day window');
}

// ---------- /api/insights ----------
async function call(days, { stored = [], token = 'cf-test', member = true } = {}) {
  const live = [];
  const f = async (url, init = {}) => {
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ email: 'a@b.c' }));
    if (url.includes('/team_members')) return new Response(JSON.stringify(member ? [{ role: 'admin' }] : []));
    if (url.includes('/post_stats')) return new Response('[]');
    if (url.includes('/site_daily_stats')) { const off = Number(/offset=(\d+)/.exec(url)[1]); return new Response(JSON.stringify(stored.slice(off, off + 1000))); }
    if (url.includes('graphql')) { const v = JSON.parse(init.body).variables; live.push(v.filter.AND[1].datetime_geq); return new Response(JSON.stringify({ data: { viewer: { accounts: [cfDay(dayOf(Date.now()), 1, 1)] } } })); }
    throw new Error('unexpected ' + url);
  };
  const req = new Request('https://x/api/insights?days=' + days, { headers: { Authorization: 'Bearer user' } });
  const res = await insights({ request: req, env: token ? { CF_ANALYTICS_TOKEN: token } : {} }, f);
  return { status: res.status, body: await res.json(), live };
}
{
  const today = dayOf(Date.now());
  check((await call(7, { member: false })).status === 403, 'insights: non-team still refused');
  // 180 days stored (covers 90 + the 90 before), each 10 views -> many rows, paged.
  const stored = [];
  for (let i = 1; i <= 180; i++) stored.push(...snapshotRows(cfDay(addDays(today, -i)), addDays(today, -i)));
  const r = await call(90, { stored });
  check(stored.length > 1000 && r.status === 200 && r.body.total.views === 89 * 10 + 1, 'insights: 90 days = 89 stored days + today live (rows paged past 1000)');
  check(r.body.previous.views === 900 && r.body.series.length === 90 && r.body.storedDays === 89, 'insights: previous 90 days from storage, full daily series');
  check(r.live.length === 1 && r.live[0] === today + 'T00:00:00Z', 'insights: Cloudflare live asked for today only');
  const gap = stored.filter((x) => x.day !== addDays(today, -3));
  const g = await call(7, { stored: gap });
  check(g.live[0] === addDays(today, -3) + 'T00:00:00Z', 'insights: a missing day is read live from Cloudflare');
  const none = await call(7, { token: null });
  check(none.body.connected === false, 'insights: no token and nothing stored = not connected');
  const offline = await call(30, { stored, token: null });
  check(offline.body.connected === true && offline.body.total.views === 290, 'insights: stored days still show without the token');
}

if (failures) { console.log(`\n${failures} analytics check(s) failed`); process.exit(1); }
console.log('\nanalytics: all checks passed');
