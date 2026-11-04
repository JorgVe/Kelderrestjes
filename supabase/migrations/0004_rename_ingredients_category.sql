-- De pagina "Ingrediënten" heet nu "Voorraad". De categorie met de ingrediënten die niet op het menu staan
-- (kind = 'ingredient') heet daarom ook "Voorraad" (eerder "Ingrediënten", tijdelijk "Stock").
-- Veilig om vaker te draaien: bij een nieuw project (seed.sql gebruikt al "Voorraad") verandert er niets.
-- Items verwijzen via category_id naar de categorie, dus de items zelf blijven ongemoeid.
update public.categories
set label = 'Voorraad'
where kind = 'ingredient'
  and label in ('Ingrediënten', 'Stock');
