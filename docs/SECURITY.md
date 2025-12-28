# Security Documentation - B2Automate

## Overview

B2Automate implements enterprise-grade security measures following OWASP Top 10 guidelines and industry best practices.

## Security Features

### 1. HTTP Security Headers

All API responses include comprehensive security headers:

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | Restrictive CSP | Prevents XSS, injection attacks |
| Strict-Transport-Security | max-age=31536000 | Forces HTTPS |
| X-Frame-Options | DENY | Prevents clickjacking |
| X-Content-Type-Options | nosniff | Prevents MIME sniffing |
| Referrer-Policy | strict-origin-when-cross-origin | Controls referrer leakage |
| Permissions-Policy | Restrictive | Limits browser APIs |
| X-XSS-Protection | 1; mode=block | Legacy XSS filter |

### 2. Authentication Security

- **Password Hashing**: bcrypt with cost factor 10
- **Password Requirements**: 8+ chars, uppercase, number
- **Account Lockout**: 5 failed attempts → 15 min lockout
- **Token Security**: JWT with RS256, 15 min access, 7 day refresh
- **Token Blacklisting**: Redis-based revocation

### 3. Multi-Tenant Isolation

- **Database Level**: Row Level Security (RLS) policies
- **Application Level**: tenantId filter on all queries  
- **JWT Enforcement**: Tenant from token, not headers
- **Cross-Tenant Blocking**: Automatic query filtering

### 4. Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login | 5 attempts | 15 min |
| Registration | 3 requests | 1 hour |
| API (FREE) | 100 requests | 1 day |
| API (STARTER) | 1,000 requests | 1 day |
| API (PRO) | 10,000 requests | 1 day |
| File Upload | 10 uploads | 1 hour |

### 5. Input Validation

- **File Uploads**: 10MB max, 5 files, images only
- **Request Payload**: 1MB JSON, 2MB form data
- **Filename Sanitization**: No path traversal
- **MIME Verification**: Magic number check

### 6. RBAC (Role-Based Access Control)

| Role | Permissions |
|------|-------------|
| SUPER_ADMIN | All operations |
| TENANT_ADMIN | read, write, delete, manage_users |
| STAFF | read, write |

## Vulnerability Reporting

Report vulnerabilities to: security@b2automate.com

### Responsible Disclosure

1. Report privately first
2. Allow 90 days for fix
3. Don't exploit the vulnerability
4. Don't access other users' data

## Security Testing

Run security tests:
```bash
npm run test -- test/security.spec.ts
```

## Compliance

- OWASP Top 10 compliant
- GDPR data protection ready
- SOC 2 controls aligned
