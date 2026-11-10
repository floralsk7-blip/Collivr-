# Collivra Development Modes: Local Mock vs. Real Supabase

Collivra supports two operational modes:

1. **Local Development Mode (Mock Service Layer)**: Starts and runs the application frontend without requiring a live Supabase project or backend credentials.
2. **Real Supabase Mode**: Connects to your live Supabase database, authentication server, and deployed edge functions.

---

## 1. Local Development Mode (Default when `.env` is absent)

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set in `.env` (or are set to empty/placeholder values), Collivra automatically activates its safe local development service layer ([`src/lib/mockSupabaseClient.js`](../src/lib/mockSupabaseClient.js)).

### Features of Local Development Mode:
- **Zero Configuration**: Open [http://localhost:5173/](http://localhost:5173/) immediately after running `npm run dev`.
- **No Blank Screens or Crashes**: The app initializes with safe mock sessions and mock database tables.
- **Realistic Seed Data**: Includes sample student profiles, faculty mentors, industry mentors, projects, and active subscription states.
- **Transparent Indicators**: A non-intrusive banner (`[Local Dev Mode]`) is displayed, clearly distinguishing mock simulation from real backend operations.
- **No Fabricated Secrets**: Real authentication tokens and real payment checkouts are never faked. Operations are handled in a safe browser-isolated sandbox.

### Sign In during Local Development Mode:
Navigate to `/login`. The login card includes quick buttons to autofill mock test accounts:
- **Student Account**: `student.dev@collivra.local` (access to project creation, mentor support, dashboard)
- **Organiser Account**: `organiser.dev@collivra.local` (access to event operations)

---

## 2. Real Supabase Mode (Live Backend)

To switch to real Supabase mode with live authentication, Postgres persistence, and Edge Functions:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your Supabase project credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-anon-key
   VITE_PAYPAL_CLIENT_ID=your-paypal-sandbox-client-id
   VITE_PAYPAL_ENV=sandbox
   VITE_EVENT_PASS_CURRENCY=USD
   ```
3. Restart the development server:
   ```bash
   npm run dev
   ```
4. Verify your environment setup:
   ```bash
   npm run check:setup
   ```

When valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are detected, Collivra automatically switches to the production `@supabase/supabase-js` client with full Row Level Security (RLS) enforcement.

---

## 3. Switching Between Modes

| Desired Mode | Action |
|---|---|
| **Local Mock Mode** | Remove or rename `.env` (or leave `VITE_SUPABASE_URL` blank) |
| **Real Supabase Mode** | Set valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` |

