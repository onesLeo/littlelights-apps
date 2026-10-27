// Static <head> and page bodies for every address. Shared by scripts/prerender.mjs (build time) and
// the Pages Functions in functions/ (posts published after the last build). Wording and addresses
// come from js/seo.js, the same file the app uses when it changes screen.
import '../js/seo.js';

export const SEO = globalThis.LL_SEO;
const ORG_ID = SEO.SITE + '/#organization';
const SITE_ID = SEO.SITE + '/#website';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const abs = (u) => (!u ? '' : /^https?:/i.test(u) ? u : SEO.SITE + '/' + String(u).replace(/^\/+/, ''));
// "0:39" -> "PT0M39S"; seconds -> same.
export function isoDuration(len) {
  let s = typeof len === 'number' ? len : 0;
  if (typeof len === 'string' && /^\d+(:\d{2}){1,2}$/.test(len.trim())) s = len.trim().split(':').map(Number).reduce((t, x) => t * 60 + x, 0);
  else if (typeof len === 'string' && /^\d+(\.\d+)?$/.test(len.trim())) s = Number(len);
  if (!s) return '';
  return 'PT' + Math.floor(s / 60) + 'M' + Math.round(s % 60) + 'S';
}
// Studio text: same small Markdown subset as mdToHtml in js/app.js.
export function mdToHtml(text) {
  return String(text || '').trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
    const quote = /^>\s?/.test(block);
    const html = esc(block.replace(/^>\s?/gm, '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>').replace(/\n/g, '<br>');
    return quote ? '<blockquote>' + html + '</blockquote>' : '<p>' + html + '</p>';
  }).join('');
}

const organization = {
  '@type': 'Organization', '@id': ORG_ID, name: SEO.NAME, url: SEO.SITE + '/',
  logo: { '@type': 'ImageObject', url: SEO.SITE + '/icons/icon-512.png', width: 512, height: 512 },
  email: 'support@littlesaltandlight.com',
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'support@littlesaltandlight.com', availableLanguage: 'English' },
};
const website = { '@type': 'WebSite', '@id': SITE_ID, name: SEO.NAME, alternateName: 'Little Light', description: SEO.PAGES.today.desc, url: SEO.SITE + '/', inLanguage: 'en', publisher: { '@id': ORG_ID } };
const family = { isFamilyFriendly: true, audience: { '@type': 'PeopleAudience', audienceType: 'Families with children' } };

function crumbs(items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SEO.SITE + path })) };
}
// JSON-LD for a page: always WebSite + Organization, plus what the page is about.
export function structuredData(page) {
  const g = [website, organization];
  const url = SEO.SITE + page.meta.path;
  const tabName = { watch: 'Watch', listen: 'Listen', read: 'Read', verses: 'Verses', play: 'Play' };
  if (page.kind === 'devotion') {
    const d = page.item;
    g.push({ '@type': 'Article', '@id': url + '#article', headline: d.title, description: page.meta.desc, url, mainEntityOfPage: url, inLanguage: 'en',
      image: SEO.IMAGE, author: { '@id': ORG_ID }, publisher: { '@id': ORG_ID }, isAccessibleForFree: true, ...family,
      ...(d.date ? { datePublished: d.date } : {}), ...(d.audio ? { audio: { '@type': 'AudioObject', contentUrl: abs(d.audio.src), encodingFormat: 'audio/mpeg', ...(isoDuration(d.audio.dur) ? { duration: isoDuration(d.audio.dur) } : {}) } } : {}) });
    g.push(crumbs([['Today', '/'], ['Read', '/read'], [d.title, page.meta.path]]));
  } else if (page.kind === 'story') {
    const x = page.item;
    const seriesUrl = SEO.SITE + '/listen';
    g.push({ '@type': 'PodcastEpisode', '@id': url + '#episode', name: x.seoTitle || x.title, description: page.meta.desc, url, inLanguage: 'en', ...family,
      ...(x.episode ? { episodeNumber: x.episode } : {}), image: SEO.storyImage(x) || SEO.IMAGE, publisher: { '@id': ORG_ID },
      partOfSeries: { '@type': 'PodcastSeries', name: x.series, url: seriesUrl },
      associatedMedia: { '@type': 'AudioObject', contentUrl: abs(x.src), encodingFormat: 'audio/mpeg', ...(isoDuration(x.dur) ? { duration: isoDuration(x.dur) } : {}) } });
    g.push(crumbs([['Today', '/'], ['Listen', '/listen'], [x.title, page.meta.path]]));
  } else if (page.kind === 'reel') {
    g.push(videoObject(page.item, url));
    g.push(crumbs([['Today', '/'], ['Watch', '/watch'], [page.item.title, page.meta.path]]));
  } else if (page.kind === 'series') {
    g.push({ '@type': 'CreativeWorkSeries', name: page.item.series, description: page.meta.desc, url, inLanguage: 'en', publisher: { '@id': ORG_ID }, ...family,
      hasPart: page.item.reels.map((r) => videoObject(r, SEO.SITE + SEO.path('watch', SEO.reelSlug(r)))) });
    g.push(crumbs([['Today', '/'], ['Watch', '/watch'], [page.item.series, page.meta.path]]));
  } else if (page.tab === 'listen' && page.episodes && page.episodes.length) {
    const series = { '@type': 'PodcastSeries', '@id': SEO.SITE + '/listen#series', name: SEO.NAME + ' audio devotions', url: SEO.SITE + '/listen', inLanguage: 'en', publisher: { '@id': ORG_ID }, ...family };
    g.push(series);
    page.episodes.forEach((e) => g.push({ '@type': 'PodcastEpisode', name: e.title, description: SEO.clip(e.verse ? '“' + e.verse + '” ' + (e.ref || '') : e.meta || e.title), url: SEO.SITE + '/listen',
      partOfSeries: { '@id': series['@id'] }, inLanguage: 'en', ...(e.date ? { datePublished: e.date } : {}),
      associatedMedia: { '@type': 'AudioObject', contentUrl: abs(e.src), encodingFormat: 'audio/mpeg', ...(isoDuration(e.dur) ? { duration: isoDuration(e.dur) } : {}) } }));
    g.push(crumbs([['Today', '/'], ['Listen', '/listen']]));
  } else if (page.tab === 'watch' && page.reels && page.reels.length) {
    g.push({ '@type': 'ItemList', name: 'Bible story videos', itemListElement: page.reels.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: SEO.SITE + SEO.path('watch', SEO.reelSlug(r)), name: r.title })) });
    g.push(crumbs([['Today', '/'], ['Watch', '/watch']]));
  } else if (page.tab === 'read' && page.devotions && page.devotions.length) {
    g.push({ '@type': 'ItemList', name: 'Family devotions', itemListElement: page.devotions.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: SEO.SITE + SEO.path('read', d.slug), name: d.title })) });
    g.push(crumbs([['Today', '/'], ['Read', '/read']]));
  } else if (page.tab === 'play') {
    g.push({ '@type': 'VideoGame', name: 'Little Light: Bible Journeys', description: SEO.PAGES.play.desc, url, inLanguage: 'en', gamePlatform: 'Android', applicationCategory: 'Game',
      genre: ['Educational', 'Adventure'], isAccessibleForFree: true, publisher: { '@id': ORG_ID }, author: { '@id': ORG_ID },
      audience: { '@type': 'PeopleAudience', suggestedMinAge: 5, suggestedMaxAge: 8 }, isFamilyFriendly: true });
    g.push(crumbs([['Today', '/'], ['Play', '/play']]));
  } else if (page.tab && page.tab !== 'today') {
    g.push(crumbs([['Today', '/'], [tabName[page.tab], page.meta.path]]));
  }
  return { '@context': 'https://schema.org', '@graph': g };
}
function videoObject(r, url) {
  // Google needs name, description, thumbnailUrl and uploadDate; duration and contentUrl/embedUrl when known.
  const thumb = r.poster ? abs(r.poster) : (r.youtube ? 'https://i.ytimg.com/vi/' + r.youtube + '/hqdefault.jpg' : SEO.IMAGE);
  const uploaded = r.date || r.updated || '';
  return { '@type': 'VideoObject', name: r.title, description: SEO.clip(r.caption || r.topic || r.title, 300), url, thumbnailUrl: thumb, inLanguage: 'en', ...family,
    ...(uploaded ? { uploadDate: uploaded } : {}), ...(isoDuration(r.len || r.seconds) ? { duration: isoDuration(r.len || r.seconds) } : {}),
    ...(r.src ? { contentUrl: abs(r.src) } : r.youtube ? { embedUrl: 'https://www.youtube-nocookie.com/embed/' + r.youtube } : {}), publisher: { '@id': ORG_ID } };
}

// /watch/<slug> opens straight into the player, whose poster fills the screen on a phone: load it with
// the HTML, first. Same choice as playerPoster() in js/app.js (built-in posters have a WebP copy).
export function playerPoster(r) {
  if (!r.src || !r.poster) return {};
  const p = String(r.poster);
  const url = r.thumb && /-poster\.jpg$/.test(p) ? p.replace(/\.jpg$/, '.webp') : p;
  return { posterImage: /^https?:/.test(url) ? url : '/' + url.replace(/^\//, '') };
}

// The <head> block between <!-- seo --> markers.
export function headHtml(page) {
  const m = page.meta, url = SEO.SITE + m.path;
  // A video page shares its own poster (any storage host); everything else, and old posts without one, the site image.
  const own = !!m.image, img = own ? m.image : SEO.IMAGE;
  const alt = own ? m.imageAlt || (page.item && page.item.title) || m.title : 'Salt and Light: Bible devotions, stories and audio for families';
  const ld = JSON.stringify(structuredData(page)).replace(/</g, '\\u003c');
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.desc)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    page.noindex ? '<meta name="robots" content="noindex">' : '',
    '<meta property="og:site_name" content="Salt and Light">',
    `<meta property="og:type" content="${esc(m.type)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.desc)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    own ? '' : '<meta property="og:image:type" content="image/png">',
    own ? '' : '<meta property="og:image:width" content="1200">',
    own ? '' : '<meta property="og:image:height" content="630">',
    own && m.imageWidth && m.imageHeight ? `<meta property="og:image:width" content="${+m.imageWidth}">\n<meta property="og:image:height" content="${+m.imageHeight}">` : '',
    own && /\.jpe?g$/i.test(img) ? '<meta property="og:image:type" content="image/jpeg">' : '',
    `<meta property="og:image:alt" content="${esc(alt)}">`,
    page.kind === 'devotion' && page.item.date ? `<meta property="article:published_time" content="${esc(page.item.date)}">` : '',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(m.title)}">`,
    `<meta name="twitter:description" content="${esc(m.desc)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    `<meta name="twitter:image:alt" content="${esc(alt)}">`,
    `<script type="application/ld+json">${ld}</script>`,
    // Same sizes as thumb() in js/app.js (the featured video); browsers without AVIF skip it.
    // A video's own page opens in the player: its poster is the first big picture (fetched first).
    page.posterImage ? `<link rel="preload" as="image" fetchpriority="high" href="${esc(page.posterImage)}">` : '',
    page.heroImage ? `<link rel="preload" as="image" type="image/avif"${page.posterImage ? '' : ' fetchpriority="high"'} imagesrcset="${esc(page.heroImage)}-360.avif 360w, ${esc(page.heroImage)}-720.avif 720w" imagesizes="(min-width: 1100px) 720px, (min-width: 900px) 60vw, 100vw">` : '',
    !page.heroImage && page.heroPoster ? `<link rel="preload" as="image"${page.posterImage ? '' : ' fetchpriority="high"'} href="${esc(page.heroPoster)}">` : '',
  ].filter(Boolean).map((l) => '  ' + l).join('\n');
}

// The devotion page the app shows at /read/<slug> (same markup as openArticle in js/app.js), so the
// text is in the HTML for search engines and appears before the scripts run.
export function articleHtml(d) {
  return '<button class="back" type="button" data-close>← Back</button>' +
    '<div class="hero" style="background:' + esc(d.color || '#ee8fb2') + ';color:' + esc(d.ink || '#3a1426') + '"><span class="p-kicker">' + esc(d.kicker || 'Devotion') + '</span><h1>' + esc(d.title) + '</h1></div>' +
    '<div class="body p-txt">' + d.html + '</div>';
}

// Turns the app's index.html into the page for one address.
export function renderPage(template, page) {
  let html = template.replace(/<!-- seo:[^>]*-->[\s\S]*?<!-- \/seo -->/, (m) => m.slice(0, m.indexOf('-->') + 3) + '\n' + headHtml(page) + '\n  <!-- /seo -->');
  const tab = page.tab || 'today';
  if (tab !== 'today') {
    html = html.replace('class="p-view v-today on"', 'class="p-view v-today"')
      .replace(`class="p-view v-${tab}"`, `class="p-view v-${tab} on"`)
      .replace('<a class="p-tab on" href="/" data-tab="today"', '<a class="p-tab" href="/" data-tab="today"')
      .replace(new RegExp(`<a class="p-tab" href="/${tab}" data-tab="${tab}"`), `<a class="p-tab on" aria-current="page" href="/${tab}" data-tab="${tab}"`);
  } else {
    html = html.replace('<a class="p-tab on" href="/" data-tab="today"', '<a class="p-tab on" aria-current="page" href="/" data-tab="today"');
  }
  // Exactly one <h1> per address: the post's title on a post page, the screen's title on a screen, the
  // site headline on Today. index.html (the Today page) has its headline as the only h1 and every
  // other screen's title as h2, so only the current one is promoted here.
  if (tab !== 'today') html = html.replace('<h1>Today, together.</h1>', '<h2>Today, together.</h2>');
  if (!page.kind && ['listen', 'read', 'verses', 'play'].includes(tab)) {
    const name = { listen: 'Listen', read: 'Read', verses: 'Verses', play: 'Play' }[tab];
    html = html.replace(`<div class="p-head glass glass--bar"><h2>${name}</h2>`, `<div class="p-head glass glass--bar"><h1>${name}</h1>`);
  }
  if (tab === 'watch' && !page.kind) {
    html = html.replace('<div class="p-wgal" id="pWatchGal" aria-busy="true" data-h="h2">', '<div class="p-wgal" id="pWatchGal" aria-busy="true" data-h="h1">')
      .replace('<div class="p-wtop" aria-hidden="true"><div class="p-wtitle">Watch</div></div>', '<div class="p-wtop"><h1 class="p-wtitle">Watch</h1></div>');
  }
  // The gallery only shows its sort bar with three or more videos/series; keep the placeholder in step.
  if (page.watchUnits != null && page.watchUnits <= 2) html = html.replace(/\n\s*<div class="p-filter glass glass--dark p-fskel"[^\n]*<\/div><\/div>/, '');
  if (page.kind === 'devotion') {
    html = html.replace(/<article class="p-over p-article" id="pArticle"([^>]*)><\/article>/, (_, attrs) => `<article class="p-over p-article on" id="pArticle"${attrs} data-slug="${esc(page.item.slug)}">${articleHtml(page.item)}</article>`);
  }
  // "Goodnight Little Light" on /listen (and under a story page): links to each bedtime story page.
  if (tab === 'listen' && page.stories && page.stories.length) {
    html = html.replace('<div class="p-gn" id="pGnWrap" hidden>', '<div class="p-gn" id="pGnWrap">')
      .replace('<div class="p-list glass glass--dark" id="pGn" aria-labelledby="pGnTitle"></div>', `<div class="p-list glass glass--dark" id="pGn" aria-labelledby="pGnTitle">${SEO.storyRowsHtml(page.stories)}</div>`);
  }
  if (page.kind === 'story') {
    html = html.replace(/<article class="p-over p-article p-epage" id="pEpisode"([^>]*)><\/article>/, (_, attrs) => `<article class="p-over p-article p-epage on" id="pEpisode"${attrs} data-slug="${esc(page.item.slug)}">${SEO.storyHtml(page.item, 'h1')}</article>`);
  }
  if (page.kind === 'reel' || page.kind === 'series') {
    const title = page.kind === 'reel' ? page.item.title : page.item.series;
    const text = page.kind === 'reel' ? page.item.caption : page.item.desc;
    // Replaced by the video gallery as soon as the app starts.
    html = html.replace('<div class="p-wgal" id="pWatchGal" aria-busy="true" data-h="h2">', `<div class="p-wgal" id="pWatchGal" aria-busy="true" data-h="h2"><div class="p-seo"><h1>${esc(title)}</h1>${text ? '<p>' + esc(text) + '</p>' : ''}</div>`);
  }
  return html;
}

// Studio posts (rows of the `posts` table) in the shape the pages use; same fields the app reads.
const words = (f) => [f.body, f.family, f.prayer].join(' ').split(/\s+/).filter(Boolean).length;
const postDate = (p) => p.publish_at || p.created_at || '';
const mediaPath = (u) => (!u ? '' : /^https?:/.test(u) ? u : String(u).replace(/^\/+/, ''));
export function audioFromPost(p) {
  const f = p.fields || {};
  return { title: p.title, meta: f.kind || 'Audio', dur: f.seconds || 0, src: mediaPath(p.media_url), verse: f.verse || '', ref: f.ref || '', date: postDate(p), _id: p.id };
}
export function devotionFromPost(p, audio) {
  const f = p.fields || {};
  return { slug: p.slug, title: p.title, teaser: f.teaser || '', kicker: 'Devotion · ' + Math.max(1, Math.round(words(f) / 180)) + ' min read', date: postDate(p), updated: p.updated_at || '',
    html: mdToHtml(f.body) + (f.ref ? '<p class="meta">' + esc(f.ref) + '</p>' : '') + (f.family ? '<p><b>For families tonight:</b> ' + esc(f.family) + '</p>' : '') + (f.prayer ? '<div class="pray">' + esc(f.prayer) + '</div>' : ''),
    audio: audio && audio.src ? audio : null };
}
// A Studio bedtime story (type 'story') in the bedtimeStories shape. Same mapping as storyFromPost in
// js/store.js (tests/edge.mjs checks they agree).
const lines = (v) => String(v || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
const paragraphs = (v) => String(v || '').split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
export function storyFromPost(p, src) {
  const f = (p && p.fields) || {}, qs = lines(f.questions);
  const x = {
    slug: p.slug, title: p.title || '', series: f.series || 'Bedtime Bible Stories for Kids', episode: +f.episode || 0,
    seoTitle: f.seo_title || '', desc: f.desc || '', narrator: f.narrator || '',
    src: src || p.media_url || '', placeholder: false, dur: +f.seconds || 0,
    timings: f.timings || '', color: hex(f.color, '#a07fd6'), ink: hex(f.ink, '#1d1233'),
    story: paragraphs(f.story), prayer: f.prayer || '', goodnight: f.goodnight || '',
    verse: { text: f.verse || '', ref: f.ref || '', version: f.translation || 'WEB' },
    questions: qs.length === 3 ? qs : qs.length ? qs.slice(0, 3) : [],
    image: f.image || '', imageWidth: +f.image_width || 0, imageHeight: +f.image_height || 0,
    date: p.publish_at || p.created_at || '', updated: p.updated_at || '', _studio: true,
  };
  if (f.next_title) x.next = { title: f.next_title, when: f.next_when || '', href: f.next_href || '/listen' };
  if (f.word && f.word_meaning) x.word = { word: f.word, meaning: f.word_meaning };
  if (!x.image) { x.imageWidth = 0; x.imageHeight = 0; }
  return x;
}
export function reelFromPost(p) {
  const f = p.fields || {};
  return { title: p.title, slug: p.slug || '', len: f.minutes || '', seconds: +f.seconds || 0, src: mediaPath(p.media_url), youtube: f.youtube || '', caption: f.caption || '', date: postDate(p), updated: p.updated_at || '',
    series: f.series || '', episode: +f.episode || 0, seriesDesc: f.series_description || '', poster: f.poster || '' };
}
