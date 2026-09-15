> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# AI Integration Points

## Where AI is Used

1. **Profile Bio Generation**: Converts nanny form data into professional bio
2. **Facebook Post Generation**: Creates shareable post for nanny to use
3. **Passport Verification**: Checks if passport photo matches, name matches, not expired
4. **WWCC Verification**: Checks if WWCC valid, name matches, not expired
5. **Facebook Screenshot Verification**: Checks if screenshot valid, posted to group
6. **Interview Email Coordination**: Sends emails to coordinate scheduling

## Provider
- OpenAI API (GPT-4o)
- Admin can review and override all AI decisions
