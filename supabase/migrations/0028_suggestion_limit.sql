-- Limiet op "Zoek mijn drankje" (cocktails.html en mocktails.html): bezoekers mogen de Edge Function cocktail-ai om suggesties vragen,
-- en elke vraag kost geld. De functie telt elke vraag hier mee voordat ze Claude aanroept.
--
--   suggestion_log     één rij per vraag: een versleutelde vingerafdruk van het IP-adres (nooit het adres zelf) en het tijdstip.
--                      Niemand kan erbij behalve de service role van de Edge Function (row level security, geen enkele policy).
--                      Rijen ouder dan 2 dagen worden bij elke vraag opgeruimd.
--   claim_suggestion   telt een vraag mee en zegt of ze mag: 'ok', 'visitor_limit' (deze bezoeker zat al aan zijn maximum in het
--                      afgelopen uur) of 'day_limit' (de hele site zat al aan het maximum in de afgelopen 24 uur). De maxima geeft de
--                      functie mee (VISITOR_PER_HOUR en DAILY_CAP in supabase/functions/cocktail-ai/index.ts), dus aanpassen kan zonder
--                      nieuwe migratie. Alleen de service role mag haar aanroepen.
--
-- Instelling suggest_enabled (true = aan): de beheerder kan de zoekfunctie voor bezoekers uitzetten op admin.html.
--
-- Dit is een schemawijziging; veilig om vaker te draaien.

create table if not exists public.suggestion_log (
  id        bigint generated always as identity primary key,
  visitor   text not null,
  asked_at  timestamptz not null default now()
);
comment on table public.suggestion_log is 'vragen aan cocktail-ai (suggest): vingerafdruk van de bezoeker en tijdstip, voor de limiet; alleen de service role';

create index if not exists suggestion_log_visitor_idx on public.suggestion_log (visitor, asked_at);
create index if not exists suggestion_log_asked_idx on public.suggestion_log (asked_at);

alter table public.suggestion_log enable row level security;           -- geen policies: anon en authenticated komen er niet bij
revoke all on public.suggestion_log from public, anon, authenticated;

create or replace function public.claim_suggestion(p_visitor text, p_visitor_cap integer, p_day_cap integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day integer;
  v_visitor integer;
begin
  if coalesce(p_visitor, '') = '' or p_visitor_cap < 1 or p_day_cap < 1 then
    raise exception 'Ongeldige aanvraag.' using errcode = '22023';
  end if;

  -- één vraag tegelijk tellen, zodat twee gelijktijdige vragen niet allebei net onder het maximum kunnen blijven
  perform pg_advisory_xact_lock(hashtext('claim_suggestion'));

  delete from public.suggestion_log where asked_at < now() - interval '2 days';

  select count(*) into v_day from public.suggestion_log where asked_at > now() - interval '24 hours';
  if v_day >= p_day_cap then
    return 'day_limit';
  end if;

  select count(*) into v_visitor from public.suggestion_log where visitor = p_visitor and asked_at > now() - interval '1 hour';
  if v_visitor >= p_visitor_cap then
    return 'visitor_limit';
  end if;

  insert into public.suggestion_log (visitor) values (p_visitor);
  return 'ok';
end
$$;

revoke all on function public.claim_suggestion(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_suggestion(text, integer, integer) to service_role;

insert into public.settings (key, value) values ('suggest_enabled', 'true'::jsonb)
on conflict (key) do nothing;
