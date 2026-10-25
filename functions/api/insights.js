// /api/insights?days=7|30 — Studio Insights (team only).
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

async function postStats(token, since, fetchImpl) {
  try {
    const r = await fetchImpl(SUPABASE_URL + '/rest/v1/post_stats?select=post_id,event,count&day=gte.' + since.slice(0, 10) + '&limit=5000',
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null; // table not created yet
    const out = {};
    for (const row of await r.json()) {
      const p = (out[row.post_id] ||= { started: 0, finished: 0, read_end: 0 });
      p[row.event] = (p[row.event] || 0) + Number(row.count || 0);
    }
    return out;
  } catch { return null; }
}

const QUERY = `query($account: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject, $vfilter: AccountRumWebVitalsEventsAdaptiveGroupsFilter_InputObject) {
  viewer { accounts(filter: { accountTag: $account }) {
    total: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1) { count sum { visits } }
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

const ms = (us) => (us == null ? null : Math.round(us / 1000));

export function shape(acct, days) {
  const posts = {};
  const get = (path) => (posts[path] ||= { path, views: 0, visits: 0, countries: {}, referrers: {} });
  for (const g of acct.paths || []) { const p = get(g.dimensions.requestPath); p.views = g.count; p.visits = (g.sum || {}).visits || 0; }
  for (const g of acct.countries || []) { const p = get(g.dimensions.requestPath), c = g.dimensions.countryName || 'Unknown'; p.countries[c] = (p.countries[c] || 0) + g.count; }
  for (const g of acct.referers || []) {
    const p = get(g.dimensions.requestPath), r = g.dimensions.refererHost || 'Direct / none';
    p.referrers[r] = (p.referrers[r] || 0) + g.count;
  }
  const list = Object.values(posts).filter((p) => p.views > 0 && !p.path.startsWith('/studio')).sort((a, b) => b.views - a.views)
    .map((p) => ({ path: p.path, views: p.views, visits: p.visits, countries: top(p.countries), referrers: top(p.referrers) }));
  const t = (acct.total || [])[0] || { count: 0, sum: { visits: 0 } };
  const v = (acct.vitals || [])[0];
  const q = (v && v.quantiles) || {};
  return {
    connected: true, days,
    total: { views: t.count || 0, visits: (t.sum || {}).visits || 0 },
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

  const days = new URL(request.url).searchParams.get('days') === '30' ? 30 : 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const plays = await postStats(token, since, fetchImpl);
  if (!env || !env.CF_ANALYTICS_TOKEN) return json({ connected: false, days, plays });

  const filter = { AND: [{ siteTag: CF_SITE_TAG }, { datetime_geq: since }, { bot: 0 }] };
  try {
    const r = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.CF_ANALYTICS_TOKEN },
      body: JSON.stringify({ query: QUERY, variables: { account: CF_ACCOUNT_ID, filter, vfilter: { AND: [{ siteTag: CF_SITE_TAG }, { datetime_geq: since }] } } })
    });
    const body = await r.json().catch(() => ({}));
    const acct = body && body.data && body.data.viewer && body.data.viewer.accounts && body.data.viewer.accounts[0];
    if (!r.ok || !acct) {
      const msg = (body.errors && body.errors[0] && body.errors[0].message) || ('HTTP ' + r.status);
      return json({ connected: true, error: 'Cloudflare Analytics didn’t answer: ' + String(msg).slice(0, 200), days, plays }, 502);
    }
    return json({ ...shape(acct, days), plays });
  } catch {
    return json({ connected: true, error: 'Couldn’t reach Cloudflare Analytics. Try again in a minute.', days, plays }, 502);
  }
}

export const onRequestGet = (context) => insights(context);
