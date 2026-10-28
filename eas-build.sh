#!/bin/bash
# EAS Build helper for Replit
# Fixes the dotslash read-only directory permissions issue

set -e

EAS_TMP="/home/runner/.expo-tmp"
EAS_CACHE="/home/runner/.expo-cache"

mkdir -p "$EAS_TMP" "$EAS_CACHE"

export TMPDIR="$EAS_TMP"
export TEMP="$EAS_TMP"
export TMP="$EAS_TMP"
export XDG_CACHE_HOME="$EAS_CACHE"
export DOTSLASH_CACHE_DIR="$EAS_CACHE/dotslash"

echo "→ Running: eas $*"
echo ""

# dotslash marks its cache dirs read-only (555) after downloading binaries.
# EAS CLI then can't clean up those dirs (rmdir → EACCES).
# This background loop continuously re-adds write permission so cleanup works.
_fix_perms() {
  while true; do
    find "$EAS_TMP" "$EAS_CACHE" -type d ! -writable -exec chmod u+w {} \; 2>/dev/null || true
    sleep 1
  done
}
_fix_perms &
_FIX_PID=$!

# Run EAS — capture exit code so we can clean up the fixer even on failure
eas "$@"
_EAS_EXIT=$?

kill "$_FIX_PID" 2>/dev/null || true

exit $_EAS_EXIT
