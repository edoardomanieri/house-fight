-- House Fight: faccenda fatta a metà
-- Chi la segna può dire che l'ha fatta solo in parte (es. stirato pochi panni): vale metà dei punti.
-- Lo decide solo chi la segna, e solo all'inserimento: chi valida lo vede e può rifiutarla.

alter table public.completions add column half boolean not null default false;

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
  new.half         := coalesce(new.half, false);
  new.points       := case when new.half then round(c.points * 0.5, 2) else c.points end;
  new.status       := 'pending';
  new.reviewed_by  := null;
  new.reviewed_at  := null;
  new.review_note  := null;
  if new.done_at > now() + interval '5 minutes' then
    raise exception 'Non puoi segnare faccende nel futuro';
  end if;
  return new;
end $$;

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
  new.half         := old.half;
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
