# B2Automate - WhatsApp AI Multi-Tenant SaaS

## Project Overview

Ye ek multi-tenant WhatsApp automation platform hai jisme AI-powered customer support, order management, aur tenant administration shamil hai. Har tenant apna WhatsApp number connect kar sakta hai, services define kar sakta hai, aur AI customers se baat kar ke orders create karta hai.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend API | Fastify + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Queue | Redis + BullMQ |
| WhatsApp | Baileys (unofficial WhatsApp Web API) |
| AI Provider | OpenAI (with mock fallback) |
| Frontend | React + Vite + TailwindCSS |
| State Management | React Query + Context API |
| Authentication | JWT (@fastify/jwt) |

---

## Folder Structure

```
b2automate/
├── apps/
│   ├── api/              # Backend REST API (Fastify)
│   ├── web/              # Tenant Admin Panel (React, port 5173)
│   ├── admin/            # Super Admin Panel (React, port 5174)
│   └── whatsapp-worker/  # WhatsApp message processor (BullMQ worker)
├── packages/
│   ├── database/         # Prisma schema aur PrismaClient
│   ├── logger/           # Pino-based logging utility
│   ├── shared-types/     # Queue payloads aur shared TypeScript types
│   └── ai-core/          # AI providers aur guardrails
├── package.json          # Root workspace config
└── tsconfig.base.json    # Shared TypeScript config
```

### Folder Explanations

- **apps/api**: Main backend server jo authentication, orders, services, aur WhatsApp session management handle karta hai
- **apps/web**: Tenant admin panel jahan business apne services, orders, aur WhatsApp manage karta hai
- **apps/admin**: Super admin panel jahan system-wide settings aur tenant management hoti hai
- **apps/whatsapp-worker**: Background worker jo WhatsApp messages send/receive karta hai via Baileys
- **packages/database**: Prisma schema jisme sab models (Tenant, User, Order, etc.) defined hain
- **packages/logger**: Centralized logging using Pino
- **packages/shared-types**: Queue payload types jo api aur worker dono share karte hain
- **packages/ai-core**: AI response generation, guardrails (price detection, prohibited phrases)

---

## Environment Variables

### Backend API (apps/api)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| JWT_SECRET | REQUIRED | N/A | JWT token signing key. Minimum 32 characters zaroori hai. App bina iske start nahi hoga. |
| REDIS_URL | Optional | redis://localhost:6379 | Redis connection URL for session aur rate limiting |
| OPENAI_API_KEY | Optional | Empty | OpenAI API key for AI responses. Bina iske mock provider use hoga. |
| PORT | Optional | 3000 | Backend server port |
| NODE_ENV | Optional | development | Environment mode (development/production) |
| DATABASE_URL | REQUIRED | N/A | PostgreSQL connection string. Prisma ke liye zaroori. |

### WhatsApp Worker (apps/whatsapp-worker)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| REDIS_URL | Optional | redis://localhost:6379 | Redis connection URL for queues |
| WHATSAPP_CUSTOMER_RATE_LIMIT | Optional | 10 | Per-customer messages allowed per window |
| WHATSAPP_CUSTOMER_RATE_WINDOW | Optional | 60 | Rate limit window in seconds |

### Frontend (apps/web, apps/admin)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| VITE_API_URL | Optional | http://localhost:3000 | Backend API URL |

---

## Prerequisites

Ye tools install hona zaroori hai:

1. **Node.js** - v18+ recommended
2. **npm** - Node ke saath aata hai (workspaces support zaroori)
3. **PostgreSQL** - Database server
4. **Redis** - Session storage aur message queues ke liye

### Verify Installation

```bash
node --version   # v18.0.0 ya upar hona chahiye
npm --version    # v8+ recommended
```

---

## Database Setup

1. PostgreSQL me ek database create karo:

```sql
CREATE DATABASE b2automate;
```

2. DATABASE_URL set karo (example):

```
DATABASE_URL="postgresql://username:password@localhost:5432/b2automate"
```

3. Prisma migrations run karo:

```bash
cd packages/database
npx prisma migrate dev
```

4. Prisma client generate karo:

```bash
npx prisma generate
```

---

## Running the Project

### Step 1: Dependencies Install Karo

Root folder me:

```bash
npm install
```

Ye sab workspaces ke dependencies install kar dega.

### Step 2: Environment Files Create Karo

**apps/api/.env:**
```
JWT_SECRET=your-secure-32-character-minimum-secret-key
DATABASE_URL=postgresql://username:password@localhost:5432/b2automate
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-your-openai-key  # Optional
PORT=3000
```

**apps/whatsapp-worker/.env:**
```
REDIS_URL=redis://localhost:6379
```

### Step 3: Redis Start Karo

```bash
redis-server
```

Ya Docker ke saath:
```bash
docker run -d -p 6379:6379 redis:alpine
```

### Step 4: Backend Start Karo

```bash
cd apps/api
npm run dev
```

Backend port 3000 pe chalega.

### Step 5: WhatsApp Worker Start Karo

Naye terminal me:

```bash
cd apps/whatsapp-worker
npm run dev
```

### Step 6: Frontend Start Karo

Naye terminal me:

```bash
cd apps/web
npm run dev
```

Tenant Admin Panel: http://localhost:5173

Super Admin Panel (optional):

```bash
cd apps/admin
npm run dev
```

Super Admin Panel: http://localhost:5174

---

## First-Time Usage Flow

### 1. Tenant Registration

- Browser me http://localhost:5173 kholo
- "Register" pe click karo
- Business name, email, password enter karo
- Account create ho jayega aur dashboard pe redirect hoga

### 2. Login

- Email aur password se login karo
- Dashboard open hoga with WhatsApp status, orders, aur stats

### 3. WhatsApp Connect

- Dashboard pe "Connect WhatsApp" button hai
- QR code appear hoga
- WhatsApp mobile app se QR scan karo (Linked Devices)
- Connection successful hone pe status "connected" dikhai dega

### 4. Services Add Karo

- Side menu me "Services" pe jao
- "Add Service" se naye services create karo
- Name, description, aur price enter karo

### 5. Order Flow

- Customer WhatsApp pe message karega
- AI automatically respond karega aur order create karega
- Orders section me orders dikhai denge
- Approve ya Reject action lene honge

---

## Common Issues and Fixes

### 1. Redis Not Running

**Error:** Connection refused / ECONNREFUSED

**Fix:**
```bash
redis-server
# Ya check karo: redis-cli ping
```

### 2. JWT_SECRET Missing

**Error:** FATAL: JWT_SECRET environment variable is not set

**Fix:** .env file me JWT_SECRET add karo (minimum 32 characters)

### 3. QR Code Not Appearing

**Possible Causes:**
- WhatsApp Worker nahi chal raha
- Redis connection fail

**Fix:**
- Check karo worker terminal me koi error hai ya nahi
- Redis running confirm karo

### 4. 401 Unauthorized Errors

**Possible Causes:**
- Token expire ho gaya
- JWT_SECRET change ho gaya

**Fix:**
- Logout aur login again
- .env me same JWT_SECRET ensure karo

### 5. Database Connection Failed

**Error:** Could not connect to database

**Fix:**
- PostgreSQL running hai ya nahi check karo
- DATABASE_URL correct hai ya nahi verify karo
- Database actually exist karta hai ya nahi

### 6. Prisma Client Not Found

**Error:** Cannot find module '@prisma/client'

**Fix:**
```bash
cd packages/database
npx prisma generate
```

---

## Security Notes

### JWT Secret

- Production me strong random string use karo (64+ characters recommended)
- Kabhi bhi hardcode mat karo
- Missing JWT_SECRET pe app start nahi hoga (fail-fast design)

### Environment Secrets

- .env files kabhi git me commit mat karo
- .gitignore me .env already hai
- Production me proper secrets manager use karo

### WhatsApp Ban Risk

- Baileys unofficial WhatsApp Web API hai
- WhatsApp ke Terms of Service violate karta hai
- Commercial use pe ban ho sakta hai
- Long-term ke liye Official WhatsApp Business API consider karo

### Rate Limiting

- API pe 100 requests/minute per tenant limit hai
- WhatsApp messages pe 5/second global + 10/minute per customer limit hai

---

## Available Scripts

### Root Level

```bash
npm run build      # Sab workspaces build karo
npm run test       # Sab workspaces test karo
npm run lint       # Sab workspaces lint karo
```

### Backend (apps/api)

```bash
npm run dev        # Development mode (tsx watch)
npm run build      # TypeScript compile
npm run start      # Production start
```

### Frontend (apps/web, apps/admin)

```bash
npm run dev        # Vite dev server
npm run build      # Production build
npm run preview    # Preview production build
```

### WhatsApp Worker

```bash
npm run dev        # Development mode (tsx watch)
npm run build      # TypeScript compile
npm run start      # Production start
```

---

## Ports Summary

| Service | Port |
|---------|------|
| Backend API | 3000 |
| Tenant Admin Panel | 5173 |
| Super Admin Panel | 5174 |
| Redis | 6379 |
| PostgreSQL | 5432 |

---

README.md updated after full codebase and env usage review — no guessing.
