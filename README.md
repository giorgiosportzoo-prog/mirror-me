# Mirror Me

Crea il tuo gemello digitale da chat, note e messaggi.

## Stack
- **Frontend**: React + Vite → Vercel
- **Backend**: Node.js + Express → Railway
- **DB**: Supabase (Postgres)
- **AI**: Anthropic Claude

## Setup in 5 passi

### 1. Supabase
1. Crea un progetto su supabase.com
2. Vai su SQL Editor e incolla il contenuto di `supabase_schema.sql`
3. Copia `Project URL` e `service_role key` dalle Settings → API

### 2. Backend su Railway
1. Crea un nuovo progetto su railway.app
2. Collega il repo GitHub → seleziona la cartella `backend`
3. Aggiungi le variabili d'ambiente:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   FRONTEND_URL=https://mirror-me.vercel.app
   PORT=3001
   ```
4. Railway deploya automaticamente ad ogni push

### 3. Frontend su Vercel
1. Crea un nuovo progetto su vercel.com
2. Collega il repo GitHub → seleziona la cartella `frontend`
3. Aggiungi la variabile d'ambiente:
   ```
   VITE_API_URL=https://mirror-me.up.railway.app
   ```
4. Vercel deploya automaticamente ad ogni push

### 4. Aggiorna FRONTEND_URL
Dopo il primo deploy Vercel, copia l'URL e aggiornalo in Railway come `FRONTEND_URL`.

### 5. Pronto
Vai su `https://mirror-me.vercel.app` e carica le tue prime chat.

## Sviluppo locale

```bash
# Backend
cd backend
cp .env.example .env  # compila le variabili
npm install
npm run dev

# Frontend (altro terminale)
cd frontend
cp .env.example .env  # compila VITE_API_URL=http://localhost:3001
npm install
npm run dev
```

## Come funziona il gemellaggio

Il punteggio è calibrato sulla quantità di materiale:
- < 200 parole → max 25%
- 200-500 → max 35%
- 500-1500 → max 50%
- 1500-5000 → max 65%
- 5000-15000 → max 78%
- 15000+ → max 88%

Il gemello impara ogni giorno automaticamente dalla chat — il punteggio sale di max 3 punti per aggiornamento.
