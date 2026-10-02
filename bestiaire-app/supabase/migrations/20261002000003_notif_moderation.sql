-- =====================================================================
-- Bestiaire : notifications et modération
-- À exécuter APRÈS 20261002000001_schema.sql et 20261002000002_social.sql.
-- Ré-exécutable sans risque.
-- =====================================================================

alter table public.profiles add column if not exists notif jsonb not null
  default '{"pellicules": true, "encheres": true, "amis": true, "guilde": true, "duels": true}';
alter table public.profiles add column if not exists films_notified_at timestamptz;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists muted_until timestamptz;

-- ---------------------------------------------------------------------
-- Notifications : boîte de réception dans le jeu + envoi push sur le téléphone
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,                 -- pellicules | encheres | amis | guilde | duels
  title      text not null,
  body       text not null,
  tab        text,                          -- onglet à ouvrir au clic
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  sent_at    timestamptz                    -- envoyée en push (ou abandonnée)
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unsent_idx on public.notifications(created_at) where sent_at is null;

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_user_idx on public.push_subscriptions(user_id);

-- Crée une notification si le joueur n'a pas coupé ce type
create or replace function public.g_notify(p_uid uuid, p_kind text, p_title text, p_body text, p_tab text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_uid is null then return; end if;
  if coalesce((select (notif->>p_kind)::boolean from profiles where id = p_uid), true) then
    insert into notifications(user_id, kind, title, body, tab) values (p_uid, p_kind, left(p_title, 80), left(p_body, 200), p_tab);
  end if;
end $$;

-- Enchères : surenchère, vente, achat
create or replace function public.t_notify_auction() returns trigger
language plpgsql security definer set search_path = public as $$
declare nom text;
begin
  select s.nom into nom from species s where s.id = new.species_id;
  if new.status = 'open' and old.best_bidder is not null and new.best_bidder is distinct from old.best_bidder then
    perform g_notify(old.best_bidder, 'encheres', 'Enchère dépassée', format('Quelqu''un a proposé %s plumes pour %s. Tes plumes te sont rendues.', new.best_bid, nom), 'market');
  end if;
  if old.status = 'open' and new.status = 'sold' then
    perform g_notify(new.seller, 'encheres', 'Vendu !', format('%s (niv. %s) vendu pour %s plumes.', nom, new.lvl, new.best_bid), 'market');
    if new.best_bidder is not null then
      perform g_notify(new.best_bidder, 'encheres', 'Enchère remportée', format('%s (niv. %s) rejoint ton bestiaire.', nom, new.lvl), 'dex');
    end if;
  elsif old.status = 'open' and new.status = 'unsold' then
    perform g_notify(new.seller, 'encheres', 'Pas d''acheteur', format('%s n''a pas trouvé preneur : la carte est revenue dans ton bestiaire.', nom), 'market');
  end if;
  return new;
end $$;
drop trigger if exists notify_auction on public.auctions;
create trigger notify_auction after update on public.auctions for each row execute function public.t_notify_auction();

-- Amis : demande reçue, demande acceptée
create or replace function public.t_notify_friend() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid; who text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    other := case when new.a = new.requester then new.b else new.a end;
    select coalesce(pseudo, 'Un joueur') into who from profiles where id = new.requester;
    perform g_notify(other, 'amis', 'Demande d''ami', who || ' veut devenir ton ami.', 'profile');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    other := case when new.a = new.requester then new.b else new.a end;
    select coalesce(pseudo, 'Un joueur') into who from profiles where id = other;
    perform g_notify(new.requester, 'amis', 'Nouvel ami', who || ' a accepté ta demande.', 'profile');
  end if;
  return new;
end $$;
drop trigger if exists notify_friend on public.friendships;
create trigger notify_friend after insert or update on public.friendships for each row execute function public.t_notify_friend();

-- Guilde : nouveau message (au plus une notification non lue par membre)
create or replace function public.t_notify_guild() returns trigger
language plpgsql security definer set search_path = public as $$
declare g text; m record;
begin
  if new.user_id is null then return new; end if;
  select name into g from guilds where id = new.guild_id;
  for m in select user_id from guild_members where guild_id = new.guild_id and user_id <> new.user_id loop
    if not exists (select 1 from notifications where user_id = m.user_id and kind = 'guilde' and read_at is null and created_at > now() - interval '30 minutes')
       and not exists (select 1 from blocks where blocker = m.user_id and blocked = new.user_id) then
      perform g_notify(m.user_id, 'guilde', g, coalesce(new.pseudo, 'Un membre') || ' : ' || new.body, 'profile');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists notify_guild on public.guild_messages;
create trigger notify_guild after insert on public.guild_messages for each row execute function public.t_notify_guild();

-- Duels : ta défense a été attaquée
create or replace function public.t_notify_duel() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(pseudo, 'Un joueur') into who from profiles where id = new.attacker;
  perform g_notify(new.defender, 'duels', 'Ta défense a été attaquée',
    case when new.won then who || ' a battu ta défense.' else 'Ta défense a repoussé ' || who || ' !' end, 'battle');
  return new;
end $$;
drop trigger if exists notify_duel on public.duels;
create trigger notify_duel after insert on public.duels for each row execute function public.t_notify_duel();

-- Pellicules rechargées (pour les joueurs qui ont activé les notifications push), toutes les 5 minutes
create or replace function public.notify_full_films() returns integer
language plpgsql security definer set search_path = public as $$
declare p profiles; n int := 0;
begin
  for p in select pr.* from profiles pr
           where exists (select 1 from push_subscriptions s where s.user_id = pr.id)
             and pr.films < g_film_cap(pr)
             and pr.films_at + make_interval(mins => g_film_minutes(pr) * (g_film_cap(pr) - pr.films)) <= now()
             and (pr.films_notified_at is null or pr.films_notified_at < pr.films_at)
  loop
    perform g_notify(p.id, 'pellicules', 'Pellicules rechargées', format('Tes %s pellicules sont prêtes : un safari t''attend !', g_film_cap(p)), 'safari');
    update profiles set films_notified_at = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Lecture et réglages par le joueur
create or replace function public.get_notifications() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'unread', (select count(*) from notifications where user_id = auth.uid() and read_at is null),
    'list', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id, kind, title, body, tab, created_at, read_at from notifications where user_id = auth.uid() order by created_at desc limit 40) x), '[]'::jsonb),
    'prefs', (select notif from profiles where id = auth.uid()),
    'push', (select count(*) from push_subscriptions where user_id = auth.uid()))
$$;
create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;
create or replace function public.set_notif_prefs(p_prefs jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; clean jsonb := '{}';
begin
  foreach k in array array['pellicules','encheres','amis','guilde','duels'] loop
    clean := clean || jsonb_build_object(k, coalesce((p_prefs->>k)::boolean, true));
  end loop;
  update profiles set notif = clean where id = auth.uid();
end $$;
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'abonnement invalide'; end if;
  if (select count(*) from push_subscriptions where user_id = auth.uid()) >= 10 then
    delete from push_subscriptions where endpoint = (select endpoint from push_subscriptions where user_id = auth.uid() order by created_at limit 1);
  end if;
  insert into push_subscriptions(endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
create or replace function public.push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- Ménage : notifications de plus de 30 jours
create or replace function public.purge_notifications() returns void
language sql security definer set search_path = public as $$
  delete from notifications where created_at < now() - interval '30 days'
$$;

-- ---------------------------------------------------------------------
-- Modération
-- ---------------------------------------------------------------------
-- Texte ramené en minuscules sans accents, chiffres « leet » convertis
create or replace function public.g_norm(t text) returns text language sql immutable as $$
  select translate(lower(coalesce(t, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœ013457@$', 'aaaaaaceeeeiiiinooooouuuuyyooieastas')
$$;
-- Insultes et propos haineux les plus courants (mots entiers seulement : « conifère » passe)
create or replace function public.g_bad(t text) returns boolean language sql immutable as $$
  select g_norm(t) ~ ('\m(' || array_to_string(array[
    'connard','connasse','conasse','salope','salaud','pute','putes','enculee?s?','encule','fdp','ntm','nique','niquer','pd','pede','pedes','tapette','tafiole',
    'batard','batards','bouffon','abruti','debile','gogol','negre','negro','bougnoule','bicot','youpin','youtre','sale juif','sale arabe',
    'nazi','nazis','hitler','heil','kkk','viol','violer','pedophile','pedo','suicide toi','va mourir','va crever',
    'fuck','fucking','bitch','nigger','nigga','faggot','whore','cunt'] , '|') || ')\M')
$$;
-- Pseudos réservés
create or replace function public.g_reserved(t text) returns boolean language sql immutable as $$
  select g_norm(t) ~ '\m(admin|administrateur|moderateur|modo|bestiaire|support|staff|anthropic)\M'
$$;

create or replace function public.t_check_pseudo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pseudo is distinct from old.pseudo and new.pseudo is not null then
    if g_bad(new.pseudo) then raise exception 'pseudo refusé : langage inapproprié'; end if;
    if g_reserved(new.pseudo) and not coalesce(old.is_admin, false) then raise exception 'ce pseudo est réservé'; end if;
  end if;
  return new;
end $$;
drop trigger if exists check_pseudo on public.profiles;
create trigger check_pseudo before update of pseudo on public.profiles for each row execute function public.t_check_pseudo();

create or replace function public.t_check_guild() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if g_bad(new.name) or g_bad(new.tag) or g_bad(new.descr) then raise exception 'texte refusé : langage inapproprié'; end if;
  if tg_op = 'INSERT' and g_reserved(new.name) then raise exception 'ce nom est réservé'; end if;
  return new;
end $$;
drop trigger if exists check_guild on public.guilds;
create trigger check_guild before insert or update on public.guilds for each row execute function public.t_check_guild();

create or replace function public.t_check_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare mu timestamptz;
begin
  if new.user_id is null then return new; end if;
  select muted_until into mu from profiles where id = new.user_id;
  if mu is not null and mu > now() then raise exception 'tu ne peux pas écrire avant le %', to_char(mu at time zone 'Europe/Paris', 'DD/MM à HH24:MI'); end if;
  if g_bad(new.body) then raise exception 'message refusé : langage inapproprié'; end if;
  return new;
end $$;
drop trigger if exists check_message on public.guild_messages;
create trigger check_message before insert on public.guild_messages for each row execute function public.t_check_message();

-- Signalements
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter    uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('message','pseudo','guilde')),
  ref         text not null,               -- id du message, du joueur ou de la guilde
  target_user uuid references public.profiles(id) on delete set null,
  excerpt     text,
  reason      text not null check (reason in ('insulte','harcelement','haine','sexuel','spam','autre')),
  status      text not null default 'open' check (status in ('open','done')),
  created_at  timestamptz not null default now(),
  unique (reporter, kind, ref)
);

create or replace function public.report(p_kind text, p_ref text, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tgt uuid; ex text; n int;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if (select count(*) from reports where reporter = uid and created_at > now() - interval '1 day') >= 20 then raise exception 'trop de signalements aujourd''hui'; end if;
  if p_kind = 'message' then
    select user_id, body into tgt, ex from guild_messages where id = p_ref::bigint and guild_id = g_my_guild(uid);
  elsif p_kind = 'pseudo' then
    select id, pseudo into tgt, ex from profiles where id = p_ref::uuid;
  elsif p_kind = 'guilde' then
    select owner, name || ' [' || tag || '] ' || descr into tgt, ex from guilds where id = p_ref::bigint;
  end if;
  if ex is null then raise exception 'élément introuvable'; end if;
  if tgt = uid then raise exception 'tu ne peux pas te signaler toi-même'; end if;
  insert into reports(reporter, kind, ref, target_user, excerpt, reason) values (uid, p_kind, p_ref, tgt, left(ex, 200), p_reason)
  on conflict (reporter, kind, ref) do nothing;
  -- masquage automatique d'un message signalé par 3 joueurs différents
  if p_kind = 'message' then
    select count(distinct reporter) into n from reports where kind = 'message' and ref = p_ref;
    if n >= 3 then update guild_messages set hidden = true where id = p_ref::bigint; return 'masqué'; end if;
  end if;
  return 'signalé';
end $$;

create or replace function public.block_user(p_other uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_other = auth.uid() then raise exception 'action impossible'; end if;
  if p_on then
    insert into blocks(blocker, blocked) values (auth.uid(), p_other) on conflict do nothing;
    delete from friendships where a = least(auth.uid(), p_other) and b = greatest(auth.uid(), p_other);
  else
    delete from blocks where blocker = auth.uid() and blocked = p_other;
  end if;
end $$;

create or replace function public.my_blocks() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.blocked, 'pseudo', coalesce(p.pseudo, 'Joueur'))), '[]'::jsonb)
  from blocks b join profiles p on p.id = b.blocked where b.blocker = auth.uid()
$$;

-- Outils de l'administrateur (profiles.is_admin = true, à activer à la main dans Supabase)
create or replace function public.g_admin() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then raise exception 'réservé à l''administrateur'; end if;
end $$;

create or replace function public.admin_reports() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform g_admin();
  return coalesce((select jsonb_agg(x order by x.n desc, x.last desc) from (
    select r.kind, r.ref, max(r.excerpt) as excerpt, r.target_user, (select pseudo from profiles where id = r.target_user) as target,
      count(*) as n, array_agg(distinct r.reason) as reasons, max(r.created_at) as last,
      (select muted_until from profiles where id = r.target_user) as muted_until
    from reports r where r.status = 'open' group by r.kind, r.ref, r.target_user) x), '[]'::jsonb);
end $$;

create or replace function public.admin_act(p_kind text, p_ref text, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare tgt uuid;
begin
  perform g_admin();
  select target_user into tgt from reports where kind = p_kind and ref = p_ref limit 1;
  if p_action = 'masquer' and p_kind = 'message' then update guild_messages set hidden = true where id = p_ref::bigint;
  elsif p_action = 'pseudo' then update profiles set pseudo = null where id = tgt;
  elsif p_action = 'guilde' and p_kind = 'guilde' then
    update guilds set name = 'Guilde ' || id, descr = '' where id = p_ref::bigint;
  elsif p_action = 'muet' then update profiles set muted_until = now() + interval '7 days' where id = tgt;
  elsif p_action = 'bannir' then
    update profiles set muted_until = now() + interval '100 years', pseudo = null where id = tgt;
    update guild_messages set hidden = true where user_id = tgt;
    delete from defenses where owner = tgt;
  elsif p_action <> 'ignorer' then raise exception 'action inconnue';
  end if;
  update reports set status = 'done' where kind = p_kind and ref = p_ref;
end $$;

-- ---------------------------------------------------------------------
-- Sécurité
-- ---------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reports enable row level security;
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select using (user_id = auth.uid());
revoke all on public.notifications, public.push_subscriptions, public.reports from anon, authenticated;
grant select on public.notifications to authenticated;
-- push_subscriptions et reports : aucune lecture directe (fonctions uniquement)

revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_state(), public.safari_shoot(text), public.fuse(text,int), public.quick_sell(bigint),
  public.list_auction(bigint,int,int,int), public.place_bid(bigint,int), public.get_bot_offers(), public.buy_bot_offer(bigint),
  public.claim_quest(int), public.battle_reward(boolean,text[],int[]), public.save_defense(bigint[]), public.record_duel(uuid,boolean),
  public.settle_auctions(),
  public.get_achievements(), public.claim_achievement(text),
  public.friend_request(text), public.friend_respond(uuid,boolean), public.friend_remove(uuid), public.get_friends(), public.friend_profile(uuid),
  public.guild_create(text,text,text,text), public.guild_list(text), public.guild_join(bigint), public.guild_leave(),
  public.guild_manage(uuid,text), public.guild_update(text,boolean), public.guild_post(text), public.guild_claim_week(), public.guild_get(),
  public.g_my_guild(uuid), public.delete_my_account(),
  public.get_notifications(), public.mark_notifications_read(), public.set_notif_prefs(jsonb), public.push_subscribe(text,text,text), public.push_unsubscribe(text),
  public.report(text,text,text), public.block_user(uuid,boolean), public.my_blocks(), public.admin_reports(), public.admin_act(text,text,text)
  to authenticated;
grant execute on function public.g_cote(int,int,int,boolean), public.g_qindex(int) to anon, authenticated;

-- Notifications en temps réel dans l'appli + tâches planifiées (si disponibles)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('bestiaire-films-pleines', '*/5 * * * *', 'select public.notify_full_films()');
    perform cron.schedule('bestiaire-purge-notifs', '17 4 * * *', 'select public.purge_notifications()');
  end if;
end $$;
