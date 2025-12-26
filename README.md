# B2Automate

Multi-tenant WhatsApp automation SaaS platform with AI-powered responses, subscription billing, and comprehensive admin controls.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Environment Variables](#environment-variables)
6. [Installation (Local Development)](#installation-local-development)
7. [Build System Explanation](#build-system-explanation)
8. [Running the Project](#running-the-project)
9. [Deployment Notes](#deployment-notes)
10. [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)
11. [Security Notes](#security-notes)
12. [Contribution and Maintenance Notes](#contribution-and-maintenance-notes)

---

## Project Overview

B2Automate is a multi-tenant SaaS application that provides:

- **WhatsApp Automation**: Automated messaging via the Baileys library with human-like typing delays and anti-ban measures
- **AI-Powered Responses**: Configurable AI providers (OpenAI, OpenRouter with 400+ models, or mock provider for development)
- **Multi-Tenant Architecture**: Complete tenant isolation with per-tenant AI governance, usage limits, and kill switches
- **Subscription Billing**: Stripe integration for subscription management with manual payment support (EasyPaisa, JazzCash, Bank Transfer)
- **Admin Dashboard**: Super Admin controls for tenant management, AI configuration, and system settings
- **Scheduled Messaging**: Message scheduling with template support

### High-Level Architecture

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
│   apps/web    │         │  apps/admin   │         │   apps/api    │
│   (Tenant UI) │         │ (Super Admin) │         │   (Fastify)   │
│   Vite+React  │         │   Vite+React  │         │   Port 3000   │
│   Port 5173   │         │   Port 5174   │         └───────┬───────┘
└───────────────┘         └───────────────┘                 │
                                                            │
                                    ┌───────────────────────┼───────────────────────┐
                                    │                       │                       │
                                    ▼                       ▼                       ▼
                          ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
                          │     Redis     │       │   PostgreSQL  │       │ whatsapp-     │
                          │   (BullMQ)    │◄─────►│   (Supabase)  │       │    worker     │
                          │   Port 6379   │       │   (Prisma)    │       │   (Baileys)   │
                          └───────────────┘       └───────────────┘       └───────────────┘
```

---

## Repository Structure

```
b2automate/
├── apps/
│   ├── admin/              # Super Admin dashboard (React + Vite)
│   ├── api/                # Backend API server (Fastify)
│   ├── web/                # Tenant-facing web app (React + Vite)
│   └── whatsapp-worker/    # WhatsApp message worker (BullMQ + Baileys)
│
├── packages/
│   ├── ai-core/            # AI provider implementations
│   ├── database/           # Prisma schema and database client
│   ├── logger/             # Pino-based logging wrapper
│   └── shared-types/       # Shared TypeScript types and queue definitions
│
├── docker-compose.yml      # Production Docker orchestration
├── Dockerfile.api          # Multi-stage build for API server
├── Dockerfile.worker       # Multi-stage build for WhatsApp worker
├── nginx.conf              # Nginx reverse proxy configuration
├── setup.sh                # One-click deployment script (Ubuntu/Oracle Cloud)
├── tsconfig.base.json      # Shared TypeScript configuration
└── package.json            # Root workspace configuration
```

### Apps

| App | Purpose | Port |
|-----|---------|------|
| `apps/api` | Fastify REST API with JWT auth, rate limiting, Stripe webhooks, and BullMQ job producers | 3000 |
| `apps/web` | Tenant-facing React SPA for managing services, orders, conversations, and settings | 5173 (dev) |
| `apps/admin` | Super Admin React SPA for tenant management, AI governance, and system configuration | 5174 (dev) |
| `apps/whatsapp-worker` | BullMQ worker that processes WhatsApp messages using Baileys with anti-ban delays | N/A (background) |

### Packages

| Package | Purpose |
|---------|---------|
| `@b2automate/database` | Prisma schema, client, and database utilities |
| `@b2automate/ai-core` | AI provider interface and implementations (OpenAI, OpenRouter, Mock) |
| `@b2automate/logger` | Pino-based structured logging |
| `@b2automate/shared-types` | Shared TypeScript enums, interfaces, and BullMQ queue definitions |

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x LTS | Runtime environment |
| TypeScript | 5.3+ | Type-safe development |
| Fastify | 4.25+ | High-performance web framework |
| Prisma | 5.7+ | Database ORM and migrations |
| BullMQ | 5.0+ | Redis-based job queue for async processing |
| IORedis | 5.3+ | Redis client for queues and session storage |
| Baileys | 6.6+ | WhatsApp Web API library |
| LangChain | 0.3/1.x | AI/LLM orchestration |
| Stripe | 20.1+ | Payment processing |
| Zod | 3.x | Runtime schema validation |
| Pino | 8.17+ | Structured JSON logging |
| bcrypt | 5.1+ | Password hashing |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3+ | UI framework |
| Vite | 5.4+ | Build tool and dev server |
| TailwindCSS | 3.4+ | Utility-first CSS framework |
| React Router DOM | 7.11+ | Client-side routing |
| TanStack Query | 5.0+ | Server state management |
| Framer Motion | 11.0+ | Animation library |
| Axios | 1.7+ | HTTP client |
| Lucide React | 0.562+ | Icon library |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| PostgreSQL | Primary database (via Supabase) |
| Redis | Queue storage, session state, rate limiting |
| Docker | Containerization |
| Nginx | Reverse proxy, static file serving, rate limiting |

---

## Prerequisites

### Required

- **Node.js**: Version 20.x LTS (required for native module compatibility)
- **npm**: Version 10.x+ (comes with Node.js 20)
- **PostgreSQL**: 14+ (or Supabase hosted database)
- **Redis**: 7.x (for BullMQ queues)

### For Production Deployment

- **Docker**: 24.x+ with Docker Compose plugin
- **Ubuntu**: 20.04 or 22.04 LTS (for setup.sh script)
- **RAM**: Minimum 1 GB (optimized for Oracle Cloud Always Free tier)

### For Local Development (Windows)

- **WSL2**: Recommended for Redis (or Windows-native Redis)
- **Git Bash** or **PowerShell**: For running npm commands

---

## Environment Variables

Copy `.env.example` to `.env` and configure all required variables.

```bash
cp .env.example .env
```

### Database (REQUIRED)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string with connection pooler (for runtime) |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection (for Prisma migrations) |

### Redis (REQUIRED)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection URL for BullMQ |

### Authentication (REQUIRED)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Must be at least 32 characters. Generate with `openssl rand -base64 64` |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Access token expiry duration |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token expiry duration |

### AI Providers (OPTIONAL)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | No | `mock` | Provider selection: `mock`, `openai`, `openrouter` |
| `OPENAI_API_KEY` | Conditional | - | Required if `AI_PROVIDER=openai` |
| `OPENROUTER_API_KEY` | Conditional | - | Required if `AI_PROVIDER=openrouter` |
| `OPENROUTER_MODEL` | No | `google/gemini-2.0-flash-exp:free` | Model to use with OpenRouter |

### Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | API server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `LOG_LEVEL` | No | `info` | Logging level (debug, info, warn, error) |

### Rate Limiting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RATE_LIMIT_MAX` | No | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW` | No | `1 minute` | Rate limit time window |

### WhatsApp Worker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHATSAPP_MESSAGE_RATE_LIMIT` | No | `5` | Global message rate limit per tenant |
| `WHATSAPP_CUSTOMER_RATE_LIMIT` | No | `10` | Messages per customer per window |
| `WHATSAPP_CUSTOMER_RATE_WINDOW` | No | `60` | Rate window in seconds |

### Stripe Billing (OPTIONAL - for payment features)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | Conditional | - | Required for Stripe billing |
| `STRIPE_PUBLISHABLE_KEY` | Conditional | - | Required for Stripe checkout |
| `STRIPE_WEBHOOK_SECRET` | Conditional | - | Required for Stripe webhook validation |
| `WEB_APP_URL` | No | `http://localhost:5173` | Frontend URL for checkout redirects |

### Frontend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:3000` | API URL for frontend apps |

---

## Installation (Local Development)

### Step 1: Clone and Install Dependencies

```bash
git clone https://github.com/Shah039zaib/b2automate.git
cd b2automate
npm install
```

This installs dependencies for all workspaces (apps and packages).

### Step 2: Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### Step 3: Generate Prisma Client

```bash
npm run db:generate --workspace=packages/database
```

### Step 4: Run Database Migrations (if using local PostgreSQL)

```bash
npm run db:migrate --workspace=packages/database
```

### Step 5: Build Packages (REQUIRED before running apps)

Packages must be built in dependency order:

```bash
# Build shared packages first (no internal dependencies)
npm run build --workspace=packages/logger
npm run build --workspace=packages/shared-types

# Build packages with internal dependencies
npm run build --workspace=packages/ai-core

# Note: @b2automate/database uses source files directly, no build needed
```

### Step 6: Start Redis

```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Or using local Redis installation
redis-server
```

---

## Build System Explanation

### Monorepo Workspaces

The project uses npm workspaces defined in the root `package.json`:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

### Package Dependencies

```
@b2automate/logger        (standalone)
@b2automate/shared-types  (standalone)
@b2automate/ai-core       → depends on @b2automate/logger
@b2automate/database      (standalone, Prisma-based)

apps/api                  → depends on all packages
apps/whatsapp-worker      → depends on logger, shared-types
apps/web                  (frontend, no package deps)
apps/admin                (frontend, no package deps)
```

### Build Order (for production)

```bash
# 1. Shared packages (no dependencies)
npm run build --workspace=packages/logger
npm run build --workspace=packages/shared-types

# 2. Packages with dependencies
npm run build --workspace=packages/ai-core

# 3. Generate Prisma client
npx prisma generate --schema=./packages/database/prisma/schema.prisma

# 4. Backend apps
npm run build --workspace=apps/api
npm run build --workspace=apps/whatsapp-worker

# 5. Frontend apps
npm run build --workspace=apps/web
npm run build --workspace=apps/admin
```

### TypeScript Configuration

All packages and apps extend `tsconfig.base.json`:

- Target: ES2022
- Module: NodeNext
- Strict mode enabled
- Composite projects for incremental builds

---

## Running the Project

### Development Mode

#### Terminal 1: Redis

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

#### Terminal 2: API Server

```bash
npm run dev --workspace=apps/api
```

The API runs on `http://localhost:3000` with hot-reload.

#### Terminal 3: Web Frontend

```bash
npm run dev --workspace=apps/web
```

The web app runs on `http://localhost:5173`.

#### Terminal 4: Admin Dashboard

```bash
npm run dev --workspace=apps/admin
```

The admin panel runs on `http://localhost:5174`.

#### Terminal 5: WhatsApp Worker (OPTIONAL)

```bash
npm run dev --workspace=apps/whatsapp-worker
```

Processes WhatsApp message jobs from Redis queues.

### Production Mode

In production, use Docker Compose (see Deployment Notes).

---

## Deployment Notes

### Docker Compose (Recommended)

The project includes a production-ready `docker-compose.yml` optimized for low-memory environments (1 GB RAM):

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

#### Memory Allocation (1 GB Total)

| Service | Memory Limit |
|---------|--------------|
| api | 300 MB |
| worker | 300 MB |
| redis | 100 MB |
| nginx | 50 MB |
| OS Reserved | 250 MB |

### One-Click Deployment (Oracle Cloud / Ubuntu)

```bash
# 1. SSH into your server
ssh ubuntu@your-server-ip

# 2. Clone repository
git clone https://github.com/Shah039zaib/b2automate.git
cd b2automate

# 3. Configure environment
cp .env.example .env
nano .env  # Fill in required values

# 4. Run setup script
bash setup.sh
```

The `setup.sh` script:
- Installs Docker and Node.js 20 LTS
- Validates environment variables
- Builds frontend applications
- Builds Docker images
- Configures firewall (ports 22, 80, 443)
- Starts all services via Docker Compose
- Waits for health checks

### Nginx Configuration

Nginx is configured in `nginx.conf` to:
- Serve static files for web (`/`) and admin (`/admin`)
- Proxy API requests from `/api/*` to the API container
- Handle Stripe webhooks at `/webhooks/*`
- Apply rate limiting (10 req/s with burst of 20)
- Add security headers (X-Frame-Options, CSP, etc.)

### SSL/HTTPS (Manual Step)

After deployment, set up SSL:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

### Database Migrations (Post-Deployment)

```bash
docker compose exec api npx prisma migrate deploy
```

---

## Common Issues and Troubleshooting

### Build Failures

**Issue**: `Cannot find module '@b2automate/logger'`

**Solution**: Build packages in order before building apps:
```bash
npm run build --workspace=packages/logger
npm run build --workspace=packages/shared-types
npm run build --workspace=packages/ai-core
```

### Memory Issues

**Issue**: `JavaScript heap out of memory` during build

**Solution**: Increase Node.js memory limit:
```bash
export NODE_OPTIONS="--max-old-space-size=512"
npm run build --workspace=apps/api
```

For Docker, this is already configured in `docker-compose.yml`:
```yaml
NODE_OPTIONS=--max-old-space-size=256
```

### Prisma Issues

**Issue**: `Error: @prisma/client did not initialize yet`

**Solution**: Generate Prisma client:
```bash
npx prisma generate --schema=./packages/database/prisma/schema.prisma
```

**Issue**: Migration failures with Supabase

**Solution**: Ensure `DIRECT_URL` is set (bypasses connection pooler):
```env
DIRECT_URL="postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

### JWT Issues

**Issue**: `FATAL: JWT_SECRET environment variable is not set`

**Solution**: The API requires a JWT secret at startup. Set it in `.env`:
```env
JWT_SECRET="your-32-character-or-longer-secret-here"
```

### WhatsApp Worker Issues

**Issue**: Sessions not persisting after restart

**Cause**: WhatsApp session state is stored in Redis. If Redis data is lost, sessions must be re-authenticated.

**Solution**: Ensure Redis persistence is enabled:
```yaml
# In docker-compose.yml, Redis has AOF persistence enabled
command: redis-server --appendonly yes
volumes:
  - redis-data:/data
```

### Port Conflicts

**Issue**: `EADDRINUSE: address already in use`

**Solution**: Check for processes using the port:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Linux
lsof -i :3000
kill -9 <pid>
```

---

## Security Notes

### Secrets Management

**Never commit to version control:**
- `.env` files
- SSL certificates (`ssl/` directory)
- WhatsApp session credentials
- Any API keys

**Production secrets** should be:
- Stored in environment variables (not files)
- Rotated regularly
- Unique per environment

### JWT Security

- Minimum 32-character secret enforced at startup
- Tokens are checked against a Redis blacklist on every request
- Logout invalidates tokens immediately

### Rate Limiting

API rate limiting is enforced at two levels:
1. **Nginx**: 10 requests/second per IP with burst of 20
2. **Fastify**: 100 requests/minute per tenant (or IP if unauthenticated)

WhatsApp messages have additional rate limiting:
- Per-tenant global limit (configurable via `WHATSAPP_MESSAGE_RATE_LIMIT`)
- Per-customer limit (configurable via `WHATSAPP_CUSTOMER_RATE_LIMIT`)

### Database Security

- All user passwords are hashed with bcrypt
- Prisma uses parameterized queries (SQL injection protected)
- Multi-tenant queries always filter by `tenantId`

### Input Validation

All API inputs are validated using Zod schemas before processing.

---

## Contribution and Maintenance Notes

### Adding New Features

1. **Database changes**: Modify `packages/database/prisma/schema.prisma`
2. **Shared types**: Add to `packages/shared-types/src/`
3. **API routes**: Create new module in `apps/api/src/modules/`
4. **Frontend**: Add pages/components to respective apps

### Code Style

- TypeScript strict mode is enforced
- Use Pino logger (`@b2automate/logger`) for all logging
- Follow existing module patterns for consistency

### Testing (Status: Limited)

Testing infrastructure exists but is minimally implemented:
- `vitest` is configured in `apps/api`
- No comprehensive test suite currently exists

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update all workspaces
npm update --workspaces
```

### Database Migrations

```bash
# Development: Create migration
npm run db:migrate --workspace=packages/database

# Production: Apply migrations
npx prisma migrate deploy --schema=./packages/database/prisma/schema.prisma
```

### Logs

- API logs to stdout in JSON format (Pino)
- Docker logs are rotated (max 10MB, 3 files per container)
- Slow requests (>200ms) are logged as warnings

---

## Additional Documentation

- `ORACLE_DEPLOYMENT.md` - Detailed Oracle Cloud deployment guide
- `OPERATOR_RUNBOOK.md` - Operations and maintenance procedures
- `DELIVERY_ROADMAP.md` - Feature roadmap and phase planning
- `prd.md` - Product Requirements Document
