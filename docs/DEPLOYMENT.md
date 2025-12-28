# Deployment Guide - B2Automate

## Quick Start

### Prerequisites
- Node.js 20.x LTS
- PostgreSQL 15+ (via Supabase)
- Redis 7+
- Docker (optional)

### Environment Setup

```bash
# Clone repository
git clone https://github.com/your-org/b2automate.git
cd b2automate

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Configure environment variables
# See Environment Variables section below
```

## Environment Variables

### Required Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
DIRECT_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-256-bit-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Stripe (Production)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# OpenRouter AI
OPENROUTER_API_KEY=sk-or-xxx
```

### Optional Variables

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Logging
LOG_LEVEL=info
```

## Database Setup

### Prisma Migrations

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed initial data (optional)
npx prisma db seed
```

### RLS Policies

Row Level Security is automatically configured. Verify:

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

## Build & Deploy

### Production Build

```bash
# Build all packages
npm run build

# Run production server
npm run start
```

### Docker Deployment

```bash
# Build Docker image
docker build -t b2automate .

# Run container
docker run -d \
  --name b2automate \
  -p 3000:3000 \
  --env-file .env.production \
  b2automate
```

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: ./apps/api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
  
  worker:
    build: ./apps/worker
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Nginx Configuration

```nginx
upstream api {
    server localhost:3000;
}

server {
    listen 443 ssl http2;
    server_name api.b2automate.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Monitoring & Health

### Health Check Endpoint

```bash
curl http://localhost:3000/health
# {"status":"ok","uptime":12345,"version":"1.0.0"}
```

### Logging

Structured JSON logs are written to stdout. Use log aggregation:
- Datadog
- Grafana + Loki
- AWS CloudWatch

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Redis connected
- [ ] SSL/TLS configured
- [ ] Health checks responding
- [ ] Monitoring configured
- [ ] Backups scheduled
- [ ] Rate limits verified
- [ ] Security headers present
- [ ] Error tracking enabled

## Troubleshooting

### Common Issues

**Database Connection Failed**
- Verify DATABASE_URL format
- Check network/firewall rules
- Verify SSL settings

**Redis Connection Refused**
- Check REDIS_URL
- Verify Redis is running
- Check authentication

**JWT Verification Failed**
- Ensure JWT_SECRET matches across instances
- Check token expiration settings
