# Stripe Billing - Testing Guide (Roman Urdu)

## Prerequisites / Zarooratain

1. **Stripe Test Mode Account**: https://dashboard.stripe.com/test/apikeys se keys lein
2. **Stripe CLI**: `npm install -g stripe` ya download karein
3. **Environment Variables**: `.env` mein yeh add karein:
   ```bash
   STRIPE_SECRET_KEY="sk_test_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."
   WEB_APP_URL="http://localhost:5173"
   ```

---

## Phase 1: Database Migration (Pehla Qadam)

```bash
cd packages/database
npx prisma db push
```

Agar error aaye toh:
- `DATABASE_URL` aur `DIRECT_URL` check karein
- Supabase pooler vs direct connection verify karein

---

## Phase 2: Stripe Mein Products/Prices Banaein

1. Dashboard: https://dashboard.stripe.com/test/products
2. "Add product" click karein
3. Yeh plans banaein:

| Plan Name | Price | Type | Notes |
|-----------|-------|------|-------|
| Free | $0 | Recurring | Billing OFF (no payment) |
| Basic | $29/mo | Recurring | Standard |
| Pro | $49/mo | Recurring | Popular |
| Enterprise | $99/mo | Recurring | Premium |

4. Har product ka `prod_xxx` aur `price_xxx` copy karein

---

## Phase 3: Plans Database Mein Add Karein (Super Admin)

API call karein (Postman/curl):

```bash
# Pehle Super Admin login karein
POST /auth/login
{
    "email": "admin@b2automate.com",
    "password": "..."
}

# Token milne ke baad, plan create karein
POST /admin/plans
Authorization: Bearer <token>
{
    "name": "Pro",
    "description": "Best value plan",
    "stripeProductId": "prod_xxx",
    "stripePriceId": "price_xxx",
    "aiPlan": "PAID_PRO",
    "aiTier": "MEDIUM",
    "aiDailyLimit": 2000,
    "aiMonthlyLimit": 50000,
    "priceAmount": 4900,
    "priceCurrency": "usd",
    "priceInterval": "month",
    "displayOrder": 2
}
```

---

## Phase 4: Local Webhook Testing (IMPORTANT!)

### Terminal 1 - Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Yeh command `whsec_xxx` dega - `.env` mein `STRIPE_WEBHOOK_SECRET` mein daalein.

### Terminal 2 - API Server:
```bash
cd apps/api && npm run dev
```

### Terminal 3 - Web App:
```bash
cd apps/web && npm run dev
```

---

## Phase 5: Checkout Test Karein

### Step 1: Checkout Session Start
```bash
POST /checkout/session
{
    "planId": "<plan-uuid>",
    "tenantId": "<tenant-uuid>",
    "email": "test@example.com"
}
```

Response mein `url` milega - browser mein kholein.

### Step 2: Stripe Test Card Use Karein
- Card: `4242 4242 4242 4242`
- Expiry: Koi bhi future date
- CVC: Koi bhi 3 digits

### Step 3: Success Page Dekho
- `/checkout/success` pe redirect hoga
- Database mein check karein:
  - `subscriptions` table mein entry
  - `tenants` table mein `aiPlan`, `aiTier` updated

---

## Phase 6: Webhook Events Test Karein

### Manually Trigger (Stripe CLI):
```bash
# Subscription created
stripe trigger customer.subscription.created

# Payment failed
stripe trigger invoice.payment_failed

# Subscription canceled
stripe trigger customer.subscription.deleted
```

### Verify in Database:
```sql
-- Check webhook idempotency
SELECT * FROM stripe_webhook_events ORDER BY "processedAt" DESC;

-- Check tenant AI tier changed
SELECT id, name, "aiPlan", "aiTier", "aiDailyLimit" FROM tenants;

-- Check subscription status
SELECT * FROM subscriptions;
```

---

## Phase 7: Failure Scenarios

### 1. Payment Decline Test
Card: `4000 0000 0000 0002`
Expected: `invoice.payment_failed` webhook, subscription `PAST_DUE`

### 2. Duplicate Webhook
Same webhook 2 baar send karein:
```bash
stripe trigger checkout.session.completed
stripe trigger checkout.session.completed
```
Expected: Sirf ek baar process ho, doosra skip

### 3. Invalid Signature
API directly call karein bina signature ke:
```bash
curl -X POST http://localhost:3000/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}'
```
Expected: 400 error

---

## Phase 8: AI Tier Auto-Enforcement Verify

### Before Subscription:
```sql
SELECT "aiPlan", "aiTier", "aiDailyLimit", "aiMonthlyLimit" 
FROM tenants WHERE id = '<tenant-id>';
-- Expected: FREE, FREE, 50, 1000
```

### After Pro Subscription:
```sql
SELECT "aiPlan", "aiTier", "aiDailyLimit", "aiMonthlyLimit" 
FROM tenants WHERE id = '<tenant-id>';
-- Expected: PAID_PRO, MEDIUM, 2000, 50000
```

### After Cancellation:
```sql
SELECT "aiPlan", "aiTier", "aiDailyLimit", "aiMonthlyLimit" 
FROM tenants WHERE id = '<tenant-id>';
-- Expected: FREE, FREE, 50, 1000 (downgraded)
```

---

## Troubleshooting / Mushkilaat

### Q: Webhook nahi aa rahe?
A: 
1. Stripe CLI running hai?
2. `STRIPE_WEBHOOK_SECRET` correct hai?
3. Firewall block toh nahi kar raha?

### Q: "Stripe not configured" error?
A:
1. `STRIPE_SECRET_KEY` set hai `.env` mein?
2. Server restart kiya?

### Q: Subscription create nahi ho rahi?
A:
1. Plan database mein hai?
2. `stripePriceId` match karta hai?
3. Tenant already subscribed toh nahi?

---

## Success Criteria ✅

- [ ] Checkout session create ho rahi hai
- [ ] Stripe hosted checkout kaam kar raha
- [ ] Webhook receive ho rahe hain
- [ ] Subscription database mein save ho rahi
- [ ] AI tier automatically update ho raha
- [ ] Duplicate webhooks skip ho rahe hain
- [ ] Cancellation pe FREE downgrade ho raha
- [ ] Payment failure pe PAST_DUE set ho raha

**Jab sab green ho, toh Stripe Billing LIVE hai! 🎉**
