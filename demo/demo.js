// общий запуск страниц витрины: сцена, шапка «линия» с плашкой-полоской, меню-шторка, механика кнопок и компонентов.
// Это же — пример того, что сайт делает у себя один раз (см. SKILL.md «Как подключить»).
import { createCosmos, attachSceneScroll } from '../src/js/cosmos.js';
import { attachButtons, attachPointerGlow, attachSwitches, attachChecks, attachDisclosures, attachCards, attachSwipeToClose,
  moveInk, motionOf, openDialog, closeDialog, pushToast, dismissToast } from '../src/js/motion.js';

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
  const nav = [['#accents', 'Темы'], ['#components', 'Компоненты'], ['#app', 'Приложение'], ['#chat', 'Чат'], ['#wizard', 'Анкета'], ['#scene', 'Сцена'],
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
    реакции и «Уже читал» → быстрая оценка, группа нескачанного: Скачать → в Telegram одним нажатием, флажок → жалоба.
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
    else if (btn.closest('.chat-side-foot')) toast?.('', 'Память: «любит мрачное и короткое», «не выносит медленное начало» — пример');
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
