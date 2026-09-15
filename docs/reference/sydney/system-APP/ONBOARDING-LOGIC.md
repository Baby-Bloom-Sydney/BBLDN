> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Onboarding Logic

## The Business Model

The matchmaking website exists as a free acquisition channel for the app. Matchmaking is free because the app funds it. Every nanny who signs up through the website is a potential distribution channel for the paid education product.

## Revenue Flow

Parent pays for the app → Baby Bloom takes its cut → Nanny receives ~$1,000 commission

### Pricing (Parent)

- **Monthly subscription** — standard rate
- **Upfront payment** — significant discount, framed as a "courtesy for your Baby Bloom nanny"

### Nanny Commission

- Approximately 50% of the service fee
- Paid roughly 31 days after the parent's purchase (61–68 days from the start of the trial)
- Ballpark figure: ~$1,000 per conversion
- Nanny continues using the app with the child after conversion

---

## Two Nanny Paths

### Path A — Matched Nanny

1. Nanny signs up on the website to find work
2. Baby Bloom matches them with a parent
3. Baby Bloom calls the nanny to onboard them onto the education app
4. Nanny is told about the commission incentive
5. Nanny begins using the app with the child

### Path B — Unmatched Nanny (Bring Your Own Parent)

1. Nanny signs up on the website to find work
2. No suitable match is available through Baby Bloom
3. Baby Bloom calls the nanny and offers an alternative: sign up their existing clients (parents they already work for outside of Baby Bloom)
4. Nanny is told about the commission incentive
5. Nanny begins using the app with those children

**Key insight:** Both paths are onboarded via phone call. This is intentional — it keeps the process human-led while the model is being validated. The phone calls also serve as a learning mechanism to understand nanny motivations and friction points. This will be systemised later once the patterns are clear.

---

## Onboarding Flow

### Step 1 — Nanny Enters the App

From the nanny's hub on the website, there is an **"Education" tab**. This tab shows:

- A list of their children (each child is a card/tile they can tap to enter that child's app view)
- An **"Add New"** button to onboard a new child

### Step 2 — Nanny Adds a Child

When the nanny taps "Add New", they:

1. Enter the child's details (name, date of birth, etc.)
2. Enter the **parent's email address**

This is the critical link — the parent's email connects the child entity to the parent's future account.

### Step 3 — Nanny Uses the App

The nanny enters the child's app view and begins using it as normal:

- Planning and completing AI-generated activities
- Logging observations (general, focused, progress)
- Recording diary entries (food, sleep)
- Building up the child's developmental feed and progress radar

**The nanny has a direct financial incentive to use the app consistently and well.** The more value the parent sees through notifications, the more likely they are to convert. The nanny's daily usage IS the sales pitch.

### Step 4 — Parent Gets Pulled In

When the nanny adds the child with the parent's email, the parent begins receiving **notifications/updates** showing what the nanny is doing with their child. These notifications prompt the parent to **sign up using the email the nanny registered them with** in order to access the app themselves.

> **Note:** The exact notification strategy (content, frequency, what's shown vs gated) is TBD. This is a fine detail to be decided later — the important thing is that the nanny's activity triggers outreach to the parent.

### Step 5 — Parent Accesses the App

Once the parent signs up:

- They see their **one child** (no child selector, no "Add New" — the child was added by the nanny)
- They have **the same app access** as the nanny for that child
- Both can create activities, log observations, record diary entries, and view progress
- The child's feed shows **who did what** (nanny vs parent attribution on each entry)
- There is no significant separation of access between nanny and parent at this stage

### Step 6 — Trial Period

- The parent gets **30 days free** from the point they sign up
- During this period, both nanny and parent use the app with full access
- At the end of 30 days, the parent is prompted to purchase (monthly or upfront)

### Step 7 — Conversion and Commission

- Parent purchases → subscription begins
- 31 days after purchase (~61–68 days from trial start), the nanny receives their commission (~$1,000)
- Both nanny and parent continue using the app with the child going forward

---

## User Perspectives

### Nanny's View

- **Hub → Education tab** → list of children + "Add New"
- Each child is a separate app instance they can enter
- A nanny can work with multiple children/families
- Each child they onboard is a potential commission

### Parent's View

- **Hub → Education tab** → their one child (no selector needed, no "Add New")
- Tapping in takes them directly to the child's app view
- They see the same feed, progress, and tools as the nanny

### The Child as Shared Entity

- The child is the central object that both nanny and parent connect to
- Both users have their own accounts and identities
- All activity on the child's feed is attributed to whoever created it
- This keeps things simple and transparent — both parties can see everything

---

## What Is NOT Being Built Yet

- Automated onboarding (no self-serve signup flow for the app — phone calls only)
- Notification strategy details (content, frequency, gating)
- Multiple children per parent
- Commission tracking dashboard
- Payment/subscription infrastructure details
- Systemised nanny outreach for Path B
