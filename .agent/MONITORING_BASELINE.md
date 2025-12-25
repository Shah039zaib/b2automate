# Monitoring Baseline

## Daily Health Checks

### Manual Checks (Required)
| Check | How | Healthy | Warning |
|-------|-----|---------|---------|
| API Health | `GET /health` | 200 OK | Timeout |
| Redis | `redis-cli ping` | PONG | Error |
| DB Connection | Prisma Studio opens | Opens | Fails |
| WhatsApp Sessions | Admin Panel | Connected | Disconnected |

### Dashboard Metrics (AI Usage Page)
| Metric | Location | Normal | Alert |
|--------|----------|--------|-------|
| Daily AI Requests | /ai-usage | < 1000 | > 5000 |
| Blocked % | /ai-usage | < 5% | > 20% |
| Guardrail Violations | /ai-usage | 0-5/day | > 20/day |
| Estimated Cost | /ai-usage | < $10/day | > $50/day |

---

## Alert Thresholds

### AI Usage Spike
- **Warning**: 3x normal daily average
- **Critical**: 10x normal OR >$50 cost/day
- **Action**: Check for abuse, reduce limits

### Blocked Requests
- **Warning**: >10% blocked in 1 hour
- **Critical**: >50% blocked in 1 hour
- **Action**: Check limits, provider status

### Redis Memory
- **Warning**: >70% memory used
- **Critical**: >90% memory used
- **Action**: Clear stale jobs, increase memory

### Error Rate
- **Warning**: >1% 5xx errors
- **Critical**: >5% 5xx errors
- **Action**: Check logs, restart if needed

### Response Time
- **Warning**: P95 > 500ms
- **Critical**: P95 > 2000ms
- **Action**: Check DB, Redis, provider latency

---

## Logging Locations

| Component | Where |
|-----------|-------|
| API Server | stdout, `apps/api/` + log level |
| WhatsApp Worker | stdout, worker process |
| Audit Logs | `audit_logs` table |
| AI Usage | `ai_usage_logs` table |
| Supabase | Supabase Dashboard > Logs |

---

## Key Queries

### Today's AI Usage
```sql
SELECT COUNT(*) FROM ai_usage_logs 
WHERE timestamp >= CURRENT_DATE;
```

### Blocked Requests Today
```sql
SELECT COUNT(*) FROM ai_usage_logs 
WHERE timestamp >= CURRENT_DATE AND "wasBlocked" = true;
```

### Top Tenants by Usage
```sql
SELECT t.name, t."aiDailyUsage", t."aiDailyLimit"
FROM tenants t
ORDER BY t."aiDailyUsage" DESC
LIMIT 10;
```

### Recent Guardrail Violations
```sql
SELECT * FROM audit_logs 
WHERE "eventType" = 'AI_GUARDRAIL_VIOLATION'
ORDER BY timestamp DESC LIMIT 20;
```

---

## Escalation Path

1. **On-Call Engineer** — First response, kill switches
2. **Tech Lead** — Architecture decisions
3. **Product Owner** — Business impact decisions
4. **External Support** — Supabase, OpenRouter
