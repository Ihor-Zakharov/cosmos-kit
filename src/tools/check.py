#!/usr/bin/env python3
"""cosmos-check — проверка сайта на cosmos-kit: правила языка, которые можно проверить машиной.

Запуск из корня сайта (кит лежит в kit/):
  python3 kit/tools/check.py                 все свои файлы сайта (*.html, *.css, *.js вне kit/)
  python3 kit/tools/check.py index.html      только указанные файлы
  python3 kit/tools/check.py --classes btn   какие классы кита есть (вместо чтения components.css)
  python3 kit/tools/check.py --tokens ink    какие токены есть (вместо чтения tokens.css)
  python3 kit/tools/check.py --icons         какие иконки есть в спрайте
  python3 kit/tools/check.py --rules         коды правил с короткой расшифровкой
Выход: 0 — ошибок нет (предупреждения не валят), 1 — есть ошибки. --strict валит и на предупреждениях.
Вывод короткий и одинаковый: «файл:строка  КОД  что не так → как исправить». Только stdlib, Python ≥ 3.8.

Коды совпадают с правилами в .agents/skills/cosmos-site/SKILL.md (раздел «Жёсткие правила»)."""
import difflib
import fnmatch
import hashlib
import json
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
KIT = TOOLS.parent                                   # kit/ в сайте, src/ в репозитории кита
ACCENTS = {"violet", "ice", "white", "gold", "ember"}
SKIP_DIRS = {"kit", "node_modules", ".git", ".cosmos", ".claude", ".agents", "dist", "build", "__pycache__"}
# классы-состояния, которые ставит JS кита или сайта и которых может не быть в CSS отдельным селектором
STATE_CLASSES = {"is-open", "on", "done", "busy", "solid", "past", "asleep", "fallback", "closing", "sel", "active"}

RULES = {
    # страница
    "P1": "<html lang=… data-theme=\"dark\">; data-accent только violet|ice|white|gold|ember; светлой темы нет",
    "P2": "порядок стилей в <head>: kit/fonts/fonts.css → kit/css/tokens.css → kit/css/components.css → свои",
    "P3": "на странице ровно один <h1>",
    "P4": "запуск кита: <script type=module> с bootSite() из kit/js/site.js; без .hero — bootSite({ page: 'inner' }) или { page: 'app' }",
    "P5": "не подключать чужие CSS/шрифты/фреймворки (Google Fonts, Tailwind, Bootstrap, CDN)",
    "P6": "заглушки заготовки заменены (ЗАМЕНИТЬ, «Название сайта», «бренд», lorem, example.com)",
    "P7": "локальные ссылки и файлы существуют, якоря #id есть на странице",
    # композиция
    "H1": "одно раскалённое действие (.btn.primary / .go-btn) на секцию или диалог; не в шапке, острове и подвале",
    "H2": "одно освещённое слово .lit на страницу и только в заголовке",
    "H3": "красная плита (.btn.solid.danger, .chip-btn.solid) — только внутри <dialog> подтверждения",
    "H4": "класс должен существовать в ките или в своих стилях — не выдумывать (свои хуки для JS — с префиксом js-)",
    "H5": "<dialog> — с .modal-box или .drawer-box внутри (на них анимация кита)",
    "H6": "иконки — только из kit/icons/sprite.svg (#i-…); свою иконку — не рисовать инлайном",
    "H7": "уровни заголовков без пропусков (h2 → h3, не h2 → h4)",
    "H8": "голова секции слева (.section-head.left) — только рядом с сайдбаром; по умолчанию по центру",
    "H10": "страница — либо сайт (.topbar + .hero/.section), либо приложение (.app + .rail): не оба каркаса сразу",
    "H9": "ряд кнопок героя (.hero-actions) — только в .hero; в секции под центрированной головой — .btn-row.row-center",
    "H11": "класс .empty занят китом (пустое состояние: .empty-mark, <p>, <small>, кнопка) — для «скрыть/пусто» нужен свой класс или [hidden]",
    "H12": "select.in вне формы (ряд фильтров) — по ширине содержимого: select.in.auto, иначе растянется на всю колонку",
    # доступность
    "A1": "у <img> есть alt, у кнопки/ссылки без текста — aria-label, у поля — подпись или aria-label",
    # стили (свои *.css и <style>)
    "S1": "цвет только токенами var(--…): никаких #hex, rgb(), hsl(), oklch(), именованных цветов",
    "S2": "шрифт только var(--font-display|text|mono|brand)",
    "S3": "длительности только var(--t-fast|base|slow|scene); свои @keyframes — нельзя (движение даёт кит)",
    "S4": "токен var(--x) должен существовать в ките или быть объявлен у себя",
    "S5": "не переопределять компоненты кита (.btn { … }) — собрать из токенов свой класс",
    "S6": "без !important и без inline style (кроме CSS-переменных вида style=\"--p:.6\")",
    "S7": "текст не мельче 13px, основной — 14–16px (мелкий моно — только числа и коды, классами кита)",
    "S9": "outline: none в своих стилях — только вместе с другим признаком фокуса (:focus-within у контейнера, как .composer-box)",
    "S8": "колонки грида — minmax(0, 1fr), а не голый 1fr (иначе поле растянет колонку и будет горизонтальная прокрутка)",
    # скрипты
    "J1": "без alert()/confirm()/prompt() — диалог кита (openDialog) и тосты (pushToast / site.toast)",
    "J2": "диалоги открывать openDialog()/closeDialog() или data-open/data-close, не showModal()/close() напрямую",
    "J3": "без сторонних библиотек с CDN (jQuery, React, анимационные) — механика есть в ките",
    # тексты интерфейса (site-research G-landing-anatomy-copy)
    "T1": "без клише генеративного копирайтинга в кнопках, заголовках, лиде (seamless, robust, unleash, «бесшовный», «революционный», «мощный»…) — число, факт, результат",
    "T2": "заголовок h1/h2 — утверждение, не риторический вопрос («Какой результат?»); вопрос уместен только в диалоге и FAQ",
    "T3": "без ложного контраста «Не X, а Y» в заголовках и лиде — сказать, что есть",
    # кит
    "K1": "файлы kit/ не правятся (обновление затрёт); всё своё — site.css/site.js",
}
WARN_ONLY = {"H7", "H8", "H11", "H12", "S5", "S7", "S8", "S9", "T1", "T2", "T3", "P6"}     # P6 — ошибка в полном прогоне, предупреждение по одному файлу

CSS_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(", re.I)
NAMED_COLORS = re.compile(r"(?<![\w-])(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|gold|"
                          r"navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|brown|violet|indigo|crimson|coral|"
                          r"tomato|salmon|khaki|beige|ivory|lavender|turquoise)(?![\w-])", re.I)
COLOR_PROPS = re.compile(r"^(?:color|background(?:-color)?|border(?:-[a-z]+)*|outline(?:-color)?|box-shadow|text-shadow|"
                         r"fill|stroke|caret-color|accent-color|text-decoration(?:-color)?|column-rule(?:-color)?|filter)$")
PLACEHOLDERS = [("ЗАМЕНИТЬ", "пометка ЗАМЕНИТЬ"), ("Название сайта", "«Название сайта»"), ("lorem ipsum", "lorem ipsum"),
                ("example.com", "example.com"), ("кикер · 2–4 слова", "кикер-заглушка"), ("Заголовок секции", "«Заголовок секции»")]
CLICHE = re.compile(r"\b(?:unleash|unlock|elevate|supercharge|revolutioni[sz]e|seamless(?:ly)?|robust|game-?changer|empower|cutting-edge|next-gen(?:eration)?|"
                    r"world-class|state-of-the-art)\b|бесшовн|революционн|инновационн|передов(?:ой|ая|ое|ые)|уникальн|мощн(?:ый|ая|ое|ые|ейш)|"
                    r"нового поколения|лучш(?:ий|ая|ее|ие) в (?:своём|своей|мире)|раскро(?:й|йте) (?:потенциал|возможности)|прокача(?:й|йте)", re.I)
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class Out:
    def __init__(self, root):
        self.root, self.items = root, []

    def add(self, path, line, code, msg, fix="", level=None):
        lvl = level or ("warn" if code in WARN_ONLY else "err")
        try:
            rel = os.path.relpath(path, self.root)
        except ValueError:
            rel = str(path)
        self.items.append((lvl, rel, line or 0, code, msg, fix))


# ---------------- инвентарь кита ----------------

def strip_css_comments(s):
    return re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), s, flags=re.S)


def css_classes(text):
    text = re.sub(r"url\([^)]*\)", "", strip_css_comments(text))
    out = set()
    for block in re.findall(r"([^{}]+)\{", text):          # только селекторы (до «{»), не значения
        if block.strip().startswith("@"):
            continue
        out.update(re.findall(r"\.(-?[_a-zA-Z][\w-]*)", block))
    return out


def css_tokens(text):
    return set(re.findall(r"(--[\w-]+)\s*:", strip_css_comments(text)))


def kit_inventory():
    classes, tokens = set(), set()
    for f in sorted((KIT / "css").glob("*.css")):
        t = f.read_text(encoding="utf-8")
        classes |= css_classes(t)
        tokens |= css_tokens(t)
    for f in (KIT / "js").glob("*.js"):                      # токены, которые ставит JS (--p, --mx …)
        tokens |= set(re.findall(r"['\"`](--[\w-]+)['\"`]", f.read_text(encoding="utf-8")))
    sprite = KIT / "icons" / "sprite.svg"
    icons = set(re.findall(r'id="(i-[\w-]+)"', sprite.read_text(encoding="utf-8"))) if sprite.exists() else set()
    return classes, tokens, icons


# ---------------- CSS ----------------

def css_decls(text):
    """(строка, селектор, свойство, значение) для каждого объявления; комментарии вырезаны, строки сохранены."""
    text = strip_css_comments(text)
    sel_stack, i, n, line, buf, buf_line = [], 0, len(text), 1, "", 1
    for ch in text:
        if ch == "{":
            sel_stack.append(buf.strip()); buf = ""; buf_line = line
        elif ch == "}":
            if ":" in buf and sel_stack:
                p, v = buf.split(":", 1)
                yield buf_line, " ⟩ ".join(sel_stack), p.strip().lower(), v.strip()
            if sel_stack:
                sel_stack.pop()
            buf = ""; buf_line = line
        elif ch == ";":
            if ":" in buf and sel_stack:
                p, v = buf.split(":", 1)
                yield buf_line, " ⟩ ".join(sel_stack), p.strip().lower(), v.strip()
            buf = ""; buf_line = line
        else:
            if not buf.strip():
                buf_line = line
            buf += ch
        if ch == "\n":
            line += 1


def check_css(text, path, out, kit_classes, known_tokens, base_line=0):
    raw = strip_css_comments(text)
    for m in re.finditer(r"@keyframes\s+([\w-]+)", raw):
        out.add(path, base_line + raw[:m.start()].count("\n") + 1, "S3", f"свои @keyframes {m.group(1)}",
                "движение — пружинами кита (enter/exit, attach*), см. references/motion.md")
    for m in re.finditer(r"prefers-color-scheme\s*:\s*light|data-theme\s*=\s*['\"]?light", raw):
        out.add(path, base_line + raw[:m.start()].count("\n") + 1, "P1", "светлая тема", "тема только тёмная — убрать блок")
    for m in re.finditer(r"@import\s+url\(\s*['\"]?https?:|fonts\.googleapis", raw):
        out.add(path, base_line + raw[:m.start()].count("\n") + 1, "P5", "внешний импорт", "шрифты и стили — только из kit/")
    s5 = set()
    has_focus_within = ":focus-within" in raw
    for ln, sel, prop, val in css_decls(text):
        L = base_line + ln
        v = re.sub(r"url\([^)]*\)", "", val)
        if prop.startswith("--"):
            pass
        elif CSS_COLOR.search(v) or (COLOR_PROPS.match(prop) and NAMED_COLORS.search(v)):
            out.add(path, L, "S1", f"{prop}: {val[:60]}", "var(--ink|--ink-2|--ink-3|--line-*|--surface*|--s1..--s4|--el-a); список: --tokens")
        if prop in ("font-family",) and "var(--font-" not in v and v not in ("inherit", "monospace"):
            out.add(path, L, "S2", f"font-family: {val[:50]}", "var(--font-text) / --font-display / --font-mono")
        if prop == "font" and re.search(r"[a-z]", re.sub(r"var\([^)]*\)|\b(?:bold|normal|italic|\d+px|\d*\.?\d+)\b", "", v)) \
                and "var(--font-" not in v and v not in ("inherit",):
            out.add(path, L, "S2", f"font: {val[:50]}", "семейство — var(--font-…)")
        if prop in ("transition", "transition-duration", "animation", "animation-duration") and \
                re.search(r"(?<![\w-])\d*\.?\d+m?s\b", re.sub(r"var\([^)]*\)", "", v)) and not re.fullmatch(r"(none|0s?)", v):
            out.add(path, L, "S3", f"{prop}: {val[:50]}", "var(--t-fast) цвет/рамка · var(--t-base) раскрытие · var(--t-slow) · var(--t-scene)")
        if prop == "outline" and re.fullmatch(r"(none|0)", v) and not has_focus_within:
            out.add(path, L, "S9", f"{sel.split(' ⟩ ')[-1][:40]} {{ outline: {v} }}", "фокус должен быть виден: контейнер { … } + контейнер:focus-within { border-color: var(--line-3) }")
        if "!important" in v and "prefers-reduced-motion" not in sel:
            out.add(path, L, "S6", f"!important в {prop}", "поднять специфичность своим классом")
        for t in re.findall(r"var\(\s*(--[\w-]+)", v):
            if t not in known_tokens:
                near = difflib.get_close_matches(t, sorted(known_tokens), 1)
                out.add(path, L, "S4", f"нет токена {t}", f"может, {near[0]}?" if near else "список: --tokens")
        if prop == "font-size":
            m = re.fullmatch(r"(\d+(?:\.\d+)?)px", v)
            if m and float(m.group(1)) < 13:
                out.add(path, L, "S7", f"font-size: {v}", "читаемый текст ≥ 14px (подписи 13+); мельче — только моно-числа/коды классами кита (.kicker, .chip.mono)")
        if prop in ("grid-template-columns",) and re.search(r"(?<![\w(,])\s*1fr", v) and "minmax(0" not in v:
            out.add(path, L, "S8", f"{prop}: {val[:50]}", "repeat(N, minmax(0, 1fr))")
        leaf = sel.split(" ⟩ ")[-1]
        if leaf and not leaf.startswith("@"):
            for part in leaf.split(","):
                first = re.match(r"\s*\.([\w-]+)\s*$", part)            # правило ровно на класс кита: .btn { … }
                if first and first.group(1) in kit_classes and leaf not in s5:
                    s5.add(leaf)
                    out.add(path, L, "S5", f"переопределение .{first.group(1)}", "свой класс рядом (.my-x) на токенах, кит не трогать")
                    break


# ---------------- JS ----------------

def check_js(text, path, out, base_line=0):
    for i, line in enumerate(text.splitlines(), 1):
        code = re.sub(r"//.*$", "", line)
        if re.search(r"(?<![\w.$])(?:window\.)?(alert|confirm|prompt)\s*\(", code):
            out.add(path, base_line + i, "J1", "системное окно браузера", "подтверждение — <dialog class=\"modal\"> + openDialog; сообщение — site.toast()")
        if re.search(r"\.showModal\(\)|(?<![\w])dialog\w*\.close\(\)", code):
            out.add(path, base_line + i, "J2", "диалог напрямую", "openDialog(dlg) / closeDialog(dlg) из kit/js/motion.js или data-open/data-close")
        if re.search(r"https?://[^'\"]*(?:jquery|react|vue|gsap|anime|framer|bootstrap|tailwind|unpkg|jsdelivr|cdnjs)", code, re.I):
            out.add(path, base_line + i, "J3", "сторонняя библиотека", "механика — kit/js/site.js и motion.js")


# ---------------- HTML ----------------

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.els, self.stack, self.text_buf = [], [], []
        self.styles, self.scripts, self.ids = [], [], set()
        self._cap = None

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        box = next((e for e in reversed(self.stack) if e["tag"] in ("section", "dialog", "main", "header", "footer")
                    or "hero" in e["cls"]), None)
        el = {"tag": tag, "a": a, "cls": set(a.get("class", "").split()), "line": self.getpos()[0],
              "anc": [(e["tag"], e["cls"]) for e in self.stack], "text": "", "box": id(box) if box else None}
        self.els.append(el)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag in ("style", "script"):
            self._cap = (tag, self.getpos()[0], a, [])
        if tag not in VOID:
            self.stack.append(el)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack and self.stack[-1]["tag"] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        if self._cap and tag == self._cap[0]:
            kind, ln, a, parts = self._cap
            (self.styles if kind == "style" else self.scripts).append((ln, a, "".join(parts)))
            self._cap = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]["tag"] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self._cap:
            self._cap[3].append(data)
            return
        for e in self.stack:
            e["text"] += data


def within(el, pred):
    return any(pred(t, c) for t, c in el["anc"])


def resolve(ref, html_path, root):
    """Файл на диске для ссылки страницы; None — не проверять (внешняя ссылка, маршрут приложения, шаблон)."""
    ref = ref.split("#")[0].split("?")[0]
    if not ref or re.match(r"^(?:[a-z]+:|//|data:|mailto:|tel:)", ref, re.I) or re.search(r"[{}$<>]|\{\{", ref):
        return None
    bare = ref.lstrip("./") if ref.startswith("./") else ref.lstrip("/")
    ku = CFG["kit_url"].strip("/") + "/"
    if bare.startswith(ku):
        return KIT / bare[len(ku):]
    if html_path.suffix != ".html" or (ref.startswith("/") and not CFG["static"]):
        return None                                       # страница из шаблона/приложения: маршруты не файлы
    if ref.startswith("/"):
        return root / bare
    return (html_path.parent / ref).resolve()


def check_html(text, path, out, root, kit_classes, site_classes, known_tokens, icons, full):
    p = Page()
    p.feed(text)
    els, fragment = p.els, "<html" not in text.lower()
    tag = lambda t: [e for e in els if e["tag"] == t]
    all_classes = kit_classes | site_classes

    if not fragment:
        html = (tag("html") or [None])[0]
        if html is not None:
            if html["a"].get("data-theme") != "dark":
                out.add(path, html["line"], "P1", "нет data-theme=\"dark\" на <html>", '<html lang="ru" data-theme="dark">')
            acc = html["a"].get("data-accent")
            if acc and acc not in ACCENTS:
                out.add(path, html["line"], "P1", f"data-accent=\"{acc}\"", "violet | ice | white | gold | ember")
            if not html["a"].get("lang"):
                out.add(path, html["line"], "A1", "нет lang у <html>", 'lang="ru"')
        order = [re.split(r"[?#]", e["a"].get("href", ""))[0] for e in tag("link") if "stylesheet" in e["a"].get("rel", "")]
        want = ["fonts/fonts.css", "css/tokens.css", "css/components.css"]
        pos = [next((i for i, h in enumerate(order) if h.endswith(w)), -1) for w in want]
        if -1 in pos or pos != sorted(pos) or (order and any(i < pos[-1] for i, h in enumerate(order) if not any(h.endswith(w) for w in want) and "kit/" not in h)):
            first_link = (tag("link") or [{"line": 1}])[0]["line"]
            out.add(path, first_link, "P2", "порядок/набор стилей кита нарушен", "kit/fonts/fonts.css → kit/css/tokens.css → kit/css/components.css → site.css")
        for e in tag("link") + tag("script"):
            ref = e["a"].get("href") or e["a"].get("src") or ""
            if re.search(r"fonts\.googleapis|fonts\.gstatic|tailwind|bootstrap|bulma|unpkg|jsdelivr|cdnjs|jquery", ref, re.I):
                out.add(path, e["line"], "P5", f"внешнее подключение {ref[:60]}", "только kit/")
        h1 = tag("h1")
        if len(h1) != 1:
            out.add(path, (h1[1] if len(h1) > 1 else (els[0] if els else {"line": 1}))["line"], "P3",
                    f"<h1> на странице: {len(h1)}", "ровно один: .display в герое или заголовок страницы")
        mods = [s for s in p.scripts if s[1].get("type") == "module"]
        js_all = "\n".join(s[2] for s in mods)
        ext = [s[1].get("src", "") for s in mods if s[1].get("src")]
        for src in ext:                                        # свой site.js, подключённый src=
            f = resolve(src, path, root)
            if f and f.exists():
                js_all += "\n" + f.read_text(encoding="utf-8", errors="replace")
        if "bootSite" not in js_all and "createCosmos" not in js_all:
            out.add(path, (tag("body") or [{"line": 1}])[0]["line"], "P4", "кит не запущен",
                    "<script type=\"module\">import { bootSite } from './kit/js/site.js'; bootSite();</script>")
        elif "bootSite" in js_all:
            has_hero = any("hero" in e["cls"] for e in els)
            inner = re.search(r"page\s*:\s*['\"](?:inner|app)['\"]", js_all)
            if not has_hero and not inner:
                out.add(path, 1, "P4", "страница без .hero, а сцена как на главной", "bootSite({ page: 'inner' }) — страница сайта, bootSite({ page: 'app' }) — приложение")
        # якоря
        for e in tag("a"):
            h = e["a"].get("href", "")
            if CFG["static"] and h.startswith("#") and len(h) > 1 and h[1:] not in p.ids:
                out.add(path, e["line"], "P7", f"якорь {h} не найден", "id у секции или поправить ссылку")

    # плейсхолдеры
    low = text.lower()
    for needle, name in PLACEHOLDERS:
        i = low.find(needle.lower())
        if i >= 0 and not fragment:
            out.add(path, text[:i].count("\n") + 1, "P6", f"не заменено: {name}", "вписать содержимое сайта",
                    level="err" if full else "warn")

    lit = []
    for e in els:
        c, a, t, L = e["cls"], e["a"], e["tag"], e["line"]
        # H4: неизвестные классы
        for k in sorted(c):
            if k.startswith("js-") or k in all_classes or k in STATE_CLASSES:
                continue
            near = difflib.get_close_matches(k, sorted(all_classes), 2)
            out.add(path, L, "H4", f"класса .{k} нет", ("похоже: ." + ", .".join(near)) if near else "найти: check.py --classes <слово>; своё — в site.css")
        # H1: раскалённое действие
        if ("btn" in c and "primary" in c) or "go-btn" in c:
            if within(e, lambda tt, cc: {"topbar", "island", "site-footer"} & cc or tt == "footer"):
                out.add(path, L, "H1", "раскалённая кнопка в шапке/подвале", "в шапке — .btn.small, главное действие — у героя")
        if "lit" in c and "field" not in c:                      # .field.lit — горящая кайма поля, другое
            lit.append(e)
            if t not in ("span",) or not within(e, lambda tt, cc: tt in ("h1", "h2")):
                out.add(path, L, "H2", ".lit вне заголовка", "<h1 class=\"display\">… <span class=\"lit\">слово</span></h1>")
        if (("btn" in c and "solid" in c and "danger" in c) or ("chip-btn" in c and "solid" in c)) and not within(e, lambda tt, cc: tt == "dialog"):
            out.add(path, L, "H3", "красная плита вне диалога", "в ряду — .btn с честным текстом «Удалить…», красная — в <dialog> подтверждения")
        if t == "dialog":
            inner = [x for x in els if x["line"] >= L and any(tt == "dialog" for tt, _ in x["anc"])]
            if not any({"modal-box", "drawer-box"} & x["cls"] for x in inner):
                out.add(path, L, "H5", "<dialog> без .modal-box/.drawer-box", "<dialog class=\"modal\"><div class=\"modal-box\">…</div></dialog>")
        if t == "use":
            ref = a.get("href") or a.get("xlink:href") or ""
            m = re.search(r"#(i-[\w-]+)$", ref)
            if not ref.split("#")[0].endswith("sprite.svg") or not m:
                out.add(path, L, "H6", f"иконка {ref[:50]}", "kit/icons/sprite.svg#i-…; список: --icons")
            elif icons and m.group(1) not in icons:
                near = difflib.get_close_matches(m.group(1), sorted(icons), 2)
                out.add(path, L, "H6", f"нет иконки {m.group(1)}", ("похоже: " + ", ".join(near)) if near else "список: --icons")
        if t == "svg" and not within(e, lambda tt, cc: tt == "svg"):
            kids = [x for x in els if x["line"] >= L and x["anc"] and x["anc"][-1][0] == "svg" and x in els]
            if any(x["tag"] in ("path", "circle", "rect", "polyline", "line", "polygon") for x in kids[:3]) and \
                    not any(x["tag"] == "use" for x in kids[:3]):
                out.add(path, L, "H6", "инлайн-рисунок вместо иконки кита", "<svg><use href=\"kit/icons/sprite.svg#i-…\"/></svg>")
        if "hero-actions" in c and not within(e, lambda tt, cc: "hero" in cc):
            out.add(path, L, "H9", ".hero-actions вне героя (кнопки уедут влево)", "<div class=\"btn-row row-center\">")
        if (t in ("a", "button", "h1", "h2", "h3", "label") or {"brand", "kicker", "card-title", "tab", "choice"} & c) and \
                re.search("[\U0001F300-\U0001FAFF\u2600-\u26FF\u2700-\u27BF]", e["text"]) and not within(e, lambda tt, cc: "prose" in cc):
            out.add(path, L, "H6", f"эмодзи в <{t}> «{e['text'].strip()[:24]}»", "иконка — <svg><use href=\"kit/icons/sprite.svg#i-…\"/></svg> (список: --icons) или просто текст")
        if "section-head" in c and "left" in c:
            out.add(path, L, "H8", ".section-head.left", "голова секции по центру; слева — только рядом с сайдбаром")
        # A1
        if t == "img" and "alt" not in a:
            out.add(path, L, "A1", "<img> без alt", "alt=\"что на картинке\" (декор — alt=\"\")")
        if t in ("button", "a") and not e["text"].strip() and not a.get("aria-label") and not a.get("title"):
            out.add(path, L, "A1", f"<{t}> без текста и aria-label", "aria-label=\"что делает\"")
        if t in ("input", "textarea", "select") and a.get("type") not in ("hidden", "submit", "button", "checkbox", "radio") \
                and not a.get("aria-label") and not a.get("aria-labelledby") and not within(e, lambda tt, cc: tt == "label") \
                and not (a.get("id") and re.search(r'for="%s"' % re.escape(a["id"]), text)):
            out.add(path, L, "A1", f"<{t}> без подписи", "<label>Подпись <input …></label> или aria-label")
        if t in ("input", "textarea") and a.get("type") in ("checkbox", "radio") and not within(e, lambda tt, cc: tt == "label") and not a.get("aria-label"):
            out.add(path, L, "A1", "флажок без подписи", "обернуть в <label class=\"switch\">…</label>")
        # T1–T3: тексты интерфейса — клише, риторические вопросы, ложный контраст (warn)
        tx = e["text"].strip()
        if tx and (t in ("h1", "h2", "h3", "button") or {"lead", "kicker", "card-title", "btn", "display"} & c) and not within(e, lambda tt, cc: "prose" in cc):
            m = CLICHE.search(tx)
            if m:
                out.add(path, L, "T1", f"клише «{m.group(0)}» в <{t}> «{tx[:32]}»", "конкретика: число, факт, что получит человек")
        if tx and t in ("h1", "h2") and not within(e, lambda tt, cc: tt == "dialog" or "faq" in cc):
            if tx.endswith("?"):
                out.add(path, L, "T2", f"риторический вопрос «{tx[:40]}»", "заголовок — утверждение: «Сайт за вечер»")
            if re.match(r"^Не\s.+?,\s*а\s", tx):
                out.add(path, L, "T3", f"«Не X, а Y»: «{tx[:40]}»", "сказать, что есть, без ложного контраста")
        # H11: .empty — пустое состояние кита, а не «скрыть»
        if "empty" in c and t not in ("p", "small", "span"):
            kids = [x for x in els if x["line"] >= L and any(("empty" in cc) for _, cc in x["anc"]) and x is not e]
            if not any(x["tag"] in ("p", "small") or "empty-mark" in x["cls"] for x in kids[:8]):
                out.add(path, L, "H11", "<%s class=\"empty\"> без текста пустого состояния" % t, "это блок empty (глиф, <p>, <small>, кнопка); чтобы спрятать — [hidden], свой класс — с префиксом js- или в site.css")
        # H12: селект в ряду фильтров — по содержимому
        if t == "select" and "in" in c and "auto" not in c and not within(e, lambda tt, cc: tt == "label" or {"form-grid", "lbl", "form-actions", "modal-box"} & cc):
            out.add(path, L, "H12", "select.in вне формы растянется на всю колонку", "<select class=\"in auto\"> — по ширине содержимого (UX.md §4)")
        # S6: inline style
        st = a.get("style", "")
        if st:
            bad = [d for d in st.split(";") if d.strip() and not d.strip().startswith("--")]
            if bad:
                out.add(path, L, "S6", f"style=\"{st[:50]}\"", "в site.css своим классом; инлайн — только --переменные")
            else:
                for tk in re.findall(r"var\(\s*(--[\w-]+)", st):
                    if tk not in known_tokens:
                        out.add(path, L, "S4", f"нет токена {tk}", "список: --tokens")
        # P7: локальные файлы
        for attr in ("href", "src"):
            ref = a.get(attr)
            if ref and t in ("a", "link", "script", "img", "source", "use") and not ref.startswith("#"):
                f = resolve(ref, path, root)
                if f is not None and not f.exists():
                    out.add(path, L, "P7", f"нет файла {ref}", "путь относительно страницы; кит — kit/…")
    hs = [(int(e["tag"][1]), e["line"]) for e in els if re.fullmatch(r"h[1-6]", e["tag"])
          and not within(e, lambda tt, cc: tt in ("dialog", "footer") or "site-footer" in cc or "rail" in cc)]
    for (a_, _), (b_, ln) in zip(hs, hs[1:]):
        if b_ > a_ + 1:
            out.add(path, ln, "H7", f"h{a_} → h{b_}", f"h{a_ + 1}")
    if any("topbar" in e["cls"] for e in els) and any("app" in e["cls"] for e in els):
        out.add(path, next(e["line"] for e in els if "topbar" in e["cls"]), "H10", "шапка сайта .topbar вместе с каркасом .app",
                "в приложении навигация — только .rail-nav, шапку и шторку-меню удалить")
    if len(lit) > 1:
        out.add(path, lit[1]["line"], "H2", f".lit на странице: {len(lit)}", "одно освещённое слово на страницу")
    # H1 по секциям/диалогам
    groups = {}
    for x in els:
        if ("btn" in x["cls"] and "primary" in x["cls"]) or "go-btn" in x["cls"]:
            groups.setdefault(x["box"], []).append(x)
    for key, own in groups.items():
        if len(own) > 1:
            out.add(path, own[1]["line"], "H1", f"раскалённых действий в одном блоке: {len(own)}", "одно .btn.primary на секцию/диалог, остальные — .btn")
    for ln, a_, css in p.styles:
        check_css(css, path, out, kit_classes, known_tokens, base_line=ln - 1)
    for ln, a_, js in p.scripts:
        if not a_.get("src"):
            check_js(js, path, out, base_line=ln - 1)


# ---------------- кит не тронут ----------------

def check_kit_integrity(root, out):
    man = KIT / "MANIFEST.sha256"
    if not man.exists() or KIT.name == "src":
        return
    for line in man.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        h, rel = line.split(None, 1)
        f = KIT / rel.strip()
        if not f.exists():
            out.add(f, 0, "K1", "файл кита удалён", "вернуть: python3 kit/tools/cosmos.py update")
        elif hashlib.sha256(f.read_bytes()).hexdigest() != h:
            out.add(f, 0, "K1", "файл кита изменён", "вернуть (python3 kit/tools/cosmos.py update), правку перенести в site.css / site.js")


# ---------------- настройки проекта (cosmos.json) и встроенные куски ----------------
# cosmos.json в корне проекта (пишет `cosmos.py init`), все поля необязательны:
#   {"kit_url": "kit/",              как страницы ссылаются на кит (у приложения часто "/static/kit/")
#    "include": ["**/*.html", …],    свои файлы (по умолчанию все *.html/*.css/*.js/*.mjs вне kit/)
#    "exclude": ["vendor/**"],
#    "embedded": ["app.py"],         файлы, где HTML/CSS/JS лежат строками (шаблоны в Python/Go/JS)
#    "static": true,                 false — страницы отдаёт приложение: /маршруты не проверяются как файлы
#    "pages": ["/"], "serve": "python3 -m http.server {port}"   для браузерной проверки (shot.mjs)}
CFG = {"kit_url": "kit/", "include": None, "exclude": [], "embedded": [], "static": True}


def find_root(start):
    for d in [start, *start.parents]:
        if (d / "cosmos.json").exists():
            return d
    return start


def load_cfg(root):
    f = root / "cosmos.json"
    if f.exists():
        try:
            CFG.update(json.loads(f.read_text(encoding="utf-8")))
        except ValueError as e:
            print(f"✗ cosmos.json: {e}")
    return CFG


def _match(rel, pats):
    return any(fnmatch.fnmatch(rel, p) or fnmatch.fnmatch(rel, p.replace("**/", "")) for p in pats)


def site_files(root):
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS and not d.startswith(".") and (Path(dp) / d).resolve() != KIT]
        for fn in fns:
            f = Path(dp) / fn
            rel = f.relative_to(root).as_posix()
            if CFG["include"] is not None:
                ok = _match(rel, CFG["include"])
            else:
                ok = fn.endswith((".html", ".css", ".js", ".mjs"))
            if ok and not _match(rel, CFG["exclude"]) and not fn.endswith(".min.js"):
                yield f


def embedded_chunks(text, suffix=""):
    """Куски разметки/стилей/скриптов в строках исходника: (вид, строка начала, текст). Вид — html|css|js.
    Кавычки — по языку: Python — тройные, JS/TS/Go — обратные (внутри Python-строк обратные кавычки — это JS)."""
    rx = r"(`)(.*?)`" if suffix in (".js", ".mjs", ".ts", ".tsx", ".jsx", ".go") else r"('{3}|\"{3})(.*?)\1"
    for m in re.finditer(rx, text, re.S):
        body = m.group(2)
        if len(body) < 200:
            continue
        line = text[:m.start(2)].count("\n") + 1
        head = body.lstrip()[:400].lower()
        if "<!doctype" in head or "<html" in head or re.search(r"<(div|section|main|header|nav|dialog|button|form)\b", body):
            yield "html", line, body
        elif re.search(r"\b(function|const|let|=>|document\.)", body) and not re.search(r"^\s*[.#:@\w-][^{;]*\{[^}]*:[^}]*;", body, re.M):
            yield "js", line, body
        elif re.search(r"[.#\w-][^{;]*\{[^}]*:[^}]*[;}]", body):
            yield "css", line, body


class Shifted:
    """Out со сдвигом строк: для кусков из строк исходника номера — от начала файла."""
    def __init__(self, out, shift):
        self.out, self.shift = out, shift

    def add(self, path, line, *a, **k):
        self.out.add(path, (line or 0) + self.shift, *a, **k)


# ---------------- запуск ----------------


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    root = find_root(Path.cwd())
    load_cfg(root)
    kit_classes, kit_tokens, icons = kit_inventory()

    def arg_after(flag):
        i = argv.index(flag)
        return argv[i + 1] if i + 1 < len(argv) else ""
    if "--rules" in flags:
        for k, v in RULES.items():
            print(f"{k}  {v}")
        return 0
    if "--classes" in flags:
        q = arg_after("--classes").lstrip(".")
        print(" ".join("." + c for c in sorted(kit_classes) if q in c) or "ничего")
        return 0
    if "--tokens" in flags:
        q = arg_after("--tokens")
        print(" ".join(t for t in sorted(kit_tokens) if q in t) or "ничего")
        return 0
    if "--icons" in flags:
        print(" ".join(sorted(icons)))
        return 0

    full = not args
    emb = {(root / e).resolve() for e in CFG["embedded"]}
    files = [Path(a).resolve() for a in args] if args else sorted(set(site_files(root)) | {e for e in emb if e.exists()})
    files = [f for f in files if f.exists() and (f.suffix in (".html", ".css", ".js", ".mjs") or f in emb)]
    # свои классы и токены: все .css проекта + <style> страниц + CSS-куски из встроенных файлов
    site_classes, site_tokens = set(), set()
    for f in set(site_files(root)) | {e for e in emb if e.exists()}:
        t = f.read_text(encoding="utf-8", errors="replace")
        css = [t] if f.suffix == ".css" else re.findall(r"<style[^>]*>(.*?)</style>", t, re.S | re.I)
        if f in emb:
            css += [b for k, _, b in embedded_chunks(t, f.suffix) if k == "css"]
        for c in css:
            site_classes |= css_classes(c)
            site_tokens |= css_tokens(c)
        if f.suffix in (".js", ".mjs", ".html") or f in emb:      # токены, которые ставит свой JS: setProperty('--w', …)
            site_tokens |= set(re.findall(r"['\"`](--[\w-]+)['\"`]", t))
    known_tokens = kit_tokens | site_tokens
    out = Out(root)
    for f in files:
        try:
            f.relative_to(KIT)
            if "--self" not in flags:                     # --self — проверка блоков/заготовки самого кита
                out.add(f, 0, "K1", "это файл кита", "свои правки — в site.css / site.js, кит не трогать")
                continue
        except ValueError:
            pass
        text = f.read_text(encoding="utf-8", errors="replace")
        if f in emb:
            for kind, line, body in embedded_chunks(text, f.suffix):
                o = Shifted(out, line - 1)
                if kind == "html":
                    check_html(body, f, o, root, kit_classes, site_classes, known_tokens, icons, full)
                elif kind == "css":
                    check_css(body, f, o, kit_classes, known_tokens)
                else:
                    check_js(body, f, o)
        elif f.suffix == ".html":
            check_html(text, f, out, root, kit_classes, site_classes, known_tokens, icons, full)
        elif f.suffix == ".css":
            check_css(text, f, out, kit_classes, known_tokens)
        else:
            check_js(text, f, out)
    if full:
        check_kit_integrity(root, out)
    rc = report(out, files, "--strict" in flags)
    if full:                                              # штамп для стоп-гейта: когда и с каким итогом был полный прогон
        stamp = root / ".cosmos" / "check.json"
        try:
            stamp.parent.mkdir(exist_ok=True)
            errs = sum(1 for i in out.items if i[0] == "err")
            stamp.write_text(json.dumps({"epoch": __import__("time").time(), "pass": rc == 0, "errors": errs,
                                         "files": len(files)}), encoding="utf-8")
        except OSError:
            pass
    return rc


def report(out, files, strict, limit=40):
    """Осознанные исключения: cosmos.json "ignore": ["A1", …] или комментарий «cosmos-ignore: H4» на той же строке —
    только с причиной рядом; в отчёте пользователю их нужно назвать."""
    seen, items, ign = set(), [], set(CFG.get("ignore") or [])
    lines_cache = {}
    def inline_ignored(rel, ln, code):
        f = out.root / rel
        if f not in lines_cache:
            try:
                lines_cache[f] = f.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                lines_cache[f] = []
        L = lines_cache[f]
        return 0 < ln <= len(L) and re.search(r"cosmos-ignore:?\s*[\w, ]*\b" + code + r"\b", L[ln - 1])
    for it in out.items:
        if it[3] in ign or inline_ignored(it[1], it[2], it[3]):
            continue
        key = it[1:5]
        if key not in seen:
            seen.add(key)
            items.append(it)
    items.sort(key=lambda x: (x[0] != "err", x[1], x[2]))
    errs = sum(1 for i in items if i[0] == "err")
    warns = len(items) - errs
    hinted = set()                                        # подсказка к коду — один раз: повтор тратит токены
    for lvl, rel, ln, code, msg, fix in items[:limit]:
        mark = "✗" if lvl == "err" else "·"
        show = fix and (code, fix) not in hinted
        hinted.add((code, fix))
        print(f"{mark} {rel}:{ln}  {code}  {msg}" + (f"  → {fix}" if show else ""))
    if len(items) > limit:
        print(f"… и ещё {len(items) - limit}")
    if not items:
        print(f"cosmos-check: OK ({len(files)} файлов)")
    else:
        print(f"cosmos-check: ошибок {errs}, предупреждений {warns} · коды: python3 kit/tools/check.py --rules")
    return 1 if errs or (strict and warns) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
