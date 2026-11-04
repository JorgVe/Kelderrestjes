-- Frisdrank, koffie en melk zijn altijd alcoholvrij. Dat hoeft nergens te staan: niet als "alcoholvrij" bij de
-- categorie en niet als 0%-markering bij een item. Een leeg alcohol_level betekent voortaan "geen alcohol, geen label".
-- (Bier 0.0 blijft 0% houden: die staat in een categorie mét alcoholgehalte.)
-- Eerst de items, want die worden herkend via het alcohol_level van hun categorie.
-- Veilig om vaker te draaien.
update public.items i
set zero_proof = false
from public.categories c
where c.id = i.category_id
  and c.alcohol_level = 'alcoholvrij'
  and i.zero_proof;

update public.categories
set alcohol_level = null
where alcohol_level = 'alcoholvrij';
