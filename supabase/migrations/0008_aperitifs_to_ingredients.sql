-- De categorie "Aperitieven & port" is van het menu. De dranken blijven bestaan, als ingrediënt: ze verhuizen naar de
-- ingrediëntencategorie ("Voorraad"), staan niet meer als drank op het menu, en recepten en voorraad blijven werken.
-- Aperini, Epacho, Funky Spritz, Lillet Blanc, Lillet Rosé, Martini Floreale, Patricio White Port, Rozès LBV Port.
-- De (nu lege) categorie zelf wordt hier niet verwijderd: ze verdwijnt vanzelf uit menu en lijsten omdat er niets in zit.
-- Wil je de rij ook echt kwijt, dan kan dat met:  delete from public.categories where label = 'Aperitieven & port';
-- Veilig om vaker te draaien.
with target as (
  select c.id,
         coalesce((select max(i.sort_order) from public.items i
                   where i.category_id = c.id
                     and i.name not in ('Aperini', 'Epacho', 'Funky Spritz', 'Lillet Blanc', 'Lillet Rosé',
                                        'Martini Floreale', 'Patricio White Port', 'Rozès LBV Port')), 0) as base
  from public.categories c
  where c.kind = 'ingredient'
  limit 1
)
update public.items i
set category_id = t.id, serving = 'ingredient', sort_order = t.base + d.ord
from target t,
     (values ('Aperini', 1), ('Epacho', 2), ('Funky Spritz', 3), ('Lillet Blanc', 4), ('Lillet Rosé', 5),
             ('Martini Floreale', 6), ('Patricio White Port', 7), ('Rozès LBV Port', 8)) as d(name, ord)
where i.name = d.name;
