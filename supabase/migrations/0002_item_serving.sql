-- Een item is een drank op zich, een ingrediënt voor cocktails, of allebei (bijv. cola).
--   drink       staat op het menu als drank
--   ingredient  alleen een ingrediënt: staat niet als drank op het menu
--   both        beide; op het menu gewoon als drank, zonder vermelding van de recepten waarin het zit

alter table public.items
  add column serving text not null default 'drink'
  check (serving in ('drink', 'ingredient', 'both'));

comment on column public.items.serving is
  'drink = alleen losse drank, ingredient = alleen ingrediënt (niet op het menu), both = allebei';

-- startwaarden voor wat er al staat; daarna pas je ze per item aan in Supabase
update public.items i
set serving = 'ingredient'
from public.categories c
where c.id = i.category_id and c.kind = 'ingredient';

update public.items i
set serving = 'both'
where i.serving = 'drink'
  and (
    exists (select 1 from public.recipe_bottles rb where rb.item_id = i.id)
    or (i.keyword is not null and exists (
      select 1 from public.recipe_lines l where lower(l.ingredient) like '%' || i.keyword || '%'))
  );
