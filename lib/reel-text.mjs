// "About this video" box and series intros for the static HTML. The text (owned by Content Creation)
// and the markup live in js/reel-text.js, the same file the app loads, so both always agree.
import '../js/reel-text.js';

export const REEL_TEXT = globalThis.LL_TEXT.REEL_TEXT;
export const SERIES_INTRO = globalThis.LL_TEXT.SERIES_INTRO;
export const reelTextHtml = globalThis.LL_TEXT.reelTextHtml;
export const seriesIntroHtml = globalThis.LL_TEXT.seriesIntroHtml;
