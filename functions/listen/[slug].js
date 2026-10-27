// /listen/<slug>: prerendered bedtime stories are plain files; a Studio story whose publish time passed
// after the last build is looked up here (see lib/edge.mjs). Unknown or future slugs stay a 404.
import { postPage } from '../../lib/edge.mjs';
export const onRequestGet = (context) => postPage(context, 'story');
