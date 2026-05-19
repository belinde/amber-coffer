#!/usr/bin/env bash
# Maps a Discord voice channel_id to an active campaign/session for Player Activity handshake.
set -euo pipefail

ENV="${1:-dev}"
CHANNEL_ID="${2:?channel_id required}"
CAMPAIGN_ID="${3:?campaign_id required}"
SESSION_ID="${4:?session_id required}"

TABLE_NAME=$(aws ssm get-parameter \
  --name "/amber-coffer/${ENV}/handshake/table-name" \
  --query 'Parameter.Value' \
  --output text)

aws dynamodb put-item \
  --table-name "${TABLE_NAME}" \
  --item "{
    \"channel_id\": {\"S\": \"${CHANNEL_ID}\"},
    \"campaign_id\": {\"S\": \"${CAMPAIGN_ID}\"},
    \"session_id\": {\"S\": \"${SESSION_ID}\"}
  }"

echo "Seeded channel ${CHANNEL_ID} → campaign ${CAMPAIGN_ID}, session ${SESSION_ID} in ${TABLE_NAME}"
