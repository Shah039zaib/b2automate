# Contributing to B2Automate

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 20.x LTS
- npm 10+
- Git
- PostgreSQL 15+ (or Supabase account)
- Redis 7+

### Getting Started

```bash
# Fork the repository first, then clone
git clone https://github.com/YOUR-USERNAME/b2automate.git
cd b2automate

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

## Code Style

### TypeScript

- Use strict mode
- No `any` types (document exceptions)
- Use proper interfaces for all data shapes
- Document public APIs with JSDoc

### Formatting

We use Prettier for consistent formatting:

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

### Linting

ESLint enforces code quality:

```bash
# Run linting
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

## Commit Conventions

We follow [Conventional Commits](https://conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting changes
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(auth): add password reset flow
fix(orders): correct total calculation with discounts
docs(api): update authentication examples
test(services): add CRUD integration tests
```

## Pull Request Process

### Before Submitting

1. **Create an issue first** for significant changes
2. **Fork the repository** and create a feature branch
3. **Follow code style** guidelines
4. **Add tests** for new functionality
5. **Update documentation** as needed
6. **Run all checks** locally

### PR Checklist

```bash
# Run all checks before submitting
npm run lint
npm run typecheck
npm run test
npm run build
```

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] All checks passing
```

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- test/auth.service.spec.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Writing Tests

- Place tests in `test/` directory
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Aim for 65%+ coverage

## Project Structure

```
b2automate/
├── apps/
│   ├── api/           # Fastify API server
│   ├── web/           # React frontend
│   └── worker/        # WhatsApp worker
├── packages/
│   ├── database/      # Prisma schema & client
│   ├── ai-core/       # AI orchestration
│   └── shared/        # Shared utilities
└── docs/              # Documentation
```

## Getting Help

- **Issues**: Report bugs or request features
- **Discussions**: Ask questions
- **Discord**: Real-time chat (link in README)

## Code of Conduct

Be respectful, inclusive, and constructive. See CODE_OF_CONDUCT.md.

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.
