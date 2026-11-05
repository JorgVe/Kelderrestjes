-- Alcoholpercentage bij bier en sterkere drank (niet bij wijn en frisdrank).
--   items.abv                  het percentage, bijv. 8.5 (een getal met hoogstens één decimaal, 0 t/m 100); leeg = onbekend
--   categories.show_alcohol    true = bij items in deze categorie hoort een alcoholpercentage: het veld verschijnt in het bewerkvenster
--                              en het percentage staat bij de drank op het menu en op Voorraad
-- Bier en Iets Sterker krijgen show_alcohol = true; wijn niet. De bestaande percentages (items.abv) zijn leeg: vul ze in via het
-- bewerkvenster. De kolom wines.alcohol wordt niet meer gebruikt of getoond.
-- Dit is een schemawijziging: draai hem op elke database VOORDAT de nieuwe site wordt uitgerold, want de site haalt de kolommen op
-- (zonder die kolommen geeft elke pagina een foutmelding). Veilig om vaker te draaien.
alter table public.items
  add column if not exists abv numeric(4,1) check (abv is null or (abv >= 0 and abv <= 100));
comment on column public.items.abv is 'alcoholpercentage (bijv. 8.5); alleen bij categorieën met show_alcohol; leeg = onbekend';

alter table public.categories
  add column if not exists show_alcohol boolean not null default false;
comment on column public.categories.show_alcohol is 'true = bij items in deze categorie hoort een alcoholpercentage (bier en sterkere drank); false = niet (wijn, frisdrank, ...)';

update public.categories set show_alcohol = true where label in ('Bier', 'Iets Sterker') and show_alcohol = false;
