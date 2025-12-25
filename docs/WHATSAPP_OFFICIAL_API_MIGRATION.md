# WhatsApp Official API Migration Guide

> **Status:** DOCUMENTATION ONLY - No implementation yet
> **Risk Level:** HIGH (Legal + Behavioral changes)
> **Estimated Effort:** 4-6 weeks

---

## Current State: Baileys (Unofficial)

The system currently uses [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) for WhatsApp integration.

### Advantages
- Free, no Meta approval needed
- Quick setup
- Full message access

### Risks
| Risk | Severity | Probability |
|------|----------|-------------|
| Account ban | HIGH | Medium (prolific use) |
| Legal action from Meta | MEDIUM | Low |
| Breaking changes | HIGH | High (no SLA) |
| Session instability | MEDIUM | Medium |

---

## Target: WhatsApp Business API (Official)

### Prerequisites

1. **Meta Business Account** (verified)
2. **WhatsApp Business Platform** access approval
3. **Phone number** dedicated to Business API
4. **Webhook server** (HTTPS required)
5. **Meta App** configured with WhatsApp Product

### Provider Options

| Provider | Pricing | Pros | Cons |
|----------|---------|------|------|
| Meta Cloud API | Per-conversation | Official, reliable | Complex setup |
| Twilio | Per-message + platform | Easy SDK, support | Higher cost |
| MessageBird | Per-message | EU hosting option | Less documentation |

---

## Migration Steps

### Phase 1: Account Setup (Week 1)
1. Create Meta Business Account
2. Apply for WhatsApp Business API access
3. Register business phone number
4. Configure webhook endpoint

### Phase 2: Code Changes (Week 2-3)
1. Create new `official-whatsapp.provider.ts`
2. Abstract session management (no QR code flow)
3. Implement webhook receiver for incoming messages
4. Update message sending to use Cloud API

### Phase 3: Testing (Week 4)
1. Test all message types (text, media, templates)
2. Verify webhook reliability
3. Test rate limits (official has strict limits)
4. Validate message status callbacks

### Phase 4: Migration (Week 5-6)
1. Parallel run both systems
2. Migrate tenants one by one
3. Monitor for issues
4. Deprecate Baileys

---

## Code Changes Required

### New Files
```
apps/api/src/services/whatsapp-cloud-api.service.ts
apps/api/src/routes/whatsapp-webhook.routes.ts
```

### Modified Files
```
apps/whatsapp-worker/src/session-manager.ts  → Abstract or replace
apps/whatsapp-worker/src/index.ts           → New worker logic
packages/shared-types/src/whatsapp.ts       → Add Cloud API types
```

### Schema Changes
```prisma
model Tenant {
  // Add official API fields
  whatsappPhoneNumberId    String?
  whatsappBusinessAccountId String?
  whatsappAccessToken      String?  // Encrypted
  whatsappWebhookSecret    String?
}
```

---

## Breaking Changes

1. **No QR Code** - Official API uses phone number registration, not QR scanning
2. **Template Messages Required** - First contact must use approved template
3. **24-Hour Window** - Can only free-text reply within 24h of customer message
4. **Rate Limits** - Much stricter than unofficial (1000 messages/day initially)
5. **Webhook-Based** - Push model instead of polling

---

## Cost Considerations

| Message Type | Cost (USD) | Notes |
|--------------|------------|-------|
| User-initiated conversation | $0.005-0.08 | Within 24h window |
| Business-initiated (marketing) | $0.05-0.15 | Requires template |
| Business-initiated (utility) | $0.03-0.08 | Requires template |

---

## Recommendation

> **Do NOT migrate until:**
> 1. Revenue justifies official API costs
> 2. Legal team approves current Baileys usage
> 3. 6-month runway exists for migration effort
> 4. Tenant count exceeds 50 (economies of scale)

For now, continue with Baileys but:
- Implement graceful degradation for bans
- Have backup numbers ready
- Monitor Meta's enforcement patterns
