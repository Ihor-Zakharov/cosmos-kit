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
  new ResizeObserver(() => { if (ready) setActive(items.find((it) => it.getAttribute(attr) === 'true'), false); }).observe(root);
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
  const nav = [['#language', 'Язык'], ['#accents', 'Акценты'], ['#components', 'Компоненты'], ['#scene', 'Сцена'], ['#motion', 'Движение'], ['#kosmos', 'KOCMOC']];
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
