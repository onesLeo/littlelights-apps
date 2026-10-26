// Nightly snapshot: at 00:15 UTC store yesterday's (UTC) anonymous daily totals from Cloudflare Web
// Analytics into Supabase public.site_daily_stats. Re-running a day replaces it (idempotent).
// Secrets (wrangler secret put): CF_ANALYTICS_TOKEN (Account Analytics Read), ANALYTICS_INGEST_SECRET.
import { snapshotDay, addDays, dayOf } from '../../lib/site-analytics.mjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/edge.mjs';

export async function run(env, now = Date.now(), fetchImpl = fetch) {
  const yesterday = addDays(dayOf(now), -1);
  // Also re-take the day before, in case a previous run failed (cheap and idempotent).
  // Each day is tried on its own and failures are logged (message only, never secrets), so one bad
  // day can't stop the other, and the run still ends as an error when anything failed.
  const out = {}, failed = [];
  for (const day of [addDays(yesterday, -1), yesterday]) {
    try {
      out[day] = await snapshotDay({ cfToken: env.CF_ANALYTICS_TOKEN, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, secret: env.ANALYTICS_INGEST_SECRET, day, fetchImpl });
      console.log('analytics-snapshot', day, out[day], 'rows');
    } catch (e) {
      console.error('analytics-snapshot', day, 'failed:', String((e && e.message) || e).slice(0, 300));
      failed.push(day);
    }
  }
  if (failed.length) throw new Error('analytics-snapshot failed for ' + failed.join(', '));
  return out;
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env, event.scheduledTime)); }
};
