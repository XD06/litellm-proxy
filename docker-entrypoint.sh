#!/bin/sh
set -eu

mkdir -p /app/tmp /app/proxy_logs /app/data /app/data/aa_cache

for path in /app/tmp /app/proxy_logs /app/data; do
  chown -R appuser:appuser "$path" 2>/dev/null || true
done

if [ -e /app/runtime_config.json ] && [ ! -d /app/runtime_config.json ]; then
  chown appuser:appuser /app/runtime_config.json 2>/dev/null || true
fi

exec gosu appuser "$@"
