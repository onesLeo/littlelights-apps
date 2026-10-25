// Nightly snapshot: at 00:15 UTC store yesterday's (UTC) anonymous daily totals from Cloudflare Web
// Analytics into Supabase public.site_daily_stats. Re-running a day replaces it (idempotent).
// Secrets (wrangler secret put): CF_ANALYTICS_TOKEN (Account Analytics Read), ANALYTICS_INGEST_SECRET.
import { snapshotDay, addDays, dayOf } from '../../lib/site-analytics.mjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/edge.mjs';

export async function run(env, now = Date.now(), fetchImpl = fetch) {
  const yesterday = addDays(dayOf(now), -1);
  // Also re-take the day before, in case a previous run failed (cheap and idempotent).
  const out = {};
  for (const day of [addDays(yesterday, -1), yesterday]) {
    out[day] = await snapshotDay({ cfToken: env.CF_ANALYTICS_TOKEN, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, secret: env.ANALYTICS_INGEST_SECRET, day, fetchImpl });
  }
  return out;
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env, event.scheduledTime)); }
};
