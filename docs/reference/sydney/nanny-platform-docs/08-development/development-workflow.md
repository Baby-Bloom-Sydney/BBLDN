> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Development Workflow

> How to contribute code to Baby Bloom Sydney.

## Overview

_Standard workflow for developing features and fixing bugs._

---

## Git Workflow

### Branch Strategy
```
main (production)
└── develop (staging)
    ├── feature/user-auth
    ├── feature/nanny-search
    └── fix/booking-bug
```

### Branch Naming
| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/short-description` | `feature/nanny-profile` |
| Bug fix | `fix/short-description` | `fix/search-pagination` |
| Hotfix | `hotfix/short-description` | `hotfix/payment-error` |
| Chore | `chore/short-description` | `chore/update-deps` |
| Docs | `docs/short-description` | `docs/api-readme` |

---

## Development Process

### 1. Pick Up a Task
- Check project board for available tasks
- Assign yourself to the task
- Move to "In Progress"

### 2. Create a Branch
```bash
# Update main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/my-feature
```

### 3. Develop
- Write code
- Write/update tests
- Commit frequently with good messages

### 4. Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

Examples:
```
feat(auth): add email verification flow
fix(search): correct distance calculation
docs(api): update endpoint documentation
```

### 5. Push and Create PR
```bash
git push origin feature/my-feature
```

Then create Pull Request on GitHub.

---

## Pull Request Process

### PR Template
```markdown
## Description
[What does this PR do?]

## Type of Change
- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor

## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
```

### PR Requirements
- [ ] All checks passing (lint, tests, build)
- [ ] At least 1 approval
- [ ] No merge conflicts
- [ ] Branch up to date with main

### Code Review Guidelines

**For Reviewers:**
- Be constructive and specific
- Approve if minor issues (note them)
- Request changes if blocking issues
- Respond within 24 hours

**For Authors:**
- Respond to all comments
- Request re-review after changes
- Keep PR scope manageable

---

## Local Development

### Daily Workflow
```bash
# Start of day
git checkout main
git pull origin main

# Start Supabase
supabase start

# Start dev server
pnpm dev
```

### Before Committing
```bash
# Run linting
pnpm lint

# Run tests
pnpm test

# Check types
pnpm type-check
```

### Before PR
```bash
# Make sure branch is up to date
git fetch origin main
git rebase origin/main

# Run full check
pnpm lint && pnpm test && pnpm build
```

---

## Testing Requirements

### Unit Tests
- All utility functions
- Business logic
- API route handlers

### Component Tests
- Key UI components
- User interactions
- Edge cases

### E2E Tests
- Critical user flows
- Authentication
- Booking process

### Coverage Goals
| Type | Target |
|------|--------|
| Unit | 80% |
| Component | 70% |
| E2E | Key flows |

---

## Coding Standards

### TypeScript
- Strict mode enabled
- No `any` types (use `unknown` if needed)
- Explicit return types for functions

### React
- Functional components only
- Use hooks appropriately
- Memoize expensive operations

### Styling
- Tailwind CSS utilities
- Component-scoped styles if needed
- Mobile-first approach

### File Organization
- One component per file
- Colocate tests with source
- Group by feature when possible

---

## Debugging

### Useful Commands
```bash
# Check Supabase logs
supabase logs

# Database GUI
supabase studio

# Check Stripe webhooks
stripe logs tail
```

### VS Code Debug Config
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug",
      "type": "node-terminal",
      "request": "launch",
      "command": "pnpm dev"
    }
  ]
}
```

---

## Open Questions

- [ ] _CI/CD pipeline specifics?_
- [ ] _Code owners for specific areas?_
- [ ] _Release process?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
