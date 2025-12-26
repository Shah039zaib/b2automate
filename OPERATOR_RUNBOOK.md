# B2Automate — Operator Runbook

**Target:** Oracle Cloud Always Free VM (1 GB RAM, 1 OCPU, Ubuntu)  
**Last Verified:** 2025-12-26  
**Status:** Production Ready

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start all | `sudo docker compose up -d` |
| Stop all | `sudo docker compose down` |
| View logs | `sudo docker compose logs -f` |
| Check health | `curl http://localhost/health` |
| Memory usage | `sudo docker stats --no-stream` |
| Rollback | `git checkout <previous-tag> && sudo docker compose up -d --build` |

---

## 1. SSH Access

### Connect to VM

```bash
ssh -i /path/to/private-key ubuntu@<VM_PUBLIC_IP>
```

### Verify Access

```bash
# Check you're on the right machine
hostname
cat /etc/os-release

# Verify sudo access
sudo whoami  # Should output: root
```

---

## 2. Environment Setup Checklist

### 2.1 Clone Repository

```bash
cd ~
git clone https://github.com/Shah039zaib/b2automate.git
cd b2automate
```

### 2.2 Create .env File

```bash
cp .env.example .env
nano .env
```

### 2.3 Required Environment Variables

| Variable | Required | Example |
|----------|----------|---------|
| `DATABASE_URL` | ✅ YES | `postgresql://user:pass@host:6543/db?pgbouncer=true` |
| `DIRECT_URL` | ✅ YES | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | ✅ YES | Min 32 chars: `openssl rand -base64 48` |
| `REDIS_URL` | Auto | Set by docker-compose |
| `AI_PROVIDER` | Default: `mock` | Keep as `mock` for initial deploy |
| `STRIPE_SECRET_KEY` | Optional | `sk_test_...` for billing |
| `STRIPE_WEBHOOK_SECRET` | Optional | `whsec_...` |

### 2.4 Validate Configuration

```bash
# Verify .env exists and has required vars
source .env
echo "DATABASE_URL: ${DATABASE_URL:0:30}..."
echo "JWT_SECRET length: ${#JWT_SECRET}"

# JWT_SECRET must be >= 32 chars
if [ ${#JWT_SECRET} -lt 32 ]; then echo "ERROR: JWT_SECRET too short"; fi
```

---

## 3. Deployment Commands

### 3.1 One-Click Setup (Recommended)

```bash
cd ~/b2automate
bash setup.sh
```

**Expected Output:**
```
[INFO] ============================================
[INFO]  B2Automate Production Setup
[INFO] ============================================
[SUCCESS] .env file found
[SUCCESS] Environment variables validated
[SUCCESS] Docker is already installed
[SUCCESS] Node.js is already installed
[SUCCESS] Dependencies installed
[SUCCESS] Frontend applications built
[SUCCESS] Docker images built
[SUCCESS] Firewall configured
[SUCCESS] Services started
[SUCCESS] API is healthy!
```

### 3.2 Manual Step-by-Step (If setup.sh fails)

```bash
# 1. Install Docker (if not present)
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
# Log out and back in after this

# 2. Install Node.js (for frontend build)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Build frontends
cd ~/b2automate
npm ci
export VITE_API_URL=""
npm run build --workspace=apps/web
npm run build --workspace=apps/admin

# 4. Build Docker images
sudo docker build -f Dockerfile.api -t b2automate-api:latest .
sudo docker build -f Dockerfile.worker -t b2automate-worker:latest .

# 5. Start services
sudo docker compose up -d

# 6. Run database migrations
sudo docker compose exec api npx prisma migrate deploy
```

---

## 4. Health Verification

### 4.1 Service Status

```bash
# All should show "Up" and "healthy"
sudo docker compose ps
```

**Expected:**
```
NAME                 STATUS                   PORTS
b2automate-api       Up (healthy)             3000/tcp
b2automate-nginx     Up                       0.0.0.0:80->80/tcp
b2automate-redis     Up (healthy)             6379/tcp
b2automate-worker    Up                       
```

### 4.2 API Health Check

```bash
curl http://localhost/health
# Expected: {"status":"ok"}
```

### 4.3 External Access Check

```bash
# From your local machine (not the server)
curl http://<VM_PUBLIC_IP>/health
```

### 4.4 Redis Health

```bash
sudo docker compose exec redis redis-cli ping
# Expected: PONG
```

---

## 5. Memory Verification

### 5.1 Container Memory Usage

```bash
sudo docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

**Expected (within limits):**
```
NAME                 MEM USAGE / LIMIT     MEM %
b2automate-api       150MiB / 300MiB       50%
b2automate-worker    120MiB / 300MiB       40%
b2automate-redis     15MiB / 100MiB        15%
b2automate-nginx     5MiB / 50MiB          10%
```

### 5.2 System Memory

```bash
free -h
```

**Expected:** At least 150 MB free for OS operations.

### 5.3 Memory Budget

| Container | Limit | Typical Use |
|-----------|-------|-------------|
| API | 300 MB | 120-180 MB |
| Worker | 300 MB | 100-150 MB |
| Redis | 100 MB | 15-30 MB |
| Nginx | 50 MB | 5-10 MB |
| **OS Reserved** | 250 MB | — |
| **TOTAL** | 1000 MB | — |

---

## 6. Rollback Steps

### 6.1 Quick Rollback (Docker Images)

```bash
# Stop current
sudo docker compose down

# Rebuild previous version
git checkout <previous-commit-or-tag>
sudo docker compose up -d --build
```

### 6.2 Database Rollback (Last Resort)

```bash
# List migrations
sudo docker compose exec api npx prisma migrate status

# Rollback (CAUTION: may cause data loss)
sudo docker compose exec api npx prisma migrate resolve --rolled-back <migration-name>
```

### 6.3 Full Reset

```bash
# DANGER: Removes all containers and volumes
sudo docker compose down -v
sudo docker system prune -af

# Rebuild from scratch
bash setup.sh
```

---

## 7. Common Failure Fixes

### 7.1 OOM (Out of Memory) Kills

**Symptoms:**
- Container repeatedly restarts
- `docker logs` shows: `Killed`
- `dmesg | grep -i oom` shows OOM killer activity

**Fix:**

```bash
# 1. Check which container is using too much memory
sudo docker stats --no-stream

# 2. Reduce Node.js heap (if API)
# Edit docker-compose.yml:
# NODE_OPTIONS=--max-old-space-size=200  (reduce from 256)

# 3. Restart
sudo docker compose down && sudo docker compose up -d
```

### 7.2 Redis Connection Failed

**Symptoms:**
- API logs show: `Redis connection failed`
- `ECONNREFUSED` errors

**Fix:**

```bash
# 1. Check Redis is running
sudo docker compose ps redis

# 2. Check Redis health
sudo docker compose exec redis redis-cli ping

# 3. If Redis not starting, check logs
sudo docker compose logs redis

# 4. If memory issue, Redis may have evicted all keys
sudo docker compose restart redis
```

### 7.3 Prisma Connection Failed

**Symptoms:**
- API fails to start
- Logs show: `Can't reach database server`

**Fix:**

```bash
# 1. Verify DATABASE_URL in .env
cat .env | grep DATABASE_URL

# 2. Test connection from container
sudo docker compose exec api npx prisma db pull

# 3. Common issues:
#    - Wrong password → Update .env
#    - IP not whitelisted → Add VM IP to Supabase
#    - SSL required → Add ?sslmode=require to URL

# 4. After fixing .env
sudo docker compose down && sudo docker compose up -d
```

### 7.4 Nginx 502 Bad Gateway

**Symptoms:**
- Browser shows 502 error
- Frontend loads but API calls fail

**Fix:**

```bash
# 1. Check if API is running
sudo docker compose ps api

# 2. Check API health directly
curl http://localhost:3000/health  # Should work
curl http://localhost/health        # Goes through nginx

# 3. Check nginx logs
sudo docker compose logs nginx

# 4. Common fix: API still starting
sleep 30 && curl http://localhost/health
```

### 7.5 Worker Not Processing Messages

**Symptoms:**
- Messages stuck in queue
- No WhatsApp responses sent

**Fix:**

```bash
# 1. Check worker is running
sudo docker compose ps worker

# 2. Check worker logs
sudo docker compose logs -f worker

# 3. Check Redis queue length
sudo docker compose exec redis redis-cli LLEN bull:inbound-messages:wait

# 4. Restart worker
sudo docker compose restart worker
```

---

## 8. Maintenance Commands

### View Logs

```bash
# All services
sudo docker compose logs -f

# Specific service
sudo docker compose logs -f api
sudo docker compose logs -f worker

# Last 100 lines only
sudo docker compose logs --tail 100 api
```

### Restart Services

```bash
# Restart single service
sudo docker compose restart api

# Restart all
sudo docker compose restart
```

### Update Deployment

```bash
cd ~/b2automate
git pull origin main
sudo docker compose down
sudo docker compose up -d --build
```

### Clean Up Disk Space

```bash
# Remove unused Docker resources
sudo docker system prune -f

# Check disk usage
df -h
```

---

## 9. Port Reference

| Port | Service | External |
|------|---------|----------|
| 80 | Nginx (HTTP) | ✅ Open |
| 443 | Nginx (HTTPS) | ✅ Open |
| 3000 | API (internal) | ❌ No |
| 6379 | Redis (internal) | ❌ No |

---

## 10. Emergency Contacts

| Issue | Action |
|-------|--------|
| VM not responding | Oracle Cloud Console → Reboot Instance |
| Database down | Supabase Dashboard → Check status |
| Stripe webhook failing | Stripe Dashboard → Webhook logs |

---

## Appendix: Verification Summary

| Component | Status | Notes |
|-----------|--------|-------|
| docker-compose.yml | ✅ Pass | Memory limits, health checks, networks |
| Dockerfile.api | ✅ Pass | Multi-stage build, Prisma generation |
| Dockerfile.worker | ✅ Pass | Multi-stage build, minimal image |
| nginx.conf | ✅ Pass | API proxy, static files, rate limiting |
| setup.sh | ✅ Pass | Idempotent, pre-flight checks, no destructive ops |

---

**Document Status:** Final  
**Next Action:** Execute deployment on target VM
