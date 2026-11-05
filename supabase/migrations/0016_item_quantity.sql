-- Aantal op voorraad per item: items.quantity.
--   null       onbekend (niet bijgehouden)
--   0          op
--   1 of meer  op voorraad
-- De voorraadpagina houdt het aantal en de schakelaar (items.in_stock) bij elkaar: de schakelaar op "op" zet het aantal op 0,
-- en een aantal van 0 zet de schakelaar op "op" (1 of meer: op voorraad). Die koppeling zit in de site, niet in de database;
-- voor de database blijft dit een gewone kolom.
-- Dit is een schemawijziging: draai hem op elke database VOORDAT de nieuwe site wordt uitgerold, want de site haalt de kolom
-- op (zonder de kolom geeft elke pagina een foutmelding). Veilig om vaker te draaien.
-- items.to_confirm wordt door de site niet meer gebruikt of getoond; de kolom blijft staan (wijnen.to_confirm werkt nog wel).
alter table public.items
  add column if not exists quantity integer check (quantity is null or quantity >= 0);

comment on column public.items.quantity is
  'aantal op voorraad: null = onbekend, 0 = op (in_stock = false), 1 of meer = op voorraad';

-- wat nu op is, krijgt aantal 0, zodat het klopt met de schakelaar; wat op voorraad is blijft onbekend (leeg)
update public.items set quantity = 0 where in_stock = false and quantity is null;
