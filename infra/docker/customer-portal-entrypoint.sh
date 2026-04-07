#!/bin/sh
set -eu

api_base_url="${CUSTOMER_PORTAL_API_BASE_URL:-/v1}"

cat > /usr/share/nginx/html/runtime-config.js <<EOF
globalThis.__CUSTOMER_PORTAL_API_BASE_URL__ = "${api_base_url}";
EOF
