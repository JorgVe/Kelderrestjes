-- De bestaande receptregels koppelen aan items (zie 0019).
--
-- Dit is dezelfde herkenning die de site tot nu toe op de tekst deed, één keer uitgevoerd en daarna vastgelegd:
--   - een item wordt herkend aan zijn naam, zijn trefwoord (items.keyword) of een van zijn andere namen (items.aliases);
--   - de langste woorden eerst, en wat is herkend telt niet meer mee voor kortere woorden ("ginger beer" vóór "gin");
--   - woorden die in meer dan één item voorkomen koppelen die allemaal ("cola" → beide colas: alternatieven);
--   - staan er twee items in één regel ("Eristoff of Absolut Vanilia") dan zijn dat alternatieven.
-- Regels waar niets bij past (bijv. "Bols Blue Curaçao" als dat item niet bestaat) krijgen geen koppeling en worden dus niet
-- bijgehouden; de beheerder kan ze later koppelen op de cocktail- en mocktailpagina.
--
-- Alleen toevoegen, nooit verwijderen: het is veilig om vaker te draaien (bestaande koppelingen blijven, nieuwe komen erbij).
-- Bij een nieuw project: draai dit na seed.sql. Controleer het resultaat met:
--   select r.name, l.sort_order, l.ingredient, string_agg(i.name, ' | ') as items
--   from public.recipe_lines l join public.recipes r on r.id = l.recipe_id
--   left join public.recipe_line_items li on li.line_id = l.id left join public.items i on i.id = li.item_id
--   group by r.name, r.kind, r.sort_order, l.sort_order, l.ingredient order by r.kind, r.sort_order, l.sort_order;
with recursive raw as (
  select lower(i.name) as term, i.id as item_id from public.items i
  union
  select lower(i.keyword), i.id from public.items i where i.keyword is not null and i.keyword <> ''
  union
  select lower(a), i.id from public.items i cross join unnest(i.aliases) as a where a <> ''
), terms as (
  select term, array_agg(distinct item_id) as ids from raw group by term
), ranked as (
  select term, ids, row_number() over (order by length(term) desc, term) as rn from terms
), n as (
  select max(rn) as maxrn from ranked
), lines as (
  select l.id as line_id, lower(l.ingredient) as txt from public.recipe_lines l
), walk as (
  select line_id, 0::bigint as rn, txt, '{}'::bigint[] as matched from lines
  union all
  select w.line_id, t.rn,
         case when strpos(w.txt, t.term) > 0 then replace(w.txt, t.term, ' ') else w.txt end,
         case when strpos(w.txt, t.term) > 0 then w.matched || t.ids else w.matched end
  from walk w join ranked t on t.rn = w.rn + 1
)
insert into public.recipe_line_items (line_id, item_id)
select distinct w.line_id, m
from walk w
cross join lateral unnest(w.matched) as m
where w.rn = (select maxrn from n)
on conflict do nothing;
