> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# AI Profile Generation

> Using AI to help nannies create compelling profiles.

## Overview

_AI-powered assistance to help nannies write professional, engaging profiles._

---

## Feature Description

### What It Does
- Takes nanny's basic input (bullet points, answers)
- Generates professional bio text
- Suggests improvements to existing content
- Creates compelling headlines

### User Flow
```
1. Nanny enters basic info / bullet points
        ↓
2. Clicks "Generate with AI"
        ↓
3. AI creates professional version
        ↓
4. Nanny reviews and edits
        ↓
5. Nanny approves final version
```

---

## Input Requirements

### For Bio Generation
| Input | Type | Example |
|-------|------|---------|
| Years experience | Number | "3 years" |
| Key strengths | Bullet list | "Patient, creative, first aid" |
| Age groups | Selection | "Infants, toddlers" |
| Special skills | Text | "Music, languages" |
| Personality traits | Selection | "Warm, energetic" |

### For Headline Generation
| Input | Type | Example |
|-------|------|---------|
| Primary strength | Text | "Experienced with newborns" |
| Location | Text | "Eastern suburbs" |
| Unique selling point | Text | "Bilingual Spanish" |

---

## Output Specifications

### Bio Output
- Length: 150-300 words
- Tone: Professional but warm
- Structure:
  - Opening hook
  - Experience summary
  - Key strengths
  - Personal touch
  - Call to action

### Headline Output
- Length: 50-80 characters
- Format: Attention-grabbing, searchable
- Examples:
  - "Experienced Infant Specialist | First Aid Certified | Inner West"
  - "Energetic & Creative Nanny | 5+ Years Experience | Bilingual"

---

## AI Prompt Design

_Full prompt template in: `05-ai-integration/prompts/profile-generation.md`_

### Key Prompt Elements
- [ ] Role definition
- [ ] Output format
- [ ] Tone guidelines
- [ ] Length constraints
- [ ] Examples (few-shot)

### Safety Considerations
- [ ] No false claims
- [ ] No inappropriate content
- [ ] Factual accuracy
- [ ] User must approve output

---

## Technical Implementation

### Model
- Model: _Claude / GPT-4 / Other_
- API: _Direct API / via backend_

### API Endpoint
```
POST /api/ai/generate-profile
{
  "type": "bio" | "headline",
  "inputs": { ... }
}
```

### Response
```json
{
  "generated_text": "...",
  "confidence": 0.95,
  "suggestions": ["...", "..."]
}
```

---

## User Experience

### UI Elements
- [ ] "Generate with AI" button
- [ ] Loading state
- [ ] Generated text display
- [ ] Edit capability
- [ ] Regenerate option
- [ ] Accept/reject

### Error Handling
| Error | Message |
|-------|---------|
| Generation failed | "Unable to generate. Please try again." |
| Rate limited | "Please wait before generating again." |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| AI generation usage rate | X% of profiles |
| User acceptance rate | X% approve without major edits |
| Profile completion rate (with AI) | X% higher than without |

---

## Open Questions

- [ ] _Which AI model to use?_
- [ ] _How many regenerations allowed?_
- [ ] _Should this be a premium feature?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
