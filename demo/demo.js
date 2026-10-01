// общий запуск страниц витрины: сцена, шапка «линия» с плашкой-полоской, меню-шторка, механика кнопок и компонентов.
// Это же — пример того, что сайт делает у себя один раз (см. SKILL.md «Как подключить»).
import { createCosmos, attachSceneScroll } from '../src/js/cosmos.js';
import { attachButtons, attachPointerGlow, attachSwitches, attachChecks, attachDisclosures, attachCards, attachSwipeToClose,
  moveInk, openDialog, closeDialog, pushToast } from '../src/js/motion.js';

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

  return { api, wrap, toast: (tone, text) => pushToast(document.getElementById('toasts'), { tone, text }) };
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
}

/** шапка + меню витрины: одна страница, все разделы — якоря */
export function shell() {
  const nav = [['#language', 'Язык'], ['#accents', 'Акценты'], ['#components', 'Компоненты'], ['#app', 'Приложение'], ['#chat', 'Чат'], ['blocks.html', 'Блоки'], ['#scene', 'Сцена'], ['#motion', 'Движение'], ['#kosmos', 'KOCMOC']];
  const links = nav.map(([h, t], i) => `<a href="${h}"${i === 0 ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  document.getElementById('topbar').innerHTML = `
    <a class="brand" href="#top"><svg><use href="../src/icons/sprite.svg#i-mark"/></svg>cosmos</a>
    <nav class="nav" aria-label="Разделы">${links}</nav>
    <div class="topbar-actions">
      <a class="btn small" href="#connect">Подключить</a>
      <button class="icon-btn menu-btn" type="button" data-open="#menu-drawer" aria-label="Меню"><svg><use href="../src/icons/sprite.svg#i-menu"/></svg></button>
    </div>`;
  document.getElementById('menu-drawer').querySelector('.drawer-links').innerHTML = nav.map(([h, t]) => `<a href="${h}" data-close>${t}</a>`).join('') + '<a href="#connect" data-close>Подключить</a>';
}

/** палитра витрины: по умолчанию — нейтральная (0.2.0); «бумага-золото» — пример пресета data-palette="paper" + data-accent="gold".
    ?palette=paper в адресе включает пример сразу (для снимков). Возвращает функцию set(name). */
export function wirePalette(group, api) {
  const set = (name, push) => {
    const paper = name === 'paper';
    const root = document.documentElement;
    if (paper) { root.dataset.palette = 'paper'; root.dataset.accent = 'gold'; } else { delete root.dataset.palette; delete root.dataset.accent; }
    api?.setAccent(paper ? getComputedStyle(root).getPropertyValue('--el-a').trim() : null, 1);
    group?.querySelectorAll('[data-palette]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.palette === (paper ? 'paper' : 'default'))));
    document.dispatchEvent(new CustomEvent('palette', { detail: paper ? 'paper' : 'default' }));
    if (push) { const u = new URL(location.href); if (paper) u.searchParams.set('palette', 'paper'); else u.searchParams.delete('palette'); history.replaceState(null, '', u); }
  };
  const q = new URLSearchParams(location.search).get('palette');
  set(q === 'paper' ? 'paper' : 'default');
  if (group) wireSegmented(group, 'aria-checked', (it) => set(it.dataset.palette, true));
  return set;
}

/** чат витрины: поток ответа с кареткой, отправка, новый чат, инкогнито, реакции и «пожаловаться» — всё без сервера.
    root — элемент .chat; стартовый разговор берётся из разметки, поток — из data-stream у последнего ответа. */
export function wireChatDemo(root, toast) {
  const $ = (s) => root.querySelector(s);
  const main = $('.chat-main'), col = $('.chat-col'), scroll = $('.chat-scroll'), ta = $('.composer textarea'), send = $('.composer .btn.primary');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seed = col.innerHTML, title = $('.chat-head h2, .chat-head h1');
  const titleText = title.textContent;
  let timer = 0;
  const bottom = () => { scroll.scrollTop = scroll.scrollHeight; };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', grow);
  // поток: слова появляются по одному, каретка дышит, под текстом — фаза и таймер; в конце — действия
  const stream = (msg, text, words) => {
    clearInterval(timer);
    const md = msg.querySelector('.md'), run = msg.querySelector('.msg-run'), tm = run?.querySelector('b');
    const parts = words || text.split(' ');
    let i = 0; const t0 = Date.now();
    send.textContent = 'Остановить'; send.classList.remove('primary');
    const finish = () => { clearInterval(timer); md.innerHTML = text; run?.remove(); msg.classList.add('last'); send.textContent = 'Отправить'; send.classList.add('primary');
      col.querySelectorAll('.msg.ai.last').forEach((m) => { if (m !== msg) m.classList.remove('last'); }); bottom(); };
    if (reduced) { finish(); return; }
    timer = setInterval(() => {
      i += 1 + Math.floor(Math.random() * 2);
      md.innerHTML = parts.slice(0, i).join(' ') + '<span class="caret" aria-hidden="true"></span>';
      if (tm) { const s = Math.floor((Date.now() - t0) / 1000); tm.textContent = '00:' + String(s).padStart(2, '0'); }
      bottom();
      if (i >= parts.length) finish();
    }, 90);
    send.onclick = () => { if (send.classList.contains('primary')) ask(); else finish(); };
  };
  const live = col.querySelector('[data-stream]');
  if (live) stream(live, live.dataset.stream);
  const ask = () => {
    const text = ta.value.trim(); if (!text) { ta.focus(); return; }
    ta.value = ''; grow();
    if (main.classList.contains('blank')) { main.classList.remove('blank'); col.innerHTML = ''; title.textContent = text.slice(0, 48); }
    col.querySelectorAll('.msg.ai.last').forEach((m) => m.classList.remove('last'));
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const mode = [...root.querySelectorAll('.composer .pills')].map((g) => g.querySelector('[aria-checked="true"]')?.textContent.toLowerCase()).filter(Boolean).join(' · ');
    col.insertAdjacentHTML('beforeend', `<div class="msg user"><div class="bubble"></div><div class="msg-acts"><button class="text-btn small" type="button">Копировать</button><button class="text-btn small" type="button">Изменить</button></div></div>`);
    const b = col.lastElementChild.querySelector('.bubble'); b.textContent = text; b.insertAdjacentHTML('beforeend', `<small>${time} · ${mode}</small>`);
    col.insertAdjacentHTML('beforeend', `<div class="msg ai"><div class="md"></div><div class="msg-run"><i class="live-dot"></i><span>Собираю контекст: профиль, отзывы, память</span><b>00:00</b></div></div>`);
    const a = col.lastElementChild;
    bottom();
    const answer = main.classList.contains('incognito')
      ? '<p>Инкогнито: отвечаю без профиля и памяти. По запросу <strong>«' + text.replace(/</g, '&lt;') + '»</strong> в каталоге есть три записи — две полные и одна радиопостановка. Какую длину предпочитаете?</p>'
      : '<p>Понял: <strong>«' + text.replace(/</g, '&lt;') + '»</strong>. Судя по вашим отзывам, подойдут две книги рядом и один «мост» в документальную прозу — ниже каждая с причиной. Скажите «покороче» или «мрачнее», и я сдвину подбор.</p>';
    setTimeout(() => stream(a, answer), reduced ? 0 : 700);
  };
  send.onclick = ask;
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (send.classList.contains('primary')) ask(); } });
  // новый чат → пустое состояние с полем по центру; инкогнито — пунктир и свой текст пустого состояния
  const blank = () => {
    clearInterval(timer); main.classList.add('blank'); title.textContent = 'Новый чат';
    root.querySelectorAll('.chat-row').forEach((r) => r.classList.remove('on'));
    const inc = main.classList.contains('incognito');
    col.innerHTML = `<div class="chat-empty"><h3>${inc ? 'Инкогнито: начнём с чистого листа' : 'Что послушать дальше?'}</h3>
      <p>${inc ? 'Не вижу ваших отзывов, анкеты и памяти и ничего не запомню. Ищу по всей библиотеке и каталогу источников.' : 'Я вижу ваши отзывы, анкету и память о вкусе. Советую книги рядом и «мосты» в другие жанры — каждую можно поставить в очередь или отправить одной кнопкой, даже если её ещё нет на диске.'}</p>
      <div class="choices"><button class="choice" type="button">Что после последней пятёрки?</button><button class="choice" type="button">Мрачное и короткое, до 5 часов</button><button class="choice" type="button">Удиви меня чем-нибудь не из фантастики</button><button class="choice" type="button">Радиоспектакль на вечер</button></div></div>`;
    send.textContent = 'Отправить'; send.classList.add('primary'); ta.focus({ preventScroll: true });
  };
  $('.chat-side > .btn')?.addEventListener('click', blank);
  const inc = $('.chat-head .switch input');
  inc?.addEventListener('change', () => { main.classList.toggle('incognito', inc.checked); $('.chat-head .sub').textContent = inc.checked ? 'инкогнито · без профиля и памяти' : 'помнит ваш вкус'; blank(); });
  // разговоры: клик по строке возвращает стартовый разговор
  root.querySelectorAll('.chat-row > button:first-child').forEach((b) => b.addEventListener('click', () => {
    clearInterval(timer); root.querySelectorAll('.chat-row').forEach((r) => r.classList.toggle('on', r.contains(b)));
    main.classList.remove('blank'); if (inc) { inc.checked = false; main.classList.remove('incognito'); }
    title.textContent = b.childNodes[0].textContent.trim() || titleText; col.innerHTML = seed; wireRows(); bottom();
  }));
  root.querySelectorAll('.chat-row .x').forEach((x) => x.addEventListener('click', () => { x.closest('.chat-row').remove(); toast?.('', 'Разговор удалён'); }));
  // подсказки, реакции, действия советов — по клику
  const wireRows = () => {
    col.querySelectorAll('.choice').forEach((c) => c.addEventListener('click', () => { ta.value = c.textContent; grow(); ask(); }));
    col.querySelectorAll('.reacts').forEach((g) => g.querySelectorAll('.react').forEach((r) => r.addEventListener('click', () => {
      const on = r.getAttribute('aria-pressed') !== 'true';
      g.querySelectorAll('.react').forEach((o) => o.setAttribute('aria-pressed', String(o === r && on)));
      r.closest('.advice-row')?.classList.toggle('gone', on && !r.querySelector('use[href$="i-thumb-up"]'));
      const rate = !r.querySelector('svg') && document.getElementById('rate');
      if (rate && on) { r.textContent = '✓ Читал'; rate.querySelector('h3').textContent = '«' + (r.closest('.advice-row')?.querySelector('.advice-title')?.textContent || 'книга') + '» — уже читали'; openDialog(rate); return; }
      if (rate) r.textContent = 'Уже читал';
      toast?.('', on ? (r.getAttribute('aria-label') || 'Отмечено как прочитанное').split(' — ')[0] + ' — учту' : 'Отметка снята');
    })));
    col.querySelectorAll('.fetch-acts .btn, .advice-side .btn-row .btn').forEach((b) => b.addEventListener('click', () => {
      const t = b.textContent.trim();
      if (/Скачать/.test(t)) { b.textContent = 'качается…'; b.disabled = true; toast?.('', 'Скачиваю — проверю и положу в библиотеку'); }
      else if (/очередь/.test(t)) { b.classList.toggle('on'); b.textContent = b.classList.contains('on') ? '✓ в очереди' : '+ в очередь'; }
      else if (/Ссылка/.test(t)) toast?.('', 'Ссылка скопирована');
      else toast?.('', 'Отправлю, как только скачается');
    }));
    col.querySelectorAll('.msg-acts .text-btn').forEach((b) => b.addEventListener('click', () => toast?.('', b.textContent.trim() === 'Копировать' ? 'Скопировано' : 'Пример: ' + b.textContent.trim())));
  };
  wireRows();
  col.addEventListener('click', (e) => { const c = e.target.closest('.chat-empty .choice'); if (c) { ta.value = c.textContent; grow(); ask(); } });
  root.querySelectorAll('.composer .pills').forEach((g) => wireSegmented(g, 'aria-checked'));
  requestAnimationFrame(bottom);
  return { ask, blank };
}

/** диалог быстрой оценки (.scale): клик по плите или цифра с клавиатуры (0 = 10) — оценка сохранена сразу; «Просто отметить», «Полный отзыв →» — тостом */
export function wireRateDialog(dlg, toast) {
  const pick = (n) => { closeDialog(dlg); toast?.('ok', `Оценка ${n}/10 сохранена · учту в подборе`); };
  dlg.querySelectorAll('.scale button').forEach((b) => b.addEventListener('click', () => pick(+b.textContent)));
  dlg.addEventListener('keydown', (e) => { if (/^[0-9]$/.test(e.key) && !e.target.matches('input, textarea')) { e.preventDefault(); pick(e.key === '0' ? 10 : +e.key); } });
  const [mark, full] = [...dlg.querySelectorAll('.modal-actions .btn')].slice(-2);
  mark?.addEventListener('click', () => toast?.('', 'Отмечено как прочитанное'));
  full?.addEventListener('click', () => toast?.('', 'Пример: открылась бы карточка отзыва'));
}
