-- 0030: een gast zet een nieuw verzonnen recept op het menu, en iedereen kan een beoordeling achterlaten.
--
-- Bezoekers schrijven nooit zelf in de tabellen: de Edge Function cocktail-ai doet het voor hen (met de service role), na eigen controles
-- en binnen een limiet. Daarom geeft deze migratie bezoekers GEEN schrijfrechten, alleen leesrechten waar dat moet.
--
--   recipes.source        waar een recept vandaan komt: leeg = door de beheerder, 'guest' = door een gast op het menu gezet
--   add_guest_recipe      zet een recept met zijn regels en koppelingen in één transactie in de database, op het menu (on_menu = true).
--                         Alleen de service role mag haar aanroepen; de Edge Function controleert eerst het (ondertekende) concept.
--   reviews               beoordelingen: 1 t/m 5 sterren, een korte tekst en een naam (allebei optioneel). Iedereen mag lezen, behalve
--                         de kolom `visitor` (een versleutelde vingerafdruk van het IP-adres, voor de limiet; nooit het adres zelf).
--                         Alleen beheerders mogen een beoordeling verwijderen; toevoegen kan alleen via de Edge Function.
--   recipe_ratings        gemiddelde en aantal per recept, voor de kaarten
--   write_log, claim_write  de limiet op toevoegen en beoordelen, zoals claim_suggestion (0028) dat voor "Help me kiezen" doet
--   review_exists, add_review  een beoordeling controleren en bewaren. De service role heeft in dit project geen rechten op tabellen
--                         (alleen op functies), dus de Edge Function leest en schrijft de beoordelingen via deze twee functies.
--
-- Instellingen (admin.html): guest_add_enabled (een gast mag een nieuw recept op het menu zetten) en reviews_enabled (beoordelingen);
-- allebei aan. Zet je er een uit, dan verdwijnt de knop of het formulier voor bezoekers.
--
-- Dit is een schemawijziging; veilig om vaker te draaien. Rol haar uit vóór de nieuwe versie van cocktail-ai en de site.

-- 1. herkomst van een recept
alter table public.recipes add column if not exists source text;
alter table public.recipes drop constraint if exists recipes_source_check;
alter table public.recipes add constraint recipes_source_check check (source is null or source = 'guest');
comment on column public.recipes.source is 'leeg = door de beheerder; guest = door een gast op het menu gezet (zie 0030)';

-- 2. beoordelingen
create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  recipe_id   bigint not null references public.recipes (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  name        text check (name is null or char_length(name) between 1 and 40),
  body        text check (body is null or char_length(body) between 1 and 500),
  created_at  timestamptz not null default now(),
  visitor     text not null
);
comment on table public.reviews is 'beoordelingen van cocktails en mocktails (zie 0030); schrijven gaat via de Edge Function cocktail-ai';
comment on column public.reviews.visitor is 'versleutelde vingerafdruk van het IP-adres (nooit het adres zelf), voor de limiet; niet leesbaar voor bezoekers';
create index if not exists reviews_recipe_idx on public.reviews (recipe_id, created_at desc);
create index if not exists reviews_visitor_idx on public.reviews (visitor, created_at);

alter table public.reviews enable row level security;
drop policy if exists "iedereen mag lezen" on public.reviews;
create policy "iedereen mag lezen" on public.reviews for select to anon, authenticated using (true);
drop policy if exists "admins mogen verwijderen" on public.reviews;
create policy "admins mogen verwijderen" on public.reviews for delete to authenticated using (public.is_admin());

-- rechten per kolom: bezoekers lezen alles behalve `visitor`; verwijderen mag alleen een ingelogde gebruiker (en dan nog alleen een beheerder, zie de policy)
revoke all on public.reviews from public, anon, authenticated;
grant select (id, recipe_id, rating, name, body, created_at) on public.reviews to anon, authenticated;
grant delete on public.reviews to authenticated;

-- gemiddelde en aantal per recept (draait met de rechten van de lezer: alleen de kolommen hierboven zijn nodig)
create or replace view public.recipe_ratings with (security_invoker = true) as
  select recipe_id, count(*)::integer as n, round(avg(rating)::numeric, 1) as avg
  from public.reviews
  group by recipe_id;
grant select on public.recipe_ratings to anon, authenticated;

-- 3. de limiet op schrijven (toevoegen en beoordelen)
create table if not exists public.write_log (
  id       bigint generated always as identity primary key,
  kind     text not null,
  visitor  text not null,
  logged_at timestamptz not null default now()
);
comment on table public.write_log is 'acties van bezoekers die iets schrijven (kind: add of review): vingerafdruk en tijdstip, voor de limiet; alleen de service role';
create index if not exists write_log_visitor_idx on public.write_log (kind, visitor, logged_at);
create index if not exists write_log_logged_idx on public.write_log (logged_at);
alter table public.write_log enable row level security;                -- geen policies: anon en authenticated komen er niet bij
revoke all on public.write_log from public, anon, authenticated;

-- telt een actie mee en zegt of ze mag: 'ok', 'visitor_limit' (deze bezoeker zat al aan zijn maximum in het afgelopen uur) of
-- 'day_limit' (de hele site zat al aan het maximum in de afgelopen 24 uur). De maxima geeft de functie mee.
create or replace function public.claim_write(p_kind text, p_visitor text, p_visitor_cap integer, p_day_cap integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day integer;
  v_visitor integer;
begin
  if coalesce(p_kind, '') = '' or coalesce(p_visitor, '') = '' or p_visitor_cap < 1 or p_day_cap < 1 then
    raise exception 'Ongeldige aanvraag.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('claim_write'));              -- één actie tegelijk tellen

  delete from public.write_log where logged_at < now() - interval '2 days';

  select count(*) into v_day from public.write_log where kind = p_kind and logged_at > now() - interval '24 hours';
  if v_day >= p_day_cap then
    return 'day_limit';
  end if;

  select count(*) into v_visitor from public.write_log where kind = p_kind and visitor = p_visitor and logged_at > now() - interval '1 hour';
  if v_visitor >= p_visitor_cap then
    return 'visitor_limit';
  end if;

  insert into public.write_log (kind, visitor) values (p_kind, p_visitor);
  return 'ok';
end
$$;
revoke all on function public.claim_write(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_write(text, text, integer, integer) to service_role;

-- 4. een recept van een gast toevoegen
-- p: { kind: 'cocktail' | 'mocktail', name, style, blurb?, method?, lines: [{ amount, ingredient, items: [item_id] }] }
-- Dezelfde bouw als save_recipe (0019), maar voor een gast: altijd nieuw, altijd op het menu, met source = 'guest'. Een naam die al bestaat
-- (per soort) geeft de fout 23505. De flessen bij het recept (recipe_bottles) volgen uit de regels, zoals bij save_recipe.
create or replace function public.add_guest_recipe(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid bigint;
  ln jsonb;
  lid bigint;
  pos integer := 0;
begin
  if coalesce(p->>'kind', '') not in ('cocktail', 'mocktail') then
    raise exception 'Een gast kan alleen een cocktail of mocktail toevoegen.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p->>'name', '')), '') is null or nullif(btrim(coalesce(p->>'style', '')), '') is null then
    raise exception 'Een recept heeft een naam en een soort nodig.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p->'lines'), '') <> 'array' then
    raise exception 'Een recept heeft regels nodig.' using errcode = '22023';
  end if;
  if jsonb_array_length(p->'lines') not between 2 and 8 then
    raise exception 'Een recept heeft 2 tot en met 8 regels nodig.' using errcode = '22023';
  end if;

  insert into public.recipes (kind, name, style, blurb, method, on_menu, source, sort_order)
  values (
    p->>'kind',
    btrim(p->>'name'),
    btrim(p->>'style'),
    nullif(btrim(coalesce(p->>'blurb', '')), ''),
    nullif(btrim(coalesce(p->>'method', '')), ''),
    true,
    'guest',
    (select coalesce(max(r.sort_order), 0) + 1 from public.recipes r where r.kind = p->>'kind')
  )
  returning id into rid;

  for ln in select * from jsonb_array_elements(p->'lines') loop
    pos := pos + 1;
    insert into public.recipe_lines (recipe_id, sort_order, amount, ingredient, on_bar)
    values (rid, pos, coalesce(ln->>'amount', ''), btrim(ln->>'ingredient'), false)
    returning id into lid;

    insert into public.recipe_line_items (line_id, item_id)
    select lid, x::bigint from jsonb_array_elements_text(coalesce(ln->'items', '[]'::jsonb)) as x
    on conflict do nothing;
  end loop;

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
revoke all on function public.add_guest_recipe(jsonb) from public, anon, authenticated;
grant execute on function public.add_guest_recipe(jsonb) to service_role;

-- 4b. beoordelingen lezen en schrijven voor de Edge Function (de service role heeft geen tabelrechten, alleen functies)
-- review_exists: heeft deze bezoeker dit recept het afgelopen etmaal al beoordeeld?
create or replace function public.review_exists(p_recipe_id bigint, p_visitor text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reviews
    where recipe_id = p_recipe_id and visitor = p_visitor and created_at > now() - interval '24 hours'
  );
$$;
revoke all on function public.review_exists(bigint, text) from public, anon, authenticated;
grant execute on function public.review_exists(bigint, text) to service_role;

-- add_review: bewaart een beoordeling en geeft haar terug, zonder de kolom visitor. De controles op sterren (1 t/m 5) en lengte staan in de tabel zelf.
create or replace function public.add_review(p_recipe_id bigint, p_rating integer, p_name text, p_body text, p_visitor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reviews;
begin
  if coalesce(p_visitor, '') = '' then
    raise exception 'Ongeldige aanvraag.' using errcode = '22023';
  end if;
  insert into public.reviews (recipe_id, rating, name, body, visitor)
  values (p_recipe_id, p_rating::smallint, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_body, '')), ''), p_visitor)
  returning * into r;
  return jsonb_build_object('id', r.id, 'recipe_id', r.recipe_id, 'rating', r.rating, 'name', r.name, 'body', r.body, 'created_at', r.created_at);
end
$$;
revoke all on function public.add_review(bigint, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.add_review(bigint, integer, text, text, text) to service_role;

-- 5. instellingen
insert into public.settings (key, value) values ('guest_add_enabled', 'true'::jsonb), ('reviews_enabled', 'true'::jsonb)
on conflict (key) do nothing;
