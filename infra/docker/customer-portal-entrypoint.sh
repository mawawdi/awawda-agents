#!/bin/sh
set -eu

api_base_url="${CUSTOMER_PORTAL_API_BASE_URL:-/v1}"
runtime_env="${CUSTOMER_PORTAL_RUNTIME_ENV:-production}"

escape_js_single_quoted() {
  printf "%s" "$1" | sed -e 's/\\/\\\\/g' -e "s/'/'\\\\''/g"
}

escaped_api_base_url="$(escape_js_single_quoted "$api_base_url")"
escaped_runtime_env="$(escape_js_single_quoted "$runtime_env")"

cat > /usr/share/nginx/html/runtime-config.js <<EOF
globalThis.__CUSTOMER_PORTAL_API_BASE_URL__ = '${escaped_api_base_url}';
globalThis.__CUSTOMER_PORTAL_RUNTIME_ENV__ = '${escaped_runtime_env}';
EOF
