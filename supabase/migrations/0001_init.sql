-- Kelderrestjes: database achter de dranken, voorraad en cocktails.
-- Vervangt legacy/drinks.js (G, M, R, P, Z, ING, OUT, W) door tabellen.
--
--   categories      dranksoorten + "Ingrediënten"   (ORDER, G, M, ING)
--   items           flessen, mixers, wijnen, ingrediënten (+ in_stock = het omgekeerde van OUT)
--   recipes         cocktails, mocktails en "puur"-serves (R, Z, P)
--   recipe_bottles  welke items in welk recept passen  (r.b)
--   recipe_lines    de receptregels                    (r.s)
--   wines           wijndetails, hangt aan een item    (W)
--   admins          wie mag schrijven (alleen via SQL editor te beheren)
--
-- Lezen mag iedereen (de website is publiek). Schrijven mag alleen wie in `admins` staat,
-- ook als er ooit per ongeluk nieuwe gebruikers kunnen registreren.

-- ---------------------------------------------------------------- tabellen

create table public.categories (
  id            bigint generated always as identity primary key,
  label         text not null unique,
  kind          text not null check (kind in ('bottle', 'drink', 'ingredient')),
  alcohol_level text,
  sort_order    int  not null default 0
);
comment on column public.categories.kind is
  'bottle = flessen (G), drink = mixers/bier/wijn/koffie (M), ingredient = niet op het menu (ING)';

create table public.items (
  id          bigint generated always as identity primary key,
  category_id bigint  not null references public.categories (id) on delete restrict,
  name        text    not null unique,
  keyword     text,
  aliases     text[]  not null default '{}',
  note        text,
  optional    boolean not null default false,
  zero_proof  boolean not null default false,
  to_confirm  boolean not null default false,
  in_stock    boolean not null default true,
  sort_order  int     not null default 0,
  updated_at  timestamptz not null default now()
);
create index items_category_id_idx on public.items (category_id);
comment on column public.items.keyword is 'trefwoord (kleine letters) om het item in receptregels te herkennen';
comment on column public.items.aliases is 'extra woorden voor dat herkennen, bijv. {j&b}';

create table public.recipes (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('cocktail', 'mocktail', 'solo')),
  name       text not null,
  style      text not null,
  blurb      text,
  method     text,
  url        text,
  sort_order int  not null default 0,
  unique (kind, name)
);
comment on column public.recipes.kind is 'cocktail = R, mocktail = Z, solo = P (puur of met één ding erbij)';
comment on column public.recipes.style is 'de soort, bijv. Klassieker, Sour, Lang & licht';

create table public.recipe_bottles (
  recipe_id  bigint   not null references public.recipes (id) on delete cascade,
  item_id    bigint   not null references public.items (id)   on delete restrict,
  sort_order smallint not null default 0,
  primary key (recipe_id, item_id)
);
create index recipe_bottles_item_id_idx on public.recipe_bottles (item_id);

create table public.recipe_lines (
  id         bigint generated always as identity primary key,
  recipe_id  bigint   not null references public.recipes (id) on delete cascade,
  sort_order smallint not null,
  amount     text     not null default '',
  ingredient text     not null,
  on_bar     boolean  not null default false,
  unique (recipe_id, sort_order)
);
comment on column public.recipe_lines.on_bar is 'true = mixer of vers ingrediënt, staat op de bar (oranje op de kaart)';

create table public.wines (
  id         bigint generated always as identity primary key,
  item_id    bigint  not null unique references public.items (id) on delete cascade,
  kind       text    not null check (kind in ('Bubbels', 'Wit', 'Rosé', 'Rood')),
  grape      text,
  region     text,
  alcohol    text,
  note       text,
  to_confirm boolean not null default false,
  sort_order int     not null default 0
);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- ---------------------------------------------------------------- updated_at

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- toegang

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- admins: geen policies, dus niet bereikbaar via de API; beheer via de SQL editor
alter table public.admins enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'items', 'recipes', 'recipe_bottles', 'recipe_lines', 'wines']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "iedereen mag lezen" on public.%I for select to anon, authenticated using (true)', t);
    execute format(
      'create policy "admins mogen toevoegen" on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format(
      'create policy "admins mogen wijzigen" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format(
      'create policy "admins mogen verwijderen" on public.%I for delete to authenticated using (public.is_admin())', t);

    -- expliciete rechten, zodat het ook werkt als nieuwe tabellen niet automatisch aan de Data API hangen
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

grant usage on schema public to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;
