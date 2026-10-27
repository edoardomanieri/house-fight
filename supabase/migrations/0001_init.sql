-- House Fight: schema iniziale
-- Esegui questo file nel SQL Editor di Supabase (oppure `supabase db push`).

create extension if not exists pgcrypto;

-- ───────────────────────── Tabelle ─────────────────────────

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Casa' check (char_length(name) between 1 and 40),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  emoji        text not null default '🦸',
  color        text not null default '#eb6834' check (color ~ '^#[0-9a-fA-F]{6}$'),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table public.chores (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  emoji        text not null default '🧹',
  points       int  not null check (points between 1 and 1000),
  archived     boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index chores_household_idx on public.chores (household_id);

create table public.completions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  chore_id     uuid references public.chores(id) on delete set null,
  chore_name   text not null,
  chore_emoji  text not null,
  points       int  not null,
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  done_at      timestamptz not null default now(),
  note         text check (note is null or char_length(note) <= 200),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text check (review_note is null or char_length(review_note) <= 200),
  created_at   timestamptz not null default now()
);
create index completions_household_done_idx on public.completions (household_id, done_at);

-- Cene di fine mese segnate come pagate
create table public.dinners (
  household_id uuid not null references public.households(id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  paid_at      timestamptz not null default now(),
  primary key (household_id, month)
);

create table public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Helper ─────────────────────────

create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where household_id = hid and user_id = auth.uid());
$$;

-- ───────────────────────── Trigger completions ─────────────────────────

-- In inserimento: snapshot di nome/emoji/punti della faccenda, sempre "pending".
create or replace function public.completions_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.chores;
begin
  select * into c from public.chores where id = new.chore_id;
  if c.id is null then raise exception 'Faccenda inesistente'; end if;
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  new.household_id := c.household_id;
  new.chore_name   := c.name;
  new.chore_emoji  := c.emoji;
  new.points       := c.points;
  new.status       := 'pending';
  new.reviewed_by  := null;
  new.reviewed_at  := null;
  new.review_note  := null;
  if new.done_at > now() + interval '5 minutes' then
    raise exception 'Non puoi segnare faccende nel futuro';
  end if;
  return new;
end $$;

create trigger completions_before_insert
  before insert on public.completions
  for each row execute function public.completions_before_insert();

-- In aggiornamento: solo l'altro può validare una faccenda in attesa.
create or replace function public.completions_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role

  -- campi immutabili
  new.household_id := old.household_id;
  new.chore_id     := old.chore_id;
  new.chore_name   := old.chore_name;
  new.chore_emoji  := old.chore_emoji;
  new.points       := old.points;
  new.user_id      := old.user_id;
  new.done_at      := old.done_at;
  new.created_at   := old.created_at;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'Questa faccenda è già stata valutata';
    end if;
    if old.user_id = auth.uid() then
      raise exception 'Non puoi validare le tue faccende';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
    if old.user_id <> auth.uid() then new.note := old.note; end if;
  end if;
  return new;
end $$;

create trigger completions_before_update
  before update on public.completions
  for each row execute function public.completions_before_update();

-- ───────────────────────── RPC: crea / unisciti ─────────────────────────

create or replace function public.create_household(
  p_name text, p_display_name text, p_emoji text, p_color text
) returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Fai già parte di una casa';
  end if;

  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Casa'))
    returning id into hid;
  insert into public.members (household_id, user_id, display_name, emoji, color)
    values (hid, auth.uid(), trim(p_display_name), p_emoji, p_color);

  insert into public.chores (household_id, name, emoji, points) values
    (hid, 'Lavare i piatti',          '🍽️', 10),
    (hid, 'Lavastoviglie',            '🫧',  5),
    (hid, 'Cucinare',                 '🍳', 15),
    (hid, 'Fare la spesa',            '🛒', 15),
    (hid, 'Aspirapolvere',            '🧹', 15),
    (hid, 'Lavare i pavimenti',       '🪣', 20),
    (hid, 'Pulire il bagno',          '🚽', 25),
    (hid, 'Lavatrice',                '🧺', 10),
    (hid, 'Stendere / ritirare',      '👕',  5),
    (hid, 'Stirare',                  '🔥', 20),
    (hid, 'Buttare la spazzatura',    '🗑️',  5),
    (hid, 'Cambiare le lenzuola',     '🛏️', 10);
  return hid;
end $$;

create or replace function public.join_household(
  p_code text, p_display_name text, p_emoji text, p_color text
) returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Fai già parte di una casa';
  end if;
  select id into hid from public.households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'Codice invito non valido'; end if;
  if (select count(*) from public.members where household_id = hid) >= 2 then
    raise exception 'Questa casa ha già due giocatori';
  end if;
  insert into public.members (household_id, user_id, display_name, emoji, color)
    values (hid, auth.uid(), trim(p_display_name), p_emoji, p_color);
  return hid;
end $$;

revoke execute on function public.create_household(text, text, text, text) from anon;
revoke execute on function public.join_household(text, text, text, text) from anon;

-- ───────────────────────── RLS ─────────────────────────

alter table public.households         enable row level security;
alter table public.members            enable row level security;
alter table public.chores             enable row level security;
alter table public.completions        enable row level security;
alter table public.dinners            enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "households: lettura membri" on public.households
  for select using (public.is_member(id));
create policy "households: modifica membri" on public.households
  for update using (public.is_member(id)) with check (public.is_member(id));

create policy "members: lettura" on public.members
  for select using (public.is_member(household_id));
create policy "members: modifica il proprio profilo" on public.members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "chores: lettura" on public.chores
  for select using (public.is_member(household_id));
create policy "chores: inserimento" on public.chores
  for insert with check (public.is_member(household_id));
create policy "chores: modifica" on public.chores
  for update using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "chores: cancellazione" on public.chores
  for delete using (public.is_member(household_id));

create policy "completions: lettura" on public.completions
  for select using (public.is_member(household_id));
create policy "completions: inserimento" on public.completions
  for insert with check (public.is_member(household_id) and user_id = auth.uid());
create policy "completions: modifica" on public.completions
  for update using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "completions: annulla le proprie in attesa" on public.completions
  for delete using (user_id = auth.uid() and status = 'pending');

create policy "dinners: tutto" on public.dinners
  for all using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy "push: le proprie" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── Realtime ─────────────────────────

alter publication supabase_realtime add table
  public.households, public.members, public.chores, public.completions, public.dinners;
