// /watch/<slug>: prerendered videos are plain files; a video published after the last build is looked
// up here (see lib/edge.mjs). Unknown slugs stay a 404.
import { postPage } from '../../lib/edge.mjs';
export const onRequestGet = (context) => postPage(context, 'reel');
