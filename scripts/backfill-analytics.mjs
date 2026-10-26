// One-time backfill: copy every past UTC day Cloudflare still returns into site_daily_stats.
// Cloudflare keeps Web Analytics for this account about 184 days (settings.notOlderThan = 15897600 s).
// Quiet days are stored as a single zero total, so Insights knows the day is done and won't ask live.
// Run (with approval, after the migration):
//   CF_ANALYTICS_TOKEN=... ANALYTICS_INGEST_SECRET=... node scripts/backfill-analytics.mjs [maxDays=183]
// Values come from the environment only and are never printed. Safe to re-run (each day is replaced).
import { fetchDays, snapshotRows, saveRows, addDays, dayOf } from '../lib/site-analytics.mjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/edge.mjs';

const { CF_ANALYTICS_TOKEN: cfToken, ANALYTICS_INGEST_SECRET: secret } = process.env;
if (!cfToken || !secret) { console.error('Set CF_ANALYTICS_TOKEN and ANALYTICS_INGEST_SECRET in the environment.'); process.exit(1); }
const maxDays = Number(process.argv[2]) || 183;
let day = addDays(dayOf(Date.now()), -1), saved = 0;
for (let i = 0; i < maxDays; i++, day = addDays(day, -1)) {
  try {
    const acct = await fetchDays(cfToken, day, addDays(day, 1));
    const rows = snapshotRows(acct, day);
    const n = await saveRows(SUPABASE_URL, SUPABASE_ANON_KEY, secret, day, rows);
    console.log(day, n, 'rows'); saved++;
  } catch (e) {
    // Past Cloudflare's retention the API answers with an error: stop there.
    console.log(day, 'stopped:', String(e.message).slice(0, 160));
    break;
  }
}
console.log('Backfilled', saved, 'days.');
