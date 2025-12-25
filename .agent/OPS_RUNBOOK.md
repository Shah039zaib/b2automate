# Operations Runbook

## Incident Response Procedures

---

## 1. WhatsApp Ban Incident

### Symptoms
- WhatsApp connection drops
- `WHATSAPP_CONNECTION_UPDATE` audit logs show disconnected
- Messages fail to send

### Immediate Actions
1. **DO NOT reconnect immediately** (could worsen ban)
2. Set `isWhatsappEnabled: false` for affected tenant
3. Wait 24-48 hours before retry

### Kill Switch
```sql
UPDATE tenants SET "isWhatsappEnabled" = false WHERE id = '<tenant_id>';
```

### Recovery
1. Wait minimum 24 hours
2. Create new WhatsApp session with different device
3. Scan QR code
4. Re-enable: `isWhatsappEnabled: true`
5. Monitor for 1 hour

---

## 2. AI Cost Spike

### Symptoms
- OpenRouter billing alert
- Unexpected high usage in `/admin/ai-usage/overview`
- Single tenant consuming >80% of requests

### Immediate Actions
1. Identify tenant: `GET /admin/ai-usage/by-tenant`
2. Check for abuse patterns
3. Reduce tenant limits or disable

### Kill Switch
```sql
-- Disable AI for specific tenant
UPDATE tenants SET "isAiEnabled" = false WHERE id = '<tenant_id>';

-- Or reduce to minimum limits
UPDATE tenants SET "aiDailyLimit" = 5, "aiMonthlyLimit" = 50 WHERE id = '<tenant_id>';
```

### Recovery
1. Contact tenant to understand usage
2. Upgrade to appropriate plan if legitimate
3. Block if abuse confirmed

---

## 3. Redis Down

### Symptoms
- API errors: `ECONNREFUSED` to Redis
- BullMQ job failures
- WhatsApp messages not processing

### Immediate Actions
1. Check Redis status: `redis-cli ping`
2. Restart Redis if needed
3. If Redis Cloud: Check dashboard

### Kill Switch
```sql
-- Disable all WhatsApp to prevent queue buildup
UPDATE system_settings SET "globalWhatsappEnabled" = false WHERE id = 'system';
```

### Recovery
1. Restore Redis connection
2. Check BullMQ queues for stuck jobs
3. Re-enable WhatsApp
4. Monitor queue processing

---

## 4. Supabase Slow / Down

### Symptoms
- API latency >2 seconds
- `SLOW API response` logs
- `P1001: Can't reach database server`

### Immediate Actions
1. Check Supabase status: status.supabase.com
2. Check connection pooler limits
3. Reduce concurrent connections if needed

### Kill Switch
```sql
-- Cannot execute if DB is down
-- Use Supabase Dashboard to pause project
```

### Recovery
1. Wait for Supabase recovery
2. Reconnect Prisma clients
3. Restart API server

---

## 5. AI Provider Outage

### Symptoms
- OpenRouter 500 errors
- AI responses failing
- `AI_FAILURE_FALLBACK_SENT` audit logs

### Immediate Actions
1. Check OpenRouter status: status.openrouter.ai
2. Fallback chain should auto-trigger (OpenRouter → OpenAI → Mock)

### Kill Switch
```sql
-- Switch to mock for all
UPDATE system_settings SET "defaultAiProvider" = 'mock' WHERE id = 'system';
```

### Recovery
1. Wait for provider recovery
2. Test with single request
3. Re-enable: `defaultAiProvider = 'openrouter'`

---

## 6. Tenant Abuse (Spam/Jailbreak)

### Symptoms
- Rapid message volume from single customer
- `AI_GUARDRAIL_VIOLATION` spikes
- Unusual content in messages

### Immediate Actions
1. Identify tenant
2. Disable AI immediately
3. Review conversation logs

### Kill Switch
```sql
-- Disable AI for tenant
UPDATE tenants SET "isAiEnabled" = false WHERE id = '<tenant_id>';

-- Suspend tenant entirely
UPDATE tenants SET status = 'SUSPENDED' WHERE id = '<tenant_id>';
```

### Recovery
1. Review abuse evidence
2. Contact tenant owner
3. Decide: warn, restrict, or terminate
4. Document in AuditLog

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| On-Call SRE | TBD |
| Product Owner | TBD |
| Supabase Support | support.supabase.com |
| OpenRouter Support | support@openrouter.ai |
