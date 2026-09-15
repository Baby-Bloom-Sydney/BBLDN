> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Models Used

> AI models used in Baby Bloom Sydney and their configurations.

## Overview

_Catalog of AI models, their use cases, and configurations._

---

## Primary Model: OpenAI GPT-4o

### Model Selection

| Use Case | Model | Rationale |
|----------|-------|-----------|
| Profile generation | GPT-4o | Good balance of quality/cost |
| Document verification | GPT-4o | Vision capabilities |
| Email generation | GPT-4o | Professional writing |
| Complex analysis | GPT-4o | High quality reasoning |

### Model Versions

| Model | Version | Use |
|-------|---------|-----|
| GPT-4o | gpt-4o | Primary model |
| GPT-4o mini | gpt-4o-mini | Simple/fast tasks |

---

## Model Configuration

### Default Settings

```typescript
const defaultConfig = {
  model: 'gpt-4o',
  max_tokens: 1024,
  temperature: 0.7,
};
```

### Per-Feature Settings

| Feature | Temperature | Max Tokens | Notes |
|---------|-------------|------------|-------|
| Profile bio | 0.7 | 500 | Creative, engaging |
| Document verification | 0.2 | 1000 | Accurate, consistent |
| Email drafts | 0.5 | 400 | Professional, varied |
| Data extraction | 0.1 | 500 | Precise, deterministic |

---

## API Configuration

### Environment Variables

```bash
# .env.local
OPENAI_API_KEY=sk-proj-...
```

### Client Setup

```typescript
// lib/ai/client.ts
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

---

## Cost Estimates

### Pricing (as of 2025)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o mini | $0.15 | $0.60 |

### Estimated Monthly Costs

| Feature | Calls/Month | Avg Tokens | Est. Cost |
|---------|-------------|------------|-----------|
| Profile generation | 500 | 2000 | ~$12 |
| Document verification | 500 | 3000 | ~$20 |
| Email generation | 1000 | 1500 | ~$20 |
| **Total** | | | **~$52** |

_Note: Estimates based on expected usage. Actual costs may vary._

---

## Rate Limiting

### OpenAI API Limits

| Tier | RPM | TPM |
|------|-----|-----|
| Tier 1 | 500 | 30,000 |
| Tier 2 | 5,000 | 450,000 |
| Tier 3 | 5,000 | 800,000 |

### Application Rate Limiting

```typescript
// Per-user limits
const USER_LIMITS = {
  profileGeneration: { max: 5, window: '1h' },
  verification: { max: 3, window: '1h' },
  emailGeneration: { max: 10, window: '1h' },
};
```

---

## Error Handling

### Retry Strategy

```typescript
const retryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

async function callWithRetry(fn: () => Promise<any>) {
  let lastError;
  for (let i = 0; i < retryConfig.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.status === 429) {
        // Rate limited - wait and retry
        await sleep(retryConfig.initialDelayMs * Math.pow(2, i));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}
```

### Error Types

| Error | Handling |
|-------|----------|
| 429 Rate Limited | Retry with backoff |
| 500 Server Error | Retry up to 3 times |
| 400 Bad Request | Log and return error |
| Network Error | Retry with backoff |

---

## Monitoring

### Metrics to Track

| Metric | Description |
|--------|-------------|
| `ai_request_count` | Total API calls |
| `ai_request_latency` | Response time |
| `ai_request_errors` | Failed requests |
| `ai_tokens_used` | Token consumption |
| `ai_cost_estimate` | Estimated cost |

### Logging

```typescript
// Log every AI call
logger.info('AI Request', {
  feature: 'profile_generation',
  model: 'gpt-4o',
  input_tokens: 150,
  output_tokens: 450,
  latency_ms: 1200,
  user_id: 'xxx',
});
```

---

## Future Considerations

### Potential Additions

| Model/Service | Use Case |
|---------------|----------|
| Embedding models | Semantic search |
| Fine-tuned model | Domain-specific tasks |
| Whisper | Voice transcription |

### Evaluation Criteria

- Quality of output
- Latency
- Cost
- Reliability
- Privacy/compliance

---

**Last Updated:** 2026-02-06
**Status:** 🟡 In Progress
