-- =====================================================================
-- Bestiaire — 004 : progression RPG (expérience, niveaux) et mode Aventure
-- À exécuter APRÈS 001, 002 et 003. Idempotent : peut être relancé sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Expérience des cartes. Le niveau se calcule : il est plafonné par le rang (étoiles de fusion).
-- Formules identiques à src/game/rpg.ts
-- ---------------------------------------------------------------------
alter table public.cards add column if not exists xp integer not null default 0 check (xp >= 0);

create or replace function public.g_niv_max(p_rang int) returns int language sql immutable as $$
  select 5 + 5 * greatest(1, least(7, coalesce(p_rang, 1)))
$$;
create or replace function public.g_xp_pour(p_niv int) returns int language sql immutable as $$
  select 5 * p_niv * p_niv + 25 * p_niv - 30
$$;
create or replace function public.g_niv(p_xp int, p_rang int) returns int language sql immutable as $$
  select least(public.g_niv_max(p_rang),
               greatest(1, floor((-25 + sqrt(625 + 20 * (greatest(coalesce(p_xp, 0), 0) + 30))) / 10 + 1e-9)::int))
$$;

-- Progression de l'aventure : { "numéro d'étape": étoiles } + compteur journalier d'expérience
alter table public.profiles add column if not exists adv jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists xp_day date;
alter table public.profiles add column if not exists xp_count integer not null default 0;

-- ---------------------------------------------------------------------
-- Fusion : la carte obtenue garde la meilleure expérience des deux
-- ---------------------------------------------------------------------
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
  insert into cards(owner, species_id, q, lvl, biome, phase, xp) values (uid, p_species, newq, p_lvl + 1, a.biome, a.phase, greatest(a.xp, b.xp)) returning id into nid;
  perform g_quest_event(uid, 'fuse');
  return jsonb_build_object('id', nid, 'species_id', p_species, 'q', newq, 'lvl', p_lvl + 1, 'up', up,
    'a', jsonb_build_object('q', a.q, 'lvl', a.lvl, 'biome', a.biome, 'phase', a.phase),
    'b', jsonb_build_object('q', b.q, 'lvl', b.lvl, 'biome', b.biome, 'phase', b.phase));
end $$;

-- Équipe de défense : on enregistre aussi le niveau de chaque animal
create or replace function public.save_defense(p_cards bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t jsonb; n int;
begin
  if coalesce(array_length(p_cards,1),0) not between 1 and 3 then raise exception 'choisis 1 à 3 animaux'; end if;
  select count(*), jsonb_agg(jsonb_build_object('species_id', species_id, 'lvl', lvl, 'q', q, 'niv', g_niv(xp, lvl))) into n, t
    from cards where owner = uid and status = 'owned' and id = any(p_cards);
  if n <> array_length(p_cards,1) then raise exception 'carte introuvable'; end if;
  insert into defenses(owner, team, rating, pseudo, updated_at)
  values (uid, t, (select rating from profiles where id = uid), (select pseudo from profiles where id = uid), now())
  on conflict (owner) do update set team = excluded.team, rating = excluded.rating, pseudo = excluded.pseudo, updated_at = now();
end $$;

-- ---------------------------------------------------------------------
-- Expérience : ajoute de l'expérience à 1 à 3 cartes du joueur (60 combats récompensés par jour)
-- Renvoie [{id, xp, niv, avant}] pour l'animation de montée de niveau
-- ---------------------------------------------------------------------
create or replace function public.g_give_xp(p_uid uuid, p_cards bigint[], p_gain int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles; d date; res jsonb := '[]'::jsonb; c cards; nx int;
begin
  if coalesce(array_length(p_cards,1),0) not between 1 and 3 then raise exception 'choisis 1 à 3 animaux'; end if;
  if (select count(*) from cards where owner = p_uid and status = 'owned' and id = any(p_cards)) <> array_length(p_cards,1) then
    raise exception 'carte introuvable';
  end if;
  select * into p from profiles where id = p_uid for update;
  d := (now() at time zone p.tz)::date;
  if p.xp_day is distinct from d then p.xp_count := 0; end if;
  if p.xp_count >= 60 then
    update profiles set xp_day = d, xp_count = p.xp_count where id = p_uid;
    return jsonb_build_object('cap', true, 'cards', res);
  end if;
  update profiles set xp_day = d, xp_count = p.xp_count + 1 where id = p_uid;
  for c in select * from cards where owner = p_uid and id = any(p_cards) for update loop
    nx := least(c.xp + greatest(p_gain, 0), g_xp_pour(g_niv_max(c.lvl)));      -- au plafond, l'expérience ne s'accumule plus
    update cards set xp = nx where id = c.id;
    res := res || jsonb_build_object('id', c.id, 'xp', nx, 'niv', g_niv(nx, c.lvl), 'avant', g_niv(c.xp, c.lvl));
  end loop;
  return jsonb_build_object('cap', false, 'cards', res);
end $$;

-- Combats sauvages et duels : un peu d'expérience pour l'équipe
create or replace function public.battle_xp(p_cards bigint[], p_won boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  return g_give_xp(auth.uid(), p_cards, case when p_won then 12 else 4 end);
end $$;

-- ---------------------------------------------------------------------
-- Aventure : 60 étapes (6 chapitres × 10). Formules identiques à src/game/adventure.ts
-- ---------------------------------------------------------------------
create or replace function public.adventure_state() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('adv', adv, 'xp_count', case when xp_day = (now() at time zone tz)::date then xp_count else 0 end)
  from profiles where id = auth.uid()
$$;

create or replace function public.adventure_win(p_stage int, p_won boolean, p_stars int, p_cards bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p profiles; prev int; st int; gain int := 0; film boolean := false; xpr jsonb; boss boolean;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if p_stage is null or p_stage < 0 or p_stage > 59 then raise exception 'étape inconnue'; end if;
  select * into p from profiles where id = uid for update;
  if p_stage > 0 and not (p.adv ? (p_stage - 1)::text) then raise exception 'termine d''abord l''étape précédente'; end if;
  boss := p_stage % 10 = 9;
  xpr := g_give_xp(uid, p_cards, case when p_won then 15 + 3 * p_stage else 5 end);
  if not p_won then
    update profiles set losses = losses + 1 where id = uid;
    return jsonb_build_object('stars', 0, 'plumes', 0, 'film', false, 'xp', xpr, 'adv', p.adv);
  end if;
  st := greatest(1, least(3, coalesce(p_stars, 1)));
  prev := (p.adv ->> p_stage::text)::int;
  if prev is null then
    gain := 20 + 4 * p_stage + (case when boss then 100 else 0 end);
    film := boss;
  end if;
  if st = 3 and coalesce(prev, 0) < 3 then gain := gain + 15; end if;
  update profiles set
    adv = jsonb_set(adv, array[p_stage::text], to_jsonb(greatest(st, coalesce(prev, 0)))),
    plumes = plumes + gain, wins = wins + 1,
    films = case when film then least(9, films + 1) else films end
  where id = uid returning adv into p.adv;
  perform g_quest_event(uid, 'win');
  return jsonb_build_object('stars', st, 'first', prev is null, 'plumes', gain, 'film', film, 'xp', xpr, 'adv', p.adv);
end $$;

-- ---------------------------------------------------------------------
-- Droits (comme dans 003 : on retire tout puis on réaccorde ; à relancer si 002/003 sont relancés)
-- ---------------------------------------------------------------------
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
  public.report(text,text,text), public.block_user(uuid,boolean), public.my_blocks(), public.admin_reports(), public.admin_act(text,text,text),
  public.battle_xp(bigint[],boolean), public.adventure_state(), public.adventure_win(int,boolean,int,bigint[])
  to authenticated;
grant execute on function public.g_cote(int,int,int,boolean), public.g_qindex(int),
  public.g_niv(int,int), public.g_niv_max(int), public.g_xp_pour(int) to anon, authenticated;
