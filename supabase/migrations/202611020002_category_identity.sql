begin;

set local lock_timeout = '5s';
set local statement_timeout = '15s';

-- All categories and records already use UUID identity; remove only legacy seed metadata.
alter table public.study_categories drop column seed_key;

commit;
