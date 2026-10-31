-- House Fight: punti con la virgola (es. 2,5)
-- Fino a due decimali; una faccenda vale più di 0 e al massimo 1000 punti.

alter table public.chores drop constraint if exists chores_points_check;
alter table public.chores alter column points type numeric(6, 2);
alter table public.chores add constraint chores_points_check check (points > 0 and points <= 1000);

alter table public.completions alter column points type numeric(6, 2);
