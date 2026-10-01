#!/bin/sh
# Самопроверка кита перед коммитом/выпуском: блоки и заготовка проходят свой линтер, init собирает сайт и приложение,
# браузер (если есть) не видит ошибок. Запуск: sh selftest.sh  (быстро: sh selftest.sh --no-browser)
set -eu
cd "$(dirname "$0")"
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
node --check src/js/site.js && node --check src/js/motion.js && node --check src/tools/shot.mjs
"$PY" -m py_compile src/tools/check.py src/tools/cosmos.py src/tools/contrast.py
"$PY" src/tools/check.py --self src/blocks/*.html starter/*.html | tail -1
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
"$PY" src/tools/cosmos.py init "$T/site" >/dev/null && "$PY" src/tools/cosmos.py init "$T/app" --app >/dev/null
for d in site app; do
  # заглушки — единственное, что допустимо в свежей заготовке
  out=$(cd "$T/$d" && "$PY" kit/tools/check.py | grep '^✗' | grep -v ' P6 ' || true)
  [ -z "$out" ] || { echo "✗ заготовка $d:"; echo "$out"; exit 1; }
  if [ "${1:-}" != "--no-browser" ]; then (cd "$T/$d" && node kit/tools/shot.mjs | tail -1); fi
done
# витрины кита: все блоки (грузятся из src/blocks) и главная демо — без ошибок консоли, 404 и прокрутки
if [ "${1:-}" != "--no-browser" ]; then node src/tools/shot.mjs demo/blocks.html demo/index.html demo/chat.html --skip B4,B5,B6,B7 | tail -1; fi
echo "selftest: OK"
