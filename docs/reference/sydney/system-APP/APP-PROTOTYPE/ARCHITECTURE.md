> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Prototype Technical Architecture

## Overview

Single-page application with no build step. All JS files loaded via `<script>` tags in `index.html`. Views are `<div>` sections shown/hidden by a simple router. All data flows through a single Google Apps Script endpoint.

## Module Organization

```
APP-PROTOTYPE/
├── index.html              # 380 lines — all HTML structure, modals, nav
├── css/
│   └── style.css           # 105 lines — animations, accordion, FAB, custom utilities
└── js/
    ├── main.js             # 23 lines — App.init(), App.login(), App.logout()
    ├── library.js          # 61 lines — 41 hardcoded milestones (LIBRARY_DATA)
    ├── core/
    │   ├── config.js       # 6 lines — CONFIG (API_URL, DOMAINS), STATE object
    │   ├── labels.js       # 218 lines — TXT: all UI text, i18n-ready
    │   ├── utils.js        # 94 lines — groupLibrary, filterLibrary, formatDate, etc.
    │   ├── api.js          # 100 lines — sendRequest + 11 API methods
    │   ├── router.js       # 10 lines — show/hide view sections
    │   └── cloudinary.js   # 50 lines — direct image upload to Cloudinary
    ├── components/
    │   ├── fab.js          # 57 lines — FAB toggle + action dispatch
    │   └── modals/
    │       ├── base.js     # 43 lines — Modal manager (open/close/dispatch)
    │       ├── plan.js     # 140 lines — PlanWizard: milestone selector + generate
    │       ├── review.js   # 155 lines — ReviewModal: mastery rating + submit
    │       ├── observation/
    │       │   ├── wizard.js   # 105 lines — LogWizard: 3-way navigation
    │       │   ├── general.js  # 44 lines — ObsGeneral: freeform note + image
    │       │   ├── focused.js  # 95 lines — ObsFocused: domain tags + note + image
    │       │   └── progress.js # 163 lines — ObsProgress: bulk mastery assessment
    │       └── diary/
    │           ├── wizard.js   # 94 lines — DiaryWizard: food/sleep navigation
    │           ├── food.js     # 83 lines — FoodLog: meal/snack/bottle entry
    │           └── sleep.js    # 92 lines — SleepLog: start/end/duration + notes
    └── views/
        ├── activity.js     # 176 lines — ActivityView: recipe-book detail + report
        ├── progress.js     # 27 lines — ProgressView: Chart.js radar chart
        └── feed/
            ├── base.js         # 149 lines — FeedView: controller + filtering + polling
            ├── activity_tile.js # 34 lines — Activity plan cards (pending + resolved)
            ├── report_tile.js   # 63 lines — Activity report cards + inline progress
            ├── observation_tile.js # 49 lines — Observation cards (general/focused)
            ├── progress_tile.js    # 61 lines — Bulk progress update cards
            ├── diary_tile.js       # 70 lines — Food + sleep log cards
            └── insight_tile.js     # 7 lines — AI insight cards
```

**Total: 28 JS files, ~2,100 lines of JavaScript**

---

## State Management

### Global STATE Object (`config.js`)

```js
const STATE = {
    user: { id: localStorage.getItem('bb_uid'), role: localStorage.getItem('bb_role') },
    child: null,           // Current child object
    library: [],           // Milestone library (cached after first load)
    feed: [],              // Current feed items
    selectedObjectives: [], // Plan wizard selections (max 3)
    reviewActivityId: null, // Activity being reviewed
    logRating: null        // Temporary rating state
};
```

- All modules read/write directly to `STATE`
- No reactive system — views re-render by calling `.render()` explicitly
- Library is fetched once, then cached in STATE for the session
- Feed is re-fetched and re-rendered after every write action

### Authentication

LocalStorage-based:
- `bb_uid` — user ID (set on login, cleared on logout)
- `bb_role` — "Educator" or "Guardian" (determines permissions)
- On app init: if both exist, skip login modal and load data directly

---

## Router Pattern (`router.js`)

Minimal show/hide routing — no URL changes, no history API.

```js
const Router = {
    navigate: (name) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${name}`).classList.remove('hidden');
        // Update nav active states
    }
};
```

Two routes: `feed` (default), `progress`.

---

## Modal System

### Base Modal Manager (`modals/base.js`)

```js
const Modals = {
    open: (name) => {
        document.getElementById(`${name}Modal`).classList.remove('hidden');
        // Dispatch to wizard init based on name
        if (name === 'plan') PlanWizard.init();
        if (name === 'log') LogWizard.init();
        if (name === 'diary') DiaryWizard.init();
    },
    close: () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }
};
```

### Modal Types

| Modal | ID | Z-Index | Style | Trigger |
|---|---|---|---|---|
| Login | loginModal | 60 | Centered card | Auto on load (no session) |
| Plan | planModal | 60 | Full-screen | FAB → Plan Activity |
| Activity Detail | activityDetailModal | 60 | Full-screen | Feed → View Activity |
| Review | reviewModal | 70 | Bottom drawer (85vh) | Activity Detail → Complete & Report |
| Observation | logModal | 70 | Bottom drawer (85vh) | FAB → Observation |
| Diary | diaryModal | 70 | Bottom drawer (85vh) | FAB → Diary Entry |

### Wizard Pattern

The Observation and Diary modals use a multi-step wizard:

1. **Step 1**: Type selection (3 buttons for Observation, 2 for Diary)
2. **Step 2+**: Type-specific form
3. **Navigation**: Back button returns to Step 1, Close X dismisses entirely
4. **Show/hide**: Each step is a `<div>` toggled via classList

---

## FAB (Floating Action Button)

- Fixed bottom-right, z-50
- Tap toggles between + (closed) and X (open, rotated 45deg, red)
- When open: 3 action buttons slide up with staggered animation
- Actions dispatch to `Modals.open('plan' | 'log' | 'diary')`
- Guardian role: FAB is hidden (no write access)

---

## Feed System

### Smart Polling (`feed/base.js`)

When any feed item has `activityJson === "PENDING_AI_RESPONSE"`:
1. A "Generating..." tile is shown
2. 10-second polling interval starts
3. Each poll re-fetches feed via API
4. Polling stops when no more pending items exist

### Client-Side Filtering

Feed items are rendered by type-specific tile components. Filtering happens client-side:

```js
filter(mode) {
    const types = {
        'All':        null,  // show all
        'Activities': ['ACTIVITY', 'REPORT'],
        'Obs':        ['OBSERVATION'],
        'Growth':     ['PROGRESS', 'DIARY'],
        'Insight':    ['INSIGHT']
    };
}
```

### Tile Dispatch

```js
const renderers = {
    ACTIVITY: FeedCard_Activity,
    REPORT: FeedCard_Report,
    OBSERVATION: FeedCard_Observation,
    PROGRESS: FeedCard_Progress,
    DIARY: FeedCard_Diary,
    INSIGHT: FeedCard_Insight
};
// item.type → renderers[item.type].render(item)
```

---

## External Dependencies

| Dependency | Version | Purpose | Loaded Via |
|---|---|---|---|
| Tailwind CSS | Latest (CDN) | Utility-first styling | `<script src="cdn.tailwindcss.com">` |
| Font Awesome | 6.4.2 | Icons | `<link>` CDN |
| Chart.js | Latest (CDN) | Radar chart on Progress view | `<script>` CDN |
| Cloudinary | N/A (direct API) | Image uploads | Custom `cloudinary.js` module |
| Google Apps Script | N/A | Backend API | Single POST endpoint |

---

## Key Design Decisions

1. **No build step** — prototype optimized for rapid iteration, all scripts loaded raw
2. **Global state object** — simple but not scalable; works for single-user, single-child sessions
3. **Static milestone library** — hardcoded for performance, avoids an API call on every load
4. **Labels file** — all UI text centralized for future i18n
5. **Drawer modals** — mobile-first UX, consistent 85vh pattern with drag-to-close
6. **Client-side filtering** — feed data fetched once, filtered in-memory (works at current data volumes)
7. **Smart polling** — avoids WebSocket complexity for the one async operation (AI generation)
