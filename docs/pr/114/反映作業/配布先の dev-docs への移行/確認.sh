#!/bin/sh
set -eu

REPO="${1:-$PWD}"
if [ -z "$REPO" ] || [ ! -f "$REPO/project-index.yaml" ]; then
  echo "project-index.yaml: failed"
  exit 1
fi
NAME=$(sed -n 's/^name: *//p' "$REPO/project-index.yaml" | head -n 1)
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8781/$NAME@develop/")
if [ "$code" = "200" ]; then
  echo "dev-docs の画面の /$NAME@develop/: ok（$code）"
else
  echo "dev-docs の画面の /$NAME@develop/: failed（$code）"
  exit 1
fi
