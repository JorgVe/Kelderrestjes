-- Het veld "alcoholgehalte" (categories.alcohol_level, de tekst achter een categorienaam) is weg: de site toont het niet meer.
-- Het deed nog één ding: aan het ontbreken ervan zag de site dat frisdrank, koffie en melk altijd alcoholvrij zijn en dus geen
-- 0%-markering krijgen. Dat staat nu in een gewone ja/nee-kolom, categories.alcoholic:
--   true   drank met alcohol (bier, wijn, likeuren, sterke drank): daar kan een item 0% zijn (bier 0.0)
--   false  altijd alcoholvrij (frisdrank, koffie, melk) of geen drank (de ingrediëntencategorie): nooit 0%
-- Dit is een schemawijziging: draai hem op elke database, ook bij een nieuw project (na 0001, 0002 en 0009, voor de seed).
-- Veilig om vaker te draaien.
alter table public.categories add column if not exists alcoholic boolean not null default true;

update public.categories
set alcoholic = (alcohol_level is not null and kind <> 'ingredient')
where exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'categories' and column_name = 'alcohol_level');

comment on column public.categories.alcoholic is 'true = drank met alcohol (0% mogelijk); false = altijd alcoholvrij of geen drank (nooit 0%)';

-- De oude kolom wordt door niets meer gelezen. Wil je hem ook echt kwijt (de waarden gaan daarmee verloren), dan kan dat met:
--   alter table public.categories drop column alcohol_level;
