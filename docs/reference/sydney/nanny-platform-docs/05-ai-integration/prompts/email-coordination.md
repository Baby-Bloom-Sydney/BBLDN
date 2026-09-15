> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Email Coordination Prompt

> AI prompt for generating interview coordination emails.

## Purpose

Write personalized emails to coordinate interviews between parents and nannies.

---

## System Prompt

```
You are a professional assistant for Baby Bloom Sydney, a nanny platform.
Your task is to write warm, professional emails that coordinate interviews
between parents and nannies.

Tone guidelines:
- Professional but friendly
- Clear and concise
- Respectful of both parties' time
- Helpful and accommodating

Structure:
- Brief greeting
- Context (who is requesting, brief family info)
- Available time slots (formatted clearly)
- Simple call to action
- Professional sign-off

Do not:
- Include full addresses or sensitive info
- Make the email too long
- Use overly formal or stiff language
- Include information not provided
```

---

## Interview Request Email

### User Prompt Template

```
Write an email from Baby Bloom Sydney to a nanny requesting an interview
on behalf of a parent.

**Nanny name:** {{nanny_first_name}}
**Parent family name:** {{family_name}}
**Parent suburb:** {{suburb}}
**Number of children:** {{num_children}}
**Children's ages:** {{children_ages}}
**Care type needed:** {{care_type}}
**Brief note from parent:** {{parent_note}}

**Available time slots:**
{{#each time_slots}}
- {{this.day}}, {{this.date}} at {{this.time}}
{{/each}}

**Interview type:** {{interview_type}}
```

---

## Example Input

```
Nanny name: Sarah
Parent family name: The Johnson Family
Parent suburb: Bondi
Number of children: 2
Children's ages: 3 and 5
Care type needed: After-school care, Mon-Fri
Brief note from parent: Looking for someone energetic who enjoys outdoor activities
Available time slots:
- Tuesday, March 12 at 10:00 AM
- Wednesday, March 13 at 2:00 PM
- Thursday, March 14 at 11:00 AM
Interview type: Video call
```

---

## Example Output

```
Subject: Interview Request from the Johnson Family - Bondi

Hi Sarah,

The Johnson Family in Bondi has viewed your profile and would love to
meet you to discuss their childcare needs.

About the family:
• Two children (ages 3 and 5)
• Looking for after-school care, Monday to Friday
• They mentioned they'd love someone energetic who enjoys outdoor activities

They're available for a video call at these times:
• Tuesday, 12 March at 10:00 AM
• Wednesday, 13 March at 2:00 PM
• Thursday, 14 March at 11:00 AM

Would any of these work for you? Simply reply to this email with your
preferred time, or suggest an alternative if none of these suit.

Looking forward to hearing from you!

Warm regards,
Baby Bloom Sydney
```

---

## Interview Confirmation Email

### To Nanny
```
Subject: Interview Confirmed - {{family_name}} on {{date}}

Hi {{nanny_first_name}},

Great news! Your interview with {{family_name}} is confirmed:

📅 {{day}}, {{date}}
⏰ {{time}}
📍 {{interview_type}}
{{#if video_link}}
🔗 {{video_link}}
{{/if}}

A few tips:
• Be ready 5 minutes early
• Have your questions prepared
• Be yourself!

If you need to reschedule, please let us know as soon as possible.

Good luck!
Baby Bloom Sydney
```

### To Parent
```
Subject: Interview Confirmed with {{nanny_first_name}} on {{date}}

Hi {{parent_first_name}},

Your interview with {{nanny_first_name}} is confirmed:

📅 {{day}}, {{date}}
⏰ {{time}}
📍 {{interview_type}}

We recommend preparing a few questions about:
• Their experience with children of similar ages
• Their approach to [specific care needs]
• Availability and scheduling

If you need to reschedule, please let us know as soon as possible.

Best of luck!
Baby Bloom Sydney
```

---

## Interview Reminder Email

```
Subject: Reminder: Interview Tomorrow at {{time}}

Hi {{recipient_name}},

Just a friendly reminder that you have an interview scheduled for tomorrow:

📅 {{day}}, {{date}}
⏰ {{time}}
📍 {{interview_type}}
{{#if video_link}}
🔗 Join here: {{video_link}}
{{/if}}

Let us know if anything has changed.

Best,
Baby Bloom Sydney
```

---

## Variables Reference

| Variable | Example |
|----------|---------|
| `{{nanny_first_name}}` | "Sarah" |
| `{{family_name}}` | "The Johnson Family" |
| `{{suburb}}` | "Bondi" |
| `{{num_children}}` | 2 |
| `{{children_ages}}` | "3 and 5" |
| `{{care_type}}` | "After-school care" |
| `{{time_slots}}` | Array of date/time objects |
| `{{interview_type}}` | "Video call" / "Phone call" / "In-person" |
| `{{video_link}}` | "https://meet.google.com/xxx" |

---

## Quality Guidelines

- Keep emails under 200 words
- Use clear formatting (bullet points for lists)
- Include all necessary information
- End with clear call to action

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
