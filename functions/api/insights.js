// /api/insights?days=7|30|90 — Studio Insights (team only).
// 1. Verifies the caller's Supabase session token (Authorization: Bearer <jwt>) with Supabase Auth.
// 2. Checks team membership the same way js/store.js does: reading team_members as that user
//    (RLS "Team sees the team" only returns rows to team members).
// 3. Reads Cloudflare Web Analytics (RUM) for the site from the GraphQL Analytics API using
//    env.CF_ANALYTICS_TOKEN (Account Analytics Read). Without the token it answers { connected: false }.
// 4. Adds the anonymous play/read counts from public.post_stats (team-only read via RLS).
// Nothing here stores anything; responses are private and never cached.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/edge.mjs';

export const CF_ACCOUNT_ID = '1835673e1406fbb875ff4210741d90cc';
export const CF_SITE_TAG = '9b7ae97446344441b89852635cb617e9'; // Web Analytics site for littlesaltandlight.com

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
});

async function teamMember(token, fetchImpl) {
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

const QUERY = `query($account: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject, $pfilter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject, $vfilter: AccountRumWebVitalsEventsAdaptiveGroupsFilter_InputObject) {
  viewer { accounts(filter: { accountTag: $account }) {
    total: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1) { count sum { visits } }
    previous: rumPageloadEventsAdaptiveGroups(filter: $pfilter, limit: 1) { count sum { visits } }
    daily: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 100, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    paths: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 200, orderBy: [count_DESC]) { count sum { visits } dimensions { requestPath } }
    countries: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 2000, orderBy: [count_DESC]) { count dimensions { requestPath countryName } }
    referers: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 2000, orderBy: [count_DESC]) { count dimensions { requestPath refererHost } }
    vitals: rumWebVitalsEventsAdaptiveGroups(filter: $vfilter, limit: 1) {
      count
      quantiles { largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 firstContentfulPaintP75 timeToFirstByteP75 }
    }
  } }
}`;

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
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const prevSince = new Date(Date.now() - 2 * days * 86400000).toISOString();
  const stats = await postStats(token, since, prevSince, fetchImpl);
  const plays = stats ? stats.plays : null, extra = stats ? { playsTotal: stats.playsTotal, playsPrevious: stats.playsPrevious, playsSeries: stats.playsSeries } : {};
  if (!env || !env.CF_ANALYTICS_TOKEN) return json({ connected: false, days, plays, ...extra });

  const filter = { AND: [{ siteTag: CF_SITE_TAG }, { datetime_geq: since }, { bot: 0 }] };
  const pfilter = { AND: [{ siteTag: CF_SITE_TAG }, { datetime_geq: prevSince }, { datetime_lt: since }, { bot: 0 }] };
  try {
    const r = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.CF_ANALYTICS_TOKEN },
      body: JSON.stringify({ query: QUERY, variables: { account: CF_ACCOUNT_ID, filter, pfilter, vfilter: { AND: [{ siteTag: CF_SITE_TAG }, { datetime_geq: since }] } } })
    });
    const body = await r.json().catch(() => ({}));
    const acct = body && body.data && body.data.viewer && body.data.viewer.accounts && body.data.viewer.accounts[0];
    if (!r.ok || !acct) {
      const msg = (body.errors && body.errors[0] && body.errors[0].message) || ('HTTP ' + r.status);
      return json({ connected: true, error: 'Cloudflare Analytics didn’t answer: ' + String(msg).slice(0, 200), days, plays, ...extra }, 502);
    }
    return json({ ...shape(acct, days), plays, ...extra });
  } catch {
    return json({ connected: true, error: 'Couldn’t reach Cloudflare Analytics. Try again in a minute.', days, plays, ...extra }, 502);
  }
}

export const onRequestGet = (context) => insights(context);
