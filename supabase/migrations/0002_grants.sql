-- House Fight: permessi per le API
-- I progetti Supabase nuovi non danno più in automatico i permessi sulle tabelle di "public"
-- ai ruoli delle API: senza questi l'app riceve "permission denied for table ...".
-- Chi può vedere cosa lo decidono comunque le regole RLS dello schema iniziale.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.households, public.members, public.chores, public.completions,
  public.dinners, public.push_subscriptions
to authenticated, service_role;

grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.create_household(text, text, text, text) to authenticated;
grant execute on function public.join_household(text, text, text, text) to authenticated;
