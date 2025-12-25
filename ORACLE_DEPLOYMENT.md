# B2Automate - Oracle Cloud Deployment Guide

> **Language:** Roman Urdu + English Technical Terms  
> **Platform:** Oracle Cloud Always Free VM (1 GB RAM, 1 OCPU)  
> **Last Updated:** December 2024

---

## 📑 Table of Contents

1. [Introduction](#1-introduction)
2. [Architecture Overview](#2-architecture-overview)
3. [Pre-Requisites](#3-pre-requisites)
4. [One-Click Deployment](#4-one-click-deployment)
5. [Environment Variables](#5-environment-variables)
6. [Verification Steps](#6-verification-steps)
7. [Common Issues & Fixes](#7-common-issues--fixes)
8. [Update & Restart](#8-update--restart)
9. [Security Notes](#9-security-notes)
10. [Final Checklist](#10-final-checklist)

---

## 1. Introduction

### B2Automate Kya Hai?

B2Automate aik **multi-tenant SaaS platform** hai jo WhatsApp Business automation provide karta hai. Is mein yeh features hain:

- **WhatsApp Integration** - Baileys library ke through WhatsApp Web
- **AI-Powered Responses** - OpenRouter/OpenAI ke saath
- **Multi-Tenant Architecture** - Aik installation, multiple businesses
- **Subscription Billing** - Stripe integration

### Oracle Cloud Free Tier Ka Overview

Oracle Cloud **Always Free** tier deta hai:
- **1 GB RAM** - Humari deployment ke liye kaafi
- **1 OCPU** - Adequate processing power
- **Public IPv4** - Direct internet access
- **50 GB Storage** - Boot volume

**Cost: $0/month** - Lifetime free (jab tak fair use policy follow karein)

---

## 2. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Oracle Cloud VM (1 GB RAM)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐                                                │
│  │   Nginx     │ Port 80/443                                    │
│  │ (50 MB RAM) │ Reverse Proxy + Static Files                   │
│  └──────┬──────┘                                                │
│         │                                                        │
│    ┌────┴────┬─────────────────────────────┐                    │
│    │         │                             │                    │
│    ▼         ▼                             ▼                    │
│ /api/*   /admin/*                       /*                      │
│    │         │                             │                    │
│    ▼         ▼                             ▼                    │
│ ┌────────────────┐ ┌──────────────┐ ┌──────────────┐           │
│ │   API Server   │ │ Admin Panel  │ │  Web Frontend │           │
│ │ Fastify :3000  │ │ (Static)     │ │  (Static)     │           │
│ │ (300 MB limit) │ │              │ │               │           │
│ └───────┬────────┘ └──────────────┘ └───────────────┘           │
│         │                                                        │
│         │ BullMQ Queues                                          │
│         ▼                                                        │
│ ┌────────────────┐     ┌─────────────────────┐                  │
│ │     Redis      │◄────│  WhatsApp Worker    │                  │
│ │ (100 MB limit) │     │  BullMQ + Baileys   │                  │
│ └────────────────┘     │  (300 MB limit)     │                  │
│                        └─────────────────────┘                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                    EXTERNAL (Supabase Cloud)                    │
│                    ┌──────────────────┐                         │
│                    │    PostgreSQL    │                         │
│                    │   (Free Tier)    │                         │
│                    └──────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### Container Explanation

| Container | Purpose | Memory Limit |
|-----------|---------|--------------|
| **nginx** | Web server + reverse proxy | 50 MB |
| **api** | Fastify API + BullMQ queue producer | 300 MB |
| **worker** | WhatsApp message processing | 300 MB |
| **redis** | Queue storage + session cache | 100 MB |

### Data Flow

1. **User Request** → Nginx receive karta hai
2. `/api/*` requests → API container ko proxy
3. Static files (web/admin) → Nginx directly serve karta hai
4. API → Redis mein job add karta hai (BullMQ)
5. Worker → Redis se job uthata hai, WhatsApp message bhejta hai

---

## 3. Pre-Requisites

### Oracle VM Creation Steps

#### Step 1: Oracle Cloud Account

1. [cloud.oracle.com](https://cloud.oracle.com) pe jao
2. "Start for Free" click karo
3. Credit card chahiye (verify karne ke liye, charge nahi hoga)
4. Account create karo

#### Step 2: Compute Instance Create Karo

1. Oracle Cloud Console mein login karo
2. Menu → Compute → Instances
3. "Create Instance" click karo
4. Settings:
   - **Name:** `b2automate-vm`
   - **Image:** Ubuntu 22.04 (Always Free eligible)
   - **Shape:** VM.Standard.E2.1.Micro (1 OCPU, 1 GB RAM)
   - **Networking:** Create new VCN or use existing
   - **Add SSH Keys:** Apni public key paste karo

```bash
# Local machine pe SSH key generate karo (agar nahi hai):
ssh-keygen -t ed25519 -C "b2automate"
cat ~/.ssh/id_ed25519.pub
# Yeh output Oracle console mein paste karo
```

#### Step 3: Firewall Ports Open Karo

Oracle Cloud Console mein:

1. Networking → Virtual Cloud Networks
2. Apni VCN select karo
3. Subnet → Security Lists → Default Security List
4. "Add Ingress Rules" click karo:

| Source CIDR | Port | Protocol | Description |
|-------------|------|----------|-------------|
| 0.0.0.0/0 | 80 | TCP | HTTP |
| 0.0.0.0/0 | 443 | TCP | HTTPS |
| 0.0.0.0/0 | 22 | TCP | SSH |

#### Step 4: SSH Access Test

```bash
# Instance ka public IP copy karo, phir:
ssh ubuntu@YOUR_VM_IP

# Agar connect ho jaye, you're ready!
```

---

## 4. One-Click Deployment

### Deployment Commands

SSH se VM mein login karo aur yeh commands run karo:

```bash
# 1. Repository clone karo
git clone https://github.com/Shah039zaib/b2automate.git
cd b2automate

# 2. Environment file create karo
cp .env.example .env

# 3. .env file edit karo (ZAROORI!)
nano .env
# Supabase DATABASE_URL, JWT_SECRET wagairah fill karo
# Save: Ctrl+O, Exit: Ctrl+X

# 4. Setup script run karo
chmod +x setup.sh
bash setup.sh

# 5. Done! 🎉
```

### Setup.sh Kya Karta Hai?

Script automatically yeh sab karta hai:

1. ✅ Ubuntu version check
2. ✅ RAM availability check (min 900 MB)
3. ✅ `.env` file validation
4. ✅ Docker + Docker Compose install
5. ✅ Node.js 20 LTS install
6. ✅ npm dependencies install
7. ✅ Frontend apps build (web + admin)
8. ✅ Docker images build
9. ✅ Firewall configure (ufw)
10. ✅ Services start
11. ✅ Health check

### Docker Compose Up Flow

```bash
# Manual start (agar zaroori ho):
sudo docker compose up -d

# Logs dekhne ke liye:
sudo docker compose logs -f

# Specific service logs:
sudo docker compose logs -f api
```

---

## 5. Environment Variables

### REQUIRED Variables (Zaroori)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Supabase connection pooler URL | `postgresql://postgres.xxx:password@...` |
| `DIRECT_URL` | Supabase direct connection | `postgresql://postgres.xxx:password@...` |
| `JWT_SECRET` | Authentication secret (min 32 chars) | `openssl rand -base64 64` se generate karo |

### OPTIONAL Variables (Feature Toggles)

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `mock` | `mock`, `openai`, ya `openrouter` |
| `OPENROUTER_API_KEY` | empty | AI features ke liye |
| `STRIPE_SECRET_KEY` | empty | Billing ke liye |
| `STRIPE_WEBHOOK_SECRET` | empty | Stripe webhooks ke liye |

### Safe Defaults

```bash
# Recommended .env for testing (no AI, no billing):
DATABASE_URL="your-supabase-url"
DIRECT_URL="your-supabase-direct-url"
JWT_SECRET="$(openssl rand -base64 64)"
AI_PROVIDER="mock"
NODE_ENV="production"
```

---

## 6. Verification Steps

### Health Check URLs

```bash
# API Health (should return {"status":"ok"})
curl http://localhost/health

# Ya browser mein:
# http://YOUR_VM_IP/health
```

### Docker Status Commands

```bash
# Running containers check:
sudo docker compose ps

# Expected output:
# NAME                  STATUS    PORTS
# b2automate-api        Up        3000/tcp
# b2automate-nginx      Up        0.0.0.0:80->80/tcp
# b2automate-redis      Up        6379/tcp
# b2automate-worker     Up
```

### Memory Usage Check

```bash
# Memory stats:
sudo docker stats --no-stream

# Output mein dekho:
# - api: ~150-250 MB
# - worker: ~100-200 MB
# - redis: ~20-50 MB
# - nginx: ~5-10 MB
```

### Redis Connection Check

```bash
# Redis ping:
sudo docker compose exec redis redis-cli ping
# Expected: PONG

# Queue stats:
sudo docker compose exec redis redis-cli info keyspace
```

### API Logs Check

```bash
# Real-time API logs:
sudo docker compose logs -f api

# Worker logs:
sudo docker compose logs -f worker
```

---

## 7. Common Issues & Fixes

### Issue 1: Low Memory / OOM

**Symptoms:** Container restart hota rehta hai, `docker ps` mein "Restarting" status

**Fix:**
```bash
# Check which container is crashing:
sudo docker compose ps

# Check specific container logs:
sudo docker compose logs api --tail=50

# Memory limit increase (temporary):
# docker-compose.yml mein mem_limit badao
```

### Issue 2: OOM Killer

**Symptoms:** `dmesg` mein "Out of memory: Killed process"

**Fix:**
```bash
# Swap enable karo (recommended for 1GB VMs):
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Permanent swap:
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Issue 3: Prisma Connection Error

**Symptoms:** API logs mein "Can't reach database server"

**Fix:**
```bash
# 1. Check DATABASE_URL in .env
# 2. Supabase dashboard se IP whitelist check karo
# 3. Oracle VM firewall outbound allow hai?

# Test connection:
sudo docker compose exec api npx prisma db pull
```

### Issue 4: Redis Connection Failed

**Symptoms:** API mein "Redis connection refused"

**Fix:**
```bash
# Redis container running hai?
sudo docker compose ps redis

# Redis logs:
sudo docker compose logs redis

# Restart Redis:
sudo docker compose restart redis
```

### Issue 5: WhatsApp QR Code Issues

**Symptoms:** Worker logs mein QR code nahi aa raha

**Fix:**
```bash
# Worker logs check karo:
sudo docker compose logs worker --tail=100

# Session data clear karo (Redis mein):
sudo docker compose exec redis redis-cli FLUSHDB
# WARNING: Yeh sab sessions delete kar dega!

# Worker restart:
sudo docker compose restart worker
```

### Issue 6: Nginx 502 Bad Gateway

**Symptoms:** Browser mein 502 error

**Fix:**
```bash
# API running hai?
sudo docker compose ps api

# API health check:
sudo docker compose exec nginx wget -q --spider http://api:3000/health

# Nginx reload:
sudo docker compose restart nginx
```

---

## 8. Update & Restart

### Code Update Procedure

```bash
# 1. Latest code pull karo
cd ~/b2automate
git pull origin main

# 2. Dependencies update
npm ci

# 3. Frontends rebuild
npm run build --workspace=apps/web
npm run build --workspace=apps/admin

# 4. Docker images rebuild
sudo docker compose build

# 5. Restart services
sudo docker compose up -d

# 6. Verify
sudo docker compose ps
curl http://localhost/health
```

### Zero-Downtime Strategy (Best Effort)

1GB VM pe true zero-downtime mushkil hai, lekin yeh approach use karo:

```bash
# 1. Pehle naye images build karo (services running rahein):
sudo docker compose build

# 2. Quick restart:
sudo docker compose up -d --force-recreate

# Downtime: ~10-30 seconds
```

### Rollback Procedure

```bash
# Previous commit pe wapas jao:
git log --oneline -5  # Recent commits dekho
git checkout <previous-commit-hash>

# Rebuild aur restart:
sudo docker compose build
sudo docker compose up -d
```

---

## 9. Security Notes

### JWT Secret Rules

```bash
# Strong secret generate karo:
openssl rand -base64 64

# .env mein paste karo:
JWT_SECRET="your-generated-secret-here"

# NEVER share this secret
# NEVER commit .env to git
```

### .env File Protection

```bash
# File permissions:
chmod 600 .env

# Verify:
ls -la .env
# Output: -rw------- (only owner can read/write)
```

### Firewall Hardening

```bash
# UFW status:
sudo ufw status

# Only required ports open karein:
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS

# Block everything else:
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
```

### SSH Hardening (Recommended)

```bash
# /etc/ssh/sshd_config edit karo:
sudo nano /etc/ssh/sshd_config

# Yeh settings enable karo:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes

# SSH restart:
sudo systemctl restart sshd
```

### Docker Security

```bash
# Regular updates:
sudo apt update && sudo apt upgrade -y

# Docker images update:
sudo docker compose pull
sudo docker compose up -d
```

---

## 10. Final Checklist

### Pre-Deployment Checklist

- [ ] Oracle VM created (1 OCPU, 1 GB RAM)
- [ ] Public IP assigned
- [ ] Security list rules added (ports 22, 80, 443)
- [ ] SSH access working
- [ ] Supabase project created
- [ ] DATABASE_URL and DIRECT_URL ready
- [ ] JWT_SECRET generated (min 32 chars)

### Post-Deployment Checklist

- [ ] `setup.sh` successfully completed
- [ ] All 4 containers running (`docker compose ps`)
- [ ] Health check returns `{"status":"ok"}`
- [ ] Web frontend accessible
- [ ] Admin panel accessible
- [ ] Memory usage under 800 MB
- [ ] Swap enabled (recommended)

### Production Readiness Checklist

- [ ] Domain configured (DNS pointing to VM IP)
- [ ] SSL certificate installed (Let's Encrypt)
- [ ] `.env` permissions set to 600
- [ ] SSH password authentication disabled
- [ ] UFW firewall enabled
- [ ] Regular backup strategy in place
- [ ] Monitoring setup (optional: UptimeRobot)

### SSL Setup (After Domain)

```bash
# Certbot install:
sudo apt install certbot python3-certbot-nginx -y

# Certificate generate:
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal test:
sudo certbot renew --dry-run
```

---

## Quick Reference Card

| Command | Description |
|---------|-------------|
| `sudo docker compose ps` | Container status |
| `sudo docker compose logs -f` | All logs (live) |
| `sudo docker compose restart` | Restart all |
| `sudo docker compose down` | Stop all |
| `sudo docker compose up -d` | Start all |
| `sudo docker stats` | Memory usage |
| `curl localhost/health` | API health check |
| `git pull && bash setup.sh` | Full update |

---

**Deployment Guide Complete!** 🎉

Agar koi issue ho, check karo:
1. Container logs
2. Memory usage
3. .env file values
4. Network connectivity

**Support:** GitHub Issues pe report karo
