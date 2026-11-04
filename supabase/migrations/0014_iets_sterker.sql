-- Alle sterke drank staat in één categorie: "Iets Sterker". Dat is de oude categorie "Digestives" (nu hernoemd), met daarin
-- ook alles uit Likeuren, Vodka, gin & jenever, Rum, Whisky en Aperitieven & port. Wat op het menu stond blijft op het menu,
-- wat alleen ingrediënt was blijft ingrediënt (items.serving verandert niet); alleen de categorie en de volgorde veranderen.
-- Onder "Iets Sterker" staat eerst wat er al stond, daarna de verhuisde dranken in de oude volgorde van de categorieën.
-- De oude categorieën zijn daarna leeg en worden hier niet verwijderd. Wil je ze ook echt kwijt, dan kan dat met:
--   delete from public.categories where label in ('Aperitieven & port', 'Likeuren', 'Vodka, gin & jenever', 'Rum', 'Whisky');
-- (dat lukt alleen als er niets meer in zit). Veilig om vaker te draaien.
update public.categories
set label = 'Iets Sterker', sort_order = 5
where label = 'Digestives'
  and not exists (select 1 from public.categories where label = 'Iets Sterker');

with t as (
  select id from public.categories where label = 'Iets Sterker'
),
moved as (
  select i.id, row_number() over (order by c.sort_order, i.sort_order, i.id) as rn
  from public.items i
  join public.categories c on c.id = i.category_id
  where c.label in ('Aperitieven & port', 'Likeuren', 'Vodka, gin & jenever', 'Rum', 'Whisky')
),
base as (
  select coalesce(max(i.sort_order), 0) as m
  from public.items i
  where i.category_id = (select id from t)
)
update public.items i
set category_id = (select id from t),
    sort_order = (select m from base) + moved.rn
from moved
where i.id = moved.id
  and exists (select 1 from t);
