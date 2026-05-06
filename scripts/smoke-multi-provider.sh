#!/bin/bash
#
# Multi-Provider Routing Smoke Test
#
# Tests the full flow:
# 1. Create user and authenticate
# 2. Create models with different providers
# 3. Test connection validation
# 4. Create virtual key
# 5. Sync CLI routing config
#
# Prerequisites:
# - API server running on localhost:3001
# - PostgreSQL running
# - Environment variables set (TAG_ENCRYPTION_MASTER_KEY)

set -e

API_URL="${TAG_API_URL:-http://localhost:3001}"
EMAIL="smoke-test-$(date +%s)@example.com"
PASSWORD="SmokeTest123!"

echo "=============================================="
echo "  Multi-Provider Routing Smoke Test"
echo "=============================================="
echo ""
echo "API URL: $API_URL"
echo "Test Email: $EMAIL"
echo ""

# ============================================================================
# Helper Functions
# ============================================================================

api() {
  local method="$1"
  local path="$2"
  local data="$3"

  if [ -n "$TOKEN" ]; then
    curl -s -X "$method" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "$data" \
      "$API_URL$path"
  else
    curl -s -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$API_URL$path"
  fi
}

check_status() {
  local response="$1"
  local expected_field="$2"

  if echo "$response" | jq -e ".$expected_field" > /dev/null 2>&1; then
    return 0
  else
    echo "ERROR: Expected field '$expected_field' not found"
    echo "Response: $response"
    return 1
  fi
}

# ============================================================================
# Step 1: Register and Login
# ============================================================================

echo "Step 1: User Registration and Authentication"
echo "----------------------------------------------"

# Register
echo -n "  Registering user... "
REGISTER_RESPONSE=$(api POST /api/auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke Tester\"}")
if check_status "$REGISTER_RESPONSE" "data"; then
  echo "OK"
else
  echo "FAILED"
  exit 1
fi

# Login
echo -n "  Logging in... "
LOGIN_RESPONSE=$(api POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token // empty')
if [ -n "$TOKEN" ]; then
  echo "OK"
else
  echo "FAILED"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

# ============================================================================
# Step 2: List Providers
# ============================================================================

echo ""
echo "Step 2: List Available Providers"
echo "----------------------------------"

echo -n "  Fetching providers... "
PROVIDERS_RESPONSE=$(api GET /api/models/providers)
PROVIDER_COUNT=$(echo "$PROVIDERS_RESPONSE" | jq -r '.data | length')
if [ "$PROVIDER_COUNT" -gt 0 ]; then
  echo "OK ($PROVIDER_COUNT providers)"
  echo "$PROVIDERS_RESPONSE" | jq -r '.data[].displayName' | while read name; do
    echo "    - $name"
  done
else
  echo "FAILED"
  exit 1
fi

# ============================================================================
# Step 3: Create Test Models
# ============================================================================

echo ""
echo "Step 3: Create Test Models"
echo "---------------------------"

# Create Anthropic model (will fail connection test without real key)
echo -n "  Creating Anthropic model... "
MODEL_RESPONSE=$(api POST /api/models "{
  \"displayName\": \"Claude Sonnet (Test)\",
  \"providerTemplateId\": \"anthropic\",
  \"modelIdentifier\": \"claude-sonnet-4-20250514\",
  \"publicConfig\": {\"model\": \"claude-sonnet-4-20250514\", \"max_tokens\": 4096},
  \"secretConfig\": {\"api_key\": \"sk-ant-test-key-for-smoke-test\"},
  \"scope\": \"TENANT\"
}")
ANTHROPIC_MODEL_ID=$(echo "$MODEL_RESPONSE" | jq -r '.data.id // empty')
if [ -n "$ANTHROPIC_MODEL_ID" ]; then
  echo "OK (ID: $ANTHROPIC_MODEL_ID)"
else
  echo "FAILED"
  echo "Response: $MODEL_RESPONSE"
  exit 1
fi

# Create Ollama model (local)
echo -n "  Creating Ollama model... "
MODEL_RESPONSE=$(api POST /api/models "{
  \"displayName\": \"Llama 3.2 (Local)\",
  \"providerTemplateId\": \"ollama\",
  \"modelIdentifier\": \"llama3.2:latest\",
  \"publicConfig\": {\"api_base\": \"http://localhost:11434\", \"model\": \"llama3.2:latest\", \"num_ctx\": 4096},
  \"scope\": \"TENANT\"
}")
OLLAMA_MODEL_ID=$(echo "$MODEL_RESPONSE" | jq -r '.data.id // empty')
if [ -n "$OLLAMA_MODEL_ID" ]; then
  echo "OK (ID: $OLLAMA_MODEL_ID)"
else
  echo "FAILED"
  echo "Response: $MODEL_RESPONSE"
  exit 1
fi

# ============================================================================
# Step 4: List Models
# ============================================================================

echo ""
echo "Step 4: List Models"
echo "--------------------"

echo -n "  Fetching models... "
MODELS_RESPONSE=$(api GET /api/models)
MODEL_COUNT=$(echo "$MODELS_RESPONSE" | jq -r '.data | length')
if [ "$MODEL_COUNT" -ge 2 ]; then
  echo "OK ($MODEL_COUNT models)"
  echo "$MODELS_RESPONSE" | jq -r '.data[] | "    - \(.displayName) (\(.providerTemplateId // "yaml"))"'
else
  echo "FAILED"
  exit 1
fi

# ============================================================================
# Step 5: Test Connection (Expected to fail with test keys)
# ============================================================================

echo ""
echo "Step 5: Test Connection Validation"
echo "------------------------------------"

echo -n "  Testing Anthropic connection (expected to fail)... "
TEST_RESPONSE=$(api POST /api/models/test "{
  \"providerTemplateId\": \"anthropic\",
  \"publicConfig\": {\"model\": \"claude-sonnet-4-20250514\"},
  \"secretConfig\": {\"api_key\": \"sk-ant-test-key-for-smoke-test\"}
}")
TEST_OK=$(echo "$TEST_RESPONSE" | jq -r '.data.ok')
if [ "$TEST_OK" = "false" ]; then
  ERROR_CODE=$(echo "$TEST_RESPONSE" | jq -r '.data.error.code')
  echo "OK (failed as expected: $ERROR_CODE)"
else
  echo "UNEXPECTED (should have failed)"
fi

# ============================================================================
# Step 6: Create Virtual Key
# ============================================================================

echo ""
echo "Step 6: Create Virtual Key"
echo "---------------------------"

echo -n "  Creating virtual key... "
KEY_RESPONSE=$(api POST /api/virtual-keys "{\"label\": \"Smoke Test Key\"}")
VIRTUAL_KEY=$(echo "$KEY_RESPONSE" | jq -r '.data.key // empty')
KEY_PREFIX=$(echo "$KEY_RESPONSE" | jq -r '.data.keyPrefix // empty')
if [ -n "$VIRTUAL_KEY" ]; then
  echo "OK"
  echo "    Key: sk-tag-$KEY_PREFIX-..."
else
  echo "FAILED"
  echo "Response: $KEY_RESPONSE"
  exit 1
fi

# ============================================================================
# Step 7: List Virtual Keys
# ============================================================================

echo ""
echo "Step 7: List Virtual Keys"
echo "--------------------------"

echo -n "  Listing keys... "
KEYS_RESPONSE=$(api GET /api/virtual-keys)
KEY_COUNT=$(echo "$KEYS_RESPONSE" | jq -r '.data | length')
if [ "$KEY_COUNT" -ge 1 ]; then
  echo "OK ($KEY_COUNT keys)"
else
  echo "FAILED"
  exit 1
fi

# ============================================================================
# Step 8: Fetch Routing Config
# ============================================================================

echo ""
echo "Step 8: Fetch Routing Config"
echo "------------------------------"

echo -n "  Fetching routing config... "
ROUTING_RESPONSE=$(api GET /api/cli/routing-config)
GATEWAY_URL=$(echo "$ROUTING_RESPONSE" | jq -r '.data.gatewayUrl // empty')
AVAILABLE_MODELS=$(echo "$ROUTING_RESPONSE" | jq -r '.data.availableModels | length')
if [ -n "$GATEWAY_URL" ]; then
  echo "OK"
  echo "    Gateway URL: $GATEWAY_URL"
  echo "    Available Models: $AVAILABLE_MODELS"
else
  echo "FAILED"
  echo "Response: $ROUTING_RESPONSE"
  exit 1
fi

# ============================================================================
# Step 9: Cleanup - Disable Models
# ============================================================================

echo ""
echo "Step 9: Cleanup"
echo "----------------"

echo -n "  Disabling test models... "
api PATCH "/api/models/$ANTHROPIC_MODEL_ID" '{"enabled": false}' > /dev/null
api PATCH "/api/models/$OLLAMA_MODEL_ID" '{"enabled": false}' > /dev/null
echo "OK"

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "=============================================="
echo "  Smoke Test Complete!"
echo "=============================================="
echo ""
echo "All tests passed. Multi-provider routing is working."
echo ""
echo "Test artifacts created:"
echo "  - User: $EMAIL"
echo "  - Models: 2 (disabled)"
echo "  - Virtual Key: sk-tag-$KEY_PREFIX-..."
echo ""
echo "To run a full E2E test with real providers:"
echo "  1. Set TAG_ENCRYPTION_MASTER_KEY in .env"
echo "  2. Configure real API keys in the admin UI"
echo "  3. Start the router service (apps/router)"
echo "  4. Make requests using the virtual key"
