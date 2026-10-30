-- A10: the Studio verse post "Ephesians 6:10-18" (id 9, published, on Today) from KJV to WEBBE
-- (World English Bible, British Edition), the site's Scripture edition. Text from bible.com/bible/1204/EPH.6.WEBBE.
-- Changes only this post's `verse` and `translation` fields; title, reference, topics, Today setting and
-- publish date stay as they are. Its Studio History gets one entry (the posts_history trigger), so the KJV
-- version can be restored from there. Run once in the SQL Editor (only after Taman's OK).
update public.posts
set fields = fields || jsonb_build_object(
  'verse', 'Finally, be strong in the Lord and in the strength of his might. Put on the whole armour of God, that you may be able to stand against the wiles of the devil. For our wrestling is not against flesh and blood, but against the principalities, against the powers, against the world’s rulers of the darkness of this age, and against the spiritual forces of wickedness in the heavenly places. Therefore put on the whole armour of God, that you may be able to withstand in the evil day, and having done all, to stand. Stand therefore, having the utility belt of truth buckled around your waist, and having put on the breastplate of righteousness, and having fitted your feet with the preparation of the Good News of peace, above all, taking up the shield of faith, with which you will be able to quench all the fiery darts of the evil one. And take the helmet of salvation, and the sword of the Spirit, which is the word of God, with all prayer and requests, praying at all times in the Spirit, and being watchful to this end in all perseverance and requests for all the saints.',
  'translation', 'WEBBE')
where id = 9 and slug = 'ephesians-6-10-18' and type = 'verse';
-- Check: select id, status, fields->>'translation', left(fields->>'verse', 80) from public.posts where id = 9;
