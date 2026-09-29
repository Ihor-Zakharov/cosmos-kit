#!/bin/sh
# Новый сайт на cosmos-kit (то же, что install.sh + cosmos.py init):
#   curl -fsSL https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/create-site.sh | sh -s -- my-site [--app]
set -eu
DIR=${1:-my-site}; shift 2>/dev/null || true
if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then echo "Каталог $DIR не пуст — выбери другое имя (или в нём: python3 ~/.cosmos-kit/src/tools/cosmos.py init)." >&2; exit 1; fi
curl -fsSL https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/install.sh | sh
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
"$PY" "${COSMOS_KIT:-$HOME/.cosmos-kit}/src/tools/cosmos.py" init "$DIR" --new "$@"
echo "Дальше: cd $DIR && $PY -m http.server 8000 → http://localhost:8000/ ; правила — .agents/skills/cosmos-site/SKILL.md"
