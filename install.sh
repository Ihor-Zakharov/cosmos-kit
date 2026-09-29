#!/bin/sh
# cosmos-kit для ИИ-агентов — одна команда:
#   curl -fsSL https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/install.sh | sh
# Кладёт кит в ~/.cosmos-kit (или $COSMOS_KIT), ставит глобальный навык cosmos-ui для Claude Code (~/.claude/skills)
# и Antigravity (~/.gemini/config/skills), глобальный хук Claude Code (узнаёт просьбы про UI, копия настроек —
# ~/.claude/settings.json.bak-cosmos), проверяет инструменты (Node ≥ 22, браузер). Повторный запуск — обновление.
# Дальше в любом проекте: «примени UI» / «сделай с UI» — или python3 ~/.cosmos-kit/src/tools/cosmos.py init
set -eu
DEST=${COSMOS_KIT:-$HOME/.cosmos-kit}; REF=${1:-main}
URL=https://github.com/Ihor-Zakharov/cosmos-kit
if [ -d "$DEST/.git" ] || [ -L "$DEST" ]; then
  git -C "$DEST" pull --ff-only -q 2>/dev/null || echo "· $DEST: обновить не вышло (локальные правки?) — оставлен как есть"
elif command -v git >/dev/null 2>&1; then
  git clone -q --depth 1 -b "$REF" "$URL" "$DEST"
else
  mkdir -p "$DEST"; curl -fsSL "https://codeload.github.com/Ihor-Zakharov/cosmos-kit/tar.gz/$REF" | tar -xz -C "$DEST" --strip-components=1
fi
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
# навык cosmos-ui (Claude Code, Antigravity) + глобальный хук Claude Code: «примени UI» / «сделай с UI» в любом проекте
"$PY" "$DEST/src/tools/cosmos.py" global-install
"$PY" "$DEST/src/tools/cosmos.py" setup || true
echo "cosmos-kit $(cat "$DEST/VERSION") → $DEST"
echo "Дальше в проекте: «примени UI» / «сделай с UI» — или $PY $DEST/src/tools/cosmos.py init"
