#!/usr/bin/env bash
# Prints Discord Developer Portal URL Mappings for Player Activity (copy-paste).
set -euo pipefail

ENV="${1:-prod}"
APP_ID="${AMBER_DISCORD_APPLICATION_ID:-1505870393007935598}"

API_HOST="api.ambercoffer.belinde.click"
TABLE_HOST="table.ambercoffer.belinde.click"
if [[ "$ENV" == "dev" ]]; then
  API_HOST="api-dev.ambercoffer.belinde.click"
  TABLE_HOST="table-dev.ambercoffer.belinde.click"
fi

echo "Discord Application: Amber Coffer (${APP_ID})"
echo "Portal: Activities -> URL Mappings (TARGET without https://)"
echo "Order: list /api BEFORE / (longer prefix first)"
echo ""
printf "| PREFIX | TARGET |\n|--------|--------|\n"
printf "| /api | %s |\n" "$API_HOST"
printf "| / | %s |\n" "$TABLE_HOST"
echo ""
echo "OAuth2 -> Redirects (same application):"
echo "  https://${TABLE_HOST}"
echo "  https://${APP_ID}.discordsays.com"
echo "  http://127.0.0.1:47832/oauth/callback  (master-app OAuth)"
