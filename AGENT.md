# Инструкция для ИИ-агента (Antigravity, Claude Code, Codex и др.)

Тебе дали ссылку на cosmos-kit и попросили сделать сайт в этом стиле. Делай так:

1. **Создай проект из заготовки** (кит, заготовка и навык скопируются сами):
   - Linux / macOS / WSL:
     `curl -fsSL https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/create-site.sh | sh -s -- <имя-сайта>`
   - Windows PowerShell:
     `& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/create-site.ps1))) <имя-сайта>`
   - Если запускать скрипты нельзя: скачай архив https://codeload.github.com/Ihor-Zakharov/cosmos-kit/tar.gz/main
     и собери вручную: содержимое `starter/` → корень сайта; `src/` → `kit/`; `VERSION` и `CHANGELOG.md` → `kit/`;
     `.agents/skills/cosmos-site/` → `.agents/skills/cosmos-site/`.
2. **Прочитай `AGENTS.md` нового проекта и `.agents/skills/cosmos-site/SKILL.md`.** Там устройство сайта,
   правила композиции, тона и движения и чек-лист. Не пропускай этот шаг: стиль держится на правилах, а не только на CSS.
3. **Наполни заготовку содержимым пользователя**: всё с пометкой `ЗАМЕНИТЬ`, секции, подвал. Собирай из
   компонентов кита (витрина — `demo/index.html` этого репозитория), свои стили — только в `site.css` на токенах.
   Файлы в `kit/` не правь.
4. **Проверь**: `python3 -m http.server 8000` → http://localhost:8000/ ; окна 1440 и 390 px без горизонтальной
   прокрутки, консоль без ошибок. Покажи пользователю результат.

Если пользователь не сказал, о чём сайт, — спроси тему, название и 3–5 разделов прежде чем наполнять.
