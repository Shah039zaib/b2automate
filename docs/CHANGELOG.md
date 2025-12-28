# Changelog

All notable changes to B2Automate will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive security test suite (74 tests)
- Security headers plugin with 7 HTTP security headers
- API integration tests (45 tests)
- Authentication service tests (15 tests)
- Orders service tests (11 tests)
- AI orchestrator tests (9 tests)
- Tenant isolation tests (3 tests)
- SECURITY.md documentation
- DEPLOYMENT.md guide
- CONTRIBUTING.md guidelines

### Changed
- Improved TypeScript type safety (65+ `any` types fixed)
- Enhanced error handling with proper type guards
- Updated test mocks for AI governance

### Fixed
- Test suite now at 100% pass rate
- Fixed Prisma mock implementations
- Fixed AIOrchestrator constructor calls
- Fixed method signature mismatches in auth tests

### Security
- Added Content-Security-Policy header
- Added Strict-Transport-Security header
- Added X-Frame-Options (DENY)
- Added X-Content-Type-Options (nosniff)
- Added Referrer-Policy header
- Added Permissions-Policy header
- Added X-XSS-Protection header

## [1.0.0] - 2024-12-28

### Added
- Initial release
- Multi-tenant SaaS architecture
- AI-powered WhatsApp automation
- Subscription billing with Stripe
- Order management workflow
- Template management
- Scheduled messaging
- Admin dashboard
- Rate limiting per tenant plan
- JWT-based authentication
- Role-based access control (RBAC)

### Technical
- Fastify 4.x API server
- React 18 + Vite frontend
- Prisma ORM with PostgreSQL
- BullMQ job processing
- Baileys WhatsApp integration
- OpenRouter AI integration
