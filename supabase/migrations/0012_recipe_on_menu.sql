-- Niet elke cocktail of mocktail hoeft op het menu. De cocktail- en mocktailpagina tonen ze allemaal; het menu alleen die
-- met een vinkje: recipes.on_menu. Bestaande recepten blijven op het menu staan (standaard true); het vinkje zet de beheerder
-- per recept op de cocktail- en mocktailpagina.
-- Dit is een schemawijziging: draai hem op elke database, ook bij een nieuw project (na 0001, 0002 en 0009, voor de seed).
-- De bestaande write-policy voor admins op `recipes` dekt het schrijven van deze kolom al. Veilig om vaker te draaien.
alter table public.recipes add column if not exists on_menu boolean not null default true;

comment on column public.recipes.on_menu is 'true = staat ook op het menu; alle recepten staan altijd op de cocktail- of mocktailpagina';
