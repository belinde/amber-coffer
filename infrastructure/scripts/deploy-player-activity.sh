#!/usr/bin/env bash
# Deploy apps/player-activity dist/ to the environment S3 bucket and invalidate CloudFront.
set -euo pipefail

ENV_NAME="${1:-prod}"
if [[ "$ENV_NAME" != "prod" && "$ENV_NAME" != "dev" ]]; then
  echo "Usage: $0 [prod|dev]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/aws-env.sh
source "${SCRIPT_DIR}/lib/aws-env.sh"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
cd "$REPO_ROOT"
nvm use 2>/dev/null || true

BUCKET="$(aws ssm get-parameter \
  --name "/amber-coffer/${ENV_NAME}/web/player-activity-bucket-name" \
  --query Parameter.Value \
  --output text)"

DIST_ID="$(aws ssm get-parameter \
  --name "/amber-coffer/${ENV_NAME}/web/table-distribution-id" \
  --query Parameter.Value \
  --output text)"

pnpm --filter @amber/player-activity build

aws s3 sync apps/player-activity/dist/ "s3://${BUCKET}/" --delete

aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*"

echo "Deployed player-activity to s3://${BUCKET}/ (env=${ENV_NAME})"
