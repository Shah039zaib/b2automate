# B2Automate - WhatsApp Automation SaaS Platform

> **Multi-tenant WhatsApp automation platform** jo AI-powered responses, subscription billing, aur complete admin controls provide karta hai.

---

## 📋 Table of Contents

1. [Project Kya Hai](#project-kya-hai)
2. [Tech Stack](#tech-stack)
3. [Features](#features)
4. [Repository Structure](#repository-structure)
5. [Local Development Setup](#local-development-setup)
6. [VPS Deployment Guide (Production)](#vps-deployment-guide-production)
7. [Environment Variables](#environment-variables)
8. [Common Issues](#common-issues)
9. [Security Notes](#security-notes)

---

## 🚀 Project Kya Hai

B2Automate ek **multi-tenant SaaS application** hai jo businesses ko WhatsApp automation provide karti hai:

### Main Features:

- ✅ **WhatsApp Automation**: Baileys library use karke automated messaging with human-like typing delays
- 🤖 **AI-Powered Responses**: OpenAI, OpenRouter (400+ models), ya mock provider
- 👥 **Multi-Tenant Architecture**: Har tenant ka complete data isolation with per-tenant limits
- 💳 **Subscription Billing**: Stripe integration + manual payments (EasyPaisa, JazzCash, Bank Transfer)
- 👑 **Admin Dashboard**: Super Admin controls for tenant management aur system settings
- ⏰ **Scheduled Messages**: Message scheduling with template support

### Architecture Diagram:

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Nginx (Reverse Proxy)                      │
│                    Port 80/443 - Static Files + API Routing          │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│   Web App     │         │  Admin Panel  │         │      API      │
│   (Tenants)   │         │ (Super Admin) │         │   (Fastify)   │
│   React+Vite  │         │   React+Vite  │         │   Port 3000   │
└───────────────┘         └───────────────┘         └───────┬───────┘
                                                            │
                    ┌───────────────────────────────────────┼───────────┐
                    │                                       │           │
                    ▼                                       ▼           ▼
          ┌───────────────┐       ┌────────────────┐    ┌──────────────┐
          │     Redis     │       │   PostgreSQL   │    │   WhatsApp   │
          │   (Queues)    │◄─────►│   (Supabase)   │    │    Worker    │
          │   Port 6379   │       │    (Prisma)    │    │   (Baileys)  │
          └───────────────┘       └────────────────┘    └──────────────┘
```

---

## 💻 Tech Stack

### Backend
- **Node.js** 20.x LTS - Runtime environment
- **TypeScript** 5.3+ - Type-safe development
- **Fastify** 4.25+ - High-performance web framework
- **Prisma** 5.7+ - Database ORM
- **BullMQ** 5.0+ - Redis-based job queues
- **Baileys** 6.6+ - WhatsApp Web API
- **LangChain** - AI/LLM orchestration
- **Stripe** - Payment processing

### Frontend
- **React** 18.3+ - UI framework
- **Vite** 5.4+ - Build tool
- **TailwindCSS** 3.4+ - CSS framework
- **TanStack Query** 5.0+ - Server state management
- **React Router** 7.11+ - Client-side routing

### Infrastructure
- **PostgreSQL** - Database (via Supabase)
- **Redis** - Queues & caching
- **Docker** - Containerization
- **Nginx** - Reverse proxy & static serving

---

## 🎯 Features

### 1. Multi-Tenant System
- Har tenant ka apna isolated data
- Per-tenant AI limits aur kill switches
- Tenant-wise WhatsApp session management

### 2. WhatsApp Integration
- QR code ya pairing code se authentication
- Human-like typing delays (anti-ban)
- Per-customer rate limiting
- Media support (images, voice, documents)
- Message scheduling

### 3. AI-Powered Responses
- Multiple AI providers support
- Tier-based model access (FREE, LOW, MEDIUM, HIGH)
- Daily/Monthly usage limits
- AI confidence threshold
- Conversation history tracking

### 4. Billing System
- Stripe subscription checkout
- Manual payment support (EasyPaisa/JazzCash/Bank)
- Invoice history
- Coupon system
- Auto-downgrade on cancellation

### 5. Admin Controls
- Tenant management (activate/suspend/archive)
- AI usage monitoring
- Audit logs
- Manual payment approval
- Growth settings (Google Analytics, Facebook Pixel)

---

## 📁 Repository Structure

```
b2automate/
├── apps/
│   ├── api/                  # Backend API (Fastify + Prisma)
│   ├── web/                  # Tenant web app (React)
│   ├── admin/                # Super admin panel (React)
│   └── whatsapp-worker/      # WhatsApp message processor (BullMQ)
│
├── packages/
│   ├── database/             # Prisma schema + client
│   ├── ai-core/              # AI provider implementations
│   ├── logger/               # Pino logging wrapper
│   └── shared-types/         # Shared TypeScript types
│
├── docker-compose.yml        # Production Docker setup
├── nginx.conf                # Nginx reverse proxy config
├── setup.sh                  # VPS deployment script
└── .env.example              # Environment variables template
```

---

## 🛠️ Local Development Setup

### Prerequisites

Aapko yeh installed honi chahiye:
- **Node.js** 20.x LTS
- **npm** 10.x+
- **PostgreSQL** 14+ (ya Supabase account)
- **Redis** 7.x
- **Git**

### Step 1: Clone Repository

```bash
git clone https://github.com/Shah039zaib/b2automate.git
cd b2automate
```

### Step 2: Install Dependencies

```bash
npm install
```

Yeh command saari apps aur packages ke liye dependencies install karega.

### Step 3: Environment Setup

Har service ka apna `.env` file banana hoga:

```bash
# Root level (Docker Compose ke liye)
cp .env.example .env

# Individual services
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/whatsapp-worker/.env.example apps/whatsapp-worker/.env
```

**Important variables configure karein:**

`apps/api/.env` mein:
```env
# Database (Supabase se milega)
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# JWT Secret (minimum 32 characters)
JWT_SECRET="apni-32-character-se-lambi-secret-key"

# Redis
REDIS_URL="redis://localhost:6379"

# AI Provider (optional - mock bhi chal sakta hai)
AI_PROVIDER="mock"
OPENROUTER_API_KEY=""
```

### Step 4: Database Setup

```bash
# Prisma client generate karein
npm run db:generate --workspace=packages/database

# Migrations run karein (agar local PostgreSQL use kar rahe hain)
npm run db:migrate --workspace=packages/database
```

### Step 5: Build Packages

Packages ko order mein build karna zaroori hai:

```bash
# Pehle shared packages
npm run build --workspace=packages/logger
npm run build --workspace=packages/shared-types

# Phir dependent packages
npm run build --workspace=packages/ai-core
```

### Step 6: Start Redis

```bash
# Docker se
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Ya local Redis
redis-server
```

### Step 7: Run Applications

4 alag terminals mein yeh commands chalayein:

**Terminal 1 - API Server:**
```bash
npm run dev --workspace=apps/api
# http://localhost:3000 pe chalega
```

**Terminal 2 - Web App:**
```bash
npm run dev --workspace=apps/web
# http://localhost:5173 pe chalega
```

**Terminal 3 - Admin Panel:**
```bash
npm run dev --workspace=apps/admin
# http://localhost:5174 pe chalega
```

**Terminal 4 - WhatsApp Worker (optional):**
```bash
npm run dev --workspace=apps/whatsapp-worker
# Background mein WhatsApp messages process karega
```

---

## 🚀 VPS Deployment Guide (Production)

Yeh complete guide hai apne VPS pe B2Automate deploy karne ke liye.

### Prerequisites (VPS Requirements)

- **OS**: Ubuntu 20.04 ya 22.04 LTS
- **RAM**: Minimum 1 GB (Oracle Cloud Always Free tier ke liye optimized)
- **Storage**: Minimum 10 GB
- **Access**: SSH access with sudo permissions

### Pre-Deployment Checklist

Deployment se pehle yeh tayyar rakhen:

1. ✅ **Supabase Database**:
   - Supabase.com pe project bana lein
   - Connection pooler URLs copy kar lein (IPv4 support ke liye)
   - Format: `postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres`

2. ✅ **Domain Name** (optional but recommended):
   - Domain khareed lein (Namecheap, GoDaddy, etc.)
   - A Record apne VPS IP pe point kar dein

3. ✅ **API Keys** (agar chahiye toh):
   - OpenRouter API key (AI ke liye): https://openrouter.ai/keys
   - Stripe keys (billing ke liye): https://dashboard.stripe.com/apikeys

### Step-by-Step Deployment

#### 1. VPS Pe SSH Login Karein

```bash
ssh ubuntu@your-vps-ip
# Ya
ssh root@your-vps-ip
```

#### 2. System Update Karein

```bash
sudo apt update && sudo apt upgrade -y
```

#### 3. Repository Clone Karein

```bash
git clone https://github.com/Shah039zaib/b2automate.git
cd b2automate
```

#### 4. Environment Variables Configure Karein

Root `.env` file edit karein:

```bash
nano .env
```

**Minimum required variables:**

```env
# Database (Supabase se copy karein - POOLER URLs use karein)
DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"

# JWT Secret (32+ characters - secure random string)
JWT_SECRET="apni-bahut-secure-aur-lambi-secret-key-32-chars-minimum"

# Redis (default theek hai)
REDIS_URL="redis://redis:6379"

# Frontend URLs (apna domain ya VPS IP)
WEB_APP_URL="http://your-domain.com"
VITE_API_URL="/api"

# AI Provider (optional - mock bhi chal sakta hai)
AI_PROVIDER="openrouter"
OPENROUTER_API_KEY="sk-or-v1-your-key-here"
OPENROUTER_MODEL="google/gemini-2.0-flash-exp:free"

# Stripe (billing ke liye - optional)
STRIPE_SECRET_KEY="sk_live_your-key"
STRIPE_WEBHOOK_SECRET="whsec_your-secret"

# WhatsApp Rate Limits (default values theek hain)
WHATSAPP_MESSAGE_RATE_LIMIT="5"
WHATSAPP_CUSTOMER_RATE_LIMIT="10"
WHATSAPP_CUSTOMER_RATE_WINDOW="60"
```

**Save karein:** `Ctrl + X`, phir `Y`, phir `Enter`

#### 5. Setup Script Chalayein

Yeh script automatically sab kuch setup kar dega:

```bash
chmod +x setup.sh
bash setup.sh
```

**Setup script kya karega:**

1. ✅ Docker aur Docker Compose install karega
2. ✅ Node.js 20 LTS install karega
3. ✅ Environment variables validate karega
4. ✅ Packages build karega
5. ✅ Frontend apps (web + admin) build karega
6. ✅ Docker images build karega
7. ✅ Firewall configure karega (ports 22, 80, 443)
8. ✅ Services start karega (API, Worker, Redis, Nginx)
9. ✅ Health checks run karega

**Script ka output:**
```
✅ Environment variables validated
✅ Dependencies installed
✅ Packages built successfully
✅ Frontend apps built successfully
✅ Docker images built successfully
✅ Firewall configured
✅ Services started successfully
✅ Health checks passed

🎉 Deployment complete!
Access your application at: http://your-vps-ip
```

#### 6. Deployment Verify Karein

Browser mein apna VPS IP ya domain kholen:

```
http://your-vps-ip/          # Web app
http://your-vps-ip/admin     # Admin panel
http://your-vps-ip/api/health # API health check
```

**Expected response (health check):**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-12-29T..."
}
```

#### 7. First User Banayein (Super Admin)

Web app pe jao aur register karein. Pehla registered user automatically **SUPER_ADMIN** ban jata hai.

```
http://your-vps-ip/
→ Register
→ Email aur password enter karein
→ Login karein
```

#### 8. SSL Certificate Setup (HTTPS ke liye)

Production mein HTTPS zaroori hai:

```bash
# Certbot install karein
sudo apt install certbot python3-certbot-nginx -y

# Certificate obtain karein (apna domain use karein)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal verify karein
sudo certbot renew --dry-run
```

Certificate automatically renew hoga har 90 days.

---

## 🔄 Updates Deploy Karna (VPS Pe)

Jab bhi code update karein GitHub pe, VPS pe yeh steps follow karein:

### Method 1: Manual Update

```bash
# 1. VPS pe SSH karein
ssh ubuntu@your-vps-ip

# 2. Repository directory mein jao
cd b2automate

# 3. Latest code pull karein
git pull origin main

# 4. Dependencies update karein (agar package.json change hua hai)
npm ci --include=dev

# 5. Packages rebuild karein
npm run build --workspace=packages/logger
npm run build --workspace=packages/shared-types
npm run build --workspace=packages/ai-core

# 6. Frontend apps rebuild karein
npm run build --workspace=apps/web
npm run build --workspace=apps/admin

# 7. Docker services restart karein
sudo docker compose down
sudo docker compose up -d --build

# 8. Logs check karein
sudo docker compose logs -f
```

### Method 2: Quick Update Script

Ek update script bana sakte hain:

```bash
nano update.sh
```

**update.sh content:**
```bash
#!/bin/bash
set -e

echo "🔄 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
npm ci --include=dev

echo "🔨 Building packages..."
npm run build --workspace=packages/logger
npm run build --workspace=packages/shared-types
npm run build --workspace=packages/ai-core

echo "🎨 Building frontend apps..."
npm run build --workspace=apps/web
npm run build --workspace=apps/admin

echo "🐳 Restarting Docker services..."
sudo docker compose down
sudo docker compose up -d --build

echo "✅ Update complete!"
echo "📊 Checking health..."
sleep 5
curl http://localhost/api/health

echo ""
echo "🎉 Application updated successfully!"
```

**Use karna:**
```bash
chmod +x update.sh
./update.sh
```

---

## 🔧 Environment Variables

Har service ke liye detailed environment variables:

### Root `.env` (Docker Compose ke liye)

Yeh file main environment configuration hai jo sab services ke saath share hoti hai.

**Zaroori Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Supabase pooler URL (port 6543) | `postgresql://postgres.XXX:PASS@...pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Direct connection (migrations ke liye) | `postgresql://postgres.XXX:PASS@...pooler.supabase.com:5432/postgres` |
| `JWT_SECRET` | 32+ characters secure key | `your-very-secure-random-string-here` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379` (Docker) ya `redis://localhost:6379` (local) |

**Optional Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `mock` | `openai`, `openrouter`, ya `mock` |
| `OPENROUTER_API_KEY` | - | OpenRouter API key (agar AI chahiye) |
| `STRIPE_SECRET_KEY` | - | Stripe secret key (billing ke liye) |
| `WEB_APP_URL` | `http://localhost:5173` | Frontend URL |
| `WHATSAPP_MESSAGE_RATE_LIMIT` | `5` | Messages per second per tenant |
| `WHATSAPP_CUSTOMER_RATE_LIMIT` | `10` | Messages per customer per minute |

### Service-Specific `.env` Files

Detailed configuration ke liye har service ka `.env.example` file dekhen:

- `apps/api/.env.example` - API service (163 lines)
- `apps/web/.env.example` - Web frontend (minimal)
- `apps/admin/.env.example` - Admin panel (minimal)
- `apps/whatsapp-worker/.env.example` - WhatsApp worker (minimal)

---

## ⚠️ Common Issues

### Issue 1: Database Connection Failed

**Error:**
```
Can't reach database server at db.xxx.supabase.co:5432
```

**Solution:**
Supabase **pooler URLs** use karein (direct URLs nahi):

```env
# ❌ WRONG
DATABASE_URL="postgresql://...@db.xxx.supabase.co:5432/postgres"

# ✅ CORRECT
DATABASE_URL="postgresql://...@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

### Issue 2: JWT Secret Not Set

**Error:**
```
FATAL: JWT_SECRET environment variable is not set
```

**Solution:**
`.env` file mein JWT_SECRET add karein:

```bash
# Strong random string generate karein
openssl rand -base64 64

# Ya manually koi bhi 32+ character string
JWT_SECRET="your-minimum-32-character-long-secret-here"
```

### Issue 3: Frontend 404 Error

**Error:**
Browser mein blank page ya 404 error.

**Solution:**

```bash
# Frontend builds check karein
ls -la apps/web/dist/index.html
ls -la apps/admin/dist/index.html

# Agar files nahi hain, rebuild karein
npm run build --workspace=apps/web
npm run build --workspace=apps/admin

# Nginx restart karein
sudo docker compose restart nginx
```

### Issue 4: WhatsApp QR Code Nahi Dikha

**Possible reasons:**

1. **Redis running nahi hai:**
   ```bash
   sudo docker compose ps
   # Redis container "Up" hona chahiye
   ```

2. **Worker running nahi hai:**
   ```bash
   sudo docker compose logs whatsapp-worker
   # Errors check karein
   ```

3. **QR expired (60 seconds):**
   - "Generate QR" button dobara click karein
   - Countdown timer dekhen

### Issue 5: Ports Already in Use

**Error:**
```
Error starting userland proxy: listen tcp 0.0.0.0:80: bind: address already in use
```

**Solution:**

```bash
# Check karo kon use kar raha hai port 80
sudo lsof -i :80

# Agar koi aur service hai (apache, etc.)
sudo systemctl stop apache2
# Ya
sudo systemctl stop nginx

# Phir Docker restart karein
sudo docker compose up -d
```

### Issue 6: Out of Memory

**Error:**
```
JavaScript heap out of memory
```

**Solution:**

VPS pe memory kam hai. Build locally karke push karein:

```bash
# Local machine pe
npm run build --workspace=apps/web
npm run build --workspace=apps/admin
git add apps/web/dist apps/admin/dist
git commit -m "build: pre-built frontend apps"
git push

# VPS pe pull karein
git pull origin main
sudo docker compose restart nginx
```

---

## 🔒 Security Notes

### Production Security Checklist

Deployment se pehle yeh ensure karein:

- ✅ **JWT_SECRET** kam se kam 32 characters ka strong random string ho
- ✅ **DATABASE_URL** Supabase pooler use kare (direct connection nahi)
- ✅ **STRIPE keys** live keys hon (test keys nahi)
- ✅ **SSL/HTTPS** enabled ho (Certbot se)
- ✅ **Firewall** configured ho (sirf 22, 80, 443 ports open)
- ✅ **Environment variables** files ko `.gitignore` mein add karein
- ✅ **Regular backups** lein (database + Redis)

### Default Credentials

**Koi default credentials nahi hain.** Pehla registered user automatically SUPER_ADMIN ban jata hai.

### Rate Limiting

System mein 3 layers ki rate limiting hai:

1. **Nginx Level**: 10 req/sec per IP (burst 20)
2. **API Level**: 100 req/min per tenant
3. **WhatsApp Level**:
   - 5 messages/sec global (per tenant)
   - 10 messages/min per customer

### Password Security

- Saare passwords bcrypt se hashed hain (10 rounds)
- Minimum password length: 8 characters
- Account lockout: 5 failed attempts = 15 min ban

---

## 📊 Monitoring & Maintenance

### Logs Dekhna

```bash
# Saari services ke logs
sudo docker compose logs -f

# Specific service ke logs
sudo docker compose logs -f api
sudo docker compose logs -f whatsapp-worker
sudo docker compose logs -f nginx

# Last 100 lines
sudo docker compose logs --tail=100
```

### Service Status Check

```bash
# Saari services ki status
sudo docker compose ps

# Health check
curl http://localhost/api/health
```

### Database Backup

```bash
# Supabase automatic backups provide karta hai
# Manual backup ke liye Supabase dashboard use karein
```

### Redis Data Check

```bash
# Redis container mein enter karein
sudo docker compose exec redis redis-cli

# Keys check karein
KEYS *

# Specific key dekhen
GET whatsapp:status:tenant-id-here

# Exit
exit
```

### Disk Space Check

```bash
# Disk usage dekhen
df -h

# Docker space cleanup
sudo docker system prune -a
```

---

## 🎓 Additional Resources

### Documentation Files

- `CLAUDE.md` - Claude Code ke liye codebase guide
- `task.md` - Task registry aur fix completion summary
- Har service ki `.env.example` - Detailed environment variables

### External Links

- **Supabase**: https://supabase.com/docs
- **OpenRouter**: https://openrouter.ai/docs
- **Stripe**: https://stripe.com/docs/api
- **Docker**: https://docs.docker.com
- **Baileys**: https://github.com/WhiskeySockets/Baileys

---

## 📞 Support

Agar koi issue aa raha hai ya help chahiye:

1. Logs check karein: `sudo docker compose logs -f`
2. Health endpoint verify karein: `curl http://localhost/api/health`
3. Environment variables double-check karein
4. GitHub Issues pe issue create karein: https://github.com/Shah039zaib/b2automate/issues

---

## 📝 License

This project is proprietary software. All rights reserved.

---

**Made with ❤️ for Pakistani Businesses**

**Deploy karne mein koi problem ho toh GitHub issue create karein ya documentation dobara dekhen!**
