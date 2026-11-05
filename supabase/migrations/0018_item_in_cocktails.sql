-- Een drank of ingrediënt kan worden uitgeschakeld voor cocktails en mocktails: items.in_cocktails.
--   true   (standaard)  het item mag in cocktails en mocktails
--   false               het item wordt niet voor cocktails en mocktails gebruikt: een recept waarvan een regel alleen nog uit zulke
--                       items kan bestaan, vervalt (net als bij iets dat op is) van het menu en de cocktail- en mocktailpagina,
--                       en bij de drank staan geen cocktails meer. De drank zelf blijft gewoon op het menu en in de voorraad,
--                       en zijn "puur"-serveerwijze (recipes.kind = 'solo') blijft staan.
-- Dit is een schemawijziging: draai hem op elke database VOORDAT de nieuwe site wordt uitgerold, want de site haalt de kolom op
-- (zonder de kolom geeft elke pagina een foutmelding). Veilig om vaker te draaien.
alter table public.items add column if not exists in_cocktails boolean not null default true;

comment on column public.items.in_cocktails is
  'true = mag in cocktails en mocktails; false = wordt daarvoor niet gebruikt (recepten die er niet zonder kunnen vervallen, de drank zelf blijft)';
