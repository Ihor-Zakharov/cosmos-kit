# Инструкция для ИИ-агента (Claude Code, Antigravity, Codex и др.)

Тебе дали ссылку на cosmos-kit — значит, интерфейс нужно сделать (или перевести) в этом стиле. Три шага, сам, без вопросов:

1. **Поставь кит** (один раз на машину; повторный запуск — обновление):
   - Linux / macOS / WSL: `curl -fsSL https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/install.sh | sh`
   - Windows PowerShell: `irm https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/install.ps1 | iex`
2. **В корне проекта:** `python3 ~/.cosmos-kit/src/tools/cosmos.py init`
   - пустая папка → новый сайт; просят приложение / кабинет / «сразу с UI» → добавь `--app`;
   - есть код → кит применяется к проекту: логика и тексты остаются, меняется вид.
3. **Прочитай `.agents/skills/cosmos-site/SKILL.md`** в проекте и пройди его цикл до строки `cosmos-done: OK`
   от `python3 kit/tools/cosmos.py done`. Там же — формат отчёта.

Чего не делать: не читать исходники кита (`kit/css`, `kit/js`) — разметка в `kit/blocks/`, классы — `check.py --classes`;
не править `kit/`; не придумывать свои цвета, шрифты и анимации; не спрашивать то, что можно решить самому (допущения — в отчёт).
