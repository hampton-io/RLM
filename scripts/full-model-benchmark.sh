#!/usr/bin/env bash
# Full RLM Model Benchmark
# Tests all supported models and generates a report

set -e
cd "$(dirname "$0")/.."

REPORT_FILE="/tmp/rlm-model-benchmark-$(date +%Y%m%d-%H%M%S).md"
TEST_CONTEXT="/tmp/benchmark-context.md"

# Create a more substantial test context
cat > "$TEST_CONTEXT" << 'EOF'
# Company Report: TechCorp Q4 2025

## Executive Summary
TechCorp achieved record revenue of $4.2 billion in Q4 2025, representing 23% year-over-year growth. The AI division contributed $1.8 billion, while cloud services generated $1.5 billion. Operating margin improved to 28%.

## Financial Highlights
- Total Revenue: $4.2B (up 23% YoY)
- AI Division: $1.8B (up 45% YoY)  
- Cloud Services: $1.5B (up 18% YoY)
- Enterprise Software: $900M (up 12% YoY)
- Operating Margin: 28% (up from 24%)
- Net Income: $890M
- EPS: $2.34 (up from $1.87)

## Regional Performance
- North America: $2.1B (50% of revenue)
- Europe: $1.05B (25% of revenue)
- Asia Pacific: $840M (20% of revenue)
- Rest of World: $210M (5% of revenue)

## Key Metrics
- Active Enterprise Customers: 12,400 (up 15%)
- Annual Recurring Revenue: $3.8B
- Customer Retention Rate: 94%
- Employee Count: 18,500

## Product Updates
The flagship AI Assistant product reached 50 million monthly active users. 
New features launched include real-time translation (45 languages) and advanced document analysis.
Cloud platform uptime was 99.97% for the quarter.

## Outlook
Management expects Q1 2026 revenue of $4.5-4.7B with continued strength in AI products.
EOF

CONTEXT_SIZE=$(wc -c < "$TEST_CONTEXT" | tr -d ' ')

# Test query
QUERY="Analyze this financial report: What was the total revenue, which division grew fastest, and what is the Q1 2026 outlook?"

echo "# RLM Full Model Benchmark" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Date:** $(date '+%Y-%m-%d %H:%M:%S')" >> "$REPORT_FILE"
echo "**Context Size:** $CONTEXT_SIZE bytes" >> "$REPORT_FILE"
echo "**Query:** $QUERY" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## Results" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Provider | Model | Time | Tokens | Calls | Cost | Status | Notes |" >> "$REPORT_FILE"
echo "|----------|-------|------|--------|-------|------|--------|-------|" >> "$REPORT_FILE"

# All models to test (February 2026)
declare -a MODELS=(
  # OpenAI - GPT-5.2 series (latest)
  "gpt-5.2"
  "gpt-5.2-pro"
  "gpt-5.2-codex"
  # OpenAI - GPT-5.1 series
  "gpt-5.1"
  "gpt-5.1-codex"
  "gpt-5.1-codex-mini"
  # OpenAI - GPT-5 series
  "gpt-5"
  "gpt-5-mini"
  "gpt-5-nano"
  # OpenAI - GPT-4.1 series  
  "gpt-4.1"
  "gpt-4.1-mini"
  "gpt-4.1-nano"
  # OpenAI - GPT-4o series
  "gpt-4o"
  "gpt-4o-mini"
  # OpenAI - o4 Reasoning (latest)
  "o4-mini"
  # OpenAI - o3 Reasoning
  "o3"
  "o3-mini"
  # Anthropic - Claude 4.6 (latest)
  "claude-opus-4-6"
  # Anthropic - Claude 4.5
  "claude-haiku-4-5"
  "claude-sonnet-4-5"
  "claude-opus-4-5"
  # Google - Gemini 3 (latest)
  "gemini-3-flash"
  "gemini-3-pro"
  "gemini-3-flash-preview"
  "gemini-3-pro-preview"
  # Google - Gemini 2.5
  "gemini-2.5-flash"
  "gemini-2.5-flash-lite"
  "gemini-2.5-pro"
  # Google - Gemini 2.0
  "gemini-2.0-flash"
  "gemini-2.0-flash-lite"
)

for MODEL in "${MODELS[@]}"; do
  echo "Testing $MODEL..."
  
  # Determine provider
  PROVIDER="openai"
  if [[ "$MODEL" == claude-* ]]; then
    PROVIDER="anthropic"
  elif [[ "$MODEL" == gemini-* ]]; then
    PROVIDER="google"
  fi
  
  # Check API key
  case "$PROVIDER" in
    openai)
      if [ -z "$OPENAI_API_KEY" ]; then
        echo "| $PROVIDER | $MODEL | - | - | - | - | ⏭️ SKIP | No API key |" >> "$REPORT_FILE"
        continue
      fi
      ;;
    anthropic)
      if [ -z "$ANTHROPIC_API_KEY" ]; then
        echo "| $PROVIDER | $MODEL | - | - | - | - | ⏭️ SKIP | No API key |" >> "$REPORT_FILE"
        continue
      fi
      ;;
    google)
      if [ -z "$GOOGLE_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
        echo "| $PROVIDER | $MODEL | - | - | - | - | ⏭️ SKIP | No API key |" >> "$REPORT_FILE"
        continue
      fi
      ;;
  esac
  
  START=$(python3 -c 'import time; print(int(time.time() * 1000))')
  
  OUTPUT=$(npx tsx src/cli.ts "$QUERY" -f "$TEST_CONTEXT" -m "$MODEL" --max-iterations 10 2>&1) || {
    END=$(python3 -c 'import time; print(int(time.time() * 1000))')
    DURATION=$((END - START))
    
    # Check for specific errors
    if echo "$OUTPUT" | grep -q "rate limit\|429\|quota"; then
      echo "| $PROVIDER | $MODEL | ${DURATION}ms | - | - | - | ⚠️ RATE_LIMIT | Rate limited |" >> "$REPORT_FILE"
    elif echo "$OUTPUT" | grep -q "not found\|404\|does not exist"; then
      echo "| $PROVIDER | $MODEL | - | - | - | - | ❌ NOT_FOUND | Model not available |" >> "$REPORT_FILE"
    elif echo "$OUTPUT" | grep -q "timeout\|timed out"; then
      echo "| $PROVIDER | $MODEL | ${DURATION}ms | - | - | - | ⏱️ TIMEOUT | Timed out |" >> "$REPORT_FILE"
    else
      ERROR=$(echo "$OUTPUT" | grep -i "error" | head -1 | cut -c1-50)
      echo "| $PROVIDER | $MODEL | ${DURATION}ms | - | - | - | ❌ ERROR | $ERROR |" >> "$REPORT_FILE"
    fi
    continue
  }
  
  END=$(python3 -c 'import time; print(int(time.time() * 1000))')
  DURATION=$((END - START))
  
  # Extract stats
  TOKENS=$(echo "$OUTPUT" | grep "Tokens:" | awk '{print $2}')
  CALLS=$(echo "$OUTPUT" | grep "Calls:" | awk '{print $2}')
  COST=$(echo "$OUTPUT" | grep "Cost:" | awk '{print $2}')
  
  # Check if we got a result
  if echo "$OUTPUT" | grep -q "Result"; then
    RESULT_PREVIEW=$(echo "$OUTPUT" | sed -n '/--- Result ---/,/--- Stats ---/p' | grep -v "^---" | head -1 | cut -c1-40)
    echo "| $PROVIDER | $MODEL | ${DURATION}ms | $TOKENS | $CALLS | $COST | ✅ OK | ${RESULT_PREVIEW}... |" >> "$REPORT_FILE"
  else
    echo "| $PROVIDER | $MODEL | ${DURATION}ms | $TOKENS | $CALLS | $COST | ⚠️ NO_RESULT | No final answer |" >> "$REPORT_FILE"
  fi
  
  # Small delay to avoid rate limits
  sleep 1
done

echo "" >> "$REPORT_FILE"
echo "## Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "Benchmark completed at $(date '+%Y-%m-%d %H:%M:%S')" >> "$REPORT_FILE"

echo ""
echo "=== Benchmark Complete ==="
echo "Report saved to: $REPORT_FILE"
echo ""
cat "$REPORT_FILE"
