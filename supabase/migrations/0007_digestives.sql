-- Nieuwe menucategorie "Digestives": sterke drank en likeur die je puur drinkt, na het eten.
--   likeuren     Amaretto, Licor 43, Pomocello
--   vruchtenwodka Soplica (Pigwowa, wordt puur geserveerd)
--   jenever      Filliers (oude graanjenever)
--   whisky       Gouden Carolus, J&B Rare, Johnnie Walker Black, White Walker
-- De rest van de sterke drank is om te mixen en staat niet meer als drank op het menu, maar blijft als ingrediënt
-- (voorraad en cocktails blijven werken): Blue Curaçao, Cointreau, Crème de Cassis, Absolut Vanilia, Eristoff,
-- Bleu d'Argent (gin), Bacardí, Bacardí Spiced, Havana Club, Kraken, UTC4.
-- De categorie "Whisky" blijft bestaan, maar is nu leeg (alle whisky is een digestief). Veilig om vaker te draaien.
-- Pas dit aan op de voorraadpagina (categorie en soort per item) als je het anders wilt.

insert into public.categories (label, kind, alcohol_level, sort_order)
values ('Digestives', 'bottle', 'middel tot sterk', 10)
on conflict (label) do nothing;

-- de ingrediëntencategorie ("Voorraad") schuift een plek op, zodat de volgorde eenduidig blijft
update public.categories set sort_order = 11 where kind = 'ingredient' and sort_order = 10;

update public.items i
set category_id = c.id, sort_order = d.ord
from (values ('Amaretto', 1), ('Licor 43', 2), ('Pomocello', 3), ('Soplica', 4), ('Filliers', 5),
             ('Gouden Carolus', 6), ('J&B Rare', 7), ('Johnnie Walker Black', 8), ('White Walker', 9)) as d(name, ord),
     public.categories c
where c.label = 'Digestives' and i.name = d.name;

update public.items
set serving = 'ingredient'
where name in ('Blue Curaçao', 'Cointreau', 'Crème de Cassis', 'Absolut Vanilia', 'Eristoff', 'Bleu D''Argent',
               'Bacardí', 'Bacardí Spiced', 'Havana Club', 'Kraken', 'UTC4')
  and serving <> 'ingredient';
