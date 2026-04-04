# Migration Guide: Supabase + Vercel

This guide walks you through setting up the new dynamic Madrid Film Calendar with **Supabase** (PostgreSQL database) and **Vercel** (frontend hosting). Both have generous free tiers.

---

## 1. Set up Supabase (Database)

### Create a project

1. Go to [supabase.com](https://supabase.com) and sign up (GitHub login works)
2. Click **New Project**
3. Choose an org, set a **project name** (e.g. `film-calendar`) and a **database password** (save it!)
4. Select **Region**: choose one close to Madrid (e.g. `eu-west-1` Frankfurt or `eu-west-2` London)
5. Click **Create new project** — wait ~2 minutes for provisioning

### Set timezone to Madrid

1. Go to **Dashboard → SQL Editor**
2. Run:
   ```sql
   ALTER DATABASE postgres SET timezone TO 'Europe/Madrid';
   ```

### Create the schema

1. Stay in **SQL Editor**
2. Open `supabase/schema.sql` from this repo, copy and paste the entire contents
3. Click **Run** — this creates the `films` and `screenings` tables with indexes and RLS policies

### Get your API credentials

Go to **Dashboard → Settings → API**. You need two values:

| Key | Where to find it | Used by |
|-----|------------------|---------|
| **Project URL** | `https://YOUR_REF.supabase.co` | Frontend + upload script |
| **Publishable key** (`sb_publishable_...`) | Under "Publishable and secret API keys" | Frontend (safe to expose) |
| **Secret key** (`sb_secret_...`) | Under "Publishable and secret API keys" | Upload script only (KEEP SECRET) |

Use the new **Publishable + Secret** keys. The "legacy anon/service_role" tab is for older projects.

---

## 2. Upload your data to Supabase

### Install Python dependencies

```bash
pip install supabase python-dotenv
```

### Run the upload script

```bash
export SUPABASE_URL="https://YOUR_REF.supabase.co"
export SUPABASE_SECRET_KEY="sb_secret_...your-secret-key..."

python scripts/upload_to_supabase.py --json docs/screenings.json --clear
```

The `--clear` flag deletes existing data first (useful for full refreshes). Without it, the script upserts (updates existing, inserts new).

You should see output like:
```
Loaded 150 films from docs/screenings.json
Clearing existing data...
  Cleared.
✓ Done!
  New films inserted:  150
  Screenings upserted: 480
```

### Verify in Supabase

Go to **Dashboard → Table Editor** — you should see your films and screenings tables populated.

---

## 3. Set up Vercel (Frontend)

### Create a Vercel account

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. The free "Hobby" plan is enough

### Deploy the Next.js app

**Option A: Deploy from GitHub (recommended)**

1. Push your repo to GitHub (if not already)
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your GitHub repo
4. Set **Root Directory** to `web` (important! the Next.js app is in the `web/` subfolder)
5. Vercel auto-detects Next.js — no framework config needed
6. Add **Environment Variables** before deploying:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://YOUR_REF.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...`
   - `NEXT_PUBLIC_GA_ID` = `G-FKN0ELREQD` (optional, for Google Analytics)
7. Click **Deploy**

**Option B: Deploy from CLI**

```bash
npm install -g vercel
cd web
vercel
# Follow prompts, set root to current directory
# Add env vars when prompted or later in dashboard
```

### Custom domain (optional)

1. Go to your project on Vercel → **Settings → Domains**
2. Add your domain and follow DNS instructions
3. Vercel handles HTTPS automatically

---

## 4. Ongoing workflow

Your daily scrape + update workflow becomes:

```bash
# 1. Scrape theaters (same as before)
python main.py scrape --output scraped.csv

# 2. Match on Letterboxd (same as before)
python main.py match --input scraped.csv --output matched.csv

# 3. Update master JSON (same as before)
python main.py update --input matched.csv

# 4. NEW: Push data to Supabase
export SUPABASE_URL="https://YOUR_REF.supabase.co"
export SUPABASE_SECRET_KEY="sb_secret_..."
python scripts/upload_to_supabase.py --json docs/screenings.json --clear
```

Step 4 is the only new step. The frontend reads from Supabase in real-time, so updates are instant.

---

## 5. Local development

```bash
cd web

# Create .env.local from template
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:3000
```

---

## Architecture

```
┌──────────────┐     scrape + match      ┌──────────────┐
│  Python CLI  │ ──────────────────────── │ screenings   │
│  (main.py)   │                          │   .json      │
└──────────────┘                          └──────┬───────┘
                                                 │
                                                 │ upload_to_supabase.py
                                                 ▼
                                          ┌──────────────┐
                                          │   Supabase   │
                                          │  PostgreSQL  │
                                          └──────┬───────┘
                                                 │
                                                │ supabase-js (publishable key)
                                                 ▼
                                          ┌──────────────┐
                                          │   Vercel     │
                                          │  (Next.js)   │
                                          │  Frontend    │
                                          └──────────────┘
```

---

## Free tier limits

| Service | Free tier includes |
|---------|-------------------|
| **Supabase** | 500 MB database, 1 GB file storage, 2 GB bandwidth, 50K monthly active users, unlimited API requests |
| **Vercel** | 100 GB bandwidth/month, serverless functions, automatic HTTPS, GitHub integration |

Both are more than enough for this project.

---

## File structure

```
web/                          ← Next.js app (deploy this to Vercel)
├── src/
│   ├── app/
│   │   ├── layout.tsx        ← Root layout (meta tags, GA, structured data)
│   │   ├── page.tsx          ← Entry page
│   │   └── globals.css       ← All CSS (ported from docs/style.css)
│   ├── components/
│   │   └── FilmCalendar.tsx  ← Main client component (all UI logic)
│   └── lib/
│       ├── supabase.ts       ← Supabase client
│       ├── types.ts          ← TypeScript types
│       └── translations.ts   ← i18n (ES/EN)
├── public/                   ← Static assets (favicons, SVGs)
├── package.json
├── next.config.js
└── .env.local.example

supabase/
└── schema.sql                ← Database schema (run in Supabase SQL Editor)

scripts/
└── upload_to_supabase.py     ← Data upload script
```
