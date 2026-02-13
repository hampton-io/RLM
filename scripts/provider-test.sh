#!/usr/bin/env bash
# Test RLM across different providers
# Usage: ./scripts/provider-test.sh

set -e

cd "$(dirname "$0")/.."

TEST_CONTEXT="/tmp/provider-test-context.md"

# Create simple test context
cat > "$TEST_CONTEXT" << 'EOF'
# Test Document

## Section A
The capital of France is Paris.
The population is approximately 2.1 million in the city proper.

## Section B  
The Eiffel Tower was built in 1889.
It is 330 meters tall.

## Section C
French cuisine includes croissants, baguettes, and cheese.
There are over 400 types of French cheese.
EOF

QUERY="What is the capital of France and when was the Eiffel Tower built? Answer with just the facts, no explanation."

echo "=== RLM Provider Comparison Test ==="
echo "Query: $QUERY"
echo "Context: $(wc -c < "$TEST_CONTEXT" | tr -d ' ') bytes"
echo ""
echo "Testing models..."
echo ""

# Models to test
MODELS=(
  "gpt-4o-mini"
  "gpt-4o"
  "claude-haiku-4-5"
  "claude-sonnet-4-5"
  "gemini-2.0-flash"
  "gemini-2.5-flash"
)

for MODEL in "${MODELS[@]}"; do
  echo "--- $MODEL ---"
  
  # Check for required API key
  case "$MODEL" in
    gpt-*|o1*|o3*)
      if [ -z "$OPENAI_API_KEY" ]; then
        echo "SKIP: OPENAI_API_KEY not set"
        echo ""
        continue
      fi
      ;;
    claude-*)
      if [ -z "$ANTHROPIC_API_KEY" ]; then
        echo "SKIP: ANTHROPIC_API_KEY not set"
        echo ""
        continue
      fi
      ;;
    gemini-*)
      if [ -z "$GOOGLE_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
        echo "SKIP: GOOGLE_API_KEY/GEMINI_API_KEY not set"
        echo ""
        continue
      fi
      ;;
  esac
  
  START=$(python3 -c 'import time; print(int(time.time() * 1000))')
  
  OUTPUT=$(npx tsx src/cli.ts "$QUERY" -f "$TEST_CONTEXT" -m "$MODEL" --max-iterations 5 2>&1) || {
    echo "ERROR: $OUTPUT"
    echo ""
    continue
  }
  
  END=$(python3 -c 'import time; print(int(time.time() * 1000))')
  DURATION=$((END - START))
  
  # Extract result and stats
  RESULT=$(echo "$OUTPUT" | sed -n '/--- Result ---/,/--- Stats ---/p' | grep -v "^---" | head -5)
  TOKENS=$(echo "$OUTPUT" | grep "Tokens:" | awk '{print $2}')
  CALLS=$(echo "$OUTPUT" | grep "Calls:" | awk '{print $2}')
  COST=$(echo "$OUTPUT" | grep "Cost:" | awk '{print $2}')
  
  echo "Result: $RESULT"
  echo "Time: ${DURATION}ms | Tokens: $TOKENS | Calls: $CALLS | Cost: $COST"
  echo ""
done

echo "=== Test Complete ==="
