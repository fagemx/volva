#!/bin/bash
message=$(head -1 "$1")
if ! echo "$message" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+$'; then
  echo "ERROR: Commit message must follow Conventional Commits format."
  echo "  Format: type(scope): description"
  echo "  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
  echo "  Got: $message"
  exit 1
fi
