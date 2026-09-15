> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Project Structure Map

> Complete directory structure for Baby Bloom Sydney documentation.

---

## Directory Tree

```
nanny-platform/
│
├── README.md                           # Project overview and quick start
├── STRUCTURE-MAP.md                    # This file - complete structure guide
│
├── docs/                               # All project documentation
│   │
│   ├── 01-business/                    # Business strategy & model
│   │   ├── business-model.md           # How we create and capture value
│   │   ├── revenue-model.md            # Pricing, fees, commission structure
│   │   ├── competitive-analysis.md     # Market landscape, competitors
│   │   └── growth-strategy.md          # User acquisition, scaling plans
│   │
│   ├── 02-users/                       # User research & journeys
│   │   ├── user-types.md               # Nannies, parents, admins defined
│   │   ├── nanny-journey.md            # End-to-end nanny experience
│   │   ├── parent-journey.md           # End-to-end parent experience
│   │   ├── admin-workflow.md           # Admin processes and tools
│   │   └── user-permissions.md         # Access control matrix
│   │
│   ├── 03-features/                    # Feature specifications
│   │   │
│   │   ├── onboarding/                 # User onboarding features
│   │   │   ├── nanny-signup.md         # Nanny registration flow
│   │   │   ├── profile-creation.md     # Profile building process
│   │   │   └── ai-profile-generation.md # AI-assisted profile writing
│   │   │
│   │   ├── verification/               # Trust & safety features
│   │   │   ├── passport-verification.md # ID verification process
│   │   │   ├── wwcc-verification.md    # Working With Children Check
│   │   │   └── badge-system.md         # Trust badges and display
│   │   │
│   │   ├── matching/                   # Discovery & matching
│   │   │   ├── search-algorithm.md     # Search ranking and filters
│   │   │   ├── geolocation-matching.md # Location-based matching
│   │   │   └── request-system.md       # Care request posting
│   │   │
│   │   ├── communication/              # Messaging & notifications
│   │   │   ├── email-orchestration.md  # Email system and templates
│   │   │   ├── interview-coordination.md # AI interview scheduling
│   │   │   └── notifications.md        # Push, in-app, SMS notifications
│   │   │
│   │   └── social/                     # Social integrations
│   │       └── facebook-integration.md # Facebook login, ads, groups
│   │
│   ├── 04-technical/                   # Technical documentation
│   │   │
│   │   ├── architecture/               # System design
│   │   │   ├── system-overview.md      # High-level architecture
│   │   │   ├── tech-stack.md           # Technologies used
│   │   │   └── deployment-strategy.md  # CI/CD and environments
│   │   │
│   │   ├── database/                   # Data layer
│   │   │   ├── schema.md               # Database tables and columns
│   │   │   ├── relationships.md        # Foreign keys and joins
│   │   │   └── migrations.md           # Migration strategy
│   │   │
│   │   ├── api/                        # Backend API
│   │   │   ├── endpoints.md            # All API endpoints
│   │   │   ├── authentication.md       # Auth implementation
│   │   │   └── api-design.md           # API design principles
│   │   │
│   │   └── frontend/                   # Frontend architecture
│   │       ├── pages.md                # All application pages
│   │       ├── components.md           # Reusable UI components
│   │       └── routing.md              # Navigation and routing
│   │
│   ├── 05-ai-integration/              # AI features
│   │   ├── overview.md                 # AI strategy and approach
│   │   ├── models-used.md              # Model selection and config
│   │   │
│   │   └── prompts/                    # AI prompt templates
│   │       ├── profile-generation.md   # Bio writing prompts
│   │       ├── passport-verification.md # Document analysis prompts
│   │       ├── wwcc-verification.md    # WWCC card reading prompts
│   │       └── email-coordination.md   # Interview email prompts
│   │
│   ├── 06-existing-system/             # Current system documentation
│   │   ├── overview.md                 # Current architecture summary
│   │   ├── migration-plan.md           # Migration strategy
│   │   │
│   │   ├── wix-scripts/                # Wix website code
│   │   │   └── inventory.md            # Pages, forms, Velo code
│   │   │
│   │   ├── gas-scripts/                # Google Apps Script
│   │   │   └── inventory.md            # Sheets structure, scripts
│   │   │
│   │   ├── make-blueprints/            # Make.com automations
│   │   │   └── inventory.md            # Scenarios and webhooks
│   │   │
│   │   └── github-scripts/             # Additional scripts
│   │       └── inventory.md            # External code inventory
│   │
│   ├── 07-business-rules/              # Business logic rules
│   │   ├── verification-rules.md       # Verification requirements
│   │   ├── matching-rules.md           # Search and visibility rules
│   │   ├── payment-rules.md            # Payment and refund policies
│   │   └── security-rules.md           # Safety and privacy rules
│   │
│   └── 08-development/                 # Developer guides
│       ├── setup-guide.md              # Local environment setup
│       ├── development-workflow.md     # Git workflow, PR process
│       ├── testing-strategy.md         # Testing approach and tools
│       └── deployment-guide.md         # Deployment procedures
│
├── planning/                           # Project management
│   ├── timeline.md                     # Project schedule
│   ├── milestones.md                   # Key milestones and criteria
│   ├── daily-logs.md                   # Development progress log
│   └── decisions.md                    # Architecture Decision Records
│
└── scripts/                            # Utility scripts (empty initially)
    └── (future migration scripts, etc.)
```

---

## Folder Descriptions

| Folder | Purpose |
|--------|---------|
| `docs/01-business/` | Business model, revenue, market strategy |
| `docs/02-users/` | User personas, journeys, permissions |
| `docs/03-features/` | Detailed feature specifications |
| `docs/04-technical/` | Architecture, database, API, frontend |
| `docs/05-ai-integration/` | AI features and prompt templates |
| `docs/06-existing-system/` | Current Wix/Sheets/Make documentation |
| `docs/07-business-rules/` | Policies and validation rules |
| `docs/08-development/` | Developer setup and workflow guides |
| `planning/` | Timeline, milestones, progress tracking |
| `scripts/` | Utility and migration scripts |

---

## Documentation Status

### Business & Strategy
| Document | Status |
|----------|--------|
| business-model.md | 🔴 Template |
| revenue-model.md | 🔴 Template |
| competitive-analysis.md | 🔴 Template |
| growth-strategy.md | 🔴 Template |

### Users
| Document | Status |
|----------|--------|
| user-types.md | 🔴 Template |
| nanny-journey.md | 🔴 Template |
| parent-journey.md | 🔴 Template |
| admin-workflow.md | 🔴 Template |
| user-permissions.md | 🔴 Template |

### Features
| Document | Status |
|----------|--------|
| onboarding/* | 🔴 Template |
| verification/* | 🔴 Template |
| matching/* | 🔴 Template |
| communication/* | 🔴 Template |
| social/* | 🔴 Template |

### Technical
| Document | Status |
|----------|--------|
| architecture/* | 🔴 Template |
| database/* | 🔴 Template |
| api/* | 🔴 Template |
| frontend/* | 🔴 Template |

### AI Integration
| Document | Status |
|----------|--------|
| overview.md | 🔴 Template |
| prompts/* | 🔴 Template |
| models-used.md | 🔴 Template |

### Existing System
| Document | Status |
|----------|--------|
| overview.md | 🔴 Template |
| *-scripts/inventory.md | 🔴 Template |
| migration-plan.md | 🔴 Template |

### Business Rules
| Document | Status |
|----------|--------|
| verification-rules.md | 🔴 Template |
| matching-rules.md | 🔴 Template |
| payment-rules.md | 🔴 Template |
| security-rules.md | 🔴 Template |

### Development
| Document | Status |
|----------|--------|
| setup-guide.md | 🔴 Template |
| development-workflow.md | 🔴 Template |
| testing-strategy.md | 🔴 Template |
| deployment-guide.md | 🔴 Template |

### Planning
| Document | Status |
|----------|--------|
| timeline.md | 🔴 Template |
| milestones.md | 🔴 Template |
| daily-logs.md | 🔴 Template |
| decisions.md | 🔴 Template |

---

## Status Legend

| Status | Meaning |
|--------|---------|
| 🔴 Template | Structure created, needs content |
| 🟡 In Progress | Being actively worked on |
| 🟢 Complete | Fully documented |
| 🔵 Reviewed | Documented and reviewed |

---

## How to Use This Structure

1. **Finding Information:** Use the tree above to locate specific documentation
2. **Adding Content:** Fill in templates with actual project information
3. **Creating New Docs:** Follow the naming conventions and folder structure
4. **Updating Status:** Update this file when documentation status changes

---

**Last Updated:** February 2026
