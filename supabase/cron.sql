-- House Fight: notifica del vincitore il primo di ogni mese (ore 9 italiane circa)
-- 1. Database → Extensions: abilita "pg_cron" e "pg_net"
-- 2. Sostituisci <ID-PROGETTO> e <CRON_SECRET> ed esegui nel SQL Editor

select cron.schedule(
  'house-fight-monthly',
  '17 7 1 * *',
  $$
  select net.http_post(
    url     := 'https://<ID-PROGETTO>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{"type":"monthly"}'::jsonb
  );
  $$
);

-- Per provarla subito (manda la notifica del mese scorso):
-- select net.http_post(url := '...', headers := ..., body := '{"type":"monthly"}'::jsonb);
