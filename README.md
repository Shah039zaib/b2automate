# B2Automate — WhatsApp AI Multi-Tenant SaaS Platform

## 1. Project Introduction

Ye project ek **multi-tenant WhatsApp AI SaaS platform** hai jo small businesses ko allow karta hai apna WhatsApp automation setup karna. Har tenant (business) apna WhatsApp number connect kar sakta hai, services define kar sakta hai, aur AI ke zariye customer inquiries handle kar sakta hai. Orders automatically create hote hain lekin human approval required hoti hai — AI kabhi bhi order confirm nahi kar sakta.

---

## 2. Tech Stack Overview

### Backend Stack
- **Node.js** with **Fastify** framework
- **TypeScript** for type safety
- **BullMQ** for job queue processing
- **ioredis** for Redis communication

### Frontend Stack
- **React 18** with TypeScript
- **Vite** for fast development builds
- **React Router v7** for navigation
- **TanStack Query** for API state management
- **Framer Motion** for animations
- **Tailwind CSS** for styling

### Database
- **PostgreSQL** — main database
- **Prisma ORM** — for database migrations and queries

### Redis
- Session state storage
- WhatsApp QR code storage 
- BullMQ job queue backend

### WhatsApp Integration
- **Baileys** library (`@whiskeysockets/baileys`) — non-official WhatsApp Web API
- QR-code based authentication
- Session persistence per tenant

### AI Usage
- **LangChain** with **OpenAI** integration
- AI guardrails for price detection and prohibited phrases
- Kill switch functionality per tenant

---

## 3. Project Folder Structure

```
b2automate/
├── apps/
│   ├── api/              # Backend API server (Fastify)
│   ├── web/              # Frontend Admin Panel (React + Vite)
│   └── whatsapp-worker/  # WhatsApp connection worker (Baileys)
├── packages/
│   ├── database/         # Prisma schema aur database client
│   ├── ai-core/          # AI orchestration logic
│   ├── shared-types/     # TypeScript types shared across apps
│   └── logger/           # Centralized logging utility
├── package.json          # Root package (npm workspaces)
└── tsconfig.base.json    # Base TypeScript config
```

### Folder Explanations

| Folder | Kya hai ye? |
|--------|-------------|
| `apps/api` | Backend server jo REST APIs provide karta hai — auth, services, orders, WhatsApp control |
| `apps/web` | Admin Panel frontend jahan tenant login karta hai, services add karta hai, orders approve karta hai |
| `apps/whatsapp-worker` | Background worker jo WhatsApp sessions manage karta hai aur messages send/receive karta hai |
| `packages/database` | Prisma schema (database tables) aur database client export |
| `packages/ai-core` | AI response generation with guardrails (price blocking, prohibited phrases) |
| `packages/shared-types` | TypeScript interfaces jo API aur Worker dono use karte hain |
| `packages/logger` | Pino-based logging jo consistent format mein logs create karta hai |

---

## 4. Prerequisites (Install Before Running)

Ye sab pehle install hona chahiye:

| Requirement | Description |
|-------------|-------------|
| **Node.js** | v18+ recommended (LTS version use karein) |
| **npm** | Node ke saath aata hai (npm workspaces use ho rahe hain) |
| **PostgreSQL** | Database server — version 14+ recommended |
| **Redis** | Session storage aur job queues ke liye — version 6+ recommended |

### Installation Check Commands

```bash
node --version    # v18.x.x ya upar hona chahiye
npm --version     # v9.x.x ya upar
```

PostgreSQL aur Redis locally ya Docker ke zariye run kar sakte hain.

---

## 5. Environment Setup (.env)

### Backend Environment Variables (apps/api)

Create a file: `apps/api/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string, e.g. `postgresql://user:password@localhost:5432/b2automate` |
| `REDIS_URL` | ❌ No | Redis connection URL. Default: `redis://localhost:6379` |
| `JWT_SECRET` | ❌ No | Secret key for JWT tokens. Default: `supersecret_dev_key` (production mein strong secret use karein!) |
| `PORT` | ❌ No | API server port. Default: `3000` |
| `OPENAI_API_KEY` | ❌ No | OpenAI API key for AI features. Default: `mock-key` (AI mock mode) |

**Example `.env` file:**
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/b2automate
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_key_here
PORT=3000
OPENAI_API_KEY=sk-your-openai-key
```

### WhatsApp Worker Environment Variables (apps/whatsapp-worker)

Create a file: `apps/whatsapp-worker/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | ❌ No | Redis connection URL. Default: `redis://localhost:6379` |

**Example:**
```env
REDIS_URL=redis://localhost:6379
```

### Frontend Environment Variables (apps/web)

Frontend ko separate `.env` ki zaroorat nahi default development mein. Lekin agar backend different URL par ho:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ❌ No | Backend API URL. Default: `http://localhost:3000` |

Development mein Vite proxy automatically `/api` requests ko `localhost:3000` forward karta hai.

---

## 6. Database Setup

### Step 1: PostgreSQL Database Create Karein

```sql
CREATE DATABASE b2automate;
```

Ya command line se:
```bash
createdb b2automate
```

### Step 2: Dependencies Install Karein

Root directory mein:
```bash
npm install
```

Ye command saari workspaces ke dependencies install karega.

### Step 3: Prisma Client Generate Karein

```bash
cd packages/database
npm run db:generate
```

### Step 4: Database Migrations Run Karein

```bash
cd packages/database
npm run db:migrate
```

Ye command Prisma schema ke according tables create karega (tenants, users, services, orders, etc.)

> **Note:** Seed command is project mein available nahi hai. Pehla tenant aur user registration ke zariye create hoga.

---

## 7. Running the Project (Step by Step)

### Step 1: Redis Running Hai Ya Nahi Check Karein

```bash
redis-cli ping
```

Agar response `PONG` aaye to Redis chal raha hai.

Redis start karne ke liye (Windows):
```bash
redis-server
```

### Step 2: Backend API Start Karein

Terminal 1 mein:
```bash
cd apps/api
npm run dev
```

Backend port **3000** par chalega. Console mein ye dikhna chahiye:
```
Server listening on port 3000
```

Health check: `http://localhost:3000/health` → `{"status":"ok"}`

### Step 3: WhatsApp Worker Start Karein

Terminal 2 mein:
```bash
cd apps/whatsapp-worker
npm run dev
```

Console mein likha aayega:
```
Starting WhatsApp Worker Service...
Listening on queues: worker_commands, outbound_messages
```

### Step 4: Frontend Start Karein

Terminal 3 mein:
```bash
cd apps/web
npm run dev
```

Frontend port **5173** par chalega. Console mein URL dikhega:
```
Local: http://localhost:5173/
```

### Summary: Running Ports

| Service | Port | URL |
|---------|------|-----|
| Backend API | 3000 | http://localhost:3000 |
| Frontend | 5173 | http://localhost:5173 |
| WhatsApp Worker | — | Background process (no HTTP) |

---

## 8. First Time Usage Flow

### Step 1: Browser Mein Frontend Kholein

`http://localhost:5173` kholein.

### Step 2: Naya Tenant Register Karein

- Login page par agar pehli baar ho to **Register** option use karein
- Tenant name, email aur password enter karein
- Register successful hone par login karein

### Step 3: Login Karein

- Email aur password enter karein
- Login ke baad Dashboard dikhega

### Step 4: WhatsApp Connect Karein (QR Code)

- Dashboard ya Onboarding se **WhatsApp Connect** section mein jayein
- "Start Session" button click karein
- QR Code screen par dikhega
- Apne phone ke WhatsApp mein:
  - **Settings** → **Linked Devices** → **Link a Device**
  - Screen par dikh raha QR code scan karein
- Connection successful hone par status "Connected" dikhega

### Step 5: Services Add Karein

- Left sidebar mein **Services** page par jayein
- **Add Service** button click karein
- Service ka naam, description, aur price enter karein
- Save karein

### Step 6: Orders Ka Flow Samjhein

- Jab customer WhatsApp par message karega aur service ke baare mein poochega:
  1. AI response dega (lekin prices ya confirmation nahi dega)
  2. Customer order request karega to **Draft Order** create hoga
  3. Admin Panel ke **Orders** page par order dikhega
  4. Admin manually **Approve** ya **Reject** karega
  5. Approval ke baad customer ko WhatsApp par confirmation jayega

> **Important:** AI kabhi bhi directly order confirm nahi karta — sirf drafts create hote hain jo human approval require karte hain.

---

## 9. Common Problems & Fixes

### Problem: Backend start nahi ho raha

**Possible Causes:**
- PostgreSQL chal nahi raha
- `DATABASE_URL` galat hai `.env` mein
- Port 3000 already use mein hai

**Fixes:**
```bash
# PostgreSQL status check karein
pg_isready

# Different port use karein
PORT=3001 npm run dev
```

### Problem: Redis connection fail ho raha

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Fix:**
```bash
# Redis start karein
redis-server

# Ya Docker mein
docker run -p 6379:6379 redis
```

### Problem: QR Code nahi dikh raha

**Possible Causes:**
- WhatsApp Worker chal nahi raha
- Redis connection issue
- Session already connected hai

**Fixes:**
1. WhatsApp Worker terminal check karein — koi error to nahi?
2. Redis chal raha hai confirm karein
3. "Stop Session" karein phir "Start Session" dobara

### Problem: Login karne ke baad redirect nahi ho raha

**Possible Causes:**
- Backend se response nahi aa raha
- CORS issue

**Fixes:**
1. Browser DevTools → Network tab mein `/auth/login` request check karein
2. Backend console mein errors dekhein
3. Frontend aur Backend dono chal rahe hain confirm karein

### Problem: "Network Error" API calls mein

**Possible Causes:**
- Backend chal nahi raha
- Vite proxy properly configured nahi

**Fixes:**
1. Backend `http://localhost:3000/health` check karein
2. Frontend restart karein (`npm run dev`)

---

## 10. Important Notes (Read Before Production)

### ⚠️ Security Warnings

1. **JWT_SECRET production mein change karein** — Default key sirf development ke liye hai
2. **Password hashing** — Current implementation mock hai, production mein bcrypt/argon2 use karein
3. **Environment files (.env) git mein commit na karein** — `.gitignore` mein add karein

### 🏢 Multi-Tenant Architecture

- Har tenant ka data completely isolated hai
- JWT token mein tenant ID embedded hota hai
- Cross-tenant access automatically blocked hai

### 📱 WhatsApp Compliance

> **Warning:** Ye project unofficial WhatsApp Web API (Baileys) use karta hai.

- WhatsApp ki Terms of Service ke against use karna account ban karwa sakta hai
- Production usage se pehle WhatsApp Business API consider karein
- Excessive messaging avoid karein — rate limits respect karein

### 🤖 AI Safety

- AI guardrails enabled hain — AI kabhi prices mention nahi karega
- AI orders confirm nahi kar sakta — sirf drafts create hote hain
- Per-tenant kill switch available hai (`isAiEnabled` flag)

### 🚀 Production Deployment Notes

- Production build ke liye:
  ```bash
  npm run build --workspaces
  ```
- Environment variables properly set karein
- HTTPS enable karein (reverse proxy like Nginx use karein)
- Database backups configure karein

---

## Quick Reference

### Common Commands

| Task | Command |
|------|---------|
| Install all dependencies | `npm install` (root mein) |
| Start backend | `cd apps/api && npm run dev` |
| Start frontend | `cd apps/web && npm run dev` |
| Start WhatsApp worker | `cd apps/whatsapp-worker && npm run dev` |
| Generate Prisma client | `cd packages/database && npm run db:generate` |
| Run migrations | `cd packages/database && npm run db:migrate` |
| Build all | `npm run build` (root mein) |

### Default URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Health Check | http://localhost:3000/health |

---

*README generated after full project review — no assumptions made.*
