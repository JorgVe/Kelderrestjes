-- Een fles scannen met de telefoon (voorraadpagina): de barcode staat bij het item.
-- De eerste keer koppel je een gescande barcode aan een drank; daarna opent een scan die drank meteen.
-- Een barcode hoort bij hooguit één item; leeg mag vaak voorkomen.
-- Dit is een schemawijziging: draai hem op elke database, ook bij een nieuw project (na 0001 en 0002), want de site
-- haalt de kolom op. De seed vult hem niet. Veilig om vaker te draaien.
alter table public.items add column if not exists barcode text;

create unique index if not exists items_barcode_key on public.items (barcode) where barcode is not null;

comment on column public.items.barcode is 'barcode (EAN/UPC) van de fles, om te scannen op de voorraadpagina; uniek, mag leeg';
