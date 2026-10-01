#!/usr/bin/env python3
"""cosmos — воркфлоу сайта/приложения на cosmos-kit для ИИ-агентов (Claude Code, Antigravity, Codex) и людей.

  python3 <кит>/tools/cosmos.py init            применить кит к проекту в текущей папке (есть код — «применить UI»,
                                                пусто — новый сайт из заготовки); повторный запуск безопасен
  python3 <кит>/tools/cosmos.py init --app      новый проект — приложение (боковая навигация), а не сайт-лендинг
  python3 kit/tools/cosmos.py status            где мы и что дальше (коротко)
  python3 kit/tools/cosmos.py done              финальная проверка: линтер + браузер; только после OK работа сдана;
                                                после OK печатает чек-лист того, что линтер не видит
  python3 kit/tools/cosmos.py quiz [--key|--check]   экзамен для модели: 10 типовых ошибок (--key — ответы, --check — линтер ловит сам)
  python3 kit/tools/cosmos.py selfcheck         для репозитория кита: копии топ-10 одинаковы, UX.md один, экзамен проходит
  python3 kit/tools/cosmos.py setup             проверить и доставить инструменты (Node ≥ 22, браузер, …)
  python3 kit/tools/cosmos.py update            обновить кит из источника (git/архив), свои файлы не трогаются
  python3 kit/tools/cosmos.py hook <pre|post|stop|session|prompt>   хуки Claude Code (читают JSON из stdin)

Только stdlib, Python ≥ 3.8. Всё, что пишет в проект: <kit>/, cosmos.json, .agents/skills/cosmos-site/,
.claude/{settings.json,skills,agents}, блок в AGENTS.md/CLAUDE.md, .cosmos/ (служебное, в .gitignore)."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
KIT = TOOLS.parent                                    # src/ в репозитории кита, <kit>/ в проекте
REPO = KIT.parent if (KIT.parent / "starter").is_dir() else None   # есть — запуск из репозитория кита
GIT_URL = "https://github.com/Ihor-Zakharov/cosmos-kit"
MARK_B, MARK_E = "<!-- cosmos-kit:begin -->", "<!-- cosmos-kit:end -->"
OWN_EXT = (".html", ".css", ".js", ".mjs")
PY = "python3" if shutil.which("python3") else "python"


def say(*a):
    print(*a, flush=True)


def find_root(start=None):
    start = Path(start or os.environ.get("CLAUDE_PROJECT_DIR") or Path.cwd()).resolve()
    for d in [start, *start.parents]:
        if (d / "cosmos.json").exists():
            return d
    return start


def load_cfg(root):
    try:
        return json.loads((root / "cosmos.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


# ---------------- init ----------------

STATIC_DIRS = ["public", "static", "www", "web", "site", "app/static", "src/static", "frontend/public", "client/public", "assets"]
SKIP = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".cosmos", ".claude", ".agents", "kit"}


def walk(root, exts):
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP and not d.startswith(".")]
        for fn in fns:
            if fn.endswith(exts):
                yield Path(dp) / fn


def detect(root):
    """Что за проект: где страницы, где класть кит, как на него ссылаться, есть ли HTML внутри исходников."""
    htmls = [p for p in walk(root, (".html", ".htm", ".jinja", ".j2", ".hbs", ".ejs", ".vue", ".svelte", ".jsx", ".tsx"))]
    embedded = []
    for p in walk(root, (".py", ".go", ".rb", ".php", ".js", ".ts", ".rs")):
        if p.stat().st_size > 3_000_000:
            continue
        t = p.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"<!doctype html|<html[\s>]", t, re.I) and p.suffix not in (".js", ".ts") or \
                (p.suffix in (".js", ".ts") and re.search(r"`\s*<!doctype html", t, re.I)):
            embedded.append(p.relative_to(root).as_posix())
    # файлы без расширения со скриптом (как abook): shebang python и разметка внутри
    for p in root.iterdir():
        if p.is_file() and not p.suffix and p.stat().st_size < 3_000_000:
            head = p.read_bytes()[:64]
            if head.startswith(b"#!") and re.search(rb"<!doctype html|<html[\s>]", p.read_bytes(), re.I):
                embedded.append(p.name)
    static = None
    for d in STATIC_DIRS:
        if (root / d).is_dir():
            static = d
            break
    if (root / "index.html").exists() or (not static and not embedded and htmls):
        kit_dir, kit_url, is_static = "kit", "kit/", True
    elif static:
        kit_dir = f"{static}/kit"
        kit_url = "/static/kit/" if static.endswith("static") else "/kit/"
        is_static = static in ("public", "www", "web", "site", "frontend/public", "client/public")
    else:
        kit_dir, kit_url, is_static = "kit", "/kit/", not embedded
    return {"htmls": [h.relative_to(root).as_posix() for h in htmls[:50]], "embedded": sorted(set(embedded)),
            "kit_dir": kit_dir, "kit_url": kit_url, "static": is_static}


def copy_kit(dst):
    """Кит (src/ этого кита) → dst; MANIFEST.sha256 — чтобы линтер заметил правку файлов кита (K1)."""
    dst = Path(dst)
    if dst.resolve() == KIT:
        return
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(KIT, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "MANIFEST.sha256"))
    if REPO:
        for f in ("VERSION", "CHANGELOG.md"):
            if (REPO / f).exists():
                shutil.copy2(REPO / f, dst / f)
    lines = []
    for f in sorted(dst.rglob("*")):
        if f.is_file() and f.name != "MANIFEST.sha256" and "__pycache__" not in f.parts:
            lines.append(f"{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.relative_to(dst).as_posix()}")
    (dst / "MANIFEST.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")


def agent_src():
    """Навык, агенты и блок правил едут вместе с китом: <кит>/agent/."""
    return KIT / "agent"


def install_agent_layer(root, kit_dir):
    src = agent_src()
    # навык проекта: .agents/skills/cosmos-site (Antigravity) и .claude/skills (Claude Code)
    skill_src = src / "skills" / "cosmos-site"
    sk = root / ".agents" / "skills" / "cosmos-site"
    if sk.exists():
        shutil.rmtree(sk)
    shutil.copytree(skill_src, sk)
    cs = root / ".claude" / "skills"
    if not cs.is_symlink():                       # у многих проектов .claude/skills — симлинк на .agents/skills
        (cs / "cosmos-site").parent.mkdir(parents=True, exist_ok=True)
        if (cs / "cosmos-site").exists():
            shutil.rmtree(cs / "cosmos-site")
        shutil.copytree(skill_src, cs / "cosmos-site")
    # агенты Claude Code
    ag = root / ".claude" / "agents"
    ag.mkdir(parents=True, exist_ok=True)
    for f in (src / "agents").glob("*.md"):
        shutil.copy2(f, ag / f.name)
    # хуки Claude Code: сливаем с тем, что уже есть; свои узнаём по «cosmos.py hook»
    st = root / ".claude" / "settings.json"
    cfg = {}
    if st.exists():
        try:
            cfg = json.loads(st.read_text(encoding="utf-8"))
        except ValueError:
            say(f"· {st} — не JSON, хуки не добавлены; поправьте файл и повторите init")
            cfg = None
    if cfg is not None:
        cmd = lambda ev: f'{PY} "$CLAUDE_PROJECT_DIR/{kit_dir}/tools/cosmos.py" hook {ev}'
        want = {
            "PreToolUse": [{"matcher": "Edit|Write|MultiEdit|Read", "hooks": [{"type": "command", "command": cmd("pre"), "timeout": 10}]}],
            "PostToolUse": [{"matcher": "Edit|Write|MultiEdit", "hooks": [{"type": "command", "command": cmd("post"), "timeout": 30}]}],
            "Stop": [{"hooks": [{"type": "command", "command": cmd("stop"), "timeout": 150}]}],
            "SessionStart": [{"hooks": [{"type": "command", "command": cmd("session"), "timeout": 10}]}],
            "UserPromptSubmit": [{"hooks": [{"type": "command", "command": cmd("prompt"), "timeout": 10}]}],
        }
        hooks = cfg.setdefault("hooks", {})
        for ev, entries in want.items():
            keep = [e for e in hooks.get(ev, []) if not any("cosmos.py" in h.get("command", "") and " hook " in h.get("command", "")
                                                             for h in e.get("hooks", []))]
            hooks[ev] = keep + entries
        perms = cfg.setdefault("permissions", {}).setdefault("allow", [])
        for rule in [f"Bash({PY} {kit_dir}/tools/check.py:*)", f"Bash({PY} {kit_dir}/tools/cosmos.py:*)",
                     f"Bash(node {kit_dir}/tools/shot.mjs:*)"]:
            if rule not in perms:
                perms.append(rule)
        st.parent.mkdir(parents=True, exist_ok=True)
        st.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # правила проекта: блок в AGENTS.md; CLAUDE.md — импорт AGENTS.md, если своего нет
    block = (src / "AGENTS-block.md").read_text(encoding="utf-8").replace("{kit}", kit_dir)
    block = f"{MARK_B}\n{block.strip()}\n{MARK_E}\n"
    am = root / "AGENTS.md"
    text = am.read_text(encoding="utf-8") if am.exists() else ""
    if MARK_B in text:
        text = re.sub(re.escape(MARK_B) + r".*?" + re.escape(MARK_E) + r"\n?", block, text, flags=re.S)
    else:
        text = (text.rstrip() + "\n\n" if text.strip() else "") + block
    am.write_text(text, encoding="utf-8")
    cm = root / "CLAUDE.md"
    if not cm.exists() and not cm.is_symlink():
        cm.write_text("@AGENTS.md\n", encoding="utf-8")
    elif not cm.is_symlink() and "AGENTS.md" not in cm.read_text(encoding="utf-8"):
        cm.write_text(cm.read_text(encoding="utf-8").rstrip() + "\n\n@AGENTS.md\n", encoding="utf-8")
    gi = root / ".gitignore"
    g = gi.read_text(encoding="utf-8") if gi.exists() else ""
    if ".cosmos/" not in g:
        gi.write_text(g + ("" if g.endswith("\n") or not g else "\n") + ".cosmos/\n", encoding="utf-8")


def cmd_init(args):
    root = Path(next((a for a in args if not a.startswith("--")), ".")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    own = [p for p in root.iterdir() if p.name not in (".git", ".gitignore", "README.md", "AGENTS.md", "CLAUDE.md", ".claude", ".agents", "LICENSE")]
    new = not own or "--new" in args
    if new:
        if not REPO:
            say("✗ новый проект создаётся из репозитория кита: python3 ~/.cosmos-kit/src/tools/cosmos.py init"); return 1
        tpl = REPO / "starter"
        for p in tpl.iterdir():
            if p.name in ("app.html",) and "--app" not in args or p.name == "update-kit.sh":
                continue
            d = root / p.name
            if d.exists():
                continue
            (shutil.copytree if p.is_dir() else shutil.copy2)(p, d)
        if "--app" in args and (root / "app.html").exists():
            (root / "index.html").unlink(missing_ok=True)
            (root / "page.html").unlink(missing_ok=True)
            (root / "app.html").rename(root / "index.html")
        info = {"kit_dir": "kit", "kit_url": "kit/", "static": True, "embedded": [], "htmls": []}
    else:
        info = detect(root)
    kit_dir = info["kit_dir"]
    copy_kit(root / kit_dir)
    if not new and not (root / ".cosmos" / "baseline.json").exists() and info["static"] and shutil.which("node"):
        # эталон «как было»: сколько текста и записей видно на страницах до перевода — done сравнит (B10)
        (root / ".cosmos").mkdir(exist_ok=True)
        try:
            subprocess.run([shutil.which("node"), str(root / kit_dir / "tools" / "shot.mjs"), "--baseline", "--w", "1920"], cwd=root,
                           capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            pass
    cfgf = root / "cosmos.json"
    cfg = load_cfg(root)
    if not cfg:
        cfg = {"kit_url": info["kit_url"], "static": info["static"]}
        if info["embedded"]:
            cfg["embedded"] = info["embedded"]
        if not info["static"]:
            cfg["serve"] = "ЗАДАТЬ: команда запуска приложения с портом {port}, например: python3 app.py --port {port}"
            cfg["pages"] = ["/"]
    cfg["kit_dir"] = kit_dir
    cfg["mode"] = cfg.get("mode") or ("new-app" if "--app" in args else "new-site" if new else "apply")
    cfgf.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    install_agent_layer(root, kit_dir)
    ver = (root / kit_dir / "VERSION").read_text().strip() if (root / kit_dir / "VERSION").exists() else "?"
    say(f"cosmos-kit {ver} → {root}/{kit_dir}  ({'новый ' + ('апп' if '--app' in args else 'сайт') if new else 'применение к проекту'})")
    if not new:
        say(f"  страницы: {len(info['htmls'])} файлов" + (f"; разметка внутри: {', '.join(info['embedded'])}" if info["embedded"] else ""))
        say(f"  кит в страницах подключать как {cfg['kit_url']}…  (проверьте, что сервер отдаёт {kit_dir}/ по этому адресу — поправьте kit_url в cosmos.json)")
        if "serve" in cfg and str(cfg["serve"]).startswith("ЗАДАТЬ"):
            say("  cosmos.json → serve: впишите команду запуска приложения с {port} — для браузерной проверки")
    say("  хуки Claude Code, навык cosmos-site и агенты установлены. Дальше: .agents/skills/cosmos-site/SKILL.md")
    return 0


# ---------------- status / done ----------------

def own_files(root, cfg):
    kit = (root / cfg.get("kit_dir", "kit")).resolve()
    out = []
    for p in walk(root, OWN_EXT):
        try:
            p.resolve().relative_to(kit)
            continue
        except ValueError:
            out.append(p)
    out += [root / e for e in cfg.get("embedded", []) if (root / e).exists()]
    return out


def stamp(root, name):
    try:
        return json.loads((root / ".cosmos" / f"{name}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def newest(files):
    return max((f.stat().st_mtime for f in files), default=0)


def status_lines(root):
    cfg = load_cfg(root)
    if not cfg:
        return ["cosmos: кит не установлен — python3 <кит>/tools/cosmos.py init"]
    files = own_files(root, cfg)
    chk, sh = stamp(root, "check"), stamp(root, "shot")
    last = newest(files)
    ph = sum(len(re.findall(r"ЗАМЕНИТЬ", f.read_text(encoding="utf-8", errors="ignore"))) for f in files if f.suffix == ".html")
    L = [f"cosmos: режим {cfg.get('mode', '?')}, кит {cfg.get('kit_dir')}, своих файлов {len(files)}"]
    L.append("  проверка: " + ("не запускалась" if not chk else ("OK" if chk["pass"] else f"ошибок {chk['errors']}") +
                             (" (устарела)" if chk and chk["epoch"] < last else "")))
    L.append("  браузер: " + ("не запускался" if not sh else ("OK" if sh["pass"] else f"ошибок {sh['errors']}") +
                            (" (устарел)" if sh and sh["epoch"] < last else "")))
    if ph:
        L.append(f"  заглушек ЗАМЕНИТЬ: {ph}")
    if str(cfg.get("serve", "")).startswith("ЗАДАТЬ"):
        nxt = "вписать serve в cosmos.json (команда запуска приложения с {port})"
    elif ph:
        nxt = "наполнить страницы (ЗАМЕНИТЬ → содержимое), блоки — kit/blocks/INDEX.md"
    elif not chk or not chk["pass"] or chk["epoch"] < last:
        nxt = f"{PY} {cfg.get('kit_dir')}/tools/check.py и исправить"
    elif not sh or not sh["pass"] or sh["epoch"] < last:
        nxt = f"{PY} {cfg.get('kit_dir')}/tools/cosmos.py done"
    else:
        nxt = "всё проверено — можно сдавать или брать следующую задачу"
    L.append(f"  дальше: {nxt}")
    return L


def run_check(root, cfg, files=None, timeout=60):
    kit = root / cfg.get("kit_dir", "kit")
    r = subprocess.run([sys.executable, str(kit / "tools" / "check.py"), *map(str, files or [])], cwd=root,
                       capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout.strip()


def run_shot(root, cfg, timeout=150):
    kit = root / cfg.get("kit_dir", "kit")
    node = shutil.which("node")
    if not node:
        return 3, "· B0  нет Node ≥ 22 — браузерная проверка пропущена (python3 kit/tools/cosmos.py setup)"
    try:
        r = subprocess.run([node, str(kit / "tools" / "shot.mjs"), "--full"], cwd=root, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "✗ B0  браузерная проверка не уложилась во время"


def cmd_status(args):
    say("\n".join(status_lines(find_root())))
    return 0


def cmd_done(args):
    root = find_root()
    cfg = load_cfg(root)
    rc1, out1 = run_check(root, cfg)
    say(out1)
    if rc1:
        say("cosmos-done: НЕТ — сначала ошибки линтера"); return 1
    rc2, out2 = run_shot(root, cfg)
    say(out2)
    if rc2 == 1:
        say("cosmos-done: НЕТ — ошибки в браузере"); return 1
    say("cosmos-done: OK" + (" (браузер недоступен — проверено только линтером)" if rc2 == 3 else ""))
    say(EYES.format(kit=cfg.get("kit_dir", "kit")))
    return 0


# то, что линтер и браузер не видят: печатается после OK — последнее, что модель прочитает перед отчётом
EYES = """  глазами, прежде чем писать отчёт:
  · снимки .cosmos/shots/<страница>-2560-full.png, -1920.png, -390.png — открыть каждый: ничего не уезжает к краю, не наезжает, не обрезано;
    проект переключает палитры (data-palette) — снять каждую: node {kit}/tools/shot.mjs --palette grey (или paper)
  · состояния: текст читается в обычном / сделанном / активном / наведении / фокусе; переключатели не двигают соседей (B11, B12 ловят не всё)
  · клавиатура: Tab по порядку, фокус виден и ничем не перекрыт, Esc закрывает, Enter/Space нажимают
  · тексты: кнопка называет результат, заголовок — утверждение, пустое состояние ведёт к действию, язык один на всех страницах
  в отчёте: что сделано · файлы · «cosmos-done OK» · снимки · допущения (что придумано без пользователя)"""


# ---------------- setup / update ----------------

def ver_tuple(s):
    return tuple(int(x) for x in re.findall(r"\d+", s)[:3])


# инструменты разработчика, которые кит считает своими зависимостями (setup --tools):
# npm-пакеты (без sudo, в каталог Node/nvm) и системные пакеты Linux (sudo — печатаем команду человеку)
DEV_NPM = [("prettier", "prettier"), ("typescript", "tsc"), ("vite", "vite"), ("svgo", "svgo"), ("playwright", "playwright"),
           ("lighthouse", "lighthouse"), ("eslint", "eslint"), ("stylelint", "stylelint"), ("stylelint-config-standard", "stylelint"),
           ("html-validate", "html-validate")]
APT = ["libnspr4", "libnss3", "libasound2t64", "libunwind8", "fonts-liberation", "fonts-noto-color-emoji", "fonts-freefont-ttf",
       "fonts-ipafont-gothic", "fonts-wqy-zenhei", "fonts-unifont", "xfonts-cyrillic", "xfonts-scalable", "xvfb",
       "fd-find", "sqlite3", "imagemagick", "webp", "pngquant", "shellcheck", "tree", "zip", "unzip", "bat", "fzf"]


def cmd_setup(args):
    ok = True
    say(f"python {sys.version.split()[0]} ✓")
    node = shutil.which("node")
    nv = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip() if node else ""
    if node and ver_tuple(nv) >= (22,):
        say(f"node {nv} ✓")
    else:
        ok = False
        say(f"node {nv or 'нет'} ✗ — нужен ≥ 22: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && nvm install --lts")
    shot = subprocess.run([node, str(TOOLS / "shot.mjs"), "--probe"], capture_output=True, text=True, timeout=60) if node else None
    if shot and "B0" not in shot.stdout:
        say("браузер ✓")
    else:
        ok = False
        say("браузер ✗ — любой Chrome/Chromium/Edge. Linux/WSL: npx playwright install chromium, затем "
            "sudo npx playwright install-deps chromium (или системный Chrome); WSL видит и Windows Chrome")
    if "--tools" in args:                              # инструменты разработчика: всё, что ставится без sudo, — ставим
        npm = shutil.which("npm")
        miss = [p for p, exe in DEV_NPM if not shutil.which(exe)]
        if miss and npm:
            say("npm -g: " + " ".join(miss))
            subprocess.run([npm, "i", "-g", "--no-fund", "--no-audit", *miss])
        if node and shutil.which("npx") and not list((Path.home() / ".cache" / "ms-playwright").glob("chromium-*")):
            subprocess.run([shutil.which("npx"), "-y", "playwright", "install", "chromium"])
        if shutil.which("uv") and not shutil.which("ruff"):
            subprocess.run([shutil.which("uv"), "tool", "install", "ruff"])
        if sys.platform.startswith("linux") and shutil.which("apt-get"):
            have = subprocess.run(["dpkg-query", "-W", "-f=${Package} ${Status}\\n", *APT], capture_output=True, text=True).stdout
            need = [pkg for pkg in APT if f"{pkg} install ok installed" not in have]
            if need:
                say("системное (нужен sudo — выполнить самому):\n  sudo apt-get install -y " + " ".join(need))
    else:
        say("инструменты разработчика (prettier, typescript, vite, svgo, playwright, lighthouse, eslint, stylelint, …): "
            f"{PY} {os.path.abspath(__file__)} setup --tools")
    say("setup: OK" if ok else "setup: есть что доставить (см. ✗)")
    return 0 if ok else 1


def cmd_update(args):
    root = find_root()
    cfg = load_cfg(root)
    kit_dir = cfg.get("kit_dir", "kit")
    src = os.environ.get("COSMOS_KIT") or str(Path.home() / ".cosmos-kit")
    if (Path(src) / ".git").exists():
        subprocess.run(["git", "-C", src, "pull", "--ff-only", "-q"])
    elif not Path(src, "src").exists():
        subprocess.run(["git", "clone", "-q", "--depth", "1", GIT_URL, src], check=False)
    tool = Path(src) / "src" / "tools" / "cosmos.py"
    if not tool.exists():
        say(f"✗ нет кита в {src}"); return 1
    old = (root / kit_dir / "VERSION").read_text().strip() if (root / kit_dir / "VERSION").exists() else "?"
    r = subprocess.run([sys.executable, str(tool), "init", str(root)], capture_output=True, text=True)
    new = (root / kit_dir / "VERSION").read_text().strip() if (root / kit_dir / "VERSION").exists() else "?"
    say(f"кит {old} → {new}")
    ch = root / kit_dir / "CHANGELOG.md"
    if ch.exists() and old != new:
        br = [l for l in ch.read_text(encoding="utf-8").splitlines() if "ломает" in l.lower()][:12]
        if br:
            say("проверьте записи «ломает»:\n" + "\n".join("  " + b.strip() for b in br))
    return r.returncode


# ---------------- хуки Claude Code ----------------

def hook_in():
    try:
        return json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return {}


def block(msg):
    """PreToolUse/PostToolUse: exit 2 — модель видит stderr и должна поступить иначе."""
    sys.stderr.write(msg.strip() + "\n")
    sys.exit(2)


def context(event, text):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}, ensure_ascii=False))
    sys.exit(0)


BIG_KIT = re.compile(r"(^|/)(css/components\.css|css/kosmos\.css|js/cosmos\.js|js/motion\.js|js/kosmos\.js|scene/.*|fonts/.*\.woff2|demo/.*)$")


def hook_pre(data, root, cfg):
    tool, ti = data.get("tool_name", ""), data.get("tool_input", {}) or {}
    fp = ti.get("file_path") or ti.get("notebook_path") or ""
    if not fp:
        return 0
    p = Path(fp) if os.path.isabs(fp) else root / fp
    kit = (root / cfg.get("kit_dir", "kit")).resolve()
    try:
        rel = p.resolve().relative_to(kit).as_posix()
    except ValueError:
        rel = None
    if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        if rel is not None:
            block(f"cosmos: {cfg.get('kit_dir', 'kit')}/ — файлы кита, их не правят (обновление затрёт, линтер K1). "
                  f"Своё — в site.css / site.js (или в стилях проекта) на токенах кита. Нет нужного компонента — собрать "
                  f"из токенов своим классом; список классов: {PY} {cfg.get('kit_dir', 'kit')}/tools/check.py --classes <слово>")
        if p.name.startswith("settings") and p.parent.name == ".claude":
            new = (ti.get("content") or "") + (ti.get("new_string") or "") + json.dumps(ti.get("edits") or "")
            old = (ti.get("old_string") or "") + json.dumps(ti.get("edits") or "")
            if ("cosmos.py" in old and "cosmos.py" not in new) or (tool == "Write" and "cosmos.py" not in new):
                block("cosmos: хуки cosmos в .claude/settings.json не убирают — это проверка качества. "
                      "Мешает проверка — исправьте то, что она нашла; ложное срабатывание — скажите пользователю.")
        return 0
    if tool == "Read" and rel is not None and BIG_KIT.search(rel) and not ti.get("limit"):
        block(f"cosmos: {rel} большой, читать целиком не нужно (тратит контекст). Вместо этого:\n"
              f"  готовая разметка — {cfg.get('kit_dir', 'kit')}/blocks/INDEX.md и файл нужного блока\n"
              f"  классы/токены/иконки — {PY} {cfg.get('kit_dir', 'kit')}/tools/check.py --classes <слово> | --tokens <слово> | --icons\n"
              f"  если всё же нужно место в файле — grep -n и Read с offset/limit ≤ 120")
    if tool == "Read" and not ti.get("limit") and p.exists() and p.is_file() and p.stat().st_size > 150_000 \
            and p.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf"):
        block(f"cosmos: {p.name} — {p.stat().st_size // 1024} КБ. Найдите место через grep -n и читайте кусками (offset/limit).")
    return 0


def hook_post(data, root, cfg):
    ti = data.get("tool_input", {}) or {}
    fp = ti.get("file_path") or ""
    if not fp:
        return 0
    p = (Path(fp) if os.path.isabs(fp) else root / fp).resolve()
    emb = {(root / e).resolve() for e in cfg.get("embedded", [])}
    if not (p.suffix in OWN_EXT or p in emb) or not p.exists():
        return 0
    try:
        p.relative_to((root / cfg.get("kit_dir", "kit")).resolve())
        return 0
    except ValueError:
        pass
    rc, out = run_check(root, cfg, [p], timeout=25)
    if rc:
        errs = [l for l in out.splitlines() if l.startswith("✗")][:15]
        block("cosmos-check нашёл ошибки в том, что вы только что записали — исправьте до следующего шага:\n" + "\n".join(errs))
    warns = [l for l in out.splitlines() if l.startswith("·")][:8]       # предупреждения — коротко, только нарушения с кодом
    if warns:
        context("PostToolUse", "cosmos-check, предупреждения в записанном файле (исправить или обосновать в отчёте):\n" + "\n".join(warns))
    return 0


def hook_stop(data, root, cfg):
    """Стоп-гейт: пока свои файлы изменены после последней успешной проверки — не даём закончить."""
    if not cfg:
        return 0
    files = own_files(root, cfg)
    last = newest(files)
    snap = root / ".cosmos" / "sessions" / str(data.get("session_id") or "-")
    if snap.exists() and last <= float(snap.read_text() or 0):
        return 0                                             # в этой сессии файлы UI не трогали — гейт молчит
    chk, sh = stamp(root, "check"), stamp(root, "shot")
    fresh = chk and chk["pass"] and chk["epoch"] >= last
    shot_fresh = sh and (sh["pass"] or sh.get("skipped")) and sh["epoch"] >= last
    if fresh and shot_fresh:
        return 0
    cnt = root / ".cosmos" / "stop-blocks"
    n = int(cnt.read_text()) if cnt.exists() else 0
    if data.get("stop_hook_active") and n >= 3:              # трижды не вышло — отпускаем, но с честной пометкой
        cnt.unlink(missing_ok=True)
        print(json.dumps({"systemMessage": "cosmos: проверка так и не прошла — скажите пользователю, что осталось"}, ensure_ascii=False))
        return 0
    rc, out = run_check(root, cfg)
    if rc == 0:
        rc2, out2 = run_shot(root, cfg)
        if rc2 == 3:
            (root / ".cosmos").mkdir(exist_ok=True)
            (root / ".cosmos" / "shot.json").write_text(json.dumps({"epoch": time.time(), "pass": True, "skipped": True, "errors": 0}))
            cnt.unlink(missing_ok=True)
            return 0
        if rc2 == 0:
            cnt.unlink(missing_ok=True)
            return 0
        out = out2
    (root / ".cosmos").mkdir(exist_ok=True)
    cnt.write_text(str(n + 1))
    lines = [l for l in out.splitlines() if l.startswith("✗")][:20]
    print(json.dumps({"decision": "block", "reason": "cosmos: работа не сдана — проверка нашла ошибки. Исправьте и закончите снова:\n"
                      + "\n".join(lines)}, ensure_ascii=False))
    return 0


def hook_session(data, root, cfg):
    if not cfg:
        return 0
    sd = root / ".cosmos" / "sessions"                       # снимок «как было» — стоп-гейт сработает только на свои правки
    try:
        sd.mkdir(parents=True, exist_ok=True)
        (sd / str(data.get("session_id") or "-")).write_text(str(newest(own_files(root, cfg))))
        for old in sorted(sd.iterdir(), key=lambda f: f.stat().st_mtime)[:-20]:
            old.unlink()
    except OSError:
        pass
    context("SessionStart", "\n".join(status_lines(root)) +
            "\nПравила UI этого проекта — навык cosmos-site (.agents/skills/cosmos-site/SKILL.md). Кит не правится.")


TRIGGER = re.compile(r"(прим[еі]н\w*|сдела\w*|переде?л\w*|добав\w*|разработ\w*|собер\w*|апп|apply|build|make)[^.\n]{0,40}"
                     r"(ui|юи|интерфейс|дизайн|сайт|страниц|экран|космос|cosmos)", re.I)


def hook_prompt(data, root, cfg):
    pr = data.get("prompt", "") or ""
    if cfg and TRIGGER.search(pr):
        context("UserPromptSubmit", "cosmos: это задача по UI — делайте по .agents/skills/cosmos-site/SKILL.md целиком и сами, "
                "без уточняющих вопросов (допущения — в отчёт). Сдача — только после "
                f"`{PY} {cfg.get('kit_dir', 'kit')}/tools/cosmos.py done` = OK.")
    return 0


# ---------------- глобальный вход: «примени UI» в любом проекте ----------------
# Слабые модели сами навыки не зовут, поэтому вход детерминированный: глобальный UserPromptSubmit-хук Claude Code
# (ставит install.sh → cosmos.py global-install) узнаёт просьбу про UI и подкладывает точную инструкцию.
UI_ASK = re.compile(r"(прим[еі]н|сдела|созда|разработ|переде?л|переверста|добав|собер|оформ|навед|apply|build|make|create|redesign)\w*"
                    r"[^\n]{0,60}?(?<![\w-])(ui|юай|уи|интерфейс\w*|дизайн\w*|cosmos|космос\w*)(?![\w./-])"
                    r"|github\.com/[\w.-]+/cosmos-kit(?![\w-])|(?<![\w-])с\s+(ui|юай|интерфейсом)(?![\w-])|with\s+(a\s+)?ui\b", re.I)
NEW_THING = re.compile(r"(сдела|созда|разработ|собер|запили|build|make|create)\w*[^\n]{0,40}?"
                       r"(сайт|лендинг|landing|website|site|приложени|app\b|кабинет|дашборд|dashboard|админк|страниц)", re.I)
APPISH = re.compile(r"приложени|кабинет|админк|дашборд|dashboard|инструмент|\bapp\b|панел[ьи] управления|сервис", re.I)


def hook_global_prompt(data):
    pr = data.get("prompt", "") or ""
    if len(pr) > 2000 or re.search(r"<(task-notification|system-reminder|local-command|command-name)\b", pr):
        return 0                                             # служебные уведомления и длинные вставки — не просьба человека
    cwd = Path(data.get("cwd") or Path.cwd())
    root = find_root(cwd)
    if (root / "cosmos.json").exists():
        return 0                                             # кит уже в проекте — ведут хуки проекта
    empty = not any(p for p in cwd.iterdir() if not p.name.startswith(".")) if cwd.is_dir() else False
    if not (UI_ASK.search(pr) or (empty and NEW_THING.search(pr))):
        return 0
    kit = Path.home() / ".cosmos-kit" / "src" / "tools" / "cosmos.py"
    flag = " --app" if empty and APPISH.search(pr) else ""
    context("UserPromptSubmit",
            f"Это задача по интерфейсу — делай на дизайн-ките cosmos-kit, сам и до конца, без уточняющих вопросов.\n"
            f"1) В корне проекта выполни: {PY} {kit} init{flag}\n"
            f"   (пустая папка — новый {'проект-приложение' if flag else 'сайт'}; есть код — кит применяется к проекту, логика не меняется).\n"
            f"2) Прочитай .agents/skills/cosmos-site/SKILL.md и пройди его цикл: блоки из kit/blocks/INDEX.md → "
            f"{PY} kit/tools/check.py → {PY} kit/tools/cosmos.py done = OK.\n"
            f"Не пиши свой CSS-дизайн с нуля, не подключай фреймворки (Vite/React/Tailwind/Bootstrap) ради вида — только кит.")


def cmd_global_install(args):
    """Навык cosmos-ui (Claude Code + Antigravity) и глобальный хук UserPromptSubmit в ~/.claude/settings.json."""
    src = (REPO or KIT.parent) / "global" / "cosmos-ui" / "SKILL.md"
    for d in (Path.home() / ".claude" / "skills" / "cosmos-ui", Path.home() / ".gemini" / "config" / "skills" / "cosmos-ui"):
        d.mkdir(parents=True, exist_ok=True)
        if src.exists():
            shutil.copy2(src, d / "SKILL.md")
    st = Path.home() / ".claude" / "settings.json"
    cfg = {}
    if st.exists():
        try:
            cfg = json.loads(st.read_text(encoding="utf-8"))
        except ValueError:
            say(f"· {st} — не JSON, глобальный хук не добавлен"); return 1
        bak = st.with_name("settings.json.bak-cosmos")
        if not bak.exists():                                 # копия «до кита» — одна, повторная установка её не затирает
            shutil.copy2(st, bak)
    cmd = f'{PY} "{os.path.abspath(__file__)}" hook global-prompt'   # без resolve: ~/.cosmos-kit может быть ссылкой
    ups = cfg.setdefault("hooks", {}).setdefault("UserPromptSubmit", [])
    ups[:] = [e for e in ups if not any("hook global-prompt" in h.get("command", "") for h in e.get("hooks", []))]
    ups.append({"hooks": [{"type": "command", "command": cmd, "timeout": 10}]})
    st.parent.mkdir(parents=True, exist_ok=True)
    st.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    say("навык cosmos-ui: ~/.claude/skills, ~/.gemini/config/skills · глобальный хук «примени UI»: ~/.claude/settings.json")
    return 0


def cmd_hook(args):
    ev = args[0] if args else ""
    data = hook_in()
    if ev == "global-prompt":
        try:
            return hook_global_prompt(data) or 0
        except SystemExit:
            raise
        except Exception as e:
            sys.stderr.write(f"cosmos global-prompt: {e}\n"); return 0
    root = find_root(data.get("cwd"))
    cfg = load_cfg(root)
    if not cfg and ev != "session":
        return 0
    fn = {"pre": hook_pre, "post": hook_post, "stop": hook_stop, "session": hook_session, "prompt": hook_prompt}.get(ev)
    try:
        return fn(data, root, cfg) if fn else 0
    except SystemExit:
        raise
    except Exception as e:                                   # хук не должен ломать работу агента
        sys.stderr.write(f"cosmos hook {ev}: {e}\n")
        return 0


# ---------------- экзамен и самопроверка правил ----------------

QUIZ = TOOLS / "agent-quiz.md"
TOP_MARK = ("<!-- cosmos-top:begin -->", "<!-- cosmos-top:end -->")


def quiz_cases():
    """[(номер, заголовок, [(язык, код)…], коды из ответов)] — из agent-quiz.md."""
    text = QUIZ.read_text(encoding="utf-8")
    body, _, key = text.partition("\n## Ответы")
    answers = {int(m.group(1)): m.group(2) for m in re.finditer(r"^\|\s*(\d+)\s*\|\s*([^|]+)\|", key, re.M)}
    cases = []
    for m in re.finditer(r"^## (\d+)\. (.*?)\n(.*?)(?=^## |\Z)", body, re.M | re.S):
        n = int(m.group(1))
        blocks = re.findall(r"```(\w+)\n(.*?)```", m.group(3), re.S)
        cases.append((n, m.group(2).strip(), blocks, answers.get(n, "")))
    return cases, body


def cmd_quiz(args):
    cases, body = quiz_cases()
    if "--key" in args:
        say(QUIZ.read_text(encoding="utf-8").partition("\n## Ответы")[2].strip()); return 0
    if "--check" not in args:
        say(body.strip()); return 0
    import tempfile
    bad, mech = [], 0
    with tempfile.TemporaryDirectory() as td:
        for n, title, blocks, codes in cases:
            want = [c for c in re.findall(r"[A-Z]\d+", codes) if not c.startswith("B")]
            if not want:
                continue
            mech += 1
            files = []
            for i, (lang, code) in enumerate(blocks):
                f = Path(td) / f"case{n}_{i}.{ {'html': 'html', 'css': 'css', 'js': 'js'}.get(lang, 'html') }"
                f.write_text(code, encoding="utf-8"); files.append(str(f))
            r = subprocess.run([sys.executable, str(TOOLS / "check.py"), *files], cwd=td, capture_output=True, text=True)
            got = set(re.findall(r"^[✗·] \S+\s+([A-Z]\d+)", r.stdout, re.M))
            miss = [c for c in want if c not in got]
            if miss:
                bad.append(f"  {n}. {title}: линтер не поймал {', '.join(miss)} (нашёл: {', '.join(sorted(got)) or '—'})")
    say("\n".join(bad) if bad else f"quiz: {mech} механических случаев из {len(cases)} — линтер ловит все")
    return 1 if bad else 0


def top_block(text):
    b, e = TOP_MARK
    return [m.strip() for m in re.findall(re.escape(b) + r"(.*?)" + re.escape(e), text, re.S)]


def cmd_selfcheck(args):
    """Один источник правды: топ-10 (agent/TOP.md) в каждом входном файле слово в слово, UX.md = references/ux.md, экзамен проходит."""
    base = REPO or KIT.parent
    top = top_block((KIT / "agent" / "TOP.md").read_text(encoding="utf-8"))[0]
    bad = []
    entries = [KIT / "agent" / "AGENTS-block.md", KIT / "agent" / "skills" / "cosmos-site" / "SKILL.md", base / "AGENT.md", base / "global" / "cosmos-ui" / "SKILL.md"]
    for f in entries:
        if not f.exists():
            bad.append(f"  нет файла {f}"); continue
        blocks = top_block(f.read_text(encoding="utf-8"))
        if len(blocks) < 2:
            bad.append(f"  {f.relative_to(base)}: топ-10 должен быть сверху и повторён перед сдачей (найдено {len(blocks)})")
        for i, b in enumerate(blocks):
            if b.replace("{kit}/", "kit/") != top:
                bad.append(f"  {f.relative_to(base)}: копия топ-10 №{i + 1} отличается от agent/TOP.md")
    ux, ref = base / "UX.md", KIT / "agent" / "skills" / "cosmos-site" / "references" / "ux.md"
    if ux.exists() and ref.exists() and ux.read_bytes() != ref.read_bytes():
        bad.append("  UX.md и references/ux.md разошлись: cp UX.md src/agent/skills/cosmos-site/references/ux.md")
    skill = KIT / "agent" / "skills" / "cosmos-site" / "SKILL.md"
    n = len(skill.read_text(encoding="utf-8").splitlines())
    if n > 140:
        bad.append(f"  SKILL.md: {n} строк (> 140) — подробности в references/")
    rc = cmd_quiz(["--check"])
    say("\n".join(bad) if bad else "selfcheck: OK (топ-10 в 4 файлах ×2, UX.md один, SKILL.md %d строк)" % n)
    return 1 if bad or rc else 0


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        say(__doc__); return 0
    cmd, rest = argv[0], argv[1:]
    fn = {"init": cmd_init, "status": cmd_status, "done": cmd_done, "setup": cmd_setup, "update": cmd_update, "hook": cmd_hook,
          "global-install": cmd_global_install, "quiz": cmd_quiz, "selfcheck": cmd_selfcheck}.get(cmd)
    if not fn:
        say(f"неизвестная команда {cmd}\n{__doc__}"); return 2
    return fn(rest) or 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
