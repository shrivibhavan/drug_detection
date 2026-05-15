# SafeReach — Secure Group Chat with Drug Monitoring

A WhatsApp-style group chat (max 10 users) with real-time messaging, login authentication, and automatic Telegram alerts when drug-related content is detected.

---

## 🏗️ Tech Stack (100% Free)

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Next.js 14 (App Router) | Free |
| Auth | Supabase Auth (email/password) | **Free** |
| Database | Supabase PostgreSQL | **Free** (500MB) |
| Real-time | Supabase Realtime | **Free** |
| Drug Detection | Regex pattern engine | Free |
| Alert System | Telegram Bot API | Free |
| Deployment | Vercel | Free tier |

---

## 🚀 Setup Guide (20 minutes)

### Step 1: Create a Supabase Project (Free)

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"**
3. Name it `safereach` (or anything)
4. Set a database password (save it somewhere)
5. Choose the **closest region** to you
6. Wait for the project to initialize (~2 minutes)

#### Get your keys:
1. Go to **Settings → API**
2. Copy **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
3. Copy **anon public** key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### Step 2: Set Up the Database

Go to **SQL Editor** in your Supabase dashboard and run this SQL:

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_color TEXT DEFAULT '#00c896',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  flagged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Anyone can read profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Policies for messages
CREATE POLICY "Anyone can read messages"
  ON messages FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

#### Disable Email Confirmation (for testing):
1. Go to **Authentication → Providers → Email**
2. Toggle OFF **"Confirm email"**
3. This lets users sign up and login immediately without email verification

---

### Step 3: Create Telegram Bot & Get Chat ID

#### Create the Bot:
1. Open Telegram, search for **@BotFather**
2. Send `/newbot`
3. Give it a name (e.g., `SafeReach Alerts`)
4. Give it a username (e.g., `safereach_alerts_bot`)
5. BotFather gives you a token → `TELEGRAM_BOT_TOKEN`

#### Get Your Admin Chat ID:
1. Search for **@userinfobot** on Telegram
2. Send it any message
3. It replies with your ID → `TELEGRAM_ADMIN_CHAT_ID`

#### Activate the Bot:
- Search for your new bot on Telegram and send `/start`

---

### Step 4: Set Up Locally

```bash
cd Mega_Project
npm install

# Create your env file
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ADMIN_CHAT_ID=your_chat_id_here
```

```bash
npm run dev
# Open http://localhost:3000
```

---

### Step 5: Deploy with GitHub + Vercel (no Vercel env UI)

Use **GitHub Secrets** (free) instead of Vercel environment variables.

1. Push this repo to GitHub (`main` branch).
2. In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_ADMIN_CHAT_ID`
   - `VERCEL_TOKEN` — from [vercel.com/account/tokens](https://vercel.com/account/tokens)
   - `VERCEL_ORG_ID` — from `.vercel/project.json` → `orgId`
   - `VERCEL_PROJECT_ID` — from `.vercel/project.json` → `projectId`
3. Link the repo on [vercel.com](https://vercel.com) (optional).
4. Push to `main` — the **Deploy to Vercel** GitHub Action builds with your secrets and deploys.

Vercel’s own build is skipped (`ignoreCommand` in `vercel.json`) so deploys always use GitHub Actions + secrets.

---

## 📁 Project Structure

```
Mega_Project/
├── app/
│   ├── api/messages/route.ts  # Drug detection API + Telegram alerts
│   ├── login/page.tsx         # Login/Signup page
│   ├── page.tsx               # Group chat UI
│   ├── layout.tsx             # Root layout + AuthProvider
│   └── globals.css            # All styles
├── lib/
│   ├── supabase.ts            # Supabase client + types
│   ├── auth-context.tsx       # Auth state management
│   ├── drug-detection.ts      # Drug keyword detection engine
│   └── telegram.ts            # Telegram alert sender
├── .env.local                 # Your secrets (never commit)
├── .env.example               # Template
└── vercel.json                # Deployment config
```

---

## 🛡️ Features

- ✅ **WhatsApp-style group chat** — real-time messaging
- ✅ **Login/Signup** — email + password authentication
- ✅ **Max 10 users** — enforced on signup
- ✅ **Online presence** — see who's currently active
- ✅ **Drug content detection** — multi-layer regex engine
- ✅ **Telegram admin alerts** — instant notification with username + message
- ✅ **Colored avatars** — unique color per user
- ✅ **Message grouping** — consecutive messages from same user
- ✅ **Dark premium UI** — glassmorphism + animations
- ✅ **Mobile responsive**
- ✅ **100% free** — no paid services

---

## 🔍 Drug Detection

| Confidence | Trigger Example |
|---|---|
| 🔴 HIGH | "sell heroin in bulk", "smuggle drugs across border" |
| 🟡 MEDIUM | "dealer" + "cocaine" mentioned together |
| 🟢 LOW | Any drug keyword mentioned (weed, meth, etc.) |

All flagged messages trigger an instant Telegram notification to the admin. The sender is NOT warned.

---

## ⚠️ Important Notes

- Never commit `.env.local`
- Users are NOT notified when their messages are flagged
- Supabase free tier: 500MB storage, 50K monthly active users
- Vercel free tier: 100GB bandwidth/month
