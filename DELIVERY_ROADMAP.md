# B2Automate — Delivery Roadmap

**Created:** 2025-12-26  
**Source:** QA & Architecture Report v1.0  
**Purpose:** Production Delivery Planning  
**Mode:** Planning Only — No Implementation

---

## Section 1 — Production Go / No-Go Decision

### Decision: **CONDITIONAL GO** ✅

The system is **safe to deploy to first users** under the following conditions:

| Condition | Rationale |
|-----------|-----------|
| Manual payment approval workflow is OFF | Stripe is primary; manual payments can wait |
| First users are known/trusted (beta) | Limited blast radius for edge cases |
| WhatsApp rate limits are enforced | Prevents API abuse and account bans |
| Monitoring is active | Redis health, API response times, error rates |

### Risks Consciously Accepted

| Risk | Decision | Justification |
|------|----------|---------------|
| Token blacklist fail-open when Redis down | **ACCEPTED** | Redis downtime is rare; users can re-login if needed. Documented as known behavior. |
| Auth/Stripe flows have no automated tests | **ACCEPTED** | Manual smoke testing covers happy paths. Tests are post-launch priority. |
| WhatsApp (Baileys) is unofficial API | **ACCEPTED** | Core business requirement. Well-known industry practice. ToS risk documented. |
| Frontend has no automated tests | **ACCEPTED** | UI is straightforward; browser testing during development is sufficient for V1. |

### What Would Block Production

| Issue | Would Block? |
|-------|--------------|
| Hardcoded secrets | NO — Not present |
| SQL injection vectors | NO — Prisma ORM prevents |
| JWT secret weakness | NO — 32+ char enforced at boot |
| Missing tenant isolation | NO — Verified working |
| Payment data exposure | NO — Stripe handles PCI |

---

## Section 2 — Must-Fix Before Public Users

### Critical Blockers: **NONE**

Based on the QA & Architecture Report, **no issues block production deployment**.

All HIGH severity items (test coverage gaps) are quality risks, not safety blockers.

### Pre-Launch Checklist (Recommended, Not Blocking)

| Task | Why Important | Effort | Status |
|------|---------------|--------|--------|
| Update README with 1GB deployment notes | Operator clarity | S | TODO |
| Verify `.env.example` matches actual requirements | Prevent config errors | S | TODO |
| Confirm Redis connection handling logs errors | Debugging visibility | S | TODO |
| Run manual Stripe checkout flow end-to-end | Payment confidence | S | TODO |

**S = Small (< 1 hour), M = Medium (1-4 hours), L = Large (1+ day)**

---

## Section 3 — Post-Launch Tasks (V1.1)

### Priority 1: Authentication Testing (HIGH from report)

| Task | Description | Effort |
|------|-------------|--------|
| Add `AuthService.login` unit tests | Valid credentials, invalid credentials, tenant suspended | M |
| Add account lockout tests | 5 failures → locked, unlock after 15 min | S |
| Add token blacklist tests | Logout revokes token, Redis mock | M |
| Add password hashing verification | bcrypt round verification | S |

### Priority 2: Stripe Integration Testing (HIGH from report)

| Task | Description | Effort |
|------|-------------|--------|
| Add `StripeService.createCheckoutSession` tests | Mock Stripe SDK | M |
| Add webhook handler tests | checkout.session.completed, subscription.updated, payment_failed | M |
| Add idempotency verification | Duplicate event handling | S |
| Add signature verification tests | Valid/invalid signatures | S |

### Priority 3: AI Governance Testing (MEDIUM)

| Task | Description | Effort |
|------|-------------|--------|
| Add global kill switch tests | globalAiEnabled = false blocks all | S |
| Add tenant kill switch tests | isAiEnabled = false blocks tenant | S |
| Add daily/monthly limit tests | Counter increment, reset logic | M |
| Add tier model validation tests | Model allowlist by tier | S |

### Priority 4: Frontend Testing (MEDIUM from report)

| Task | Description | Effort |
|------|-------------|--------|
| Set up React Testing Library | Test infrastructure | M |
| Add auth context tests | Login state management | M |
| Add protected route tests | Redirect when unauthenticated | S |
| Add API error handling tests | Error toast display | S |

### Priority 5: Code Quality (LOW from report)

| Task | Description | Effort |
|------|-------------|--------|
| Create proper Stripe type interfaces | Replace `any` casts | S |
| Refactor `processInboundMessage` | Split into smaller functions | M |
| Document AI counter edge case | Known race condition on daily reset | S |

---

## Section 4 — Security Decision Record

### SDR-001: Token Blacklist Fail-Open

| Field | Value |
|-------|-------|
| **Decision** | Token blacklist fails OPEN when Redis is unavailable |
| **Date** | 2025-12-26 |
| **Status** | ACCEPTED |
| **Context** | `AuthService.isTokenBlacklisted()` returns `false` if Redis connection fails |
| **Rationale** | 1) Redis downtime is operationally rare. 2) Fail-closed would lock out ALL users during Redis outage. 3) JWT access tokens are short-lived (15 min). 4) Worst case: a logged-out user can act for up to 15 minutes if Redis goes down. |
| **Alternatives Considered** | Fail-closed (reject all if Redis down) — rejected due to availability impact |
| **Mitigation** | Monitor Redis health. Short token expiry limits exposure window. |

---

### SDR-002: WhatsApp Unofficial API

| Field | Value |
|-------|-------|
| **Decision** | Use @whiskeysockets/baileys for WhatsApp integration |
| **Date** | 2025-12-26 |
| **Status** | ACCEPTED |
| **Context** | Baileys is an unofficial WhatsApp Web API wrapper. WhatsApp ToS prohibits unofficial automation. |
| **Rationale** | 1) Official WhatsApp Business API has high cost and approval barriers. 2) Baileys is widely used in the industry. 3) Business requirement necessitates WhatsApp integration. |
| **Risks** | Account bans possible. No SLA or support. Breaking changes. |
| **Mitigation** | Rate limiting enforced. Graceful degradation on connection loss. Account diversification strategy for scale. |

---

### SDR-003: AI Default Provider Mock

| Field | Value |
|-------|-------|
| **Decision** | AI defaults to `mock` provider when no API keys configured |
| **Date** | 2025-12-26 |
| **Status** | ACCEPTED |
| **Context** | `AI_PROVIDER="mock"` is the default in `.env.example` |
| **Rationale** | Prevents accidental API costs. Enables development without real credentials. Explicit opt-in required for production AI. |
| **Action Required** | Operators MUST set `OPENROUTER_API_KEY` or `OPENAI_API_KEY` for real AI responses. |

---

## Section 5 — Testing Strategy (Realistic)

### What to Test FIRST

1. **Stripe Webhook Handlers** — Payment correctness is business-critical
2. **AuthService Core Flows** — Login, lockout, token revocation
3. **Tenant Isolation Middleware** — Security boundary (already has tests ✅)

### What Can Wait

1. Frontend component tests — UI is straightforward
2. AI orchestrator refactoring — Working correctly, complexity is maintainability issue
3. Performance benchmarks — 1GB constraint is known, optimize as needed

### What Must NEVER Use Real Credentials

| System | Requirement |
|--------|-------------|
| Stripe | Use `sk_test_*` keys only. Mock in unit tests. |
| OpenRouter/OpenAI | Mock in all tests. Never hit real API. |
| WhatsApp (Baileys) | Always mock. Never connect real session. |
| PostgreSQL | Use test database or in-memory (e.g., testcontainers) |
| Redis | Use in-memory mock (e.g., ioredis-mock) |

### Test Environment Variables

```bash
# Safe test configuration
AI_PROVIDER="mock"
STRIPE_SECRET_KEY="sk_test_..."
DATABASE_URL="postgresql://localhost:5432/b2automate_test"
REDIS_URL="redis://localhost:6379/1"  # Separate DB index
```

---

## Section 6 — Deployment Confidence

### Oracle Cloud Readiness: **YES** ✅

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1GB RAM constraint documented | ✅ | ORACLE_DEPLOYMENT.md exists |
| Docker Compose strategy defined | ✅ | Single-server deployment |
| Environment variables documented | ✅ | .env.example comprehensive |
| Build scripts verified | ⚠️ | UNVERIFIED — manual test recommended |
| Systemd/boot survival | ⚠️ | UNVERIFIED — needs testing on target VM |

### Resource Risk Summary

| Resource | Risk Level | Constraint | Mitigation |
|----------|------------|------------|------------|
| **RAM (1GB)** | MEDIUM | Low headroom | Node.js heap limits, single worker instance |
| **Redis** | LOW | Minimal memory footprint | Default config sufficient |
| **Worker Concurrency** | LOW | Single instance | BullMQ handles gracefully |
| **PostgreSQL** | LOW | External (Supabase) | No local memory impact |

### Rollback Confidence: **HIGH** ✅

| Scenario | Rollback Path |
|----------|---------------|
| Bad API deployment | Revert Docker image tag |
| Bad worker deployment | Revert Docker image tag |
| Database migration issue | Prisma migration rollback |
| Configuration error | Restore previous .env |

### Deployment Sequence (Recommended)

1. Deploy to Oracle VM with mock AI provider
2. Verify API health check (`/health`)
3. Verify Redis connection (check logs)
4. Configure Stripe test keys
5. Run manual checkout flow
6. Enable real AI provider
7. Connect WhatsApp session
8. Monitor first 24 hours

---

## Summary

| Section | Key Takeaway |
|---------|--------------|
| Go/No-Go | **CONDITIONAL GO** — Safe for beta users |
| Must-Fix | **NONE** blocking; pre-launch checklist is advisory |
| V1.1 Tasks | Auth tests, Stripe tests, then AI/Frontend tests |
| Security Decisions | 3 SDRs documented (blacklist, WhatsApp, mock AI) |
| Testing Strategy | Stripe first, auth second, never real credentials |
| Deployment | Oracle ready, monitor RAM, high rollback confidence |

---

**Document Status:** Final  
**Next Action:** Review and approve, then execute V1.0 deployment
