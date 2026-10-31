-- House Fight: nuova scala dei punti
-- La faccenda più pesante vale 7 punti, una facile tra 0,5 e 1,5. Visto che i punti sono
-- circa un quarto di prima, il moltiplicatore della cena di partenza passa da 0,50 € a 2 €.
-- Si può eseguire più volte: tocca solo le case ancora nella scala vecchia (qualche faccenda sopra 7).

alter table public.households alter column dinner_rate set default 2;

do $$
declare hid uuid;
begin
  for hid in select household_id from public.chores group by household_id having max(points) > 7 loop
    -- le faccende di partenza prendono il nuovo valore, le altre scalano in proporzione (25 → 7),
    -- arrotondate a mezzo punto
    update public.chores set points = case name
      when 'Pulire il bagno'       then 7
      when 'Lavare i pavimenti'    then 5
      when 'Stirare'               then 5
      when 'Cucinare'              then 3.5
      when 'Aspirapolvere'         then 3.5
      when 'Fare la spesa'         then 3
      when 'Cambiare le lenzuola'  then 2.5
      when 'Lavare i piatti'       then 2
      when 'Lavatrice'             then 1.5
      when 'Stendere / ritirare'   then 1.5
      when 'Lavastoviglie'         then 1
      when 'Buttare la spazzatura' then 0.5
      else least(1000, greatest(0.5, round(points * 0.28 * 2) / 2))
    end
    where household_id = hid;

    -- anche le faccende già segnate passano alla nuova scala, così il mese resta confrontabile
    update public.completions c set points = ch.points
    from public.chores ch
    where c.chore_id = ch.id and c.household_id = hid;

    update public.households set dinner_rate = 2 where id = hid and dinner_rate = 0.5;
  end loop;
end $$;

-- Le case nuove partono già con la nuova scala
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
    (hid, 'Lavare i piatti',          '🍽️', 2),
    (hid, 'Lavastoviglie',            '🫧', 1),
    (hid, 'Cucinare',                 '🍳', 3.5),
    (hid, 'Fare la spesa',            '🛒', 3),
    (hid, 'Aspirapolvere',            '🧹', 3.5),
    (hid, 'Lavare i pavimenti',       '🪣', 5),
    (hid, 'Pulire il bagno',          '🚽', 7),
    (hid, 'Lavatrice',                '🧺', 1.5),
    (hid, 'Stendere / ritirare',      '👕', 1.5),
    (hid, 'Stirare',                  '🔥', 5),
    (hid, 'Buttare la spazzatura',    '🗑️', 0.5),
    (hid, 'Cambiare le lenzuola',     '🛏️', 2.5);
  return hid;
end $$;
