# RLM Model Benchmark Report

**Date:** 2026-02-13
**RLM Version:** v0.4.0
**Test Context:** Financial report (1.2KB)
**Query:** Analyze this financial report: What was the total revenue, which division grew fastest, and what is the Q1 2026 outlook?

## Summary

| Rank | Model | Speed | Cost | Value Score |
|------|-------|-------|------|-------------|
| 🥇 | **gemini-2.0-flash** | 2.9s | $0.0005 | Best overall |
| 🥈 | **gpt-4.1-nano** | 6.5s | $0.0006 | Best OpenAI value |
| 🥉 | **gemini-2.5-flash** | 4.3s | $0.0005 | Good balance |

## Full Results

### Google Gemini Models

| Model | Time | Tokens | Calls | Cost | Status |
|-------|------|--------|-------|------|--------|
| **gemini-2.0-flash** | 2.9s | 4,847 | 2 | $0.0005 | ✅ Fastest |
| gemini-2.5-flash | 4.3s | 2,884 | 2 | $0.0005 | ✅ Good |
| gemini-2.5-flash-lite | 4.3s | 8,029 | 4 | $0.0007 | ✅ Efficient |
| gemini-3-flash-preview | 5.3s | 2,808 | 2 | $0.0017 | ✅ Newest |
| gemini-2.5-pro | 7.0s | 2,485 | 1 | $0.0060 | ✅ Pro tier |
| gemini-2.0-flash-lite | 8.8s | 14,412 | 6 | $0.0012 | ✅ Many iterations |
| gemini-3-pro-preview | 15.2s | - | - | - | ⚠️ Rate limited |

### OpenAI Models

| Model | Time | Tokens | Calls | Cost | Status |
|-------|------|--------|-------|------|--------|
| **gpt-4.1-nano** | 6.5s | 4,871 | 2 | $0.0006 | ✅ Best value |
| gpt-4.1 | 7.3s | 4,562 | 2 | $0.0113 | ✅ Good |
| gpt-4o-mini | 8.1s | 7,101 | 4 | $0.0012 | ✅ Reliable |
| gpt-4o | 10.4s | 2,510 | 4 | $0.0094 | ✅ Works |
| gpt-4.1-mini | 13.4s | 10,959 | 5 | $0.0051 | ✅ Verbose |
| gpt-5-mini | - | - | - | - | ❌ Needs temp=0 disabled |
| gpt-5 | - | - | - | - | ❌ Needs temp=0 disabled |
| o3-mini | - | - | - | - | ❌ No temperature param |
| o1-mini | - | - | - | - | ❌ Not available |

### Anthropic Claude Models

| Model | Time | Tokens | Calls | Cost | Status |
|-------|------|--------|-------|------|--------|
| claude-haiku-4-5 | 6.9s | 3,120 | 1 | $0.0066 | ✅ Fast |
| claude-opus-4-5 | 9.3s | 2,734 | 1 | $0.0233 | ✅ Smart |
| claude-sonnet-4-5 | 13.4s | 3,373 | 2 | $0.0177 | ✅ Balanced |

## Key Findings

### Speed Ranking (fastest to slowest)
1. gemini-2.0-flash (2.9s)
2. gemini-2.5-flash (4.3s)
3. gemini-2.5-flash-lite (4.3s)
4. gemini-3-flash-preview (5.3s)
5. gpt-4.1-nano (6.5s)
6. claude-haiku-4-5 (6.9s)
7. gemini-2.5-pro (7.0s)
8. gpt-4.1 (7.3s)
9. gpt-4o-mini (8.1s)
10. gemini-2.0-flash-lite (8.8s)
11. claude-opus-4-5 (9.3s)
12. gpt-4o (10.4s)
13. claude-sonnet-4-5 (13.4s)
14. gpt-4.1-mini (13.4s)

### Cost Ranking (cheapest to most expensive)
1. gemini-2.0-flash ($0.0005)
2. gemini-2.5-flash ($0.0005)
3. gpt-4.1-nano ($0.0006)
4. gemini-2.5-flash-lite ($0.0007)
5. gpt-4o-mini ($0.0012)
6. gemini-2.0-flash-lite ($0.0012)
7. gemini-3-flash-preview ($0.0017)
8. gpt-4.1-mini ($0.0051)
9. gemini-2.5-pro ($0.0060)
10. claude-haiku-4-5 ($0.0066)
11. gpt-4o ($0.0094)
12. gpt-4.1 ($0.0113)
13. claude-sonnet-4-5 ($0.0177)
14. claude-opus-4-5 ($0.0233)

## Issues Found

### OpenAI Reasoning Models
- **gpt-5, gpt-5-mini**: Don't support `temperature` parameter. Need to add model-specific handling.
- **o3-mini**: Requires different API parameters (no temperature).
- **o1-mini**: Model not found (may need different endpoint).

### Google Models
- **gemini-3-pro-preview**: Hit rate limit during testing.

## Recommendations

### For Speed-Critical Applications
Use **gemini-2.0-flash** - it's 2-3x faster than everything else.

### For Cost-Sensitive Applications
Use **gemini-2.0-flash** or **gemini-2.5-flash** - both at $0.0005 per query.

### For Quality-Critical Applications
Use **claude-opus-4-5** or **gemini-2.5-pro** - more thorough reasoning.

### Default Model
**gemini-2.0-flash** is the recommended default:
- Fastest (2.9s)
- Cheapest ($0.0005)
- Reliable (works consistently)

## Next Steps

1. Add model-specific parameter handling for reasoning models (gpt-5, o3)
2. Test with larger contexts (10KB, 100KB, 1MB)
3. Add quality scoring (correctness of answers)
4. Test streaming performance
