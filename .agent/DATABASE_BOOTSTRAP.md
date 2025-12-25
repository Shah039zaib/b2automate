# Database Bootstrap System

## Overview

This document describes the **database bootstrap system** that ensures critical singleton rows exist before the API accepts requests.

---

## Why Bootstrap Exists

In a multi-tenant SaaS, certain singleton tables must have exactly **one row** for the system to function:

| Table | Purpose |
|-------|---------|
| `SystemSettings` | Global kill switches (AI, WhatsApp) |
| `GrowthSettings` | Platform marketing settings |

**Problem Without Bootstrap:**
- Empty database → first API call fails
- Race conditions on row creation
- Scattered get-or-create logic across services

**Solution:**
- Centralized bootstrap at startup
- Guaranteed row existence
- Safe defaults (features OFF)

---

## What Is Auto-Created

### SystemSettings

| Field | Default | Why |
|-------|---------|-----|
| `globalAiEnabled` | **false** | SAFE: AI must be explicitly enabled |
| `globalWhatsappEnabled` | **false** | SAFE: WhatsApp must be explicitly enabled |
| `defaultAiProvider` | `mock` | SAFE: No real API calls |
| `maxTenantsAllowed` | `100` | Reasonable limit |
| `maxMessagesPerHour` | `1000` | Rate limit |

### GrowthSettings

| Field | Default | Why |
|-------|---------|-----|
| `gaEnabled` | **false** | SAFE: No analytics tracking |
| `fbPixelEnabled` | **false** | SAFE: No pixel tracking |
| `couponEnabled` | **false** | SAFE: No discounts auto-applied |

---

## What Is NEVER Auto-Created

| Item | Reason |
|------|--------|
| `SubscriptionPlan` | Requires Stripe product/price IDs |
| `Subscription` | Created by checkout flow |
| `Tenant` | Created by onboarding |
| `User` | Created by registration |
| `ManualPayment` | Created by user payment submission |

**Rule:** Bootstrap NEVER touches billing, tenant, or user data.

---

## Failure Behavior

The bootstrap system is **crash-resistant**:

```
1. Database unreachable → Log error, continue startup
2. Row creation fails → Log warning, retry on access
3. Server always starts → Never process.exit() on bootstrap failure
```

**Safe Mode Response:**
```json
{
  "error": "System is initializing. Please try again in a moment.",
  "code": "SYSTEM_INITIALIZING"
}
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `services/bootstrap.service.ts` | Startup bootstrap logic |
| `lib/settings.ts` | Safe getters with fallbacks |
| `index.ts` | Startup hook integration |

---

## Usage

### At Startup (Automatic)

```typescript
// index.ts - runs before server starts
const bootstrapService = new BootstrapService(prisma);
await bootstrapService.runStartupBootstrap();
```

### In Services (Manual)

```typescript
import { getSystemSettings, getGrowthSettings } from '../lib/settings';

// Always returns valid object
const settings = await getSystemSettings(prisma);
if (settings.globalAiEnabled) {
    // AI is allowed
}
```

---

## Safety Checklist

- ✅ Idempotent (safe to run multiple times)
- ✅ Non-destructive (never deletes data)
- ✅ Features OFF by default
- ✅ No Stripe API calls
- ✅ No tenant mutations
- ✅ No billing activation
- ✅ Crash-resistant (logs errors, never crashes)

---

## Verification

After startup, you should see in logs:

```
=== DATABASE BOOTSTRAP STARTING ===
Database connection verified
SystemSettings created with safe defaults (AI: OFF, WhatsApp: OFF)
GrowthSettings created with safe defaults (Analytics: OFF, Coupon: OFF)
=== DATABASE BOOTSTRAP COMPLETE ===
```

Or if rows already exist:
```
=== DATABASE BOOTSTRAP STARTING ===
Database connection verified
SystemSettings already exists, skipping creation
GrowthSettings already exists, skipping creation
=== DATABASE BOOTSTRAP COMPLETE ===
```

---

## Production Readiness

This system is **production-safe** because:

1. **No data loss** - Only creates, never updates or deletes
2. **No auto-charges** - Billing features disabled by default
3. **No tracking** - Analytics disabled by default
4. **Graceful degradation** - Server runs even if bootstrap fails
5. **Audit-safe** - All operations logged
