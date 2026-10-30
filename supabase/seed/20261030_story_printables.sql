-- Free printables for the bedtime stories that are Studio posts (Elijah, The Smallest Star, Pip).
-- Jonah is a built-in story: its printables are in js/content.js. The PDFs are files of this site
-- (media/printables/, made with littlelights-growth tools/make_printables.py).
-- Apply in the SQL Editor after this branch is live. Safe to run twice (it sets the same list again).
-- Later printables can be uploaded in the Studio instead (Bedtime story → Printables).
update public.posts set fields = fields || jsonb_build_object('printables', jsonb_build_array(
    jsonb_build_object('title', 'Colouring page', 'file', 'media/printables/elijah-colouring-page.589cfdba.pdf'),
    jsonb_build_object('title', 'Memory verse and question cards', 'file', 'media/printables/elijah-verse-and-question-cards.159ab4cc.pdf')))
  where type = 'story' and slug = 'elijah-still-small-voice-bedtime-story';
update public.posts set fields = fields || jsonb_build_object('printables', jsonb_build_array(
    jsonb_build_object('title', 'Colouring page', 'file', 'media/printables/the-smallest-star-colouring-page.6b715a77.pdf'),
    jsonb_build_object('title', 'Memory verse and question cards', 'file', 'media/printables/the-smallest-star-verse-and-question-cards.73e8c63f.pdf')))
  where type = 'story' and slug = 'the-smallest-star';
update public.posts set fields = fields || jsonb_build_object('printables', jsonb_build_array(
    jsonb_build_object('title', 'Colouring page', 'file', 'media/printables/pip-and-the-heavy-acorn-colouring-page.a084c7ff.pdf'),
    jsonb_build_object('title', 'Memory verse and question cards', 'file', 'media/printables/pip-and-the-heavy-acorn-verse-and-question-cards.aad51929.pdf')))
  where type = 'story' and slug = 'pip-and-the-heavy-acorn';
-- Check: select slug, fields->'printables' from public.posts where type = 'story';
