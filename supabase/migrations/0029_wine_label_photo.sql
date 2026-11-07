-- 0029: een foto van het etiket bij een wijn, te openen vanuit de wijnlijst.
--
--   wines.label_path    het pad van de foto in de bucket wine-labels (leeg = geen foto). Het pad is "<item-id>/<tijd in ms>-<code>.<jpg|png|webp>"
--                       en wordt bij elke nieuwe foto nieuw, zodat een vervangen foto niet uit het geheugen van een browser komt.
--   wine-labels         publieke bucket (hoogstens 5 MB, alleen JPEG/PNG/WebP): de wijnlijst is voor iedereen, dus de foto's ook.
--                       Bezoekers kunnen een foto openen als ze het adres kennen, maar niet de hele bucket doorzoeken. De foto's van
--                       Scan foto (bottle-scans) blijven privé: daar kan een hele schappenfoto tussen zitten.
--   policies op storage alleen beheerders mogen foto's toevoegen, lezen en verwijderen (verwijderen, om een vervangen of weggehaalde
--                       foto niet te laten liggen; bottle-scans kent dat niet).
--
-- Rol deze migratie uit vóór de site die label_path vraagt. Draait de site eerder, dan werkt ze gewoon door zonder etiketfoto's
-- (data-loader.js valt dan terug op de kolommen van vroeger en het veld "Foto van het etiket" blijft weg).
-- Het script is herhaalbaar: op een database waar dit al staat verandert het niets.

-- 1. de kolom, met een controle op de vorm van het pad (de site maakt er een adres van)
alter table public.wines add column if not exists label_path text;

alter table public.wines drop constraint if exists wines_label_path_format;
alter table public.wines add constraint wines_label_path_format
  check (label_path is null or label_path ~ '^[0-9]+/[0-9]+-[0-9a-z]+\.(jpg|png|webp)$');

comment on column public.wines.label_path is 'pad van de etiketfoto in de bucket wine-labels (zie 0029); leeg = geen foto';

-- 2. de bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wine-labels', 'wine-labels', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. wie erbij mag (lezen door bezoekers gaat via het publieke adres en heeft geen policy nodig)
drop policy if exists "Wine label admins can read" on storage.objects;
create policy "Wine label admins can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'wine-labels' and public.is_admin());

drop policy if exists "Wine label admins can upload" on storage.objects;
create policy "Wine label admins can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wine-labels' and public.is_admin());

drop policy if exists "Wine label admins can delete" on storage.objects;
create policy "Wine label admins can delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wine-labels' and public.is_admin());
