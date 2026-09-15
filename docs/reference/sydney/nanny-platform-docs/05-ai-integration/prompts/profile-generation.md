> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Profile Generation Prompt

> AI prompt for generating nanny profile bios.

## Purpose

Help nannies create professional, engaging profile bios from basic inputs.

---

## System Prompt

```
You are a professional copywriter specializing in childcare industry profiles.
Your task is to write compelling, authentic nanny profile bios that help
nannies connect with families.

Guidelines:
- Write in first person from the nanny's perspective
- Be warm, professional, and genuine
- Highlight experience and qualifications naturally
- Keep the tone friendly but professional
- Avoid clichés and generic phrases
- Be specific where possible
- Length: 150-250 words

Do not:
- Make up qualifications or experience not provided
- Use superlatives excessively
- Include anything that could be misleading
- Add emojis or informal language
```

---

## User Prompt Template

```
Please write a professional nanny profile bio based on the following information:

**Name:** {{first_name}}
**Years of Experience:** {{years_experience}}
**Age Groups Worked With:** {{age_groups}}
**Certifications:** {{certifications}}
**Languages:** {{languages}}
**Special Skills:** {{special_skills}}
**Personality Traits:** {{personality_traits}}
**Why I Love Being a Nanny:** {{motivation}}
**Additional Notes:** {{additional_notes}}

Write a compelling bio that would appeal to parents looking for a trusted nanny.
```

---

## Example Input

```
Name: Sarah
Years of Experience: 4
Age Groups Worked With: Infants (0-12 months), Toddlers (1-3 years)
Certifications: First Aid, CPR, Cert III Early Childhood
Languages: English (native), Spanish (conversational)
Special Skills: Sleep training, Montessori methods, Music (guitar)
Personality Traits: Patient, creative, energetic
Why I Love Being a Nanny: I love watching children grow and learn
Additional Notes: Available for overnight care
```

---

## Example Output

```
Hi, I'm Sarah! With four years of experience caring for infants and toddlers,
I've developed a deep understanding of what little ones need during their
most formative years.

I hold a Certificate III in Early Childhood Education, along with current
First Aid and CPR certifications. My background includes specialised training
in sleep routines and Montessori-inspired learning methods, which I find
wonderful for encouraging independence and curiosity in young children.

One thing parents often appreciate is my ability to incorporate music into
daily activities—I play guitar and love using songs to make learning fun,
whether we're practicing counting or winding down before naptime.

I'm also conversational in Spanish, which can be a lovely way to introduce
bilingual exposure naturally through play and everyday interactions.

What draws me to this work is the privilege of witnessing those amazing
developmental milestones—first words, first steps, the way a toddler's
face lights up when they master something new.

I'm available for regular care as well as overnight arrangements for families
who need that flexibility. I'd love to chat about how I might be a great fit
for your family!
```

---

## Variations

### Headline Generation
```
Based on the profile above, write a short headline (50-80 characters)
that would appear at the top of the profile. Make it attention-grabbing
but professional.
```

### Profile Improvement
```
Here is an existing nanny profile bio. Please improve it while maintaining
the nanny's voice and personality. Make it more engaging and professional.

Current bio:
{{existing_bio}}
```

---

## Variables Reference

| Variable | Type | Example |
|----------|------|---------|
| `{{first_name}}` | String | "Sarah" |
| `{{years_experience}}` | Number | 4 |
| `{{age_groups}}` | Array | ["Infants", "Toddlers"] |
| `{{certifications}}` | Array | ["First Aid", "CPR"] |
| `{{languages}}` | Array | ["English", "Spanish"] |
| `{{special_skills}}` | Array | ["Sleep training", "Music"] |
| `{{personality_traits}}` | Array | ["Patient", "Creative"] |
| `{{motivation}}` | String | "I love watching children grow" |
| `{{additional_notes}}` | String | "Available for overnights" |

---

## Quality Checks

Before presenting to user, verify:
- [ ] Length is 150-250 words
- [ ] Written in first person
- [ ] No made-up qualifications
- [ ] Professional tone
- [ ] No grammatical errors

---

## Fallback Behavior

If AI fails:
1. Show generic template for user to fill in
2. Log error for debugging
3. Allow retry after brief delay

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
