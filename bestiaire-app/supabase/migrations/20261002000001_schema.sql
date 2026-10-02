-- =====================================================================
-- Bestiaire : schéma, sécurité (RLS) et fonctions serveur
-- Toute action qui crée de la valeur (photos, fusions, plumes, enchères)
-- passe par une fonction "security definer" : les joueurs ne peuvent
-- jamais écrire directement dans les tables de jeu.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Référentiel des espèces (lecture publique)
-- ---------------------------------------------------------------------
create table if not exists public.species (
  id          text primary key,
  nom         text not null,
  sci         text not null,
  classe      char(1) not null,          -- M O R A P I K X
  tier        smallint not null check (tier between 0 and 4),
  biomes      text not null,             -- lettres F P H M V L
  act         char(1) not null check (act in ('D','N','C')),
  months      smallint[],                -- null = toute l'année
  uicn        text,
  mass_g      integer not null default 0,
  arch        char(1) not null,          -- p g f a v n o
  pays        text,                      -- non null = espèce étrangère (marché uniquement)
  sprite      smallint,                  -- planche photo
  sprite_idx  smallint,                  -- case dans la planche
  credit      text,
  photo_src   text
);
create index if not exists species_tier_idx on public.species(tier);

-- ---------------------------------------------------------------------
-- Profils joueurs
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  pseudo        text check (pseudo is null or char_length(pseudo) between 2 and 24),
  tz            text not null default 'Europe/Paris',
  plumes        integer not null default 50 check (plumes >= 0),
  films         smallint not null default 3 check (films >= 0),
  films_at      timestamptz not null default now(),
  rating        integer not null default 1000,
  wins          integer not null default 0,
  losses        integer not null default 0,
  duel_w        integer not null default 0,
  duel_l        integer not null default 0,
  quests        jsonb,
  quests_day    date,
  rewards_day   date,
  rewards_count integer not null default 0,
  duels_count   integer not null default 0,
  wishes        text[] not null default '{}',
  premium_until timestamptz,             -- abonnement actif jusqu'à cette date (écrit uniquement par le serveur / Stripe)
  stripe_customer text,
  created_at    timestamptz not null default now()
);

-- Profil créé automatiquement à l'inscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, pseudo) values (new.id, null) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Cartes (photos possédées)
-- ---------------------------------------------------------------------
create table if not exists public.cards (
  id          bigint generated always as identity primary key,
  owner       uuid not null references public.profiles(id) on delete cascade,
  species_id  text not null references public.species(id),
  q           smallint not null check (q between 0 and 99),
  lvl         smallint not null default 1 check (lvl between 1 and 7),
  biome       char(1),
  phase       text,
  status      text not null default 'owned' check (status in ('owned','auction')),
  created_at  timestamptz not null default now()
);
create index if not exists cards_owner_idx on public.cards(owner, species_id);

-- ---------------------------------------------------------------------
-- Marché
-- ---------------------------------------------------------------------
create table if not exists public.auctions (
  id           bigint generated always as identity primary key,
  seller       uuid not null references public.profiles(id) on delete cascade,
  card_id      bigint references public.cards(id) on delete set null,
  species_id   text not null references public.species(id),
  q            smallint not null,
  lvl          smallint not null,
  start_price  integer not null check (start_price > 0),
  buy_now      integer check (buy_now is null or buy_now > start_price),
  ends_at      timestamptz not null,
  status       text not null default 'open' check (status in ('open','sold','unsold')),
  best_bid     integer,
  best_bidder  uuid references public.profiles(id) on delete set null,
  bids         integer not null default 0,
  bot_buyer    text,
  created_at   timestamptz not null default now()
);
create index if not exists auctions_open_idx on public.auctions(status, ends_at);

create table if not exists public.sales (
  id          bigint generated always as identity primary key,
  species_id  text not null references public.species(id),
  lvl         smallint not null,
  q           smallint not null,
  price       integer not null,
  at          timestamptz not null default now()
);
create index if not exists sales_species_idx on public.sales(species_id, at desc);

create table if not exists public.bot_offers (
  id          bigint generated always as identity primary key,
  species_id  text not null references public.species(id),
  q           smallint not null,
  lvl         smallint not null,
  price       integer not null,
  seller      text not null,
  pays        text not null,
  expires_at  timestamptz not null,
  buyer       uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Combats entre joueurs
-- ---------------------------------------------------------------------
create table if not exists public.defenses (
  owner       uuid primary key references public.profiles(id) on delete cascade,
  team        jsonb not null,            -- [{species_id, lvl, q}]
  rating      integer not null default 1000,
  pseudo      text,
  updated_at  timestamptz not null default now()
);
create table if not exists public.duels (
  id          bigint generated always as identity primary key,
  attacker    uuid not null references public.profiles(id) on delete cascade,
  defender    uuid not null references public.profiles(id) on delete cascade,
  won         boolean not null,
  delta       integer not null,
  at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Sécurité : RLS partout, aucune écriture directe sur les tables de jeu
-- ---------------------------------------------------------------------
alter table public.species    enable row level security;
alter table public.profiles   enable row level security;
alter table public.cards      enable row level security;
alter table public.auctions   enable row level security;
alter table public.sales      enable row level security;
alter table public.bot_offers enable row level security;
alter table public.defenses   enable row level security;
alter table public.duels      enable row level security;

drop policy if exists species_read on public.species;
create policy species_read on public.species for select using (true);
drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for select using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists cards_own on public.cards;
create policy cards_own on public.cards for select using (owner = auth.uid());
drop policy if exists auctions_read on public.auctions;
create policy auctions_read on public.auctions for select to authenticated using (true);
drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select using (true);
drop policy if exists bot_read on public.bot_offers;
create policy bot_read on public.bot_offers for select to authenticated using (buyer is null and expires_at > now());
drop policy if exists defenses_read on public.defenses;
create policy defenses_read on public.defenses for select to authenticated using (true);
drop policy if exists duels_own on public.duels;
create policy duels_own on public.duels for select using (attacker = auth.uid() or defender = auth.uid());

-- Les joueurs ne modifient eux-mêmes que leur pseudo, leur fuseau et leur liste de souhaits
revoke all on public.profiles from anon, authenticated;
-- (premium_until et stripe_customer ne sont jamais modifiables par le joueur)
grant select on public.profiles to authenticated;
grant update (pseudo, tz, wishes) on public.profiles to authenticated;
revoke insert, update, delete on public.species, public.cards, public.auctions, public.sales, public.bot_offers, public.defenses, public.duels from anon, authenticated;
grant select on public.species, public.sales to anon, authenticated;
grant select on public.cards, public.auctions, public.bot_offers, public.defenses, public.duels to authenticated;

-- =====================================================================
-- Règles du jeu (côté serveur)
-- =====================================================================
create or replace function public.g_odds(t int) returns numeric language sql immutable as
$$ select (array[60,25,10,4,1])[t+1]::numeric $$;

create or replace function public.g_cote(p_tier int, p_lvl int, p_q int, p_foreign boolean default false) returns integer
language sql immutable as $$
  select round((array[5,12,30,80,250])[p_tier+1]
         * power(2::numeric, p_lvl-1)
         * (case when p_q>=95 then 2 when p_q>=80 then 1.3 when p_q>=40 then 1 else .8 end)
         * (case when p_foreign then 1.5 else 1 end))::int
$$;

create or replace function public.g_qindex(p_q int) returns int language sql immutable as
$$ select case when p_q>=95 then 3 when p_q>=80 then 2 when p_q>=40 then 1 else 0 end $$;

-- Phase de la journée à l'heure locale du joueur
create or replace function public.g_phase(p_tz text) returns text language sql stable as $$
  select case when h>=21 or h<5 then 'nuit' when h<8 then 'aube' when h<19 then 'jour' else 'crépuscule' end
  from (select extract(hour from now() at time zone coalesce(p_tz,'Europe/Paris'))::int h) x
$$;

create or replace function public.g_actweight(p_act text, p_phase text) returns numeric language sql immutable as $$
  select case
    when p_act='D' then case p_phase when 'jour' then 1 when 'nuit' then .05 else .5 end
    when p_act='N' then case p_phase when 'nuit' then 1 when 'jour' then .05 else .5 end
    else case p_phase when 'jour' then .3 when 'nuit' then .6 else 1 end end
$$;

-- Biome du jour (le même pour tout le monde, selon la date locale)
create or replace function public.g_daily_biome(p_tz text) returns text language sql stable as $$
  select (array['F','P','H','M','V','L'])[ (abs(hashtext(((now() at time zone coalesce(p_tz,'Europe/Paris'))::date)::text)) % 6) + 1 ]
$$;

-- Abonnement premium (4,99 €/mois) : avantages réglables ici
create or replace function public.g_is_premium(p public.profiles) returns boolean language sql stable as
$$ select p.premium_until is not null and p.premium_until > now() $$;
create or replace function public.g_film_cap(p public.profiles) returns int language sql stable as
$$ select case when g_is_premium(p) then 9 else 6 end $$;        -- réserve de pellicules
create or replace function public.g_film_minutes(p public.profiles) returns int language sql stable as
$$ select case when g_is_premium(p) then 40 else 60 end $$;      -- une pellicule toutes les X minutes

-- Recharge des pellicules : 1 par heure (40 min en premium), plafond 6 (9 en premium)
create or replace function public.g_refill(p_uid uuid) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles; n int; cap int; per int;
begin
  select * into p from profiles where id = p_uid for update;
  if not found then raise exception 'profil introuvable'; end if;
  cap := g_film_cap(p); per := g_film_minutes(p);
  if p.films >= cap then
    update profiles set films_at = now() where id = p_uid returning * into p;
  else
    n := floor(extract(epoch from (now() - p.films_at)) / (per * 60));
    if n > 0 then
      update profiles set films = least(cap, films + n),
             films_at = case when least(cap, films + n) >= cap then now() else films_at + make_interval(mins => n * per) end
       where id = p_uid returning * into p;
    end if;
  end if;
  return p;
end $$;

-- Défis du jour
create or replace function public.g_quests_for(p_day date) returns jsonb language plpgsql immutable as $$
declare h int := abs(hashtext(p_day::text)); b text; c text; pool jsonb; pick jsonb := '[]'; k int; q jsonb; i int := 0;
begin
  b := (array['F','P','H','M','V','L'])[h % 6 + 1];
  c := (array['O','I','M','A'])[h % 4 + 1];
  pool := jsonb_build_array(
    jsonb_build_object('t','biome','b',b,'goal',10,'rw',jsonb_build_object('plumes',30)),
    jsonb_build_object('t','new','goal',2,'rw',jsonb_build_object('films',1)),
    jsonb_build_object('t','cls','c',c,'goal',5,'rw',jsonb_build_object('plumes',25)),
    jsonb_build_object('t','rare','goal',1,'rw',jsonb_build_object('plumes',40)),
    jsonb_build_object('t','win','goal',2,'rw',jsonb_build_object('plumes',35)),
    jsonb_build_object('t','fuse','goal',1,'rw',jsonb_build_object('films',1)),
    jsonb_build_object('t','night','goal',3,'rw',jsonb_build_object('plumes',30)));
  k := h;
  while jsonb_array_length(pick) < 3 and i < 50 loop
    q := pool -> (k % 7);
    if not pick @> jsonb_build_array(q) then pick := pick || jsonb_build_array(q || jsonb_build_object('prog',0,'claimed',false)); end if;
    k := k / 7 + 13; i := i + 1;
  end loop;
  return pick;
end $$;

create or replace function public.g_quests(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles; d date;
begin
  select * into p from profiles where id = p_uid for update;
  d := (now() at time zone p.tz)::date;
  if p.quests_day is distinct from d or p.quests is null then
    update profiles set quests = g_quests_for(d) || (case when g_is_premium(p) then
             jsonb_build_array(jsonb_build_object('t','shot5','goal',15,'rw',jsonb_build_object('films',1),'prog',0,'claimed',false,'premium',true)) else '[]'::jsonb end),
           quests_day = d where id = p_uid returning * into p;
  end if;
  return p.quests;
end $$;

create or replace function public.g_quest_event(p_uid uuid, p_type text, p_sp public.species default null, p_biome text default null) returns void
language plpgsql security definer set search_path = public as $$
declare qs jsonb; q jsonb; i int; hit boolean;
begin
  qs := g_quests(p_uid);
  for i in 0 .. jsonb_array_length(qs) - 1 loop
    q := qs -> i;
    if (q->>'prog')::int >= (q->>'goal')::int then continue; end if;
    hit := (p_type = 'shot' and (
              (q->>'t' = 'biome' and q->>'b' = p_biome) or
              (q->>'t' = 'cls'   and q->>'c' = p_sp.classe) or
              (q->>'t' = 'rare'  and p_sp.tier >= 2) or
              (q->>'t' = 'night' and p_sp.act = 'N')))
        or (q->>'t' = p_type and p_type in ('new','win','fuse'))
        or (q->>'t' = 'shot5' and p_type = 'shot');
    if hit then qs := jsonb_set(qs, array[i::text,'prog'], to_jsonb((q->>'prog')::int + 1)); end if;
  end loop;
  update profiles set quests = qs where id = p_uid;
end $$;

-- =====================================================================
-- Fonctions appelées par l'application (RPC)
-- =====================================================================

-- État du joueur
create or replace function public.get_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles;
begin
  if uid is null then raise exception 'non connecté'; end if;
  insert into profiles(id) values (uid) on conflict do nothing;
  perform settle_auctions();
  p := g_refill(uid);
  perform g_quests(uid);
  select * into p from profiles where id = uid;
  return jsonb_build_object(
    'pseudo', p.pseudo, 'tz', p.tz, 'plumes', p.plumes, 'films', p.films,
    'next_film_at', case when p.films >= g_film_cap(p) then null else p.films_at + make_interval(mins => g_film_minutes(p)) end,
    'film_cap', g_film_cap(p), 'film_minutes', g_film_minutes(p),
    'premium', g_is_premium(p), 'premium_until', p.premium_until,
    'rating', p.rating, 'wins', p.wins, 'losses', p.losses, 'duel_w', p.duel_w, 'duel_l', p.duel_l,
    'quests', p.quests, 'wishes', p.wishes,
    'phase', g_phase(p.tz), 'month', extract(month from now() at time zone p.tz)::int,
    'daily_biome', g_daily_biome(p.tz), 'server_time', now());
end $$;

-- Safari : 5 photos dans un biome, tirées par le serveur
create or replace function public.safari_shoot(p_biome text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles; ph text; m int; daily text; i int; s species; qv int; cid bigint; res jsonb := '[]'; was_new boolean;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if p_biome not in ('F','P','H','M','V','L') then raise exception 'biome inconnu'; end if;
  p := g_refill(uid);
  if p.films < 1 then raise exception 'plus de pellicule'; end if;
  update profiles set films = films - 1, films_at = case when films >= g_film_cap(p) then now() else films_at end where id = uid;
  ph := g_phase(p.tz); m := extract(month from now() at time zone p.tz)::int; daily := g_daily_biome(p.tz);
  for i in 1..5 loop
    -- tirage pondéré : chaque rareté garde sa chance (60/25/10/4/1, × 2 pour les rares le biome du jour)
    -- dès qu'au moins une espèce de cette rareté est active ; à l'intérieur d'une rareté, les espèces
    -- actives à cette heure (diurnes le jour, nocturnes la nuit) sont fortement favorisées.
    with av as (
      select sp.*, g_actweight(sp.act, ph) w
      from species sp
      where sp.pays is null and sp.sprite is not null and position(p_biome in sp.biomes) > 0 and (sp.months is null or m = any(sp.months))
    ), cnt as (select tier, sum(w) sw from av group by tier)
    select av.id, av.nom, av.sci, av.classe, av.tier, av.biomes, av.act, av.months, av.uicn, av.mass_g, av.arch, av.pays, av.sprite, av.sprite_idx, av.credit, av.photo_src
      into s
      from av join cnt using (tier)
     where av.w > 0
     order by -ln(greatest(random(), 1e-12)) / (g_odds(av.tier) * (case when p_biome = daily and av.tier >= 2 then 2 else 1 end) * least(1, cnt.sw) * av.w / cnt.sw)
     limit 1;
    if s.id is null then raise exception 'aucune espèce active ici en ce moment'; end if;
    was_new := not exists (select 1 from cards where owner = uid and species_id = s.id);
    qv := floor(random() * 100);
    insert into cards(owner, species_id, q, lvl, biome, phase) values (uid, s.id, qv, 1, p_biome, ph) returning id into cid;
    perform g_quest_event(uid, 'shot', s, p_biome);
    if was_new then perform g_quest_event(uid, 'new'); end if;
    res := res || jsonb_build_object('id', cid, 'species_id', s.id, 'q', qv, 'lvl', 1, 'biome', p_biome, 'phase', ph, 'is_new', was_new);
  end loop;
  return res;
end $$;

-- Fusion : deux exemplaires du même niveau → niveau +1
create or replace function public.fuse(p_species text, p_lvl int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a cards; b cards; qi int; up boolean := false; newq int; nid bigint;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if p_lvl < 1 or p_lvl >= 7 then raise exception 'niveau invalide'; end if;
  select * into a from cards where owner = uid and species_id = p_species and lvl = p_lvl and status = 'owned' order by q desc, id limit 1 for update;
  select * into b from cards where owner = uid and species_id = p_species and lvl = p_lvl and status = 'owned' and id <> a.id order by q asc, id limit 1 for update;
  if a.id is null or b.id is null then raise exception 'il faut deux exemplaires de ce niveau'; end if;
  qi := greatest(g_qindex(a.q), g_qindex(b.q));
  if g_qindex(a.q) = g_qindex(b.q) and qi < 2 and random() < .25 then qi := qi + 1; up := true; end if;   -- jamais « parfaite » par fusion
  newq := greatest(a.q, (array[0,40,80,95])[qi+1]);
  delete from cards where id in (a.id, b.id);
  insert into cards(owner, species_id, q, lvl, biome, phase) values (uid, p_species, newq, p_lvl + 1, a.biome, a.phase) returning id into nid;
  perform g_quest_event(uid, 'fuse');
  return jsonb_build_object('id', nid, 'species_id', p_species, 'q', newq, 'lvl', p_lvl + 1, 'up', up,
    'a', jsonb_build_object('q', a.q, 'lvl', a.lvl, 'biome', a.biome, 'phase', a.phase),
    'b', jsonb_build_object('q', b.q, 'lvl', b.lvl, 'biome', b.biome, 'phase', b.phase));
end $$;

-- Vente rapide : 60 % de la cote
create or replace function public.quick_sell(p_card bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c cards; s species; price int;
begin
  select * into c from cards where id = p_card and owner = uid and status = 'owned' for update;
  if not found then raise exception 'carte introuvable'; end if;
  select * into s from species where id = c.species_id;
  price := round(g_cote(s.tier, c.lvl, c.q, s.pays is not null) * .6);
  delete from cards where id = c.id;
  update profiles set plumes = plumes + price where id = uid;
  return price;
end $$;

-- Mise aux enchères
create or replace function public.list_auction(p_card bigint, p_start int, p_buy_now int, p_minutes int) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c cards; aid bigint;
begin
  if p_minutes not in (10, 60, 360, 1440) then raise exception 'durée invalide'; end if;
  if p_start < 1 then raise exception 'mise de départ invalide'; end if;
  if p_buy_now is not null and p_buy_now <= p_start then raise exception 'l''achat immédiat doit dépasser la mise de départ'; end if;
  select * into c from cards where id = p_card and owner = uid and status = 'owned' for update;
  if not found then raise exception 'carte introuvable'; end if;
  update cards set status = 'auction' where id = c.id;
  insert into auctions(seller, card_id, species_id, q, lvl, start_price, buy_now, ends_at)
  values (uid, c.id, c.species_id, c.q, c.lvl, p_start, p_buy_now, now() + make_interval(mins => p_minutes))
  returning id into aid;
  return aid;
end $$;

-- Clôture d'une enchère (appelée par le cron, par l'achat immédiat et à chaque connexion)
create or replace function public.settle_one(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a auctions; s species; ref int;
begin
  select * into a from auctions where id = p_id for update;
  if a.status <> 'open' then return; end if;
  select * into s from species where id = a.species_id;
  if a.best_bidder is not null then
    update cards set owner = a.best_bidder, status = 'owned' where id = a.card_id;
    update profiles set plumes = plumes + a.best_bid where id = a.seller;
    insert into sales(species_id, lvl, q, price) values (a.species_id, a.lvl, a.q, a.best_bid);
    update auctions set status = 'sold' where id = a.id;
  else
    ref := g_cote(s.tier, a.lvl, a.q, s.pays is not null);
    if a.start_price <= ref * 1.15 and random() < .6 then
      -- un collectionneur (bot) rachète au prix de départ
      delete from cards where id = a.card_id;
      update profiles set plumes = plumes + a.start_price where id = a.seller;
      insert into sales(species_id, lvl, q, price) values (a.species_id, a.lvl, a.q, a.start_price);
      update auctions set status = 'sold', best_bid = a.start_price, bot_buyer = 'Collectionneur' where id = a.id;
    else
      update cards set status = 'owned' where id = a.card_id;
      update auctions set status = 'unsold' where id = a.id;
    end if;
  end if;
end $$;

create or replace function public.settle_auctions() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from auctions where status = 'open' and ends_at <= now() order by ends_at for update skip locked loop
    perform settle_one(r.id); n := n + 1;
  end loop;
  return n;
end $$;

-- Enchérir (plumes bloquées, l'ancien meilleur enchérisseur est remboursé dans la même transaction)
create or replace function public.place_bid(p_auction bigint, p_amount int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a auctions; mn int; cost int; me profiles;
begin
  if uid is null then raise exception 'non connecté'; end if;
  select * into a from auctions where id = p_auction for update;
  if not found or a.status <> 'open' or a.ends_at <= now() then raise exception 'enchère terminée'; end if;
  if a.seller = uid then raise exception 'tu ne peux pas enchérir sur ta propre vente'; end if;
  mn := case when a.best_bid is null then a.start_price else ceil(a.best_bid * 1.05) end;
  if a.buy_now is not null and p_amount >= a.buy_now then p_amount := a.buy_now;
  elsif p_amount < mn then raise exception 'il faut au moins % plumes', mn; end if;
  cost := case when a.best_bidder = uid then p_amount - a.best_bid else p_amount end;
  select * into me from profiles where id = uid for update;
  if me.plumes < cost then raise exception 'pas assez de plumes'; end if;
  update profiles set plumes = plumes - cost where id = uid;
  if a.best_bidder is not null and a.best_bidder <> uid then
    update profiles set plumes = plumes + a.best_bid where id = a.best_bidder;
  end if;
  update auctions set best_bid = p_amount, best_bidder = uid, bids = bids + 1,
         ends_at = case when ends_at - now() < interval '2 minutes' then now() + interval '2 minutes' else ends_at end
   where id = a.id;
  if a.buy_now is not null and p_amount >= a.buy_now then
    update auctions set ends_at = now() where id = a.id;
    perform settle_one(a.id);
    return jsonb_build_object('bought', true, 'amount', p_amount);
  end if;
  return jsonb_build_object('bought', false, 'amount', p_amount);
end $$;

-- Offres des collectionneurs (bots), renouvelées toutes les heures
create or replace function public.get_bot_offers() returns setof public.bot_offers
language plpgsql security definer set search_path = public as $$
declare need int; i int; t int; s species; lv int; qv int; sellers text[] := array['Léa','Hugo','Sofia','Lukas','Marta','Aiko','Noah','Ana','Liam','Mia','Kai','Emma'];
        v_pays text[] := array['France','France','Italie','Allemagne','Espagne','Japon','Canada','Brésil','Irlande','Belgique','Nouvelle-Zélande','Suisse']; k int;
begin
  perform pg_advisory_xact_lock(424242);   -- évite que deux appels simultanés créent des offres en double
  delete from bot_offers where expires_at < now() - interval '1 day';
  select 8 - count(*) into need from bot_offers where buyer is null and expires_at > now();
  for i in 1..greatest(need,0) loop
    if i <= 2 and (select count(*) from bot_offers where buyer is null and expires_at > now() and species_id in (select sp2.id from species sp2 where sp2.pays is not null)) < 2 then
      select * into s from species where pays is not null order by random() limit 1;
    else
      t := (select x from (values (0,40),(1,30),(2,18),(3,9),(4,3)) v(x,w) order by -ln(random())/w limit 1);
      select * into s from species where pays is null and tier = t order by random() limit 1;
    end if;
    lv := case when random() < .7 then 1 else 2 + floor(random()*2)::int end;
    qv := 10 + floor(random()*90)::int; k := 1 + floor(random()*12)::int;
    insert into bot_offers(species_id, q, lvl, price, seller, pays, expires_at)
    values (s.id, qv, lv, round(g_cote(s.tier, lv, qv, s.pays is not null) * (1 + random()*.6)),
            sellers[k], coalesce(s.pays, v_pays[k]), now() + interval '1 hour');
  end loop;
  return query select * from bot_offers where buyer is null and expires_at > now() order by id;
end $$;

create or replace function public.buy_bot_offer(p_offer bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o bot_offers; me profiles; cid bigint;
begin
  select * into o from bot_offers where id = p_offer for update;
  if not found or o.buyer is not null or o.expires_at <= now() then raise exception 'offre indisponible'; end if;
  select * into me from profiles where id = uid for update;
  if me.plumes < o.price then raise exception 'pas assez de plumes'; end if;
  update profiles set plumes = plumes - o.price where id = uid;
  update bot_offers set buyer = uid where id = o.id;
  insert into cards(owner, species_id, q, lvl) values (uid, o.species_id, o.q, o.lvl) returning id into cid;
  return cid;
end $$;

-- Récupérer la récompense d'un défi
create or replace function public.claim_quest(p_index int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); qs jsonb; q jsonb; p profiles;
begin
  qs := g_quests(uid);
  select * into p from profiles where id = uid;
  q := qs -> p_index;
  if q is null or (q->>'claimed')::boolean or (q->>'prog')::int < (q->>'goal')::int then raise exception 'défi non disponible'; end if;
  qs := jsonb_set(qs, array[p_index::text, 'claimed'], 'true');
  update profiles set quests = qs,
         plumes = plumes + coalesce((q->'rw'->>'plumes')::int, 0),
         films  = least(g_film_cap(p) + 3, films + coalesce((q->'rw'->>'films')::int, 0))
   where id = uid;
  return q->'rw';
end $$;

-- Récompense d'un combat contre des animaux sauvages (plafonnée)
-- Note : le combat est simulé dans l'appli ; le serveur plafonne les gains (30 récompenses / jour, 400 plumes max par combat).
create or replace function public.battle_reward(p_won boolean, p_foes text[], p_lvls int[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles; d date; gain int := 0; bonus boolean := false; i int;
begin
  select * into p from profiles where id = uid for update;
  d := (now() at time zone p.tz)::date;
  if p.rewards_day is distinct from d then update profiles set rewards_day = d, rewards_count = 0 where id = uid; p.rewards_count := 0; end if;
  if not p_won then update profiles set losses = losses + 1 where id = uid; return jsonb_build_object('gain',0,'bonus',false); end if;
  update profiles set wins = wins + 1 where id = uid;
  perform g_quest_event(uid, 'win');
  if p.rewards_count >= 30 or coalesce(array_length(p_foes,1),0) = 0 or array_length(p_foes,1) > 3 then return jsonb_build_object('gain',0,'bonus',false,'cap',true); end if;
  for i in 1..array_length(p_foes,1) loop
    gain := gain + 6 * (1 + coalesce((select tier from species where id = p_foes[i]), 0)) * least(greatest(coalesce(p_lvls[i],1),1),7);
  end loop;
  gain := least(gain, 400); bonus := random() < .2;
  update profiles set plumes = plumes + gain, rewards_count = rewards_count + 1,
         films = case when bonus then least(9, films + 1) else films end where id = uid;
  return jsonb_build_object('gain', gain, 'bonus', bonus);
end $$;

-- Équipe de défense (1 à 3 de ses propres cartes)
create or replace function public.save_defense(p_cards bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t jsonb; n int;
begin
  if coalesce(array_length(p_cards,1),0) not between 1 and 3 then raise exception 'choisis 1 à 3 animaux'; end if;
  select count(*), jsonb_agg(jsonb_build_object('species_id', species_id, 'lvl', lvl, 'q', q)) into n, t
    from cards where owner = uid and status = 'owned' and id = any(p_cards);
  if n <> array_length(p_cards,1) then raise exception 'carte introuvable'; end if;
  insert into defenses(owner, team, rating, pseudo, updated_at)
  values (uid, t, (select rating from profiles where id = uid), (select pseudo from profiles where id = uid), now())
  on conflict (owner) do update set team = excluded.team, rating = excluded.rating, pseudo = excluded.pseudo, updated_at = now();
end $$;

-- Résultat d'un duel contre la défense d'un autre joueur (classement Elo, 20 duels / jour)
create or replace function public.record_duel(p_defender uuid, p_won boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles; dr int; e numeric; delta int; gain int := 0; d date;
begin
  if p_defender = uid then raise exception 'pas contre toi-même'; end if;
  select rating into dr from defenses where owner = p_defender;
  if dr is null then raise exception 'adversaire introuvable'; end if;
  select * into p from profiles where id = uid for update;
  d := (now() at time zone p.tz)::date;
  if p.rewards_day is distinct from d then update profiles set rewards_day = d, rewards_count = 0, duels_count = 0 where id = uid; p.duels_count := 0; end if;
  if p.duels_count >= 20 then raise exception 'limite de 20 duels par jour atteinte'; end if;
  e := 1 / (1 + power(10, (dr - p.rating) / 400.0));
  delta := round(24 * ((case when p_won then 1 else 0 end) - e));
  if p_won then gain := 15 + greatest(delta, 0); perform g_quest_event(uid, 'win'); end if;
  update profiles set rating = greatest(0, rating + delta), plumes = plumes + gain, duels_count = duels_count + 1,
         duel_w = duel_w + (case when p_won then 1 else 0 end), duel_l = duel_l + (case when p_won then 0 else 1 end)
   where id = uid returning * into p;
  update defenses set rating = p.rating where owner = uid;
  insert into duels(attacker, defender, won, delta) values (uid, p_defender, p_won, delta);
  return jsonb_build_object('delta', delta, 'gain', gain, 'rating', p.rating);
end $$;

-- Droits d'exécution : uniquement les joueurs connectés, jamais les fonctions internes
revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_state(), public.safari_shoot(text), public.fuse(text,int), public.quick_sell(bigint),
  public.list_auction(bigint,int,int,int), public.place_bid(bigint,int), public.get_bot_offers(), public.buy_bot_offer(bigint),
  public.claim_quest(int), public.battle_reward(boolean,text[],int[]), public.save_defense(bigint[]), public.record_duel(uuid,boolean),
  public.settle_auctions()
  to authenticated;
grant execute on function public.g_cote(int,int,int,boolean), public.g_qindex(int) to anon, authenticated;

-- Temps réel sur le marché (si disponible)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.auctions; exception when duplicate_object then null; end;
  end if;
end $$;

-- Clôture automatique des enchères chaque minute (si pg_cron est disponible)
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('bestiaire-settle-auctions', '* * * * *', 'select public.settle_auctions()');
  end if;
end $$;
