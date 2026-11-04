-- Melk staat niet meer als drank op het menu, alleen nog als ingrediënt (voorraad en recepten blijven werken).
-- Deca koffie is nieuw, bij de koffie. Veilig om vaker te draaien.
update public.items
set serving = 'ingredient'
where name = 'Melk'
  and serving <> 'ingredient';

insert into public.items (category_id, name, serving, sort_order)
select c.id, 'Deca koffie', 'drink',
       coalesce((select max(i.sort_order) from public.items i where i.category_id = c.id), 0) + 1
from public.categories c
where c.label = 'Koffie & melk'
on conflict (name) do nothing;
