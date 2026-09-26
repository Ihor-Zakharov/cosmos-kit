#!/bin/sh
# Обновить kit/ и навык cosmos-site до версии кита: sh update-kit.sh [vX.Y.Z | main]
set -eu
REF=${1:-main}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://codeload.github.com/Ihor-Zakharov/cosmos-kit/tar.gz/$REF" | tar -xz -C "$TMP" --strip-components=1
rm -rf kit && mkdir kit && cp -R "$TMP/src/." kit/ && cp "$TMP/VERSION" "$TMP/CHANGELOG.md" kit/
rm -rf .agents/skills/cosmos-site && mkdir -p .agents/skills && cp -R "$TMP/.agents/skills/cosmos-site" .agents/skills/
echo "kit/ обновлён до $(cat kit/VERSION) ($REF). Прочитай kit/CHANGELOG.md — пункты «ломает» требуют правок."
