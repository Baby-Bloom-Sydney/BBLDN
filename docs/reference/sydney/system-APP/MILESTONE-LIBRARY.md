> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Milestone Library

The app tracks child development against 41 milestones across 7 developmental domains and 6 age brackets. This library is hardcoded in the prototype (`js/library.js`) as a static performance optimization.

## Domains

| Code | Full Name | Short Label |
|---|---|---|
| CL | Communication & Language | Communication |
| PSE | Personal, Social & Emotional | Social |
| PD | Physical Development | Physical |
| LIT | Literacy | Literacy |
| NUM | Numeracy | Numeracy |
| UW | Understanding the World | World |
| EAD | Expressive Arts & Design | Art |

## Age Brackets

| Code | Range |
|---|---|
| 03 | 0–3 months |
| 36 | 3–6 months |
| 612 | 6–12 months |
| 1218 | 12–18 months |
| 1824 | 18–24 months |
| 2432 | 24–32 months |

## ID Format

```
{DOMAIN}-{AGE_CODE}-{LETTER}
```

Examples: `CL-03-A`, `PSE-2432-D`, `NUM-612-D`

- Domain: 2–3 letter domain code
- Age code: age bracket without dash (e.g., `03`, `2432`)
- Letter: sequential within domain+age group (A, B, C, D)

## Complete Catalog

### Communication & Language (CL)

| ID | Age | Milestone |
|---|---|---|
| CL-03-A | 0–3 months | Expresses needs through cries |
| CL-03-B | 0–3 months | Makes throaty noises when content |
| CL-03-C | 0–3 months | Soothed by familiar voices |
| CL-2432-D | 24–32 months | Uses plurals/past tense |

### Personal, Social & Emotional (PSE)

| ID | Age | Milestone |
|---|---|---|
| PSE-03-A | 0–3 months | Smiles at people |
| PSE-03-B | 0–3 months | Makes eye contact |
| PSE-03-C | 0–3 months | Startles at loud noises |
| PSE-1218-C | 12–18 months | Has tantrums when frustrated |
| PSE-2432-C | 24–32 months | Asserts independence (eg: 'I do it!') |
| PSE-2432-D | 24–32 months | Has imaginary friends/pretend play |

### Physical Development (PD)

| ID | Age | Milestone |
|---|---|---|
| PD-03-A | 0–3 months | Lifts head and chest when on stomach |
| PD-03-B | 0–3 months | Moves arms and legs actively |
| PD-03-C | 0–3 months | Grasps finger when placed in palm |
| PD-2432-C | 24–32 months | Climbs playground equipment |
| PD-2432-D | 24–32 months | Pedals tricycle |

### Literacy (LIT)

| ID | Age | Milestone |
|---|---|---|
| LIT-03-A | 0–3 months | Listens to voices and sounds |
| LIT-03-B | 0–3 months | Recognizes familiar voices |
| LIT-03-C | 0–3 months | Enjoys simple songs/rhymes |
| LIT-2432-B | 24–32 months | Scribbles own name with help |
| LIT-2432-C | 24–32 months | Sits through longer stories |
| LIT-2432-D | 24–32 months | Understands print has meaning |

### Numeracy (NUM)

| ID | Age | Milestone |
|---|---|---|
| NUM-03-A | 0–3 months | Notices patterns and routines (e.g., feeding times) |
| NUM-03-B | 0–3 months | Recognizes faces and objects |
| NUM-03-C | 0–3 months | Responds to number songs (rhythm) |
| NUM-612-D | 6–12 months | Explores nesting toys/shape sorters |
| NUM-2432-C | 24–32 months | Understands size/weight/length |
| NUM-2432-D | 24–32 months | Uses number words in context |

### Understanding the World (UW)

| ID | Age | Milestone |
|---|---|---|
| UW-03-A | 0–3 months | Alert to faces and voices |
| UW-03-B | 0–3 months | Follows objects with eyes |
| UW-03-C | 0–3 months | Reaches for dangling objects |
| UW-36-D | 3–6 months | May imitate simple actions |
| UW-1824-A | 18–24 months | Pretends to be someone else |
| UW-2432-C | 24–32 months | Shows interest in nature |
| UW-2432-D | 24–32 months | Follows three-step instructions |

### Expressive Arts & Design (EAD)

| ID | Age | Milestone |
|---|---|---|
| EAD-03-A | 0–3 months | Coos as early musical expression |
| EAD-03-B | 0–3 months | Moves arms/legs rhythmically |
| EAD-03-C | 0–3 months | Shows pleasure in sounds |
| EAD-1218-B | 12–18 months | Plays with playdough/clay |
| EAD-1824-D | 18–24 months | Sings songs, may create own |
| EAD-2432-C | 24–32 months | Sings songs with actions |
| EAD-2432-D | 24–32 months | Enjoys role-playing/dressing up |

## Distribution Summary

| Domain | Count |
|---|---|
| CL | 4 |
| PSE | 6 |
| PD | 5 |
| LIT | 6 |
| NUM | 6 |
| UW | 7 |
| EAD | 7 |
| **Total** | **41** |

## Notes on Expanding

- The prototype only covers a subset of milestones per domain/age — many age brackets have gaps (e.g., CL has 0–3mo and 24–32mo but nothing in between)
- The ID scheme supports arbitrary expansion: just add new entries with the next letter
- The integration should store milestones in a database table rather than hardcoding, to allow admin-managed additions
- Consider aligning with the Australian Early Years Learning Framework (EYLF) for more comprehensive coverage
