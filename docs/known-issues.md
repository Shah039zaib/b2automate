# Known Issues & Future Work

## npm Audit Vulnerabilities (Non-Critical)

As of Sprint 1 completion, the following moderate-severity vulnerabilities exist:

### 6 Moderate Severity Issues

| Package | Via | Severity | Impact | Fix Requires |
|---------|-----|----------|--------|--------------|
| **esbuild** | vite | Moderate | Dev server CORS bypass | vite@7.x (breaking) |
| **fast-jwt** | @fastify/jwt | Moderate | Token validation edge case | @fastify/jwt@10.x (breaking) |

### Detailed Analysis

#### esbuild (via vite)
- **GHSA-67mh-4wv8-2f99**: CORS bypass in dev server
- **Severity**: Moderate
- **Impact**: Development only - allows any website to make requests to dev server
- **Production Impact**: None (Nginx reverse proxy handles CORS)
- **Fix**: Upgrade vite to v7.x (breaking changes)
- **Status**: Deferred to post-production

#### fast-jwt (via @fastify/jwt)
- **GHSA-gm45-q3v2-6cf8**: Improper `iss` claim validation
- **Severity**: Moderate
- **Impact**: Runtime authentication
- **Mitigation**: Additional validation via Redis blacklist layer
- **Fix**: Upgrade @fastify/jwt to v10.x (breaking changes)
- **Status**: Planned for Sprint 3 with comprehensive testing

### Risk Assessment

| Factor | Assessment |
|--------|------------|
| Exploitability | Low - requires specific conditions |
| Data Exposure | None - additional layers prevent bypass |
| Production Safety | ✅ Acceptable with mitigations |
| Priority | Medium - plan for future sprint |

### Current Mitigations

1. **Production Nginx** - Handles CORS, rate limiting, security headers
2. **Redis Blacklist** - Token revocation layer prevents replay attacks
3. **JWT Expiry** - 15-minute access tokens limit exposure window
4. **Account Lockout** - Brute force protection via Redis

### Future Action Plan

| Sprint | Package | Action |
|--------|---------|--------|
| Sprint 3 | @fastify/jwt | Upgrade to v10.x with full test coverage |
| Post-Production | vite | Upgrade to v7.x for dev environment |

---

## Recommendations

- **Do NOT** run `npm audit fix --force` - will break the application
- **Do** document any new vulnerabilities here
- **Do** plan major upgrades with dedicated testing sprints
- **Do** review this document before each production deployment
