-- Instellingen van de site en tellingen voor het beheerscherm (admin.html).
--
-- settings: sleutel en waarde (json). Iedereen mag ze lezen (ze bepalen wat bezoekers zien), alleen een beheerder mag ze wijzigen.
-- De site werkt ook zonder deze tabel of zonder een rij: dan gelden de standaardwaarden in js/data-loader.js (SETTING_DEFAULTS).
--   hide_unavailable_recipes  true   cocktails en mocktails waarvan een ingrediënt op is, verdwijnen
--   show_out_of_stock         false  bezoekers zien ook wat op is (doorgestreept)
--   show_register_button      true   de knop "Registreer als beheerder" voor bezoekers
--   menu_show_cocktails       true   de cocktails op het menu
--   menu_show_mocktails       true   de mocktails op het menu
--   notice_enabled            false  een mededeling bovenaan elke pagina
--   notice_text               ""     de tekst van die mededeling
--
-- admin_stats(): de grootte van de database en het aantal rijen per tabel, voor het blok Monitoring op admin.html. Alleen voor een
-- beheerder (security invoker: de rechten van wie hem aanroept, en de functie weigert wie geen beheerder is).
--
-- Dit is een schemawijziging; veilig om vaker te draaien (bestaande instellingen blijven staan).

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.settings is 'instellingen van de site (zie admin.html); sleutel en waarde (json)';

alter table public.settings enable row level security;

drop policy if exists "iedereen mag lezen" on public.settings;
create policy "iedereen mag lezen" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "admins mogen toevoegen" on public.settings;
create policy "admins mogen toevoegen" on public.settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins mogen wijzigen" on public.settings;
create policy "admins mogen wijzigen" on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins mogen verwijderen" on public.settings;
create policy "admins mogen verwijderen" on public.settings
  for delete to authenticated using (public.is_admin());

grant select on public.settings to anon, authenticated;
grant insert, update, delete on public.settings to authenticated;

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (key, value) values
  ('hide_unavailable_recipes', 'true'::jsonb),
  ('show_out_of_stock',        'false'::jsonb),
  ('show_register_button',     'true'::jsonb),
  ('menu_show_cocktails',      'true'::jsonb),
  ('menu_show_mocktails',      'true'::jsonb),
  ('notice_enabled',           'false'::jsonb),
  ('notice_text',              '""'::jsonb)
on conflict (key) do nothing;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Alleen voor een beheerder.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'postgres_version', current_setting('server_version'),
    'server_time', now(),
    'last_item_update', (select max(updated_at) from public.items),
    'rows', jsonb_build_object(
      'categories',        (select count(*) from public.categories),
      'items',             (select count(*) from public.items),
      'recipes',           (select count(*) from public.recipes),
      'recipe_lines',      (select count(*) from public.recipe_lines),
      'recipe_line_items', (select count(*) from public.recipe_line_items),
      'wines',             (select count(*) from public.wines),
      'settings',          (select count(*) from public.settings)
    )
  );
end
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
