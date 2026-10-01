// общий запуск страниц витрины: сцена, шапка «линия» с плашкой-полоской, меню-шторка, механика кнопок и компонентов.
// Это же — пример того, что сайт делает у себя один раз (см. SKILL.md «Как подключить»).
import { createCosmos, attachSceneScroll } from '../src/js/cosmos.js';
import { attachButtons, attachPointerGlow, attachSwitches, attachChecks, attachDisclosures, attachCards, attachSwipeToClose,
  moveInk, motionOf, openDialog, closeDialog, pushToast, dismissToast, enter, exit } from '../src/js/motion.js';

const ICON = new URL('../src/icons/sprite.svg', import.meta.url).href;

export function boot({ hero = null } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wrap = document.getElementById('cosmos-wrap');
  // фон по умолчанию — ESRGAN испр. (plate-hd.webp); ?plate=old — исходный plate.webp
  const plateUrl = new URLSearchParams(location.search).get('plate') === 'old' ? undefined : new URL('../src/scene/plate-hd.webp', import.meta.url).href;
  const api = createCosmos(document.getElementById('cosmos'), { reduced, ...(plateUrl ? { plateUrl } : {}) });
  window.cosmosApi = api;
  if (!api.ok) wrap.classList.add('fallback');
  new ResizeObserver(() => api.resize()).observe(wrap);
  if (hero) {
    // главная: сцена живая, гаснет за героем
    addEventListener('pointermove', (e) => { if (e.pointerType && e.pointerType !== 'mouse') return; api.setPointer((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * -2); }, { passive: true });
    attachSceneScroll(api, { hero, wrap });
  } else {
    // внутренняя страница: сцена спит с первого кадра
    wrap.classList.add('asleep'); api.pause();
  }

  // шапка: плита после 40px; активный пункт — общая полоска .nav-ink, едет пружиной
  const topbar = document.getElementById('topbar');
  const nav = topbar.querySelector('.nav');
  const links = [...nav.querySelectorAll('a')];
  let ink = nav.querySelector('.nav-ink');
  if (!ink) { ink = document.createElement('span'); ink.className = 'nav-ink'; ink.setAttribute('aria-hidden', 'true'); nav.append(ink); }
  const targets = links.map((a) => { const h = a.getAttribute('href'); return h.startsWith('#') ? document.querySelector(h) : null; });
  const setCurrent = (i, immediate) => {
    links.forEach((a, j) => { if (j === i) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    moveInk(nav, links[i], ink, { immediate });
  };
  let navRaf = 0;
  const syncNav = () => {
    navRaf = 0;
    topbar.classList.toggle('solid', scrollY > 40);
    if (!targets.some(Boolean)) return;
    const line = innerHeight * 0.34;
    let cur = links.findIndex((a) => a.hasAttribute('aria-current'));
    // активна секция, чей верх ближе всего над линией; порядок пунктов меню не важен
    let best = -Infinity;
    targets.forEach((t, i) => { const top = t?.getBoundingClientRect().top; if (top != null && top <= line && top > best) { best = top; cur = i; } });
    if (cur < 0) cur = 0;
    if (!links[cur].hasAttribute('aria-current')) setCurrent(cur, false);
  };
  addEventListener('scroll', () => { if (!navRaf) navRaf = requestAnimationFrame(syncNav); }, { passive: true });
  const initial = Math.max(0, links.findIndex((a) => a.hasAttribute('aria-current')));
  setCurrent(initial, true);
  syncNav();
  addEventListener('resize', () => setCurrent(Math.max(0, links.findIndex((a) => a.hasAttribute('aria-current'))), true));
  links.forEach((a, i) => a.addEventListener('click', () => { if (targets[i]) setCurrent(i, false); }));

  // механика компонентов — по одному вызову на страницу
  attachButtons(document);
  attachPointerGlow(document);   // только .field-body и [data-glow] — свет курсора это акцент, не фон для каждой кнопки
  attachSwitches(document);
  attachChecks(document);
  attachDisclosures(document);
  attachCards(document);

  // диалоги: [data-open="#id"] открывает, [data-close] закрывает; шторки смахиваются
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(dlg)));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); });
    attachSwipeToClose(dlg);
  });
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDialog(document.querySelector(b.dataset.open))));

  const toast = (tone, text, ttl) => pushToast(document.getElementById('toasts'), { tone, text, ...(ttl ? { ttl } : {}) });
  /** тост с действием «Отменить» — обратимое делается сразу, отмена живёт в тосте (UX.md §11) */
  const toastAction = (tone, text, label, fn) => {
    const el = toast(tone, text, 6000);
    const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = label;
    b.addEventListener('click', () => { dismissToast(el); fn?.(); });
    el.append(b);
    return el;
  };
  return { api, wrap, toast, toastAction };
}

/** сегментированный переключатель: клик переключает aria-*, плашка едет «каплей» (moveInk) */
export function wireSegmented(root, attr, onChange) {
  const items = [...root.querySelectorAll(`[${attr}]`)];
  const setActive = (el, immediate) => {
    items.forEach((it) => it.setAttribute(attr, it === el ? 'true' : 'false'));
    moveInk(root, el, undefined, { immediate });
  };
  items.forEach((it) => it.addEventListener('click', () => { setActive(it, false); onChange?.(it); }));
  let ready = false;
  requestAnimationFrame(() => { setActive(items.find((it) => it.getAttribute(attr) === 'true') || items[0], true); ready = true; });
  // контейнер меняет ширину, когда активный пункт становится жирным — перецеливаем плашку без снапа, иначе капля не видна
  // если группа только что появилась из скрытого (ширина была 0) — ставим плашку сразу, без анимации
  let lastW = root.offsetWidth;
  new ResizeObserver(() => { const w = root.offsetWidth, appeared = !lastW && w; lastW = w;
    if (ready && w) setActive(items.find((it) => it.getAttribute(attr) === 'true'), appeared); }).observe(root);
  return { next: () => { const i = items.findIndex((it) => it.getAttribute(attr) === 'true'); items[(i + 1) % items.length].click(); } };
}

/** дерево: клик по строке переносит aria-current и плашку .tree-ink */
export function wireTree(tree) {
  let ink = tree.querySelector('.tree-ink');
  if (!ink) { ink = document.createElement('span'); ink.className = 'tree-ink'; ink.setAttribute('aria-hidden', 'true'); tree.prepend(ink); }
  const nodes = [...tree.querySelectorAll('.tnode')];
  const setActive = (el, immediate) => {
    nodes.forEach((n) => { if (n === el) n.setAttribute('aria-current', 'true'); else n.removeAttribute('aria-current'); });
    moveInk(tree, el, ink, { immediate, axis: 'y' });
  };
  nodes.forEach((n) => n.addEventListener('click', () => setActive(n, false)));
  requestAnimationFrame(() => setActive(nodes.find((n) => n.getAttribute('aria-current') === 'true') || nodes[0], true));
  return { next: () => { const i = nodes.findIndex((n) => n.getAttribute('aria-current') === 'true'); setActive(nodes[(i + 1) % nodes.length], false); } };
}

/** шапка + меню витрины: одна страница, все разделы — якоря */
export function shell() {
  const nav = [['#accents', 'Темы'], ['#components', 'Компоненты'], ['#app', 'Приложение'], ['#chat', 'Чат'], ['#wizard', 'Анкета'], ['#setup', 'Первый запуск'], ['#scene', 'Сцена'],
    ['#motion', 'Движение'], ['#kosmos', 'KOCMOC'], ['#future', 'Будет'], ['blocks.html', 'Блоки']];
  const links = nav.map(([h, t], i) => `<a href="${h}"${i === 0 ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  document.getElementById('topbar').innerHTML = `
    <a class="brand" href="#top"><svg><use href="${ICON}#i-mark"/></svg>cosmos</a>
    <nav class="nav" aria-label="Разделы">${links}</nav>
    <div class="topbar-actions">
      <a class="btn small" href="#connect">Подключить</a>
      <button class="icon-btn menu-btn" type="button" data-open="#menu-drawer" aria-label="Меню"><svg><use href="${ICON}#i-menu"/></svg></button>
    </div>`;
  document.getElementById('menu-drawer').querySelector('.drawer-links').innerHTML = [['#toc', 'Оглавление'], ...nav].map(([h, t]) => `<a href="${h}" data-close>${t}</a>`).join('') + '<a href="#connect" data-close>Подключить</a>';
}

/** оглавление витрины: секции по кикеру, подразделы — элементы с [data-toc] и id */
export function buildToc(box) {
  const groups = [];
  for (const s of document.querySelectorAll('section.section')) {
    if (s.id === 'toc') continue;
    const k = s.querySelector(':scope > .section-head .kicker');
    const subs = [...s.querySelectorAll('[data-toc][id]')].map((x) => `<a href="#${x.id}">${x.dataset.toc || x.textContent.trim()}</a>`);
    if (s.id && k) groups.push({ head: `<a class="toc-head" href="#${s.id}">${k.textContent.trim()}</a>`, subs });
    else if (groups.length) groups[groups.length - 1].subs.push(...subs);   // секция-продолжение без id (KOCMOC 2, 3) — к предыдущей группе
  }
  box.innerHTML = groups.map((g) => `<div class="toc-group">${g.head}${g.subs.join('')}</div>`).join('');
}

/** темы витрины — три палитры кита одним переключателем (внизу страницы и в секции «Темы»; клавиша T — по кругу):
      neutral — умолчание 0.3 (нейтральные чернила Lc 90/78/62), grey — «серая» 0.2.0 один-в-один (data-palette="grey"),
      gold — «золотистая»: бумага + золотой свет (data-palette="paper" data-accent="gold").
    Выбор помнится (localStorage, с try/catch) и читается из ?theme=neutral|grey|gold (старое ?palette=paper = gold). */
export const THEMES = {
  neutral: { label: 'Нейтральная', palette: null, accent: null },
  grey: { label: 'Серая', palette: 'grey', accent: null },
  gold: { label: 'Золотистая', palette: 'paper', accent: 'gold' },
};
const THEME_KEY = 'cosmos-demo-theme';
export function themeName() { const p = document.documentElement.dataset.palette; return p === 'grey' ? 'grey' : p === 'paper' ? 'gold' : 'neutral'; }
export function wireTheme(groups, api) {
  groups = (Array.isArray(groups) ? groups : [groups]).filter(Boolean);
  const root = document.documentElement;
  const set = (name, push) => {
    if (!THEMES[name]) name = 'neutral';
    const th = THEMES[name];
    if (th.palette) root.dataset.palette = th.palette; else delete root.dataset.palette;
    if (th.accent) root.dataset.accent = th.accent; else delete root.dataset.accent;
    api?.setAccent(th.accent ? getComputedStyle(root).getPropertyValue('--el-a').trim() : null, 1);
    groups.forEach((g) => { const on = g.querySelector(`[data-theme="${name}"]`);
      g.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-checked', String(b === on)));
      if (push && on) moveInk(g, on); });
    document.dispatchEvent(new CustomEvent('theme', { detail: name }));
    if (push) {
      try { localStorage.setItem(THEME_KEY, name); } catch {}
      const u = new URL(location.href); if (name === 'neutral') u.searchParams.delete('theme'); else u.searchParams.set('theme', name); u.searchParams.delete('palette');
      history.replaceState(null, '', u);
    }
  };
  const q = new URLSearchParams(location.search);
  let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch {}
  set(q.get('theme') || (q.get('palette') === 'paper' ? 'gold' : null) || saved || 'neutral', false);
  groups.forEach((g) => wireSegmented(g, 'aria-checked', (it) => set(it.dataset.theme, true)));
  const order = Object.keys(THEMES);
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (/^[tTеЕ]$/.test(e.key)) set(order[(order.indexOf(themeName()) + 1) % order.length], true);
  });
  return set;
}

// ---- «проиграть ещё раз» для движений, которые иначе видны только от мыши ----
/** нажатие и отпускание — как палец: вниз .97 за .09, обратно с одним перелётом */
export function pressDemo(el) { const m = motionOf(el); m.to({ s: 0.97 }, { response: 0.09, damping: 1 }); setTimeout(() => m.to({ s: 1 }, { response: 0.36, damping: 0.68 }), 140); }
/** «вдох» фокуса с клавиатуры: 1.06 → 1 */
export function breathDemo(el) { const m = motionOf(el); m.from({ s: 1.06 }); m.to({ s: 1 }, { response: 0.45, damping: 0.6 }); }
/** подъём при наведении и возврат */
export function hoverDemo(el, lift = 1.02) { const m = motionOf(el); m.to({ s: lift }, { response: 0.34, damping: 0.72 }); setTimeout(() => m.to({ s: 1 }, { response: 0.36, damping: 0.68 }), 700); }

/** чат витрины — вся механика экрана без сервера: поток ответа с кареткой и фазой, «Отправить» ↔ «Остановить» (Esc),
    Enter / Shift+Enter, ↑ в пустом поле — правка последнего вопроса (пузырь становится полем, ответы ниже уходят),
    «Другой ответ», копирование, новый чат (пустое состояние с подсказками), инкогнито, выбор и удаление разговора,
    переименование (карандаш у заголовка), поиск по разговорам (появляется, когда их больше шести), кнопка «вниз»,
    реакции и «Уже читал» → быстрая оценка, группа нескачанного: Скачать → в Telegram одним нажатием, флажок → жалоба,
    переключатель провайдера ИИ в шапке, подвал «Память · Obsidian» (щелчок — выгрузка, двойной — импорт).
    Лента сама едет вниз, только если человек не отмотал её вверх. root — элемент .chat. */
export function wireChatDemo(root, toast) {
  const $ = (s) => root.querySelector(s);
  const side = $('.chat-side'), main = $('.chat-main'), col = $('.chat-col'), scroll = $('.chat-scroll'), ta = $('.composer textarea'), send = $('.composer .btn.primary');
  const head = $('.chat-head'), title = head.querySelector('h1, h2'), sub = head.querySelector('.sub');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seed = col.innerHTML, seedTitle = title.textContent;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let timer = 0, streaming = null, altI = -1;
  const nearBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 160;
  const bottom = (force) => { if (force || nearBottom()) scroll.scrollTop = scroll.scrollHeight; };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(240, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', grow);
  const time = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const mode = () => [...root.querySelectorAll('.composer .pills')].map((g) => g.querySelector('[aria-checked="true"]')?.textContent.trim().toLowerCase()).filter(Boolean).join(' · ');
  const ACTS_USER = '<div class="msg-acts"><button class="text-btn small" type="button" data-act="copy">Копировать</button><button class="text-btn small" type="button" data-act="edit">Изменить</button></div>';
  const ACTS_AI = `<div class="msg-acts"><button class="text-btn small" type="button" data-act="copy">Копировать</button><button class="text-btn small" type="button" data-act="again"><svg><use href="${ICON}#i-refresh"/></svg>Другой ответ</button><span class="meta"></span></div>`;
  const rows = () => [...side.querySelectorAll('.chat-row')];

  // кнопка «вниз» — когда лента отмотана от конца
  let down = main.querySelector('.chat-down');
  if (!down) { down = document.createElement('button'); down.type = 'button'; down.className = 'chat-down'; down.setAttribute('aria-label', 'К последнему сообщению'); down.innerHTML = `<svg><use href="${ICON}#i-arrow-down"/></svg>`; main.append(down); }
  down.addEventListener('click', () => scroll.scrollTo({ top: scroll.scrollHeight, behavior: reduced ? 'auto' : 'smooth' }));
  const syncDown = () => down.classList.toggle('show', !nearBottom() && !main.classList.contains('blank'));
  scroll.addEventListener('scroll', syncDown, { passive: true });
  new ResizeObserver(syncDown).observe(col);

  // переименование — карандаш у заголовка
  if (!head.querySelector('[data-act="rename"]')) { title.insertAdjacentHTML('afterend', `<button class="icon-btn small" type="button" data-act="rename" aria-label="Переименовать разговор"><svg><use href="${ICON}#i-pencil"/></svg></button>`); }
  const rename = () => {
    if (head.querySelector('.in')) return;
    const inp = document.createElement('input'); inp.className = 'in sm'; inp.value = title.textContent; inp.maxLength = 80; inp.setAttribute('aria-label', 'Название разговора');
    title.replaceWith(inp); inp.focus(); inp.select();
    let closed = false;   // replaceWith уводит фокус → blur → повторный done: защищаемся флагом
    const done = (save) => { if (closed) return; closed = true; const v = inp.value.trim(); inp.replaceWith(title);
      if (save && v && v !== title.textContent) { title.textContent = v; const on = rows().find((r) => r.classList.contains('on')); if (on) on.querySelector('button').childNodes[0].textContent = v; toast?.('', 'Переименовано'); } };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
    inp.addEventListener('blur', () => { if (inp.isConnected) done(true); });
  };

  // поиск по разговорам — когда их больше шести
  let search = side.querySelector('.chat-search');
  if (!search) { search = document.createElement('div'); search.className = 'chat-search'; search.innerHTML = `<svg><use href="${ICON}#i-search"/></svg><input class="in sm" type="search" placeholder="Поиск по разговорам" aria-label="Поиск по разговорам">`; side.querySelector('.chat-list').before(search); }
  const sInput = search.querySelector('input');
  const syncSearch = () => {
    const q = sInput.value.trim().toLowerCase();
    search.hidden = rows().length <= 6 && !q;
    rows().forEach((r) => r.classList.toggle('hide', !!q && !r.textContent.toLowerCase().includes(q)));
    side.querySelectorAll('.chat-group').forEach((g) => { let n = g.nextElementSibling, any = false; while (n && !n.classList.contains('chat-group')) { if (!n.classList.contains('hide')) any = true; n = n.nextElementSibling; } g.classList.toggle('hide', !any); });
  };
  sInput.addEventListener('input', syncSearch);
  sInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (sInput.value) { sInput.value = ''; syncSearch(); } else sInput.blur(); } });
  syncSearch();

  // поток: слова по одному, каретка дышит, под текстом — фаза и таймер; «Остановить» обрывает на текущем слове
  const setSend = (busy) => { send.textContent = busy ? 'Остановить' : 'Отправить'; send.classList.toggle('primary', !busy); };
  const stream = (msg, html) => {
    stop();
    const md = msg.querySelector('.md'); let run = msg.querySelector('.msg-run');
    if (!run) { run = document.createElement('div'); run.className = 'msg-run'; run.innerHTML = '<i class="live-dot"></i><span>Собираю контекст: профиль, отзывы, память</span><b>00:00</b>'; md.after(run); }
    const tm = run.querySelector('b'), parts = html.split(' '); let i = 0; const t0 = Date.now();
    streaming = msg; setSend(true); md.innerHTML = '';
    col.querySelectorAll('.msg.ai.last').forEach((m) => m.classList.remove('last'));
    const finish = (partial) => {
      clearInterval(timer); timer = 0; md.innerHTML = partial ? parts.slice(0, i).join(' ') : html; run.remove(); msg.classList.add('last'); streaming = null; setSend(false);
      if (!msg.querySelector('.msg-acts')) msg.insertAdjacentHTML('beforeend', ACTS_AI);
      const meta = msg.querySelector('.msg-acts .meta'); if (meta) meta.textContent = (partial ? 'остановлено · ' : '') + '00:' + String(Math.max(1, Math.round((Date.now() - t0) / 1000))).padStart(2, '0');
      bottom(); syncDown();
    };
    msg._finish = finish;
    if (reduced) { finish(false); return; }
    timer = setInterval(() => {
      i += 1 + Math.floor(Math.random() * 2);
      md.innerHTML = parts.slice(0, i).join(' ') + '<span class="caret" aria-hidden="true"></span>';
      tm.textContent = '00:' + String(Math.floor((Date.now() - t0) / 1000)).padStart(2, '0');
      bottom();
      if (i >= parts.length) finish(false);
    }, 90);
  };
  const stop = () => { if (streaming) streaming._finish?.(true); };
  const reply = (text) => main.classList.contains('incognito')
    ? `<p>Инкогнито: отвечаю без профиля и памяти. По запросу <strong>«${esc(text)}»</strong> в каталоге три записи — две полные и одна радиопостановка. Какую длину предпочитаете?</p>`
    : `<p>Понял: <strong>«${esc(text)}»</strong>. Судя по вашим отзывам, подойдут две книги рядом и один «мост» в документальную прозу — ниже каждая с причиной. Скажите «покороче» или «мрачнее», и я сдвину подбор.</p>`;
  const ALT = ['<p>Другой вариант: три радиоспектакля по часу — <strong>«Пикник на обочине»</strong>, <strong>«Солярис»</strong> и <strong>«Малыш»</strong>; все на диске, можно слушать подряд.</p>',
    '<p>Если не мрачное, а просто короткое: <strong>«Превращение»</strong>, 2 ч 10 мин, уже на диске, чтец Терновский. И одна притча рядом — <strong>«Чужак»</strong> Камю, 3 ч.</p>'];
  const answer = (html) => { col.insertAdjacentHTML('beforeend', '<div class="msg ai"><div class="md"></div></div>'); const a = col.lastElementChild; bottom(true); setTimeout(() => stream(a, html), reduced ? 0 : 700); return a; };
  const ask = (text = ta.value.trim()) => {
    if (!text) { ta.focus(); return; }
    if (streaming) stop();
    ta.value = ''; grow();
    if (main.classList.contains('blank')) {
      main.classList.remove('blank'); col.innerHTML = ''; title.textContent = text.slice(0, 48);
      const list = side.querySelector('.chat-list'); let g = list.querySelector('.chat-group'); if (!g || g.textContent.trim() !== 'Сегодня') { g = document.createElement('div'); g.className = 'chat-group'; g.textContent = 'Сегодня'; list.prepend(g); }
      g.insertAdjacentHTML('afterend', `<div class="chat-row on"><button type="button"></button><button class="x" type="button" aria-label="Удалить разговор"><svg><use href="${ICON}#i-x"/></svg></button></div>`);
      const b = g.nextElementSibling.querySelector('button'); b.textContent = title.textContent; b.insertAdjacentHTML('beforeend', `<small>${time()} · 1 вопрос${main.classList.contains('incognito') ? ' · инкогнито' : ''}</small>`);
      rows().forEach((r) => r.classList.toggle('on', r === g.nextElementSibling)); syncSearch();
    }
    col.insertAdjacentHTML('beforeend', `<div class="msg user"><div class="bubble"></div>${ACTS_USER}</div>`);
    const b = col.lastElementChild.querySelector('.bubble'); b.textContent = text; b.insertAdjacentHTML('beforeend', `<small>${time()} · ${mode()}</small>`);
    answer(reply(text));
  };
  send.addEventListener('click', () => (streaming ? stop() : ask()));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!streaming) ask(); }
    else if (e.key === 'Escape' && streaming) { e.preventDefault(); stop(); }
    else if (e.key === 'ArrowUp' && !ta.value) { const last = [...col.querySelectorAll('.msg.user')].pop(); if (last) { e.preventDefault(); edit(last); } }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && streaming && !e.target.closest?.('input, textarea')) stop(); });

  // правка вопроса: пузырь становится полем; «Отправить снова» убирает всё ниже и пишет ответ заново
  const edit = (msg) => {
    const b = msg.querySelector('.bubble'); if (!b || b.classList.contains('edit')) return;
    const text = b.childNodes[0]?.textContent.trim() || '', meta = b.querySelector('small')?.outerHTML || '';
    b.dataset.text = text; b.dataset.meta = meta; b.classList.add('edit');
    b.innerHTML = '<textarea aria-label="Изменить сообщение"></textarea><div class="btn-row"><button class="btn small" type="button" data-act="cancel">Отмена</button><button class="btn small" type="button" data-act="resend">Отправить снова</button></div>';
    const t = b.querySelector('textarea'); t.value = text; t.focus(); t.setSelectionRange(text.length, text.length);
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); resend(msg); } else if (e.key === 'Escape') { e.stopPropagation(); cancelEdit(msg); } });
  };
  const cancelEdit = (msg) => { const b = msg.querySelector('.bubble'); b.classList.remove('edit'); b.textContent = b.dataset.text; b.insertAdjacentHTML('beforeend', b.dataset.meta); ta.focus(); };
  const resend = (msg) => {
    const b = msg.querySelector('.bubble'), text = b.querySelector('textarea').value.trim(); if (!text) return;
    stop(); b.classList.remove('edit'); b.textContent = text; b.insertAdjacentHTML('beforeend', `<small>${time()} · ${mode()} · изменено</small>`);
    let n = msg.nextElementSibling; while (n) { const x = n; n = n.nextElementSibling; x.remove(); }
    answer(reply(text)); ta.focus();
  };

  // реакции: отметка действует сразу и снимается повторным нажатием; 👎 гасит совет; «Уже читал» → быстрая оценка
  const react = (r) => {
    const g = r.closest('.reacts'), on = r.getAttribute('aria-pressed') !== 'true';
    g.querySelectorAll('.react').forEach((o) => o.setAttribute('aria-pressed', String(o === r && on)));
    const row = r.closest('.advice-row'), kind = r.querySelector('use[href$="i-thumb-up"]') ? 'up' : r.querySelector('use[href$="i-thumb-down"]') ? 'down' : 'read';
    row?.classList.toggle('gone', on && kind === 'down');
    if (kind === 'read') {
      const rate = document.getElementById('rate');
      if (on) { r.textContent = '✓ Читал'; if (rate) { rate.querySelector('h3').textContent = `«${row?.querySelector('.advice-title')?.textContent.trim() || 'книга'}» — уже читали`; openDialog(rate); } else toast?.('', 'Отмечено как прочитанное'); }
      else { r.textContent = 'Уже читал'; toast?.('', 'Отметка снята'); }
      return;
    }
    toast?.('', on ? (kind === 'up' ? 'Нравится — учту, больше такого' : 'Не моё — учту, меньше такого') : 'Отметка снята');
  };
  // нескачанное: «в Telegram» сам скачивает, проверяет и отправляет — одно действие до результата (UX.md §13)
  const fetchAct = (b) => {
    const t = b.textContent.trim(), grp = b.closest('.btn-row');
    const find = (re) => [...grp.querySelectorAll('.btn')].find((x) => re.test(x.textContent));
    if (/Скачать|качается/.test(t)) {
      if (b.disabled) return; b.disabled = true; b.textContent = '↓ качается…'; toast?.('', 'Скачиваю — проверю полноту и положу в библиотеку');
      setTimeout(() => { b.textContent = '✓ на диске'; grp.dataset.ready = '1'; const tg = find(/после загрузки/); if (tg) { tg.textContent = '✓ отправлено'; toast?.('ok', 'Отправлено в Telegram'); } }, reduced ? 0 : 1800);
      return;
    }
    if (/очередь/.test(t)) { b.classList.toggle('on'); b.textContent = b.classList.contains('on') ? '✓ в очереди' : '+ в очередь'; return; }
    if (/Ссылка/.test(t)) { toast?.('', 'Ссылка скопирована'); return; }
    if (/Telegram/.test(t)) {
      if (b.disabled) return; const dl = find(/Скачать/);
      if (dl && !grp.dataset.ready) { b.disabled = true; b.textContent = '✈ после загрузки'; fetchAct(dl); }
      else { b.disabled = true; b.textContent = '✓ отправлено'; toast?.('ok', 'Отправлено в Telegram'); }
      return;
    }
    if (/отправлено|на диске|после загрузки/.test(t)) return;
    toast?.('', 'Пример: ' + t);
  };

  // подвал списка — зеркало данных во внешний инструмент: щелчок по «Obsidian» выгружает, двойной — забирает оттуда новое;
  // выгрузка ждёт 260 мс, чтобы двойной щелчок не дал и выгрузку, и импорт
  let footTimer = 0;
  const footAct = (btn) => {
    if (!/Obsidian/.test(btn.textContent)) { toast?.('', 'Память: «любит мрачное и короткое», «не выносит медленное начало» — пример'); return; }
    clearTimeout(footTimer);
    footTimer = setTimeout(() => { btn.disabled = true; setTimeout(() => { btn.disabled = false; toast?.('ok', 'Obsidian: 14 заметок (3 обновлено) · путь скопирован'); }, reduced ? 0 : 500); }, 260);
  };
  side.querySelector('.chat-side-foot')?.addEventListener('dblclick', (e) => { const btn = e.target.closest('button'); if (!btn || !/Obsidian/.test(btn.textContent)) return; clearTimeout(footTimer); toast?.('ok', 'Из Obsidian: +2 факта'); });
  // провайдер ИИ в шапке — действует на всё приложение; недоступный (CLI не найден) — disabled, нажать нельзя
  head.querySelectorAll('.pills').forEach((g) => wireSegmented(g, 'aria-checked', (it) => toast?.('', `ИИ: ${it.textContent.trim()} — для всех функций приложения`)));

  // новый чат → пустое состояние с полем по центру; инкогнито — пунктир и свой текст; выбор разговора
  const blank = () => {
    stop(); main.classList.add('blank'); title.textContent = 'Новый чат'; rows().forEach((r) => r.classList.remove('on'));
    const inc = main.classList.contains('incognito');
    col.innerHTML = `<div class="chat-empty"><h3>${inc ? 'Инкогнито: начнём с чистого листа' : 'Что послушать дальше?'}</h3>
      <p>${inc ? 'Не вижу ваших отзывов, анкеты и памяти и ничего не запомню. Ищу по всей библиотеке и каталогу источников.' : 'Я вижу ваши отзывы, анкету и память о вкусе. Советую книги рядом и «мосты» в другие жанры — каждую можно поставить в очередь или отправить одной кнопкой, даже если её ещё нет на диске.'}</p>
      <div class="choices"><button class="choice" type="button">Что после последней пятёрки?</button><button class="choice" type="button">Мрачное и короткое, до 5 часов</button><button class="choice" type="button">Удиви меня чем-нибудь не из фантастики</button><button class="choice" type="button">Радиоспектакль на вечер</button></div></div>`;
    setSend(false); syncDown(); ta.focus({ preventScroll: true });
  };
  const incInput = head.querySelector('.switch input');
  incInput?.addEventListener('change', () => { main.classList.toggle('incognito', incInput.checked); if (sub) sub.textContent = incInput.checked ? 'инкогнито · без профиля и памяти' : 'помнит ваш вкус'; blank(); });
  const first = rows().find((r) => r.classList.contains('on'));
  const select = (row) => {
    stop(); rows().forEach((r) => r.classList.toggle('on', r === row)); main.classList.remove('blank');
    if (incInput) { incInput.checked = false; main.classList.remove('incognito'); if (sub) sub.textContent = 'помнит ваш вкус'; }
    const name = row.querySelector('button').childNodes[0].textContent.trim();
    title.textContent = name || seedTitle;
    if (row === first) col.innerHTML = seed;
    else col.innerHTML = `<div class="msg user"><div class="bubble">${esc(name)}<small>${row.querySelector('small')?.textContent.split('·')[0].trim() || ''} · рядом · авто</small></div>${ACTS_USER}</div>
      <div class="msg ai last"><div class="md"><p>Это сохранённый разговор «${esc(name)}» — в примере он короткий. Спросите что-нибудь ниже, и ответ напишется потоком.</p></div>${ACTS_AI}</div>`;
    bottom(true); syncDown();
  };

  // все клики — одним слушателем: разметка ленты меняется целиком, обработчики не теряются
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const act = btn.dataset.act, msg = btn.closest('.msg');
    if (act === 'copy') { const src = msg.querySelector('.bubble') || msg.querySelector('.md'); navigator.clipboard?.writeText(src.textContent.trim()).catch(() => {}); toast?.('', 'Скопировано'); }
    else if (act === 'edit') edit(msg);
    else if (act === 'cancel') cancelEdit(msg);
    else if (act === 'resend') resend(msg);
    else if (act === 'again') { stop(); msg.querySelector('.msg-acts')?.remove(); msg.querySelectorAll('.advice, .choices').forEach((x) => x.remove()); altI = (altI + 1) % ALT.length; stream(msg, ALT[altI]); }
    else if (act === 'rename') rename();
    else if (btn.matches('.choice') && btn.closest('.chat-col')) ask(btn.textContent.trim());
    else if (btn.matches('.react')) react(btn);
    else if (btn.matches('.advice-side .btn-row .btn')) fetchAct(btn);
    else if (btn.matches('.chat-row > button:first-child')) select(btn.closest('.chat-row'));
    else if (btn.matches('.chat-row .x')) { const row = btn.closest('.chat-row'), was = row.classList.contains('on'); row.remove(); syncSearch(); toast?.('', 'Разговор удалён'); if (was) blank(); }
    else if (btn.closest('.chat-side-foot')) footAct(btn);
    else if (btn.matches('.chat-side > .btn')) blank();
  });
  root.querySelectorAll('.composer .pills').forEach((g) => wireSegmented(g, 'aria-checked'));
  const live = col.querySelector('[data-stream]');
  if (live) stream(live, live.dataset.stream);
  requestAnimationFrame(() => { bottom(true); syncDown(); });
  return { ask, blank, stop, replay: () => { const last = [...col.querySelectorAll('.msg.ai')].pop(); if (!last) return; stop(); const html = last.querySelector('.md').innerHTML; last.querySelector('.msg-acts')?.remove(); stream(last, html); } };
}

/** диалог быстрой оценки (.scale): клик по плите или цифра с клавиатуры (0 = 10) — оценка сохранена сразу; повторный клик по той же — снимает */
export function wireRateDialog(dlg, toast) {
  const btns = [...dlg.querySelectorAll('.scale button')];
  const pick = (n) => {
    const b = btns[n - 1], was = b?.getAttribute('aria-pressed') === 'true';
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b && !was)));
    closeDialog(dlg); toast?.(was ? '' : 'ok', was ? 'Оценка снята' : `Оценка ${n}/10 сохранена · учту в подборе`);
  };
  btns.forEach((b) => b.addEventListener('click', () => pick(+b.textContent)));
  dlg.addEventListener('keydown', (e) => { if (/^[0-9]$/.test(e.key) && !e.target.matches('input, textarea')) { e.preventDefault(); pick(e.key === '0' ? 10 : +e.key); } });
  const [mark, full] = [...dlg.querySelectorAll('.modal-actions .btn')].slice(-2);
  mark?.addEventListener('click', () => toast?.('', 'Отмечено как прочитанное'));
  full?.addEventListener('click', () => toast?.('', 'Пример: открылась бы карточка отзыва'));
}

/** анкета витрины: клик по шагу показывает его панель (.wz-pane: 1–2 — книги, 3–5 — как слушаете, 6–7 — что ещё) и меняет подпись
    главной кнопки («Далее →» / «К итогу →»); чипы — делегированием (radiogroup → aria-checked одному, group → aria-pressed,
    .scale.small — оценка одним кликом, повтор снимает); поле .suggest подсказывает из «библиотеки» (≤ 8, задержка 90 мс):
    ↑↓ — выбор, Enter — выбранное или «любая книга», Alt+Enter — «автор целиком» (строка поднимается первой, когда запрос похож
    на имя автора), Esc — спрятать; добавленное — карточкой .entry первым, крестик убирает. Это ввод на уровне того, как думает
    человек: «нравится автор», а не только «книга из базы». */
export function wireWizardDemo(form, toast) {
  const $ = (s) => form.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps = [...form.querySelectorAll('.steps .step')], next = $('.form-actions .btn.primary');
  const paneOf = (i) => (i < 2 ? 'books' : i < 5 ? 'listen' : 'more');
  const showStep = (s) => {
    const i = steps.indexOf(s);
    steps.forEach((o) => { o.classList.toggle('on', o === s); if (o === s) o.setAttribute('aria-current', 'step'); else o.removeAttribute('aria-current'); });
    form.querySelectorAll('.wz-pane').forEach((p) => { p.hidden = p.dataset.pane !== paneOf(i); });
    if (next) next.textContent = i >= 5 ? 'К итогу →' : 'Далее →';
  };
  steps.forEach((s) => s.addEventListener('click', () => showStep(s)));
  showStep(steps.find((s) => s.classList.contains('on')) || steps[0]);
  const entries = $('.entries'), note = $('.entries-note');
  const count = () => { if (!note) return; const n = entries.children.length;
    note.innerHTML = n ? `Добавлено: <b>${n}</b>` + (n < 3 ? ' · хорошо бы ещё пару' : '') : 'Пока пусто. Название и Enter — книга; имя и Alt+Enter — автор целиком.'; };
  form.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.choice')) { const g = b.closest('.choices');
      if (g?.getAttribute('role') === 'radiogroup') g.querySelectorAll('.choice').forEach((o) => o.setAttribute('aria-checked', String(o === b)));
      else b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); }
    else if (b.closest('.scale')) { const was = b.getAttribute('aria-pressed') === 'true'; b.closest('.scale').querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b && !was))); }
    else if (b.matches('.entry .x')) { const en = b.closest('.entry'); const title = en.dataset.key || ''; (reduced ? Promise.resolve() : Promise.race([exit(en, { dy: 0, scale: 0.97 }), new Promise((r) => setTimeout(r, 320))])).then(() => { en.remove(); count(); toast?.('', `Убрано: ${title}`); }); }   // уход не дольше 320 мс
  });
  // подсказки из «библиотеки» — для витрины список короткий; в приложении — запрос к серверу с той же механикой
  const LIB = [['Кобо Абэ', 'Женщина в песках', '5 ч · прослушано · 9'], ['Кобо Абэ', 'Чужое лицо', '6,2 ч · в очереди'], ['Кобо Абэ', 'Сожжённая карта', '7 ч'],
    ['Станислав Лем', 'Солярис', '8,9 ч · в очереди'], ['Станислав Лем', 'Непобедимый', '6,5 ч'], ['Стругацкие', 'Пикник на обочине', '7,2 ч · прослушано · 9'],
    ['Франц Кафка', 'Превращение', '2 ч 10 мин'], ['Франц Кафка', 'Процесс', '9 ч'], ['Умберто Эко', 'Имя розы', '21 ч'], ['Филип Дик', 'Убик', '7,5 ч · прослушано · 8'],
    ['Джордж Оруэлл', '1984', '11,3 ч · брошено · 6'], ['Эли Визель', 'Ночь', '3 ч 40 мин']].map(([a, t, m]) => ({ a, t, m }));
  const WHY_BOOK = ['сюжет', 'герои', 'атмосфера', 'язык', 'идеи', 'чтец', 'финал'], WHY_AUTHOR = ['атмосфера', 'герои', 'язык', 'идеи', 'сюжет', 'юмор', 'мрачность'];
  const sg = $('.suggest'); if (!sg || !entries) { count(); return { showStep }; }
  const inp = sg.querySelector('input'), hints = sg.querySelector('.hints');
  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').trim();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const hl = (text, q) => { const i = norm(text).indexOf(norm(q)); return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length)); };
  const scale = (v) => `<div class="scale small" role="group" aria-label="Оценка">${[...Array(10)].map((_, i) => `<button type="button" aria-pressed="${i + 1 === v}">${i + 1}</button>`).join('')}</div>`;
  const chips = (list, on, label) => `<div class="choices" role="group" aria-label="${label}">${list.map((c) => `<button class="choice" type="button" aria-pressed="${on.includes(c)}">${c}</button>`).join('')}</div>`;
  const card = ({ author, title, meta, kind }) => {
    const x = `<button class="x" type="button" aria-label="Убрать"><svg><use href="${ICON}#i-x"/></svg></button>`;
    const head = kind === 'author' ? `<div class="entry-fields one"><input class="in" aria-label="Автор" value="${esc(title)}"></div><span class="tag accent">автор целиком</span>${x}`
      : kind === 'lib' ? `<div class="entry-title">${esc(author ? author + ' — «' + title + '»' : title)}<small>${esc(meta || 'в вашей библиотеке')}</small></div><span class="tag">в библиотеке</span>${x}`
      : `<div class="entry-fields"><input class="in" aria-label="Автор" placeholder="Автор" value="${esc(author)}"><input class="in" aria-label="Название" placeholder="Название" value="${esc(title)}"></div><span class="tag out">вне библиотеки</span>${x}`;
    return `<div class="entry" data-key="${esc(kind === 'author' ? title : (author ? author + ' — ' : '') + title)}"><div class="entry-head">${head}</div>
      <p class="entry-lbl">${kind === 'author' ? 'Чем нравится автор' : 'Чем понравилась'}</p>${chips(kind === 'author' ? WHY_AUTHOR : WHY_BOOK, [], kind === 'author' ? 'Чем нравится автор' : 'Чем понравилась')}
      <div class="entry-row">${scale(0)}<input class="in" aria-label="Комментарий" placeholder="Одной строкой: что запомнилось (необязательно)"></div></div>`;
  };
  let H = [], rows = [], act = 0, q = '', timer = 0;
  const has = (key) => [...entries.querySelectorAll('.entry')].some((e) => norm(e.dataset.key || '') === norm(key));
  const add = (it) => {
    const key = it.kind === 'author' ? it.title : (it.author ? it.author + ' — ' : '') + it.title;
    if (has(key)) { toast?.('warn', 'Уже в списке'); return; }
    entries.insertAdjacentHTML('afterbegin', card(it)); if (!reduced) enter(entries.firstElementChild, { dy: 8 });
    inp.value = ''; q = ''; H = []; hints.hidden = true; count(); inp.focus();
  };
  const free = () => { const m = q.split(/\s+[—–-]\s+/); add(m.length > 1 ? { author: m[0].trim(), title: m.slice(1).join(' — ').trim() } : { author: '', title: q }); };
  const addAuthor = () => add({ author: '', title: q, kind: 'author' });
  const paint = () => {
    if (!q) { hints.hidden = true; return; }
    const hits = H.map((it) => ({ html: `<span>${hl((it.a ? it.a + ' — ' : '') + it.t, q)}</span><span class="tag">в библиотеке</span><small>${esc(it.m)}</small>`, pick: () => add({ author: it.a, title: it.t, meta: it.m, kind: 'lib' }) }));
    const book = { html: `<span>+ Добавить «${esc(q)}» — любая книга</span><span class="tag out">Enter</span><small>формат «Автор — Название»; можно и без автора</small>`, pick: free, add: true };
    const author = { html: `<span>+ Добавить автора «${esc(q)}» целиком</span><span class="tag out">Alt+Enter</span><small>если нравится автор в целом — опишите чем</small>`, pick: addAuthor, add: true };
    // запрос похож на имя автора (две и больше его книги в подсказках) — «автор целиком» первым
    const authorLike = H.filter((it) => norm(it.a).includes(norm(q))).length >= 2;
    rows = authorLike ? [author, ...hits, book] : [...hits, book, author];
    act = Math.min(act, rows.length - 1);
    hints.innerHTML = rows.map((r, i) => `<div class="hint${r.add ? ' add' : ''}" role="option" aria-selected="${i === act}" data-i="${i}">${r.html}</div>`).join('');
    hints.hidden = false; hints.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  inp.addEventListener('input', () => { clearTimeout(timer); q = inp.value.trim(); if (!q) { H = []; hints.hidden = true; return; }
    timer = setTimeout(() => { H = LIB.filter((x) => norm(x.a + ' ' + x.t).includes(norm(q))).slice(0, 8); act = 0; paint(); }, 90); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && rows.length) { e.preventDefault(); act = (act + 1) % rows.length; paint(); }
    else if (e.key === 'ArrowUp' && rows.length) { e.preventDefault(); act = (act - 1 + rows.length) % rows.length; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!q) return; if (e.altKey) addAuthor(); else (rows[act] || { pick: free }).pick(); }
    else if (e.key === 'Escape' && !hints.hidden) { e.stopPropagation(); hints.hidden = true; }
  });
  inp.addEventListener('blur', () => setTimeout(() => { hints.hidden = true; }, 150));
  inp.addEventListener('focus', () => { if (q) paint(); });
  hints.addEventListener('mousedown', (e) => { const h = e.target.closest('.hint'); if (!h) return; e.preventDefault(); rows[+h.dataset.i]?.pick(); });
  count();
  return { showStep, add };
}

/** мастер первого запуска витрины: действие шага → шаг сделан («✓», «готово»), раскалённым становится следующий несделанный;
    «Позже» → отложен («позже»); счётчик несделанных — <small> у пункта рейки; «Закрыть, настрою потом» → обычный экран с
    уведомлением и кнопкой «открыть»; reset() — как при первом запуске. root — рамка .demo-app с рейкой и экранами;
    rail — её .rail-nav (переключение экранов — wireRail из site.js, show(id) — его обработчик). */
export function wireSetupDemo(root, toast) {
  const $ = (s) => root.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const list = $('.setup'), seed = list.innerHTML, rail = $('.rail-nav'), views = [...root.querySelectorAll('.view')];
  const railBtn = (id) => rail.querySelector(`[data-view="${id}"]`);
  const DONE = { 'Проверить связь': ['Проверить связь', 'ИИ отвечает · 1,4 с', 'Проверяю…'], 'Сохранить': ['Изменить', 'Папка сохранена', ''],
    'Скачать готовый каталог': ['Обновить каталог', 'Каталог: 50 112 записей · 48 350 книг', '↓ качается…'], 'Заполнить анкету': ['Открыть анкету', 'Пример: открылась бы анкета', ''],
    'Включить синхронизацию': ['Синхронизировать сейчас', 'Синхронизация включена: приватный репозиторий создан', 'Создаю репозиторий…'] };
  const plural = (n, a, b, c) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c}`;
  const sync = () => {
    const steps = [...list.querySelectorAll('.setup-step')], left = steps.filter((s) => !s.classList.contains('done') && !s.classList.contains('later'));
    const badge = railBtn('vs-setup')?.querySelector('small'); if (badge) badge.textContent = left.length ? String(left.length) : '';
    steps.forEach((s) => s.querySelector('.act .btn')?.classList.toggle('primary', s === left[0]));
    const n = $('.notice'); if (n) { n.hidden = !left.length; const b = n.querySelector('b'); if (b) b.textContent = plural(left.length, 'шаг', 'шага', 'шагов'); }
  };
  const wirePills = () => list.querySelectorAll('.pills').forEach((g) => wireSegmented(g, 'aria-checked', (it) => toast?.('', `ИИ: ${it.textContent.trim()} — для всех функций приложения`)));
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.closest('.pills') || b.disabled) return;
    const step = b.closest('.setup-step'), st = step.querySelector('.st'), n = step.querySelector('.n'), label = b.textContent.trim();
    if (b.matches('.text-btn') && /^Позже/.test(label)) { step.classList.add('later'); st.textContent = 'позже'; b.remove(); toast?.('', 'Отложено — шаг остаётся в «Настройке»'); sync(); return; }
    if (b.matches('.text-btn')) { toast?.('', 'Пример: ' + label); return; }
    const [after, msg, busy] = DONE[label] || [label, 'Готово', ''];
    b.disabled = true; if (busy) b.textContent = busy;
    setTimeout(() => {
      b.disabled = false; b.textContent = after; step.classList.add('done'); step.classList.remove('later'); n.textContent = '✓'; st.textContent = 'готово';
      if (/Скачать/.test(label)) { const m = step.querySelector('.item-meta'); if (m) m.textContent = '50 112 записей · 48 350 книг'; }
      toast?.('ok', msg); sync();
    }, reduced || !busy ? 0 : 900);
  });
  const show = (id) => views.forEach((v) => { const on = v.id === id; if (on && v.hidden) { v.hidden = false; if (!reduced) enter(v, { dy: 10, scale: 1, blur: 0, response: 0.5, damping: 0.85 }); } else if (!on) v.hidden = true; });
  $('.setup-foot .btn')?.addEventListener('click', () => { railBtn('vs-home')?.click(); toast?.('', 'Мастер закрыт — откроется из рейки «Настройка»'); });
  root.querySelectorAll('.notice [data-view]').forEach((b) => b.addEventListener('click', () => railBtn(b.dataset.view)?.click()));
  const reset = () => { list.innerHTML = seed; wirePills(); sync(); railBtn('vs-setup')?.click(); toast?.('', 'Первый запуск: ИИ не проверен, анкета пуста — мастер открылся сам'); };
  wirePills(); sync();
  return { show, reset, sync };
}
