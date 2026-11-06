-- 0027: per regel kiezen tussen "erbij tellen" en "vervangen" bij Scan foto.
--
-- apply_bottle_scan_stock(p_updates, p_mode) kreeg één stand voor de hele scan. Nu mag elke regel in p_updates een eigen "mode"
-- hebben ('add' = het aantal komt bij de voorraad, 'set' = het wordt het aantal); zonder "mode" geldt p_mode, zoals voorheen.
-- Dezelfde naam en parameters, dus bestaande aanroepen (de eerdere Edge Function scan-bottles) werken ongewijzigd door.
-- Let op: een database zonder deze migratie negeert "mode" in een regel en gebruikt p_mode voor alles. Rol dit dus uit
-- voordat de site wordt uitgerold die per regel kiest.
-- Verder niets veranderd: alles of niets in één transactie, alleen voor beheerders, bij wijn alleen lege velden aanvullen.

create or replace function public.apply_bottle_scan_stock(p_updates jsonb, p_mode text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_update record;
  v_new_quantity integer;
  v_mode text;
  v_result jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_mode not in ('add', 'set') then
    raise exception 'p_mode must be add or set' using errcode = '22023';
  end if;

  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'p_updates must be a JSON array' using errcode = '22023';
  end if;

  for v_update in
    select *
    from jsonb_to_recordset(p_updates) as x(
      item_id bigint,
      count integer,
      wine_grape text,
      wine_region text,
      wine_alcohol text,
      wine_note text,
      mode text
    )
  loop
    if v_update.item_id is null or v_update.count is null or v_update.count <= 0 then
      raise exception 'Each update requires an item_id and a positive count' using errcode = '22023';
    end if;

    v_mode := coalesce(nullif(v_update.mode, ''), p_mode);
    if v_mode not in ('add', 'set') then
      raise exception 'mode must be add or set' using errcode = '22023';
    end if;

    update public.items as i
    set quantity = case
          when v_mode = 'add' then coalesce(i.quantity, 0) + v_update.count
          else v_update.count
        end,
        in_stock = case
          when v_mode = 'add' then coalesce(i.quantity, 0) + v_update.count > 0
          else v_update.count > 0
        end,
        updated_at = now()
    where i.id = v_update.item_id
    returning i.quantity into v_new_quantity;

    if not found then
      raise exception 'Item % not found or not writable', v_update.item_id using errcode = '42501';
    end if;

    update public.wines as w
    set grape = coalesce(nullif(w.grape, ''), nullif(v_update.wine_grape, '')),
        region = coalesce(nullif(w.region, ''), nullif(v_update.wine_region, '')),
        alcohol = coalesce(nullif(w.alcohol, ''), nullif(v_update.wine_alcohol, '')),
        note = coalesce(nullif(w.note, ''), nullif(v_update.wine_note, ''))
    where w.item_id = v_update.item_id
      and (
        (nullif(w.grape, '') is null and nullif(v_update.wine_grape, '') is not null)
        or (nullif(w.region, '') is null and nullif(v_update.wine_region, '') is not null)
        or (nullif(w.alcohol, '') is null and nullif(v_update.wine_alcohol, '') is not null)
        or (nullif(w.note, '') is null and nullif(v_update.wine_note, '') is not null)
      );

    v_result := v_result || jsonb_build_array(
      jsonb_build_object('item_id', v_update.item_id, 'quantity', v_new_quantity)
    );
  end loop;

  return v_result;
end;
$function$;

revoke all on function public.apply_bottle_scan_stock(jsonb, text) from public, anon;
grant execute on function public.apply_bottle_scan_stock(jsonb, text) to authenticated;
