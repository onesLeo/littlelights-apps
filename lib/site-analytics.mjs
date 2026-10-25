// Daily anonymous site analytics: shared by functions/api/insights.js, the nightly snapshot Worker
// (workers/analytics-snapshot) and the one-time backfill (scripts/backfill-analytics.mjs).
// A "row" is one daily total: { day: 'YYYY-MM-DD', metric, dimension, key, value } — the shape of
// public.site_daily_stats. Only aggregated counts from Cloudflare Web Analytics are ever turned into
// rows: no IP, user agent, cookie, visitor id or per-visit record exists anywhere in here.
export const CF_ACCOUNT_ID = '1835673e1406fbb875ff4210741d90cc';
export const CF_SITE_TAG = '9b7ae97446344441b89852635cb617e9'; // Web Analytics site for littlesaltandlight.com
export const CF_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const SEP = '\t'; // path<TAB>country / path<TAB>referrer host in `key`

export const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
export const addDays = (day, n) => dayOf(Date.parse(day + 'T00:00:00Z') + n * 86400000);

// Everything grouped by UTC date, so the same query serves one day (snapshot) or a range (live/backfill).
export const DAY_QUERY = `query($account: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject, $vfilter: AccountRumWebVitalsEventsAdaptiveGroupsFilter_InputObject) {
  viewer { accounts(filter: { accountTag: $account }) {
    daily: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1000, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    paths: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 5000, orderBy: [count_DESC]) { count sum { visits } dimensions { date requestPath } }
    countries: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 10000, orderBy: [count_DESC]) { count dimensions { date requestPath countryName } }
    referers: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 10000, orderBy: [count_DESC]) { count dimensions { date requestPath refererHost } }
    vitals: rumWebVitalsEventsAdaptiveGroups(filter: $vfilter, limit: 1000, orderBy: [date_ASC]) {
      count dimensions { date }
      quantiles { largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 firstContentfulPaintP75 timeToFirstByteP75 }
    }
  } }
}`;

// Ask Cloudflare for [fromDay, toDayExclusive) by UTC day. Throws on any error (message only, never the token).
export async function fetchDays(token, fromDay, toDayExclusive, fetchImpl = fetch, toDatetime) {
  const end = toDatetime || toDayExclusive + 'T00:00:00Z';
  const range = [{ siteTag: CF_SITE_TAG }, { datetime_geq: fromDay + 'T00:00:00Z' }, { datetime_lt: end }];
  const r = await fetchImpl(CF_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ query: DAY_QUERY, variables: { account: CF_ACCOUNT_ID, filter: { AND: [...range, { bot: 0 }] }, vfilter: { AND: range } } })
  });
  const body = await r.json().catch(() => ({}));
  const acct = body && body.data && body.data.viewer && body.data.viewer.accounts && body.data.viewer.accounts[0];
  if (!r.ok || !acct || (body.errors && body.errors.length)) {
    throw new Error((body.errors && body.errors[0] && body.errors[0].message) || ('HTTP ' + r.status));
  }
  return acct;
}

// Cloudflare uses -1 for a vital with no samples that day (skipped).
// Cloudflare reports vitals in microseconds (CLS unitless); rows hold integers: µs, CLS × 10000.
const VITALS = [['lcp', 'largestContentfulPaintP75'], ['inp', 'interactionToNextPaintP75'], ['cls', 'cumulativeLayoutShiftP75'], ['fcp', 'firstContentfulPaintP75'], ['ttfb', 'timeToFirstByteP75']];

// Cloudflare per-date groups -> daily total rows.
export function toRows(acct) {
  const rows = [], add = (day, metric, dimension, key, value) => { if (day && value) rows.push({ day, metric, dimension, key, value: Math.round(Number(value)) }); };
  const sum = new Map(), bump = (k, v) => sum.set(k, (sum.get(k) || 0) + v);
  for (const g of acct.daily || []) { add(g.dimensions.date, 'views', 'total', '', g.count); add(g.dimensions.date, 'visits', 'total', '', (g.sum || {}).visits); }
  for (const g of acct.paths || []) { const d = g.dimensions; add(d.date, 'views', 'path', d.requestPath, g.count); add(d.date, 'visits', 'path', d.requestPath, (g.sum || {}).visits); }
  for (const g of acct.countries || []) { const d = g.dimensions; bump([d.date, 'path_country', d.requestPath + SEP + (d.countryName || 'Unknown')].join('\n'), g.count); }
  for (const g of acct.referers || []) { const d = g.dimensions; bump([d.date, 'path_referer', d.requestPath + SEP + (d.refererHost || '')].join('\n'), g.count); }
  for (const [k, v] of sum) { const [day, dimension, key] = k.split('\n'); add(day, 'views', dimension, key, v); }
  for (const g of acct.vitals || []) {
    const day = g.dimensions.date, q = g.quantiles || {};
    add(day, 'samples', 'vitals', '', g.count);
    for (const [name, f] of VITALS) if (q[f] != null && q[f] >= 0) add(day, 'p75', 'vitals', name, name === 'cls' ? q[f] * 10000 : q[f]);
  }
  return rows;
}

// Daily rows for [fromDay, toDayExclusive) -> the account object shape() in insights.js expects.
// Vitals across several days: sample-weighted mean of each day's p75 (a close, honest summary).
export function rowsToAcct(rows, fromDay, toDayExclusive) {
  const inside = (rows || []).filter((r) => r.day >= fromDay && r.day < toDayExclusive);
  const total = { count: 0, sum: { visits: 0 } }, daily = {}, paths = {}, countries = {}, referers = {}, vit = {};
  let samples = 0;
  const vitalsByDay = {};
  for (const r of inside) {
    const v = Number(r.value) || 0;
    if (r.dimension === 'total') {
      const d = (daily[r.day] ||= { count: 0, sum: { visits: 0 }, dimensions: { date: r.day } });
      if (r.metric === 'views') { d.count += v; total.count += v; } else if (r.metric === 'visits') { d.sum.visits += v; total.sum.visits += v; }
    } else if (r.dimension === 'path') {
      const p = (paths[r.key] ||= { count: 0, sum: { visits: 0 }, dimensions: { requestPath: r.key } });
      if (r.metric === 'views') p.count += v; else if (r.metric === 'visits') p.sum.visits += v;
    } else if (r.dimension === 'path_country' || r.dimension === 'path_referer') {
      const i = r.key.indexOf(SEP), path = r.key.slice(0, i), other = r.key.slice(i + 1), map = r.dimension === 'path_country' ? countries : referers;
      const g = (map[r.key] ||= { count: 0, dimensions: r.dimension === 'path_country' ? { requestPath: path, countryName: other } : { requestPath: path, refererHost: other } });
      g.count += v;
    } else if (r.dimension === 'vitals') (vitalsByDay[r.day] ||= {})[r.metric === 'samples' ? 'samples' : r.key] = v;
  }
  for (const d of Object.values(vitalsByDay)) {
    const n = d.samples || 0; if (!n) continue; samples += n;
    for (const [name] of VITALS) if (d[name] != null) { const a = (vit[name] ||= { w: 0, n: 0 }); a.w += d[name] * n; a.n += n; }
  }
  const q = {}; for (const [name, f] of VITALS) if (vit[name]) q[f] = (vit[name].w / vit[name].n) / (name === 'cls' ? 10000 : 1);
  return {
    total: [total],
    daily: Object.values(daily).sort((a, b) => a.dimensions.date.localeCompare(b.dimensions.date)),
    paths: Object.values(paths).sort((a, b) => b.count - a.count),
    countries: Object.values(countries), referers: Object.values(referers),
    vitals: samples ? [{ count: samples, quantiles: q }] : []
  };
}

// Days for which a stored snapshot exists (the snapshot always writes total/views, even 0, as a marker).
export const storedDays = (rows) => new Set((rows || []).filter((r) => r.dimension === 'total' && r.metric === 'views').map((r) => r.day));

// Snapshot rows for one day; adds a zero total so a quiet day still counts as "stored".
export function snapshotRows(acct, day) {
  const rows = toRows(acct).filter((r) => r.day === day);
  if (!rows.some((r) => r.dimension === 'total' && r.metric === 'views')) rows.push({ day, metric: 'views', dimension: 'total', key: '', value: 0 });
  return rows;
}

// Upsert through the secret-gated RPC (no service role key needed anywhere).
export async function saveRows(supabaseUrl, anonKey, secret, day, rows, fetchImpl = fetch) {
  const r = await fetchImpl(supabaseUrl + '/rest/v1/rpc/save_site_daily_stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: 'Bearer ' + anonKey },
    body: JSON.stringify({ p_secret: secret, p_day: day, p_rows: rows.map(({ metric, dimension, key, value }) => ({ metric, dimension, key, value })) })
  });
  if (!r.ok) throw new Error('Supabase save failed: HTTP ' + r.status);
  return rows.length;
}

// Fetch one finished UTC day from Cloudflare and store it. Idempotent: the RPC replaces that day.
export async function snapshotDay({ cfToken, supabaseUrl, anonKey, secret, day, fetchImpl = fetch }) {
  const acct = await fetchDays(cfToken, day, addDays(day, 1), fetchImpl);
  return saveRows(supabaseUrl, anonKey, secret, day, snapshotRows(acct, day), fetchImpl);
}
