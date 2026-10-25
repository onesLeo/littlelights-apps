// /sitemap.xml: the built sitemap plus posts published in the Studio after the last build (see lib/edge.mjs).
import { sitemap } from '../lib/edge.mjs';
export const onRequestGet = (context) => sitemap(context);
