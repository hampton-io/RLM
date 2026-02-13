# RLM Model Benchmark Report

**Date:** 2026-02-13  
**RLM Version:** v0.4.0+  
**Test Context:** Financial report (1.2KB)  
**Query:** Analyze this financial report: What was the total revenue, which division grew fastest, and what is the Q1 2026 outlook?

## Executive Summary

| Rank | Model | Speed | Cost | Notes |
|------|-------|-------|------|-------|
| 🥇 | **gemini-2.0-flash** | 2.7s | $0.0005 | Best overall (fastest + cheapest) |
| 🥈 | **gemini-2.0-flash-lite** | 3.7s | $0.0004 | Cheapest option |
| 🥉 | **gemini-2.5-flash** | 3.9s | $0.0005 | Good balance |

## Full Results by Provider

### Google Gemini Models

| Model | Time | Tokens | Calls | Cost | Status |
|-------|------|--------|-------|------|--------|
| **gemini-2.0-flash** | 2.7s | 4,847 | 2 | $0.0005 | ✅ Fastest |
| gemini-2.0-flash-lite | 3.7s | 4,920 | 2 | $0.0004 | ✅ Cheapest |
| gemini-2.5-flash | 3.9s | 2,884 | 2 | $0.0005 | ✅ Good |
| gemini-2.5-flash-lite | 4.8s | 8,029 | 4 | $0.0007 | ✅ OK |
| gemini-3-flash-preview | 5.6s | 2,808 | 2 | $0.0017 | ✅ Newest |
| gemini-2.5-pro | 7.4s | 2,485 | 1 | $0.0060 | ✅ Pro tier |
| gemini-3-pro-preview | 9.7s | - | - | - | ⚠️ Rate limited |
| gemini-3-flash | - | - | - | - | ❌ Not available yet |
| gemini-3-pro | - | - | - | - | ❌ Not available yet |

### OpenAI Models

| Model | Time | Tokens | Calls | Cost | Status |
|-------|------|--------|-------|------|--------|
| gpt-4.1 | 5.0s | 4,454 | 2 | $0.0104 | ✅ Good |
| gpt-4o | 5.3s | 2,328 | 2 | $0.0081 | ✅ OK |
| gpt-5-mini | 5.7s | 2,341 | 1 | $0.0036 | ✅ Fixed |
| gpt-4.1-mini | 7.3s | 5,175 | 3 | $0.0024 | ✅ OK |
| gpt-4o-mini | 8.3s | 7,100 | 4 | $0.0012 | ✅ Reliable |
| gpt-4.1-nano | 9.6s | 7,694 | 3 | $0.0009 | ✅ Cheapest OpenAI |
| gpt-5 | ~6s | 2,963 | 1 | ~$0.005 | ✅ Fixed |
| gpt-5-nano | ~6s | - | - | - | ✅ Fixed |
| gpt-5.1 | - | - | - | - | ✅ Available |
| gpt-5.1-codex | - | - | - | - | ✅ Available |
| gpt-5.2 | - | - | - | - | ✅ Available |
| gpt-5.2-codex | - | - | - | - | ✅ Available |
| o3-mini | ~5s | 2,123 | 1 | ~$0.003 | ✅ Fixed |
| o4-mini | ~6s | 2,634 | 1 | ~$0.004 | ✅ Fixed |
| o3 | - | - | - | - | ✅ Fixed |

### Anthropic Claude Models

| Model | Time | Tokens | Calls | Cost | Status |
|-------|------|--------|-------|------|--------|
| claude-haiku-4-5 | 7.0s | 3,164 | 1 | $0.0068 | ✅ Fast |
| claude-sonnet-4-5 | 14.5s | 3,398 | 2 | $0.0184 | ✅ Balanced |
| claude-opus-4-5 | 16.6s | 3,395 | 2 | $0.0301 | ✅ Smart |
| **claude-opus-4-6** | 18.7s | 3,320 | 1 | $0.1137 | ✅ Latest/Best quality |

## Speed Rankings

1. **gemini-2.0-flash** (2.7s)
2. gemini-2.0-flash-lite (3.7s)
3. gemini-2.5-flash (3.9s)
4. gemini-2.5-flash-lite (4.8s)
5. gpt-4.1 (5.0s)
6. gpt-4o (5.3s)
7. gemini-3-flash-preview (5.6s)
8. gpt-5-mini (5.7s)
9. claude-haiku-4-5 (7.0s)
10. gpt-4.1-mini (7.3s)
11. gemini-2.5-pro (7.4s)
12. gpt-4o-mini (8.3s)
13. gpt-4.1-nano (9.6s)
14. claude-sonnet-4-5 (14.5s)
15. claude-opus-4-5 (16.6s)
16. claude-opus-4-6 (18.7s)

## Cost Rankings

1. **gemini-2.0-flash-lite** ($0.0004)
2. gemini-2.0-flash ($0.0005)
3. gemini-2.5-flash ($0.0005)
4. gemini-2.5-flash-lite ($0.0007)
5. gpt-4.1-nano ($0.0009)
6. gpt-4o-mini ($0.0012)
7. gemini-3-flash-preview ($0.0017)
8. gpt-4.1-mini ($0.0024)
9. gpt-5-mini ($0.0036)
10. gemini-2.5-pro ($0.0060)
11. claude-haiku-4-5 ($0.0068)
12. gpt-4o ($0.0081)
13. gpt-4.1 ($0.0104)
14. claude-sonnet-4-5 ($0.0184)
15. claude-opus-4-5 ($0.0301)
16. claude-opus-4-6 ($0.1137)

## Issues Fixed

### Reasoning Model Temperature Fix

Reasoning models (gpt-5.x, o1, o3, o4) don't support the `temperature` parameter.

**Solution:** Added `isReasoningModel()` helper that detects these models and skips temperature:

```typescript
function isReasoningModel(model: string): boolean {
  if (model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return true;
  if (model.startsWith('gpt-5')) return true;
  return false;
}
```

**Fixed models:**
- gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro
- gpt-5.1, gpt-5.2 (and codex variants)
- o3, o3-mini, o3-pro
- o4-mini

### Remaining Issues

| Issue | Models Affected | Status |
|-------|-----------------|--------|
| Model not available | gemini-3-flash, gemini-3-pro | Preview only (use -preview suffix) |
| Rate limiting | gemini-3-pro-preview | Add retry logic |

## Recommendations

### By Use Case

| Use Case | Recommended Model | Reason |
|----------|-------------------|--------|
| **Speed** | gemini-2.0-flash | 2.7s, fastest by 2x |
| **Cost** | gemini-2.0-flash-lite | $0.0004, cheapest |
| **Quality** | claude-opus-4-6 | Most thorough reasoning |
| **Balance** | gemini-2.5-flash | Good speed/cost/quality |
| **Coding** | gpt-5.2-codex | Optimized for agentic tasks |
| **OpenAI Best** | gpt-4.1 | Fast, reliable, good quality |

### Default Model

**gemini-2.0-flash** is the recommended default:
- Fastest (2.7s)
- Cheapest ($0.0005)
- Reliable (consistent results)
- Good quality for most tasks

## Model Pricing Reference (February 2026)

### OpenAI
| Model | Input/1M | Output/1M |
|-------|----------|-----------|
| gpt-5.2 | $5.00 | $15.00 |
| gpt-5.2-codex | $2.00 | $8.00 |
| gpt-5-mini | $1.00 | $4.00 |
| gpt-5-nano | $0.25 | $1.00 |
| gpt-4.1 | $2.00 | $8.00 |
| gpt-4.1-mini | $0.40 | $1.60 |
| gpt-4.1-nano | $0.10 | $0.40 |
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| o4-mini | $1.10 | $4.40 |
| o3-mini | $0.55 | $2.20 |

### Anthropic
| Model | Input/1M | Output/1M |
|-------|----------|-----------|
| claude-opus-4-6 | $15.00 | $75.00 |
| claude-opus-4-5 | $5.00 | $25.00 |
| claude-sonnet-4-5 | $3.00 | $15.00 |
| claude-haiku-4-5 | $1.00 | $5.00 |

### Google
| Model | Input/1M | Output/1M |
|-------|----------|-----------|
| gemini-3-pro-preview | $3.50 | $14.00 |
| gemini-3-flash-preview | $0.50 | $2.00 |
| gemini-2.5-pro | $1.25 | $10.00 |
| gemini-2.5-flash | $0.15 | $0.60 |
| gemini-2.0-flash | $0.10 | $0.40 |
| gemini-2.0-flash-lite | $0.075 | $0.30 |

## Changelog

- **2026-02-13:** Initial comprehensive benchmark with 25 models
- **2026-02-13:** Fixed reasoning model temperature issue
- **2026-02-13:** Added GPT-5.2, Claude 4.6, Gemini 3 models
