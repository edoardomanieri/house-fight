# 🥊🏠 House Fight

La sfida delle faccende di casa per due. Ogni faccenda vale dei punti, chi la fa la segna,
**l'altro la deve validare**, e a fine mese chi perde offre una cena che vale
**la differenza di punti × un moltiplicatore** (es. 2 € a punto).

È una **PWA**: si apre dal browser e si installa sulla schermata Home (iPhone e Android),
funziona anche offline per la consultazione e manda **notifiche push**.

## Cosa fa

- **Sfida del mese**: punteggio in tempo reale, barra del tiro alla fune, chi è in testa, serie di giorni consecutivi 🔥
- **Faccende**: crea, modifica, archivia; ogni faccenda ha emoji e valore in punti
  (cambiare il valore non tocca i punti già guadagnati)
- **Segna "fatta"** con un tocco, anche per ieri o per qualche giorno fa, con una nota facoltativa
- **Validazione**: i punti contano solo dopo che l'altro ha premuto ✓ (oppure ✕ spiegando il motivo).
  Il database impedisce di validare le proprie faccende o di cambiarne i punti.
- **🔔 Stuzzica**: ricorda al partner che hai faccende in attesa
- **Cena di fine mese**: vale `distacco × €/punto` (moltiplicatore in *Profilo*, arrotondato ai 50 cent).
  In home vedi in diretta "se finisse ora" quanto vale la cena; a fine mese un banner dice chi paga e
  quanto, da segnare come "pagata" (l'importo resta registrato). Albo d'oro ed euro vinti nelle statistiche.
- **Statistiche** per mese, per anno e da sempre: gara giorno per giorno, punti per mese, classifica
  delle faccende, giorni della settimana, record personali
- **Storico** filtrabile per persona e stato
- **Notifiche**: nuova faccenda da validare, faccenda validata/rifiutata, stuzzicata, risultato del mese.
  Badge sull'icona con il numero di faccende da validare.

## Modalità demo

Senza configurazione l'app parte in **modalità demo**: dati finti salvati solo sul dispositivo e
un pulsante in alto per "giocare come" l'altra persona e provare la validazione.

```bash
npm install
npm run dev
```

## Messa online (gratis)

Serve: un progetto [Supabase](https://supabase.com) (piano Free) e [Vercel](https://vercel.com) (piano Hobby).

### 1. Database

1. Crea un progetto su Supabase.
2. **SQL Editor** → incolla ed esegui `supabase/migrations/0001_init.sql`, poi `0002_grants.sql`
   (i permessi delle API: senza, l'app dà "permission denied for table") e `0003_decimal_points.sql`
   (punti con la virgola), infine `0004_points_scale.sql` (scala da 0,5 a 7 punti).
3. **Authentication → Sign In / Providers → Email**: per semplicità puoi disattivare
   *Confirm email* (altrimenti imposta in **Authentication → URL Configuration** come *Site URL*
   l'indirizzo dell'app).

### 2. Notifiche push

```bash
npx web-push generate-vapid-keys          # genera chiave pubblica e privata

npx supabase login
npx supabase link --project-ref <id-progetto>
npx supabase secrets set \
  VAPID_PUBLIC_KEY=<pubblica> \
  VAPID_PRIVATE_KEY=<privata> \
  VAPID_SUBJECT=mailto:<tua-email> \
  CRON_SECRET=<una-stringa-casuale>
npx supabase functions deploy notify --no-verify-jwt
```

Per la notifica del vincitore il primo del mese: **Database → Extensions** abilita `pg_cron` e
`pg_net`, poi esegui `supabase/cron.sql` (dopo averci messo id del progetto e `CRON_SECRET`).

### 3. Vercel

1. Su vercel.com → **Add New → Project** → importa questo repository (va bene anche privato).
   Vercel riconosce Vite da solo.
2. In **Environment Variables** aggiungi `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (la chiave *anon/publishable*: è pubblica per design, i dati sono protetti dalle regole RLS)
   e `VITE_VAPID_PUBLIC_KEY`. Senza queste l'app parte in modalità demo.
3. **Deploy**. Ogni push su `main` aggiorna l'app su `https://<progetto>.vercel.app`.

### 4. Installazione sui telefoni

- **iPhone**: apri il link in Safari → *Condividi* → *Aggiungi alla schermata Home*, poi apri l'app
  da lì (su iOS le notifiche funzionano solo dall'app installata, iOS 16.4+).
- **Android**: Chrome → menu → *Installa app*.

Poi: uno dei due si registra e **crea la casa**, l'altro si registra e inserisce il **codice invito**.
Da **Profilo → Attiva notifiche** ognuno abilita le notifiche sul proprio telefono.

## Struttura

```
src/
  App.tsx, store.tsx        navigazione, stato globale, realtime, toast
  screens/                  Sfida, Faccende, Storico, Statistiche, Profilo, accesso
  components/               UI e grafici SVG interattivi
  lib/
    supabaseBackend.ts      dati su Supabase (auth, tabelle, realtime)
    demoBackend.ts          dati locali per la modalità demo
    stats.ts                calcoli di punteggi e statistiche
    notifications.ts        push, notifiche locali, badge
public/sw.js                service worker (offline + push)
supabase/
  migrations/0001_init.sql  tabelle, regole di sicurezza (RLS), trigger di validazione
  migrations/0002_grants.sql permessi delle tabelle per i ruoli delle API
  migrations/0003_decimal_points.sql punti con la virgola
  migrations/0004_points_scale.sql   scala dei punti (max 7) e faccende di partenza
  functions/notify/         Edge Function che invia le notifiche push
```
