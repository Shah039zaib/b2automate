# Change Control Policy

## Classification

### Level 1: No PRD Required
Changes that can be made without formal approval:
- Bug fixes with no user-facing impact
- Log message updates
- Comment/documentation updates
- Dependency security patches (minor versions)

### Level 2: Team Review Required
Changes requiring peer review but no PRD:
- Bug fixes with user-facing impact
- Performance optimizations
- UI text changes
- Configuration changes

### Level 3: PRD Required (vNext)
Changes requiring formal PRD:
- New features
- Schema changes
- API contract changes
- New AI models/providers
- Pricing/limit changes
- New integrations

---

## Emergency Hotfix Policy

### Definition
A hotfix is an unplanned change required to:
- Restore service availability
- Fix security vulnerability
- Prevent data loss
- Stop cost bleeding

### Process
1. **Identify** — Document the issue
2. **Assess** — Is it truly emergency?
3. **Approve** — Verbal approval from Product Owner
4. **Implement** — Minimal fix only
5. **Test** — In staging if possible
6. **Deploy** — With rollback ready
7. **Document** — Post-incident report within 24h

### Approvers
- Primary: Product Owner
- Fallback: Tech Lead
- After-hours: On-call engineer (with retrospective)

---

## Code Freeze

### When Active
- After production go-live
- During incident response
- Holiday periods
- Major customer onboarding

### What's Allowed During Freeze
- Emergency hotfixes only
- Kill switch operations
- Configuration rollbacks
- Monitoring changes

### What's NOT Allowed
- Feature development
- Refactoring
- Non-critical bug fixes
- Dependency updates

---

## Approval Matrix

| Change Type | Developer | Tech Lead | Product | Emergency |
|-------------|-----------|-----------|---------|-----------|
| Level 1 | ✅ | - | - | ✅ |
| Level 2 | - | ✅ | - | ✅ |
| Level 3 | - | ✅ | ✅ | - |
| Hotfix | ✅ | ✅ | Verbal | ✅ |

---

## Post-Change Requirements

| Change Type | Code Review | Testing | Documentation |
|-------------|-------------|---------|---------------|
| Level 1 | Optional | Manual | No |
| Level 2 | Required | Manual | Changelog |
| Level 3 | Required | Full | PRD + Changelog |
| Hotfix | Post-facto | Minimal | Incident Report |
