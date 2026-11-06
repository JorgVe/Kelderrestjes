-- 0026: de database-kant van "Scan foto" (voorraadpagina), die tot nu toe alleen in Supabase stond en nu in de repository.
--
--   bottle-scans              privébucket voor de foto's (hoogstens 10 MB, alleen JPEG/PNG/WebP)
--   policies op storage       alleen beheerders mogen uploaden en lezen; niemand kan verwijderen of overschrijven
--   apply_bottle_scan_stock   past de voorraad van meerdere items in één transactie aan (aantal en "Op voorraad" horen samen)
--
-- De Edge Function die dit aanroept staat in supabase/functions/scan-bottles/index.ts.
-- Het script is herhaalbaar: op een database waar dit al staat verandert het niets (het is een weergave van wat er nu draait).

-- 1. de bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bottle-scans', 'bottle-scans', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. wie erbij mag
drop policy if exists "Bottle scan admins can read" on storage.objects;
create policy "Bottle scan admins can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bottle-scans' and public.is_admin());

drop policy if exists "Bottle scan admins can upload" on storage.objects;
create policy "Bottle scan admins can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bottle-scans' and public.is_admin());

-- 3. de voorraad bijwerken
-- p_updates: [{ item_id, count, wine_grape, wine_region, wine_alcohol, wine_note }, …]; p_mode: 'add' (erbij) of 'set' (vervangen).
-- Draait met de rechten van de aanroeper (geen security definer): is_admin() en RLS bepalen of het mag.
-- Bij wijn worden alleen lege velden (druif, regio, alcohol, notitie) aangevuld. Een fout draait het geheel terug.
create or replace function public.apply_bottle_scan_stock(p_updates jsonb, p_mode text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_update record;
  v_new_quantity integer;
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
      wine_note text
    )
  loop
    if v_update.item_id is null or v_update.count is null or v_update.count <= 0 then
      raise exception 'Each update requires an item_id and a positive count' using errcode = '22023';
    end if;

    update public.items as i
    set quantity = case
          when p_mode = 'add' then coalesce(i.quantity, 0) + v_update.count
          else v_update.count
        end,
        in_stock = case
          when p_mode = 'add' then coalesce(i.quantity, 0) + v_update.count > 0
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
