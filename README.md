# 🥊🏠 House Fight

La sfida delle faccende di casa per due. Ogni faccenda vale dei punti, chi la fa la segna,
**l'altro la deve validare**, e a fine mese chi ha più punti si fa offrire la cena.

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
- **Cena di fine mese**: banner con chi vince e chi paga, da segnare come "pagata"; albo d'oro nelle statistiche
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

Serve: un progetto [Supabase](https://supabase.com) (piano gratuito) e GitHub Pages.

### 1. Database

1. Crea un progetto su Supabase.
2. **SQL Editor** → incolla ed esegui `supabase/migrations/0001_init.sql`.
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

### 3. GitHub Pages

Nel repository GitHub:

1. **Settings → Pages → Source: GitHub Actions** (sul piano gratuito il repo deve essere pubblico).
2. **Settings → Secrets and variables → Actions**
   - *Variables*: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (la chiave *anon/publishable*, è pubblica
     per design: i dati sono protetti dalle regole RLS), `VITE_VAPID_PUBLIC_KEY`
   - *Secrets*: `CRON_SECRET` (la stessa stringa usata sopra)
3. Ogni push su `main` pubblica l'app su `https://<utente>.github.io/<repo>/`.
   Il workflow *Risultato del mese* manda la notifica del vincitore il primo di ogni mese.

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
  functions/notify/         Edge Function che invia le notifiche push
```
