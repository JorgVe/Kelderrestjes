-- Een item verwijderen dat in recepten wordt gebruikt, samen met zijn koppelingen en de recepten die niet zonder kunnen.
--
-- Tot nu toe kon een item dat in een receptregel of bij de flessen van een recept zat niet worden verwijderd (on delete restrict).
-- remove_item(p_id, p_execute) maakt dat mogelijk, in één transactie:
--   - recepten (cocktails, mocktails en puur-serves) met een regel waarvan dit het enige gekoppelde item is, worden verwijderd,
--     met hun regels, koppelingen en flessen: zonder het item kan zo'n regel niet meer. Staat er een alternatief bij ("Havana Club
--     of Bacardí") dan blijft het recept bestaan, zonder dit item; de tekst van die regel pas je zelf aan in het recept;
--   - alle koppelingen van het item met receptregels (recipe_line_items) en flessen (recipe_bottles) verdwijnen;
--   - het item zelf wordt verwijderd (zijn wijngegevens gaan mee, on delete cascade).
-- Met p_execute = false (de standaard) verandert er niets: de functie geeft alleen terug wat er zou gebeuren, zodat het
-- bewerkvenster kan laten zien welke recepten verdwijnen voordat de beheerder bevestigt. Met true gebeurt het ook echt.
-- Geeft terug: { item, executed, recipes_removed: [{id, name, kind}], recipes_changed: [{id, name, kind}] }.
-- Draait met de rechten van wie hem aanroept (security invoker): de policies uit 0001 blijven gelden, en zonder beheerdersrechten
-- doet de functie niets. Dit is een schemawijziging (een functie); veilig om vaker te draaien.
create or replace function public.remove_item(p_id bigint, p_execute boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item_name text;
  gone_ids bigint[];
  gone jsonb;
  changed jsonb;
begin
  if not public.is_admin() then
    raise exception 'Alleen een beheerder mag items verwijderen.' using errcode = '42501';
  end if;

  select name into item_name from public.items where id = p_id;
  if item_name is null then
    raise exception 'Dit item bestaat niet (meer).' using errcode = 'P0002';
  end if;

  -- recepten met een regel waarvan dit het enige gekoppelde item is
  select coalesce(array_agg(distinct l.recipe_id), '{}')
    into gone_ids
  from public.recipe_line_items li
  join public.recipe_lines l on l.id = li.line_id
  where li.item_id = p_id
    and not exists (select 1 from public.recipe_line_items o where o.line_id = li.line_id and o.item_id <> p_id);

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'kind', r.kind) order by r.kind, r.sort_order), '[]'::jsonb)
    into gone
  from public.recipes r where r.id = any(gone_ids);

  -- recepten die blijven, maar zonder dit item (er is een alternatief)
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'kind', r.kind) order by r.kind, r.sort_order), '[]'::jsonb)
    into changed
  from public.recipes r
  where r.id <> all(gone_ids)
    and exists (
      select 1 from public.recipe_line_items li join public.recipe_lines l on l.id = li.line_id
      where l.recipe_id = r.id and li.item_id = p_id
    );

  if p_execute then
    delete from public.recipes where id = any(gone_ids);                  -- regels, koppelingen en flessen gaan mee
    delete from public.recipe_line_items where item_id = p_id;
    delete from public.recipe_bottles where item_id = p_id;
    delete from public.items where id = p_id;
  end if;

  return jsonb_build_object('item', item_name, 'executed', p_execute, 'recipes_removed', gone, 'recipes_changed', changed);
end
$$;

revoke all on function public.remove_item(bigint, boolean) from public, anon;
grant execute on function public.remove_item(bigint, boolean) to authenticated;
