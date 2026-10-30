// /dl/<path>: free printables, counted per file, day and country, then sent on (see lib/downloads.mjs).
import { download } from '../../lib/downloads.mjs';
export const onRequest = (context) => download(context);
