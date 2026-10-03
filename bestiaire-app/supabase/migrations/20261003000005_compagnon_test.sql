-- =====================================================================
-- Bestiaire — 005 : mode Compagnon (TEST)
-- À exécuter APRÈS 001 → 004. Idempotent.
-- Version test : l'état du compagnon est calculé dans l'appli puis sauvegardé ici,
-- pour le retrouver sur un autre appareil et pour que les autres joueurs puissent l'affronter.
-- =====================================================================
create table if not exists public.compagnons (
  owner       uuid primary key references public.profiles(id) on delete cascade,
  pseudo      text,
  espece      text not null,
  surnom      text,
  niveau      integer not null default 1 check (niveau between 1 and 60),
  rating      integer not null default 1000,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists compagnons_niveau_idx on public.compagnons(niveau);
alter table public.compagnons enable row level security;
drop policy if exists compagnons_lecture on public.compagnons;
create policy compagnons_lecture on public.compagnons for select to authenticated using (true);
revoke insert, update, delete on public.compagnons from anon, authenticated;
grant select on public.compagnons to authenticated;

-- Sauvegarde (taille limitée, surnom filtré comme les pseudos)
create or replace function public.compagnon_save(p_espece text, p_surnom text, p_niveau int, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'non connecté'; end if;
  if pg_column_size(p_data) > 20000 then raise exception 'données trop volumineuses'; end if;
  if not exists (select 1 from species where id = p_espece) then raise exception 'espèce inconnue'; end if;
  if p_niveau is null or p_niveau < 1 or p_niveau > 60 then raise exception 'niveau invalide'; end if;
  if p_surnom is not null and (char_length(p_surnom) > 20 or g_bad(p_surnom)) then raise exception 'surnom refusé'; end if;
  insert into compagnons(owner, pseudo, espece, surnom, niveau, data, updated_at)
  values (uid, (select pseudo from profiles where id = uid), p_espece, p_surnom, p_niveau, p_data, now())
  on conflict (owner) do update set pseudo = excluded.pseudo, espece = excluded.espece, surnom = excluded.surnom,
    niveau = excluded.niveau, data = excluded.data, updated_at = now();
end $$;

-- Duel contre le compagnon d'un autre joueur : classement Elo, 20 par jour
alter table public.profiles add column if not exists cduels_day date;
alter table public.profiles add column if not exists cduels_count integer not null default 0;
create or replace function public.compagnon_duel(p_def uuid, p_won boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me compagnons; dr int; e numeric; delta int; p profiles; d date;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if p_def = uid then raise exception 'pas contre toi-même'; end if;
  select * into me from compagnons where owner = uid;
  if me.owner is null then raise exception 'sauvegarde ton compagnon d''abord'; end if;
  select rating into dr from compagnons where owner = p_def;
  if dr is null then raise exception 'adversaire introuvable'; end if;
  select * into p from profiles where id = uid for update;
  d := (now() at time zone p.tz)::date;
  if p.cduels_day is distinct from d then p.cduels_count := 0; end if;
  if p.cduels_count >= 20 then raise exception 'limite de 20 duels de compagnons par jour'; end if;
  update profiles set cduels_day = d, cduels_count = p.cduels_count + 1 where id = uid;
  e := 1 / (1 + power(10, (dr - me.rating) / 400.0));
  delta := round(24 * ((case when p_won then 1 else 0 end) - e));
  update compagnons set rating = greatest(0, rating + delta) where owner = uid returning rating into me.rating;
  update compagnons set rating = greatest(0, rating - delta / 2) where owner = p_def;
  return jsonb_build_object('delta', delta, 'rating', me.rating);
end $$;

revoke execute on function public.compagnon_save(text,text,int,jsonb), public.compagnon_duel(uuid,boolean) from public, anon;
grant execute on function public.compagnon_save(text,text,int,jsonb), public.compagnon_duel(uuid,boolean) to authenticated;
