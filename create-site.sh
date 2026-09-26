#!/bin/sh
# Новый сайт на cosmos-kit:
#   curl -fsSL https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/create-site.sh | sh -s -- my-site
# Второй аргумент — версия кита (тег vX.Y.Z), по умолчанию main.
set -eu
DIR=${1:-my-site}; REF=${2:-main}
if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then echo "Каталог $DIR не пуст — выбери другое имя." >&2; exit 1; fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://codeload.github.com/Ihor-Zakharov/cosmos-kit/tar.gz/$REF" | tar -xz -C "$TMP" --strip-components=1
mkdir -p "$DIR/kit" "$DIR/.agents/skills" "$DIR/.claude"
cp -R "$TMP/starter/." "$DIR/"
cp -R "$TMP/src/." "$DIR/kit/"
cp "$TMP/VERSION" "$TMP/CHANGELOG.md" "$DIR/kit/"
cp -R "$TMP/.agents/skills/cosmos-site" "$DIR/.agents/skills/"
# Claude Code читает CLAUDE.md и .claude/skills, Antigravity — AGENTS.md и .agents/skills
cp "$DIR/AGENTS.md" "$DIR/CLAUDE.md"
cp -R "$DIR/.agents/skills" "$DIR/.claude/skills"
printf 'node_modules/\n.env*\n.DS_Store\n' > "$DIR/.gitignore"
echo "Готово: $DIR (cosmos-kit $(cat "$DIR/kit/VERSION"), $REF)."
echo "Дальше: прочитай $DIR/AGENTS.md; запуск — cd $DIR && python3 -m http.server 8000"
