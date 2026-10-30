// /api/insights?days=7|30|90 — Studio Insights (team only).
// 1. Verifies the caller's Supabase session token (Authorization: Bearer <jwt>) with Supabase Auth.
// 2. Checks team membership the same way js/store.js does: reading team_members as that user
//    (RLS "Team sees the team" only returns rows to team members).
// 3. Visitor numbers by UTC day: finished days come from our own copy, public.site_daily_stats
//    (team-only read via RLS, filled nightly by workers/analytics-snapshot). Today, and any past day
//    not stored yet, are read live from Cloudflare Web Analytics (GraphQL Analytics API, using
//    env.CF_ANALYTICS_TOKEN). With neither stored days nor the token it answers { connected: false }.
// 4. Adds the anonymous play/read counts from public.post_stats (team-only read via RLS).
// This endpoint itself stores nothing; responses are private and never cached.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/edge.mjs';
import { CF_ACCOUNT_ID, CF_SITE_TAG, fetchDays, toRows, rowsToAcct, storedDays, dayOf, addDays } from '../../lib/site-analytics.mjs';
export { CF_ACCOUNT_ID, CF_SITE_TAG };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
});

export async function teamMember(token, fetchImpl) {
  const h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token };
  const u = await fetchImpl(SUPABASE_URL + '/auth/v1/user', { headers: h });
  if (!u.ok) return null;
  const email = String((await u.json()).email || '').toLowerCase();
  if (!email) return null;
  const r = await fetchImpl(SUPABASE_URL + '/rest/v1/team_members?select=role&email=eq.' + encodeURIComponent(email) + '&limit=1', { headers: h });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.length ? { email, role: rows[0].role } : null;
}

// Play/read counts for this period (per post, totals and per day) plus the previous period's totals,
// so the Studio can say "up 20% on the 7 days before".
export function shapeStats(rows, since) {
  const day0 = since.slice(0, 10), plays = {}, playsTotal = { started: 0, finished: 0, read_end: 0 }, playsPrevious = { started: 0, finished: 0, read_end: 0 }, byDay = {};
  for (const row of rows || []) {
    const n = Number(row.count || 0), ev = row.event;
    if (String(row.day || day0) < day0) { playsPrevious[ev] = (playsPrevious[ev] || 0) + n; continue; }
    const p = (plays[row.post_id] ||= { started: 0, finished: 0, read_end: 0 });
    p[ev] = (p[ev] || 0) + n;
    playsTotal[ev] = (playsTotal[ev] || 0) + n;
    if (row.day) { const d = (byDay[row.day] ||= { date: row.day, started: 0, finished: 0, read_end: 0 }); d[ev] = (d[ev] || 0) + n; }
  }
  return { plays, playsTotal, playsPrevious, playsSeries: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)) };
}

async function postStats(token, since, prevSince, fetchImpl) {
  try {
    const r = await fetchImpl(SUPABASE_URL + '/rest/v1/post_stats?select=post_id,day,event,count&day=gte.' + prevSince.slice(0, 10) + '&limit=20000',
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null; // table not created yet
    return shapeStats(await r.json(), since);
  } catch { return null; }
}

// Our stored daily totals for [fromDay, toDayExclusive), read as the signed-in user (RLS: team only).
// PostgREST returns at most 1000 rows per request, so page through. Missing table = no rows.
export async function storedRows(token, fromDay, toDayExclusive, fetchImpl) {
  const out = [], size = 1000;
  try {
    for (let offset = 0; offset < 500000; offset += size) {
      const r = await fetchImpl(SUPABASE_URL + '/rest/v1/site_daily_stats?select=day,metric,dimension,key,value&day=gte.' + fromDay + '&day=lt.' + toDayExclusive +
        '&order=day,metric,dimension,key&limit=' + size + '&offset=' + offset, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
      if (!r.ok) return out;
      const page = await r.json();
      out.push(...page);
      if (page.length < size) break;
    }
  } catch { /* fall back to live */ }
  return out;
}

function top(map, n = 5) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, views]) => ({ name, views }));
}

// Friendly names for where visitors came from (the referring website's host name).
const SOURCES = [
  [/(^|\.)google\./, 'Google search'], [/(^|\.)bing\.com$/, 'Bing search'], [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo search'],
  [/(^|\.)(yahoo|ecosia|baidu|yandex)\./, 'Other search engines'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'Facebook'], [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'WhatsApp'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X (Twitter)'], [/(^|\.)(t\.me|telegram\.org)$/, 'Telegram'],
  [/(^|\.)pinterest\./, 'Pinterest'], [/(^|\.)tiktok\.com$/, 'TikTok'], [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)littlesaltandlight\.com$|\.pages\.dev$/, 'Within the site']
];
export function friendlySource(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!h || h === 'direct / none') return 'Direct';
  for (const [re, name] of SOURCES) if (re.test(h)) return name;
  return h;
}

const ms = (us) => (us == null ? null : Math.round(us / 1000));

export function shape(acct, days) {
  const posts = {};
  const get = (path) => (posts[path] ||= { path, views: 0, visits: 0, countries: {}, referrers: {} });
  const countries = {}, sources = {};
  for (const g of acct.paths || []) { const p = get(g.dimensions.requestPath); p.views = g.count; p.visits = (g.sum || {}).visits || 0; }
  for (const g of acct.countries || []) { const p = get(g.dimensions.requestPath), c = g.dimensions.countryName || 'Unknown'; p.countries[c] = (p.countries[c] || 0) + g.count;
    if (!p.path.startsWith('/studio')) countries[c] = (countries[c] || 0) + g.count; }
  for (const g of acct.referers || []) {
    const p = get(g.dimensions.requestPath), r = g.dimensions.refererHost || 'Direct / none';
    p.referrers[r] = (p.referrers[r] || 0) + g.count;
    if (!p.path.startsWith('/studio')) { const f = friendlySource(g.dimensions.refererHost); sources[f] = (sources[f] || 0) + g.count; }
  }
  const list = Object.values(posts).filter((p) => p.views > 0 && !p.path.startsWith('/studio')).sort((a, b) => b.views - a.views)
    .map((p) => ({ path: p.path, views: p.views, visits: p.visits, countries: top(p.countries), referrers: top(p.referrers) }));
  const t = (acct.total || [])[0] || { count: 0, sum: { visits: 0 } };
  const pv = (acct.previous || [])[0] || { count: 0, sum: { visits: 0 } };
  const v = (acct.vitals || [])[0];
  const q = (v && v.quantiles) || {};
  return {
    connected: true, days,
    total: { views: t.count || 0, visits: (t.sum || {}).visits || 0 },
    previous: { views: pv.count || 0, visits: (pv.sum || {}).visits || 0 },
    series: (acct.daily || []).map((g) => ({ date: g.dimensions.date, views: g.count, visits: (g.sum || {}).visits || 0 })),
    countries: top(countries, 8), sources: top(sources, 8),
    pages: list,
    // Cloudflare reports times in microseconds; the Studio shows milliseconds.
    vitals: v ? { samples: v.count, lcp: ms(q.largestContentfulPaintP75), inp: ms(q.interactionToNextPaintP75), cls: q.cumulativeLayoutShiftP75 == null ? null : q.cumulativeLayoutShiftP75, fcp: ms(q.firstContentfulPaintP75), ttfb: ms(q.timeToFirstByteP75) } : null
  };
}

export async function insights(context, fetchImpl = fetch) {
  const { request, env } = context;
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in to the Studio first.' }, 401);
  let member;
  try { member = await teamMember(token, fetchImpl); } catch { member = null; }
  if (!member) return json({ error: 'This account isn’t on the Salt and Light team.' }, 403);

  const asked = Number(new URL(request.url).searchParams.get('days'));
  const days = [7, 30, 90].includes(asked) ? asked : 7;
  const now = Date.now(), today = dayOf(now);
  const start = addDays(today, -(days - 1)), prevStart = addDays(start, -days);
  const since = start + 'T00:00:00Z', prevSince = prevStart + 'T00:00:00Z';
  const stats = await postStats(token, since, prevSince, fetchImpl);
  const plays = stats ? stats.plays : null, extra = stats ? { playsTotal: stats.playsTotal, playsPrevious: stats.playsPrevious, playsSeries: stats.playsSeries } : {};

  const stored = await storedRows(token, prevStart, today, fetchImpl);
  const have = storedDays(stored);
  let liveFrom = today; // first finished day we don't have; live covers it up to now
  for (let d = prevStart; d < today; d = addDays(d, 1)) if (!have.has(d)) { liveFrom = d; break; }
  // Cloudflare answers at most ~93 days per query; older gaps simply stay empty.
  if (liveFrom < addDays(today, -92)) liveFrom = addDays(today, -92);
  const hasToken = !!(env && env.CF_ANALYTICS_TOKEN);
  if (!hasToken && !have.size) return json({ connected: false, days, plays, ...extra });

  let rows = stored.filter((r) => r.day < liveFrom || (r.day < today && !hasToken)), liveError = null;
  if (hasToken) {
    try { rows = rows.concat(toRows(await fetchDays(env.CF_ANALYTICS_TOKEN, liveFrom, addDays(today, 1), fetchImpl, new Date(now).toISOString()))); }
    catch (e) { liveError = e; }
  }
  if (liveError && !have.size) {
    return json({ connected: true, error: 'Cloudflare Analytics didn’t answer: ' + String(liveError.message || 'error').slice(0, 200), days, plays, ...extra }, 502);
  }
  const acct = rowsToAcct(rows, start, addDays(today, 1));
  acct.previous = rowsToAcct(rows, prevStart, start).total;
  return json({ ...shape(acct, days), storedDays: [...have].filter((d) => d >= start).length, live: hasToken && !liveError,
    ...(liveError ? { note: 'Showing saved days only; today’s live numbers didn’t load.' } : {}), plays, ...extra });
}

export const onRequestGet = (context) => insights(context);
