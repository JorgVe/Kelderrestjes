-- 0031: een soort drank (Gin, Rum, Tonic, ...) los van de merkfles, zodat een recept niet aan één fles hangt.
--
-- Tot nu toe was elke receptregel gekoppeld aan één of meer vaste items ("Havana Club of Bacardí"). Was dat ene item op of werd het verwijderd,
-- dan kon het recept niet meer, ook al stond er nog een andere fles van dezelfde soort in huis. Nu kan een item een soort hebben en een
-- receptregel om een soort vragen: elk item van die soort telt dan. Net als bij wijn (de kleur staat als kolom bij de wijn, er is geen aparte
-- tabel van kleuren) is een soort een eigenschap, geen eigen record: er is geen tabel van soorten.
--
--   items.drink_sort          de soort drank van dit item (bijv. "Gin", "Rum", "Tonic"), of leeg. Alleen een label; vergelijken gaat zonder
--                             hoofdletters en spaties aan de randen. Een item zonder soort werkt zoals altijd, alleen als zichzelf.
--   recipe_lines.drink_sort   de regel vraagt om een soort: elk item met die soort telt, naast de items die er direct aan gekoppeld zijn
--                             (recipe_line_items blijft bestaan voor merken die je er bewust bij wilt, of als alternatief).
--
-- save_recipe slaat de soort van een regel nu ook op (regel.drink_sort in de JSON; zonder die sleutel verandert er niets aan het gedrag).
-- remove_item kijkt ook naar soorten: een recept met een regel die om een soort vraagt, blijft bestaan als er na het verwijderen nog een
-- ander item van die soort is. Het plan dat de functie teruggeeft heeft dezelfde vorm als voorheen.
--
-- Dit is een schemawijziging (twee kolommen en twee functies); veilig om vaker te draaien. De soorten zelf vul je in op de site
-- (bewerkvenster van een item en van een recept); er wordt hier niets ingevuld.

alter table public.items add column if not exists drink_sort text;
alter table public.items drop constraint if exists items_drink_sort_check;
alter table public.items add constraint items_drink_sort_check check (drink_sort is null or char_length(btrim(drink_sort)) between 1 and 40);
comment on column public.items.drink_sort is 'soort drank (Gin, Rum, Tonic, ...): elk item van dezelfde soort telt voor een receptregel die om die soort vraagt (zie 0031); leeg = geen soort';
create index if not exists items_drink_sort_idx on public.items (lower(btrim(drink_sort))) where drink_sort is not null;

alter table public.recipe_lines add column if not exists drink_sort text;
alter table public.recipe_lines drop constraint if exists recipe_lines_drink_sort_check;
alter table public.recipe_lines add constraint recipe_lines_drink_sort_check check (drink_sort is null or char_length(btrim(drink_sort)) between 1 and 40);
comment on column public.recipe_lines.drink_sort is 'de regel vraagt om een soort drank: elk item met die soort telt, naast de direct gekoppelde items (zie 0031); leeg = alleen de gekoppelde items';

-- save_recipe: zoals in 0019, plus de soort van een regel
create or replace function public.save_recipe(p jsonb)
returns bigint
language plpgsql
set search_path = ''
as $function$
declare
  rid bigint;
  ln jsonb;
  lid bigint;
  pos integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Alleen een beheerder mag recepten opslaan.' using errcode = '42501';
  end if;
  if nullif(btrim(p->>'name'), '') is null then
    raise exception 'Een recept heeft een naam nodig.' using errcode = '22023';
  end if;

  if nullif(p->>'id', '') is null then
    insert into public.recipes (kind, name, style, blurb, method, url, on_menu, sort_order)
    values (
      p->>'kind',
      btrim(p->>'name'),
      btrim(p->>'style'),
      nullif(btrim(coalesce(p->>'blurb', '')), ''),
      nullif(btrim(coalesce(p->>'method', '')), ''),
      nullif(btrim(coalesce(p->>'url', '')), ''),
      coalesce((p->>'on_menu')::boolean, true),
      coalesce(nullif(p->>'sort_order', '')::integer,
               (select coalesce(max(r.sort_order), 0) + 1 from public.recipes r where r.kind = p->>'kind'))
    )
    returning id into rid;
  else
    rid := (p->>'id')::bigint;
    update public.recipes
    set name = btrim(p->>'name'),
        style = btrim(p->>'style'),
        blurb = nullif(btrim(coalesce(p->>'blurb', '')), ''),
        method = nullif(btrim(coalesce(p->>'method', '')), ''),
        url = nullif(btrim(coalesce(p->>'url', '')), ''),
        on_menu = coalesce((p->>'on_menu')::boolean, on_menu),
        sort_order = coalesce(nullif(p->>'sort_order', '')::integer, sort_order)
    where id = rid;
    if not found then
      raise exception 'Dit recept bestaat niet (meer).' using errcode = 'P0002';
    end if;
    delete from public.recipe_lines where recipe_id = rid;
  end if;

  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    pos := pos + 1;
    insert into public.recipe_lines (recipe_id, sort_order, amount, ingredient, on_bar, drink_sort)
    values (rid, pos, coalesce(ln->>'amount', ''), btrim(ln->>'ingredient'), coalesce((ln->>'on_bar')::boolean, false),
            nullif(btrim(coalesce(ln->>'drink_sort', '')), ''))
    returning id into lid;

    insert into public.recipe_line_items (line_id, item_id)
    select lid, x::bigint from jsonb_array_elements_text(coalesce(ln->'items', '[]'::jsonb)) as x
    on conflict do nothing;
  end loop;

  delete from public.recipe_bottles where recipe_id = rid;
  insert into public.recipe_bottles (recipe_id, item_id, sort_order)
  select rid, q.item_id, (row_number() over (order by q.first_line, q.item_id))::smallint
  from (
    select li.item_id, min(l.sort_order) as first_line
    from public.recipe_lines l
    join public.recipe_line_items li on li.line_id = l.id
    join public.items i on i.id = li.item_id
    join public.categories c on c.id = i.category_id
    where l.recipe_id = rid and c.kind = 'bottle'
    group by li.item_id
  ) q;

  return rid;
end
$function$;

-- remove_item: zoals in 0025, maar een regel die om een soort vraagt overleeft het verwijderen zolang er een ander item van die soort is
create or replace function public.remove_item(p_id bigint, p_execute boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item_name text;
  item_sort text;
  gone_ids bigint[];
  gone jsonb;
  changed jsonb;
begin
  if not public.is_admin() then
    raise exception 'Alleen een beheerder mag items verwijderen.' using errcode = '42501';
  end if;

  select name, lower(btrim(drink_sort)) into item_name, item_sort from public.items where id = p_id;
  if item_name is null then
    raise exception 'Dit item bestaat niet (meer).' using errcode = 'P0002';
  end if;

  -- recepten met een regel die zonder dit item geen enkele optie meer heeft: geen ander gekoppeld item, en geen ander item van de soort die de regel vraagt
  select coalesce(array_agg(distinct l.recipe_id), '{}')
    into gone_ids
  from public.recipe_lines l
  where (
      exists (select 1 from public.recipe_line_items li where li.line_id = l.id and li.item_id = p_id)
      or (item_sort is not null and lower(btrim(l.drink_sort)) = item_sort)
    )
    and not exists (select 1 from public.recipe_line_items o where o.line_id = l.id and o.item_id <> p_id)
    and not (
      l.drink_sort is not null
      and exists (select 1 from public.items i where i.id <> p_id and lower(btrim(i.drink_sort)) = lower(btrim(l.drink_sort)))
    );

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'kind', r.kind) order by r.kind, r.sort_order), '[]'::jsonb)
    into gone
  from public.recipes r where r.id = any(gone_ids);

  -- recepten die blijven, maar zonder dit item (er is een alternatief, of een ander item van dezelfde soort)
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
