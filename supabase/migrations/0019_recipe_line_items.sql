-- Receptregels koppelen aan items.
--
-- Tot nu toe herkende de site een item in een receptregel aan de tekst ("citroensap" → Citroen, "cola" → beide colas). Dat is
-- gokwerk: een andere schrijfwijze, een hernoemd item of een nieuw woord, en de koppeling klopt niet meer. Nu heeft elke
-- receptregel een echte koppeling met één of meer items (recipe_line_items). Meerdere items bij één regel zijn alternatieven
-- ("Havana Club of Bacardí"): het recept kan zolang er één van is. Een regel zonder koppeling (bijv. ijs) wordt niet bijgehouden.
-- De tekst van de regel (recipe_lines.ingredient) blijft staan: dat is wat er op de kaart staat.
--
-- Een item dat in een receptregel is gekoppeld kan niet worden verwijderd (on delete restrict), net als bij recipe_bottles.
-- Een regel verwijderen (of het hele recept) haalt zijn koppelingen mee weg (on delete cascade).
--
-- 0020 vult de koppelingen voor de bestaande recepten. Daarna kan de beheerder op de cocktail- en mocktailpagina recepten
-- toevoegen en wijzigen; dat gaat via de functie save_recipe hieronder, die het recept, zijn regels, de koppelingen en de
-- flessen (recipe_bottles) in één keer en in één transactie opslaat. Zonder beheerdersrechten doet de functie niets.
--
-- Dit is een schemawijziging: draai hem op elke database VOORDAT de nieuwe site wordt uitgerold, want de site haalt de tabel op
-- (zonder de tabel geeft elke pagina een foutmelding). Veilig om vaker te draaien.

create table if not exists public.recipe_line_items (
  line_id bigint not null references public.recipe_lines (id) on delete cascade,
  item_id bigint not null references public.items (id) on delete restrict,
  primary key (line_id, item_id)
);
create index if not exists recipe_line_items_item_id_idx on public.recipe_line_items (item_id);

comment on table public.recipe_line_items is
  'welke items een receptregel dekken; meer dan één = alternatieven (A of B); geen = een regel die niet wordt bijgehouden';

-- rechten, zoals bij de andere tabellen (zie 0001): lezen mag iedereen, schrijven alleen een beheerder
alter table public.recipe_line_items enable row level security;

drop policy if exists "iedereen mag lezen" on public.recipe_line_items;
create policy "iedereen mag lezen" on public.recipe_line_items
  for select to anon, authenticated using (true);

drop policy if exists "admins mogen toevoegen" on public.recipe_line_items;
create policy "admins mogen toevoegen" on public.recipe_line_items
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins mogen wijzigen" on public.recipe_line_items;
create policy "admins mogen wijzigen" on public.recipe_line_items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins mogen verwijderen" on public.recipe_line_items;
create policy "admins mogen verwijderen" on public.recipe_line_items
  for delete to authenticated using (public.is_admin());

grant select on public.recipe_line_items to anon, authenticated;
grant insert, update, delete on public.recipe_line_items to authenticated;

-- ---------------------------------------------------------------- recept opslaan
-- p = { id?, kind, name, style, blurb?, method?, url?, on_menu?, sort_order?,
--       lines: [ { amount, ingredient, on_bar, items: [item_id, …] }, … ] }
-- Zonder id wordt een nieuw recept toegevoegd (onderaan zijn soort), anders wordt dat recept bijgewerkt en worden zijn regels
-- vervangen door de regels uit p. Geeft het id van het recept terug. De flessen van het recept (recipe_bottles) zijn de gekoppelde
-- items uit een categorie van soort 'bottle', in de volgorde van de regels.
-- Draait met de rechten van wie hem aanroept (security invoker): de policies hierboven en in 0001 blijven dus gelden.
create or replace function public.save_recipe(p jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
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
    delete from public.recipe_lines where recipe_id = rid;          -- de koppelingen gaan mee (on delete cascade)
  end if;

  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    pos := pos + 1;
    insert into public.recipe_lines (recipe_id, sort_order, amount, ingredient, on_bar)
    values (rid, pos, coalesce(ln->>'amount', ''), btrim(ln->>'ingredient'), coalesce((ln->>'on_bar')::boolean, false))
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
$$;

revoke all on function public.save_recipe(jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb) to authenticated;
