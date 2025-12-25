# Production Go-Live Checklist

## Pre-Flight Checks

### Environment Variables
- [ ] `DATABASE_URL` — Supabase pooler connection
- [ ] `DIRECT_URL` — Supabase direct connection
- [ ] `REDIS_URL` — Production Redis instance
- [ ] `JWT_SECRET` — 32+ character secret (unique per env)
- [ ] `OPENROUTER_API_KEY` — Valid, with credits loaded
- [ ] `OPENAI_API_KEY` — Fallback (optional)
- [ ] `AI_PROVIDER` — Set to `openrouter`
- [ ] `OPENROUTER_MODEL` — Default: `google/gemini-2.0-flash-exp:free`
- [ ] `NODE_ENV` — Set to `production`
- [ ] `LOG_LEVEL` — Set to `info` or `warn`

### Database
- [ ] `npx prisma db push` — Schema applied
- [ ] SystemSettings record exists (`id: 'system'`)
- [ ] `globalAiEnabled: true`
- [ ] `globalWhatsappEnabled: true`

### Redis
- [ ] Redis running and accessible
- [ ] BullMQ queues created (inbound_events, outbound_messages)
- [ ] Memory < 80% threshold

### AI Providers
- [ ] OpenRouter API key tested
- [ ] Free tier limits understood (50/day without credits)
- [ ] Credits loaded if expecting >50 req/day
- [ ] Fallback to Mock tested

### Security
- [ ] JWT_SECRET is unique (not from .env.example)
- [ ] Rate limiting enabled
- [ ] CORS configured for admin/web domains only
- [ ] No debug logs in production

### Kill Switches
- [ ] Global AI kill switch tested (SystemSettings.globalAiEnabled)
- [ ] Tenant AI kill switch tested (Tenant.isAiEnabled)
- [ ] WhatsApp kill switch tested

---

## Go-Live Actions

1. [ ] Apply database schema: `npx prisma db push`
2. [ ] Start API server: `npm run start` (not dev)
3. [ ] Start WhatsApp worker: `npm run start:worker`
4. [ ] Verify health check: `GET /health`
5. [ ] Create first tenant via Admin Panel
6. [ ] Connect WhatsApp session
7. [ ] Send test message
8. [ ] Verify AI response
9. [ ] Check AiUsageLog entry created
10. [ ] Monitor for 15 minutes

---

## Rollback Plan

**Trigger**: Any critical failure within 1 hour of go-live

1. Set `globalAiEnabled: false` in SystemSettings
2. Set `globalWhatsappEnabled: false`
3. Investigate logs
4. Fix issue
5. Re-enable step by step

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| SRE | | | |
| Product | | | |
