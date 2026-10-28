// Cloudflare Web Analytics, loaded by the site itself (Cloudflare's automatic injection is switched off for
// littlesaltandlight.com, see docs/studio.md "Not counting the team"). Cookie-free; no other tracking.
// The beacon is never loaded:
//   - on /studio (the Studio page doesn't include this file, and this file checks again), or
//   - anywhere but littlesaltandlight.com (previews, local copies), or
//   - on a device where "don't count me" is on: localStorage 'll.nocount' = '1'.
// Open https://littlesaltandlight.com/?nocount=1 once on a device to turn it on, ?nocount=0 to turn it off
// (or use the switch in Studio → Guide). A small note confirms the change.
(function () {
  var KEY = 'll.nocount';
  // Public Web Analytics site token: it is in every page that loads the beacon; not a secret.
  var TOKEN = '3fd8950820e646c99e27720e4d4aaf05';
  var store = null;
  try { store = window.localStorage; } catch (e) {}
  var get = function () { try { return !!store && store.getItem(KEY) === '1'; } catch (e) { return false; } };
  var set = function (on) { try { if (on) store.setItem(KEY, '1'); else store.removeItem(KEY); } catch (e) {} };
  var loc = window.location, q = null;
  try { q = new URLSearchParams(loc.search).get('nocount'); } catch (e) {}
  if (q === '1' || q === '0') {
    set(q === '1');
    try { var u = new URL(loc.href); u.searchParams.delete('nocount'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) {}
    note(q === '1' ? 'This device won\u2019t be counted in visitor numbers.' : 'This device is counted in visitor numbers again.');
  }
  if (get() || /^\/studio(\/|$)/.test(loc.pathname)) return;
  // Only the real site is counted: previews, *.pages.dev and local copies never load the beacon
  // (tests/nocount.mjs sets LL_BEACON_ANY_HOST to check the loader on localhost with a fake beacon).
  if (loc.hostname !== 'littlesaltandlight.com' && !window.LL_BEACON_ANY_HOST) return;
  var s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: TOKEN, spa: true }));
  (document.head || document.documentElement).appendChild(s);

  function note(text) {
    var show = function () {
      var n = document.createElement('div');
      n.className = 'll-nocount-note'; n.setAttribute('role', 'status'); n.textContent = text;
      var st = n.style;
      st.position = 'fixed'; st.left = '50%'; st.bottom = '16px'; st.transform = 'translateX(-50%)'; st.zIndex = '2147483000';
      st.background = 'rgba(29,24,51,.92)'; st.color = '#fff'; st.font = '500 13px/1.35 system-ui, sans-serif';
      st.padding = '8px 14px'; st.borderRadius = '999px'; st.maxWidth = '90vw'; st.textAlign = 'center'; st.pointerEvents = 'none';
      document.body.appendChild(n);
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 3500);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
})();
