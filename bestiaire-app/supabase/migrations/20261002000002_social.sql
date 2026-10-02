-- =====================================================================
-- Bestiaire : succès, amis, guildes
-- À exécuter APRÈS 20261002000001_schema.sql. Ré-exécutable sans risque.
-- Comme pour le reste du jeu, toute écriture passe par des fonctions
-- « security definer » : aucune écriture directe dans les tables.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Amis (par code ami à 6 caractères)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists friend_code text;
create unique index if not exists profiles_friend_code_idx on public.profiles(friend_code);

create table if not exists public.friendships (
  a          uuid not null references public.profiles(id) on delete cascade,   -- a < b
  b          uuid not null references public.profiles(id) on delete cascade,
  requester  uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

create or replace function public.g_friend_code(p_uid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  select friend_code into c from profiles where id = p_uid;
  while c is null loop
    c := upper(translate(substr(md5(random()::text || clock_timestamp()::text), 1, 6), '01', 'KM'));
    begin update profiles set friend_code = c where id = p_uid; exception when unique_violation then c := null; end;
  end loop;
  return c;
end $$;

create or replace function public.friend_request(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o uuid; lo uuid; hi uuid; f friendships;
begin
  if uid is null then raise exception 'non connecté'; end if;
  select id into o from profiles where friend_code = upper(trim(p_code));
  if o is null then raise exception 'code ami introuvable'; end if;
  if o = uid then raise exception 'c''est ton propre code'; end if;
  if exists(select 1 from blocks where (blocker = o and blocked = uid) or (blocker = uid and blocked = o)) then raise exception 'impossible d''ajouter ce joueur'; end if;
  lo := least(uid, o); hi := greatest(uid, o);
  select * into f from friendships where a = lo and b = hi for update;
  if found then
    if f.status = 'accepted' then return 'déjà amis'; end if;
    if f.requester = o then update friendships set status = 'accepted' where a = lo and b = hi; return 'accepted'; end if;
    return 'pending';
  end if;
  if (select count(*) from friendships where (a = uid or b = uid)) >= 100 then raise exception 'liste d''amis pleine (100)'; end if;
  insert into friendships(a, b, requester) values (lo, hi, uid);
  return 'pending';
end $$;

create or replace function public.friend_respond(p_other uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if p_accept then
    update friendships set status = 'accepted' where a = least(uid, p_other) and b = greatest(uid, p_other) and requester = p_other and status = 'pending';
    if not found then raise exception 'demande introuvable'; end if;
  else
    delete from friendships where a = least(uid, p_other) and b = greatest(uid, p_other);
  end if;
end $$;

create or replace function public.friend_remove(p_other uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where a = least(auth.uid(), p_other) and b = greatest(auth.uid(), p_other)
$$;

create or replace function public.get_friends() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); code text;
begin
  if uid is null then raise exception 'non connecté'; end if;
  code := g_friend_code(uid);
  return jsonb_build_object('code', code, 'list', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'pseudo', coalesce(o.pseudo, 'Joueur ' || left(o.friend_code, 3)), 'status', f.status, 'incoming', f.status = 'pending' and f.requester <> uid,
      'species', (select count(distinct c.species_id) from cards c where c.owner = o.id),
      'rating', o.rating, 'last_seen', o.last_seen,
      'guild', (select g.tag from guild_members m join guilds g on g.id = m.guild_id where m.user_id = o.id),
      'defense', exists(select 1 from defenses d where d.owner = o.id))
      order by f.status desc, o.last_seen desc nulls last)
    from friendships f join profiles o on o.id = case when f.a = uid then f.b else f.a end
    where f.a = uid or f.b = uid), '[]'::jsonb));
end $$;

-- Profil d'un ami : ses plus belles cartes et ses statistiques
create or replace function public.friend_profile(p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o profiles;
begin
  if not exists(select 1 from friendships where a = least(uid, p_other) and b = greatest(uid, p_other) and status = 'accepted')
     and not exists(select 1 from guild_members m1 join guild_members m2 on m1.guild_id = m2.guild_id where m1.user_id = uid and m2.user_id = p_other)
  then raise exception 'profil réservé aux amis et à la guilde'; end if;
  select * into o from profiles where id = p_other;
  return jsonb_build_object('id', o.id, 'pseudo', o.pseudo, 'rating', o.rating, 'wins', o.wins, 'duel_w', o.duel_w,
    'achievements', coalesce(array_length(o.achievements, 1), 0), 'metrics', g_metrics(o.id),
    'top', coalesce((select jsonb_agg(t) from (
        select distinct on (c.species_id) c.species_id, c.q, c.lvl, c.phase, s.tier
        from cards c join species s on s.id = c.species_id where c.owner = o.id
        order by c.species_id, c.lvl desc, c.q desc) t
      ), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Guildes
-- ---------------------------------------------------------------------
create table if not exists public.guilds (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 3 and 24),
  tag        text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  descr      text not null default '' check (char_length(descr) <= 140),
  emblem     text references public.species(id),
  open       boolean not null default true,
  owner      uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists guilds_name_idx on public.guilds(lower(name));
create unique index if not exists guilds_tag_idx on public.guilds(tag);

create table if not exists public.guild_members (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  guild_id     bigint not null references public.guilds(id) on delete cascade,
  role         text not null default 'membre' check (role in ('chef','officier','membre')),
  week_claimed date,
  joined_at    timestamptz not null default now()
);
create index if not exists guild_members_guild_idx on public.guild_members(guild_id);

create table if not exists public.guild_messages (
  id       bigint generated always as identity primary key,
  guild_id bigint not null references public.guilds(id) on delete cascade,
  user_id  uuid references public.profiles(id) on delete set null,
  pseudo   text,
  body     text not null check (char_length(body) between 1 and 200),
  hidden   boolean not null default false,   -- masqué par la modération
  at       timestamptz not null default now()
);
alter table public.guild_messages add column if not exists hidden boolean not null default false;
-- Joueurs bloqués (leurs messages sont masqués, plus de demande d'ami possible)
create table if not exists public.blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (blocker, blocked)
);
create index if not exists guild_messages_idx on public.guild_messages(guild_id, at desc);

create or replace function public.g_my_guild(p_uid uuid) returns bigint language sql stable security definer set search_path = public as
$$ select guild_id from guild_members where user_id = p_uid $$;

-- Objectif de la semaine : photos prises par les membres depuis lundi
create or replace function public.g_guild_week(p_gid bigint) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'photos', coalesce(sum(case when p.week_of = date_trunc('week', now())::date then p.week_shots else 0 end), 0),
    'goal', least(600, 40 * count(*)), 'members', count(*))
  from guild_members m join profiles p on p.id = m.user_id where m.guild_id = p_gid
$$;

create or replace function public.guild_create(p_name text, p_tag text, p_descr text, p_emblem text) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid bigint;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if g_my_guild(uid) is not null then raise exception 'tu es déjà dans une guilde'; end if;
  if char_length(trim(p_name)) < 3 then raise exception 'nom trop court (3 caractères minimum)'; end if;
  if exists(select 1 from guilds where lower(name) = lower(trim(p_name))) then raise exception 'ce nom de guilde est déjà pris'; end if;
  if exists(select 1 from guilds where tag = upper(trim(p_tag))) then raise exception 'ce sigle est déjà pris'; end if;
  if p_emblem is not null and not exists(select 1 from cards where owner = uid and species_id = p_emblem) then raise exception 'l''emblème doit être un animal de ta collection'; end if;
  update profiles set plumes = plumes - 100 where id = uid and plumes >= 100;
  if not found then raise exception 'il faut 100 plumes pour fonder une guilde'; end if;
  insert into guilds(name, tag, descr, emblem, owner) values (trim(p_name), upper(trim(p_tag)), left(coalesce(trim(p_descr), ''), 140), p_emblem, uid) returning id into gid;
  insert into guild_members(user_id, guild_id, role) values (uid, gid, 'chef');
  return gid;
end $$;

create or replace function public.guild_list(p_q text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.n desc, x.id), '[]'::jsonb) from (
    select g.id, g.name, g.tag, g.descr, g.emblem, g.open, count(m.user_id) as n,
      (select round(avg(p.rating)) from guild_members m2 join profiles p on p.id = m2.user_id where m2.guild_id = g.id) as rating
    from guilds g left join guild_members m on m.guild_id = g.id
    where coalesce(p_q, '') = '' or g.name ilike '%' || p_q || '%' or g.tag ilike '%' || p_q || '%'
    group by g.id order by count(m.user_id) desc, g.id limit 30) x
$$;

create or replace function public.guild_join(p_gid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g guilds;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if g_my_guild(uid) is not null then raise exception 'tu es déjà dans une guilde'; end if;
  select * into g from guilds where id = p_gid for update;
  if not found then raise exception 'guilde introuvable'; end if;
  if not g.open then raise exception 'cette guilde est fermée'; end if;
  if (select count(*) from guild_members where guild_id = p_gid) >= 30 then raise exception 'guilde complète (30 membres)'; end if;
  insert into guild_members(user_id, guild_id, week_claimed) values (uid, p_gid, date_trunc('week', now())::date);
  insert into guild_messages(guild_id, user_id, pseudo, body) select p_gid, null, null, coalesce(pseudo, 'Un joueur') || ' rejoint la guilde.' from profiles where id = uid;
end $$;

create or replace function public.guild_leave() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me guild_members; heir uuid;
begin
  select * into me from guild_members where user_id = uid;
  if not found then raise exception 'tu n''es dans aucune guilde'; end if;
  delete from guild_members where user_id = uid;
  if me.role = 'chef' then
    select user_id into heir from guild_members where guild_id = me.guild_id order by (role = 'officier') desc, joined_at limit 1;
    if heir is null then delete from guilds where id = me.guild_id; return; end if;
    update guild_members set role = 'chef' where user_id = heir;
    update guilds set owner = heir where id = me.guild_id;
  end if;
  insert into guild_messages(guild_id, user_id, pseudo, body) select me.guild_id, null, null, coalesce(pseudo, 'Un joueur') || ' a quitté la guilde.' from profiles where id = uid;
end $$;

create or replace function public.guild_manage(p_user uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me guild_members; t guild_members;
begin
  select * into me from guild_members where user_id = uid;
  select * into t from guild_members where user_id = p_user;
  if me.guild_id is null or t.guild_id is distinct from me.guild_id or p_user = uid then raise exception 'action impossible'; end if;
  if p_action = 'exclure' then
    if me.role = 'membre' or t.role = 'chef' or (me.role = 'officier' and t.role = 'officier') then raise exception 'droits insuffisants'; end if;
    delete from guild_members where user_id = p_user;
  elsif p_action in ('promouvoir', 'retrograder', 'chef') then
    if me.role <> 'chef' then raise exception 'seul le chef peut changer les rôles'; end if;
    if p_action = 'chef' then
      update guild_members set role = 'officier' where user_id = uid;
      update guild_members set role = 'chef' where user_id = p_user;
      update guilds set owner = p_user where id = me.guild_id;
    else
      update guild_members set role = case when p_action = 'promouvoir' then 'officier' else 'membre' end where user_id = p_user;
    end if;
  else raise exception 'action inconnue'; end if;
end $$;

create or replace function public.guild_update(p_descr text, p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me guild_members;
begin
  select * into me from guild_members where user_id = uid;
  if me.role is distinct from 'chef' and me.role is distinct from 'officier' then raise exception 'droits insuffisants'; end if;
  update guilds set descr = left(coalesce(trim(p_descr), ''), 140), open = p_open where id = me.guild_id;
end $$;

create or replace function public.guild_post(p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid bigint := g_my_guild(uid); b text := trim(p_body);
begin
  if gid is null then raise exception 'tu n''es dans aucune guilde'; end if;
  if char_length(b) = 0 then return; end if;
  if char_length(b) > 200 then raise exception 'message trop long (200 caractères)'; end if;
  if exists(select 1 from guild_messages where user_id = uid and at > now() - interval '3 seconds') then raise exception 'doucement : un message toutes les 3 secondes'; end if;
  insert into guild_messages(guild_id, user_id, pseudo, body) select gid, uid, coalesce(pseudo, 'Joueur'), b from profiles where id = uid;
end $$;

create or replace function public.guild_claim_week() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me guild_members; w jsonb; wk date := date_trunc('week', now())::date;
begin
  select * into me from guild_members where user_id = uid for update;
  if not found then raise exception 'tu n''es dans aucune guilde'; end if;
  if me.week_claimed = wk then raise exception 'récompense de la semaine déjà récupérée'; end if;
  w := g_guild_week(me.guild_id);
  if (w->>'photos')::int < (w->>'goal')::int then raise exception 'objectif de la semaine pas encore atteint'; end if;
  update guild_members set week_claimed = wk where user_id = uid;
  update profiles set plumes = plumes + 60, films = films + 1 where id = uid;
  return jsonb_build_object('plumes', 60, 'films', 1);
end $$;

-- Ma guilde : membres, objectif, derniers messages
create or replace function public.guild_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid bigint := g_my_guild(uid); g guilds; wk date := date_trunc('week', now())::date;
begin
  if gid is null then return null; end if;
  select * into g from guilds where id = gid;
  return jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'descr', g.descr, 'emblem', g.emblem, 'open', g.open,
    'role', (select role from guild_members where user_id = uid),
    'claimed', (select week_claimed = wk from guild_members where user_id = uid),
    'week', g_guild_week(gid),
    'members', (select jsonb_agg(jsonb_build_object('id', p.id, 'pseudo', coalesce(p.pseudo, 'Joueur'), 'role', m.role, 'rating', p.rating,
                  'species', (select count(distinct c.species_id) from cards c where c.owner = p.id),
                  'week', case when p.week_of = wk then p.week_shots else 0 end, 'last_seen', p.last_seen)
                order by (m.role = 'chef') desc, (m.role = 'officier') desc, p.rating desc)
                from guild_members m join profiles p on p.id = m.user_id where m.guild_id = gid),
    'messages', coalesce((select jsonb_agg(x order by x.at) from (select id, user_id, pseudo, body, at from guild_messages where guild_id = gid and not hidden
                  and (user_id is null or user_id not in (select blocked from blocks where blocker = uid)) order by at desc limit 50) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Succès
-- ---------------------------------------------------------------------
-- Définition des succès : code, mesure, objectif, récompense (plumes, pellicules)
create or replace function public.g_achievement_defs() returns table(code text, metric text, goal int, rw_plumes int, rw_films int)
language sql immutable as $$
  values
    ('first_photo','shots',1,20,0), ('shots_100','shots',100,0,2), ('shots_500','shots',500,150,3),
    ('species_10','species',10,40,0), ('species_50','species',50,100,1), ('species_150','species',150,250,2), ('species_400','species',400,600,5),
    ('birds_25','birds',25,80,0), ('mammals_10','mammals',10,80,0), ('insects_25','insects',25,80,0),
    ('epic_1','epic',1,60,0), ('legend_1','legend',1,150,1), ('legend_5','legend',5,500,3),
    ('perfect_1','perfect',1,40,0), ('perfect_10','perfect',10,150,1),
    ('lvl_3','maxlvl',3,40,0), ('lvl_5','maxlvl',5,120,1), ('lvl_7','maxlvl',7,400,3),
    ('fusions_10','fusions',10,60,0), ('fusions_50','fusions',50,200,2),
    ('night_20','night',20,80,1),
    ('wins_10','wins',10,60,0), ('wins_50','wins',50,200,2), ('duel_5','duel_w',5,100,1),
    ('world_3','world',3,120,0), ('biomes_6','biomes',6,60,1),
    ('sales_1','sales',1,30,0), ('sales_10','sales',10,120,1),
    ('friend_1','friends',1,30,0), ('friend_5','friends',5,100,1), ('guild_1','guild',1,50,0)
$$;

-- Valeurs actuelles des mesures pour un joueur
create or replace function public.g_metrics(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shots', p.shots, 'night', p.night_shots, 'fusions', p.fusions, 'wins', p.wins, 'duel_w', p.duel_w,
    'species', (select count(distinct c.species_id) from cards c join species s on s.id = c.species_id where c.owner = p.id and s.pays is null),
    'birds',   (select count(distinct c.species_id) from cards c join species s on s.id = c.species_id where c.owner = p.id and s.pays is null and s.classe = 'O'),
    'mammals', (select count(distinct c.species_id) from cards c join species s on s.id = c.species_id where c.owner = p.id and s.pays is null and s.classe = 'M'),
    'insects', (select count(distinct c.species_id) from cards c join species s on s.id = c.species_id where c.owner = p.id and s.pays is null and s.classe = 'I'),
    'epic',    (select count(distinct c.species_id) from cards c join species s on s.id = c.species_id where c.owner = p.id and s.tier >= 3),
    'legend',  (select count(distinct c.species_id) from cards c join species s on s.id = c.species_id where c.owner = p.id and s.tier = 4),
    'world',   (select count(distinct c.species_id) from cards c join species s on s.id = c.species_id where c.owner = p.id and s.pays is not null),
    'perfect', (select count(*) from cards c where c.owner = p.id and c.q >= 95),
    'maxlvl',  (select coalesce(max(c.lvl), 0) from cards c where c.owner = p.id),
    'biomes',  (select count(distinct c.biome) from cards c where c.owner = p.id and c.biome is not null),
    'sales',   (select count(*) from auctions a where a.seller = p.id and a.status = 'sold'),
    'friends', (select count(*) from friendships f where (f.a = p.id or f.b = p.id) and f.status = 'accepted'),
    'guild',   (select count(*) from guild_members m where m.user_id = p.id))
  from profiles p where p.id = p_uid
$$;

-- Liste des succès avec progression (pour l'écran Succès)
create or replace function public.get_achievements() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m jsonb; got text[];
begin
  if uid is null then raise exception 'non connecté'; end if;
  m := g_metrics(uid); select achievements into got from profiles where id = uid;
  return (select jsonb_agg(jsonb_build_object('code', d.code, 'goal', d.goal, 'prog', least(coalesce((m->>d.metric)::int, 0), d.goal),
            'plumes', d.rw_plumes, 'films', d.rw_films, 'claimed', d.code = any(got)) order by d.code)
          from g_achievement_defs() d);
end $$;

create or replace function public.claim_achievement(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d record; m jsonb; p profiles;
begin
  if uid is null then raise exception 'non connecté'; end if;
  select * into d from g_achievement_defs() x where x.code = p_code;
  if not found then raise exception 'succès inconnu'; end if;
  select * into p from profiles where id = uid for update;
  if p_code = any(p.achievements) then raise exception 'déjà récupéré'; end if;
  m := g_metrics(uid);
  if coalesce((m->>d.metric)::int, 0) < d.goal then raise exception 'succès pas encore atteint'; end if;
  update profiles set achievements = array_append(achievements, p_code), plumes = plumes + d.rw_plumes, films = films + d.rw_films where id = uid;
  return jsonb_build_object('plumes', d.rw_plumes, 'films', d.rw_films);
end $$;

-- ---------------------------------------------------------------------
-- Suppression du compte (RGPD) : efface le compte et toutes ses données
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles;
begin
  if uid is null then raise exception 'non connecté'; end if;
  select * into p from profiles where id = uid;
  if p.premium_until is not null and p.premium_until > now() + interval '2 days' then
    raise exception 'résilie d''abord ton abonnement Bestiaire+ (Profil > Gérer mon abonnement)';
  end if;
  if exists(select 1 from guild_members where user_id = uid) then perform guild_leave(); end if;
  -- les enchères en cours sont annulées et les offres remboursées
  update profiles pr set plumes = pr.plumes + a.best_bid from auctions a where a.seller = uid and a.status = 'open' and a.best_bidder = pr.id;
  delete from auctions where seller = uid and status = 'open';
  delete from auth.users where id = uid;   -- supprime le profil, les cartes, les amis… en cascade
end $$;

-- ---------------------------------------------------------------------
-- Sécurité
-- ---------------------------------------------------------------------
alter table public.friendships enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_messages enable row level security;
alter table public.blocks enable row level security;
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for select using (blocker = auth.uid());
drop policy if exists friendships_own on public.friendships;
create policy friendships_own on public.friendships for select using (a = auth.uid() or b = auth.uid());
drop policy if exists guilds_read on public.guilds;
create policy guilds_read on public.guilds for select to authenticated using (true);
drop policy if exists guild_members_read on public.guild_members;
create policy guild_members_read on public.guild_members for select to authenticated using (true);
drop policy if exists guild_messages_read on public.guild_messages;
create policy guild_messages_read on public.guild_messages for select using (guild_id = public.g_my_guild(auth.uid()) and not hidden);
revoke insert, update, delete on public.friendships, public.guilds, public.guild_members, public.guild_messages, public.blocks from anon, authenticated;
grant select on public.friendships, public.guilds, public.guild_members, public.guild_messages, public.blocks to authenticated;
-- le code ami n'est lisible qu'à travers get_friends (le profil n'est lisible que par son propriétaire)

revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_state(), public.safari_shoot(text), public.fuse(text,int), public.quick_sell(bigint),
  public.list_auction(bigint,int,int,int), public.place_bid(bigint,int), public.get_bot_offers(), public.buy_bot_offer(bigint),
  public.claim_quest(int), public.battle_reward(boolean,text[],int[]), public.save_defense(bigint[]), public.record_duel(uuid,boolean),
  public.settle_auctions(),
  public.get_achievements(), public.claim_achievement(text),
  public.friend_request(text), public.friend_respond(uuid,boolean), public.friend_remove(uuid), public.get_friends(), public.friend_profile(uuid),
  public.guild_create(text,text,text,text), public.guild_list(text), public.guild_join(bigint), public.guild_leave(),
  public.guild_manage(uuid,text), public.guild_update(text,boolean), public.guild_post(text), public.guild_claim_week(), public.guild_get(),
  public.g_my_guild(uuid), public.delete_my_account()
  to authenticated;
grant execute on function public.g_cote(int,int,int,boolean), public.g_qindex(int) to anon, authenticated;

-- Messages de guilde en temps réel (si disponible)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.guild_messages; exception when duplicate_object then null; end;
  end if;
end $$;
