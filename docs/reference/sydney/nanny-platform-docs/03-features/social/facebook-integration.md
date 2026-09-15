> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Facebook Integration

> Integration with Facebook for marketing and user acquisition.

## Overview

_How Baby Bloom Sydney integrates with Facebook for growth and engagement._

---

## Integration Types

### 1. Facebook Login
_Social authentication option_

| Feature | Description |
|---------|-------------|
| Sign up with Facebook | One-click registration |
| Login with Facebook | Returning user auth |
| Profile data import | Name, email, photo |

**Privacy:** Only request minimal permissions

### 2. Facebook Page
_Official Baby Bloom Sydney presence_

| Use | Description |
|-----|-------------|
| Brand presence | Official page |
| Content sharing | Tips, updates, success stories |
| Community | Engage with parents and nannies |
| Messenger | Support channel |

### 3. Facebook Groups
_Community engagement_

| Strategy | Description |
|----------|-------------|
| Join parenting groups | Engage authentically |
| Share job opportunities | For nanny recruitment |
| _Own group?_ | Baby Bloom Sydney community |

### 4. Facebook Ads
_Paid acquisition_

| Campaign Type | Target | Objective |
|---------------|--------|-----------|
| Parent acquisition | Parents in Sydney | Website conversions |
| Nanny recruitment | Job seekers, caregivers | Lead generation |
| Brand awareness | Sydney parents | Reach |

---

## Facebook Login Implementation

### Permissions Requested
| Permission | Required | Use |
|------------|----------|-----|
| email | ✅ | Account creation |
| public_profile | ✅ | Name, profile picture |

### OAuth Flow
```
1. User clicks "Continue with Facebook"
        ↓
2. Redirect to Facebook OAuth
        ↓
3. User approves permissions
        ↓
4. Redirect back with auth code
        ↓
5. Exchange code for access token
        ↓
6. Fetch user data
        ↓
7. Create/login account
```

### Technical Implementation
```typescript
// Using Supabase Auth with Facebook provider
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'facebook',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    scopes: 'email',
  },
});
```

---

## Facebook Pixel

### What It Tracks
- Page views
- Signups
- Bookings
- Key conversions

### Events to Track
| Event | Trigger |
|-------|---------|
| PageView | All pages |
| Lead | Nanny signup started |
| CompleteRegistration | Signup completed |
| Search | Nanny search performed |
| ViewContent | Profile viewed |
| InitiateCheckout | Booking started |
| Purchase | Booking completed |

### Implementation
```html
<!-- Facebook Pixel Code -->
<script>
  fbq('init', 'YOUR_PIXEL_ID');
  fbq('track', 'PageView');
</script>
```

---

## Messenger Integration

### Use Cases
| Feature | Description |
|---------|-------------|
| Customer support | Answer questions via Messenger |
| Booking notifications | _Optional: Send booking updates_ |
| Chat plugin | Messenger chat on website |

### Chat Plugin
- Floating chat button on website
- Connects to Facebook Page Messenger
- After-hours: Collect message for follow-up

---

## Content Strategy

### Types of Content
| Content | Frequency | Purpose |
|---------|-----------|---------|
| Tips for parents | 2x/week | Engagement, SEO |
| Nanny spotlights | 1x/week | Social proof |
| Success stories | 2x/month | Trust building |
| Job postings | As needed | Nanny recruitment |

### Posting Schedule
- Best times for Sydney audience
- Consistent posting schedule
- Engagement with comments

---

## Facebook Ads Strategy

### Parent Acquisition
| Targeting | Details |
|-----------|---------|
| Location | Sydney, specific suburbs |
| Demographics | Parents, 25-45 |
| Interests | Parenting, childcare |
| Behaviors | New parents, working parents |

### Nanny Recruitment
| Targeting | Details |
|-----------|---------|
| Location | Sydney metro |
| Demographics | 18-50 |
| Interests | Childcare, early childhood education |
| Job seeking | Active job seekers |

---

## Compliance

### Facebook Terms
- [ ] Comply with Facebook Platform Terms
- [ ] Data use policies
- [ ] Advertising policies

### Privacy
- [ ] Clear privacy policy for Facebook data
- [ ] Don't store Facebook data longer than needed
- [ ] Allow users to disconnect Facebook

---

## Open Questions

- [ ] _Use Facebook Login at launch?_
- [ ] _Budget for Facebook Ads?_
- [ ] _Create a Facebook Group?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
