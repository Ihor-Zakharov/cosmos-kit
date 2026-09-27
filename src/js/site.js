/**
 * Запуск сайта на cosmos-kit одной функцией: сцена «чёрная дыра», шапка, меню-шторка, диалоги, тосты
 * и вся механика движения кита. Разметку ждёт ту же, что в starter/index.html
 * (id="cosmos-wrap", "cosmos", "topbar", "hero", "toasts"; диалоги — <dialog>, открытие — [data-open="#id"]).
 *
 *   import { bootSite } from './kit/js/site.js';
 *   const site = bootSite();                        // главная: живая сцена, гаснет за героем
 *   bootSite({ page: 'inner' });                    // внутренняя страница: сцена спит с первого кадра
 *   bootSite({ accent: 'gold' });                   // ступень излучения: violet | ice | gold | ember (по умолчанию белая)
 *   bootSite({ plateUrl: 'img/my-plate.webp' });    // свой фон сцены (те же пропорции и точки привязки, что у plate.webp);
 *                                                   // без него на больших экранах высокой чёткости берётся plate-hd.webp
 *   bootSite({ stars: 'procedural' });              // экспериментально: звёзды кодом, резкие на 4K (дороже на 2×)
 *   site.toast('ok', 'Сохранено');                  // тон: '' | 'ok' | 'err'
 */
import { createCosmos, attachSceneScroll } from './cosmos.js';
import { attachButtons, attachPointerGlow, attachSwitches, attachChecks, attachDisclosures, attachCards, attachSwipeToClose,
  moveInk, openDialog, closeDialog, pushToast } from './motion.js';

export function bootSite({ page = 'home', accent = null, plateUrl = null, stars = 'plate' } = {}) {
  const $ = (id) => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (accent && accent !== 'white') document.documentElement.setAttribute('data-accent', accent);

  // сцена: одна на сайт
  const wrap = $('cosmos-wrap'), canvas = $('cosmos');
  let cosmos = null;
  if (wrap && canvas) {
    // фон: на больших экранах высокой чёткости — plate-hd.webp (3342×1882, Real-ESRGAN ×2), на телефонах — лёгкий plate.webp
    const hd = !matchMedia('(pointer: coarse)').matches && Math.max(screen.width, innerWidth) * devicePixelRatio >= 2400;
    // в режиме stars: 'procedural' звёзды рисуются кодом, план берётся беззвёздный — HD-план со звёздами не подставляем
    const plate = plateUrl || (hd && stars !== 'procedural' ? new URL('../scene/plate-hd.webp', import.meta.url).href : null);
    cosmos = createCosmos(canvas, { reduced, stars, ...(plate ? { plateUrl: plate } : {}) });
    if (!cosmos.ok) wrap.classList.add('fallback');
    new ResizeObserver(() => cosmos.resize()).observe(wrap);
    if (accent && accent !== 'white') cosmos.setAccent(getComputedStyle(document.documentElement).getPropertyValue('--el-a').trim());
    const hero = $('hero');
    if (page !== 'inner' && hero) {
      addEventListener('pointermove', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        cosmos.setPointer((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * -2);
      }, { passive: true });
      attachSceneScroll(cosmos, { hero, wrap });
    } else { wrap.classList.add('asleep'); cosmos.pause(); }
  }

  // шапка «линия»: плита после 40px; активный пункт — общая полоска .nav-ink, едет пружиной
  const topbar = $('topbar'), nav = topbar?.querySelector('.nav');
  if (topbar && nav) {
    const links = [...nav.querySelectorAll('a')];
    let ink = nav.querySelector('.nav-ink');
    if (!ink) { ink = document.createElement('span'); ink.className = 'nav-ink'; ink.setAttribute('aria-hidden', 'true'); nav.append(ink); }
    const targets = links.map((a) => { const h = a.getAttribute('href'); return h.startsWith('#') ? document.querySelector(h) : null; });
    const curIndex = () => Math.max(0, links.findIndex((a) => a.hasAttribute('aria-current')));
    const setCurrent = (i, immediate) => {
      links.forEach((a, j) => (j === i ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
      moveInk(nav, links[i], ink, { immediate });
    };
    let raf = 0;
    const sync = () => {
      raf = 0;
      topbar.classList.toggle('solid', scrollY > 40);
      if (!links.length || !targets.some(Boolean)) return;
      // активна секция, чей верх ближе всего над линией; порядок пунктов меню не важен
      let cur = curIndex(), best = -Infinity;
      targets.forEach((t, i) => { const top = t?.getBoundingClientRect().top; if (top != null && top <= innerHeight * 0.34 && top > best) { best = top; cur = i; } });
      if (!links[cur].hasAttribute('aria-current')) setCurrent(cur, false);
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
    if (links.some((a) => a.hasAttribute('aria-current'))) setCurrent(curIndex(), true);
    else ink.style.opacity = '0';
    sync();
    addEventListener('resize', () => { if (links.some((a) => a.hasAttribute('aria-current'))) setCurrent(curIndex(), true); });
    links.forEach((a, i) => a.addEventListener('click', () => { if (targets[i]) setCurrent(i, false); }));
  }

  // сегментированные переключатели: <div class="tabs|pills" data-segmented> с [aria-selected] или [aria-checked]
  for (const root of document.querySelectorAll('[data-segmented]')) wireSegmented(root);

  // механика компонентов — по одному вызову на страницу
  attachButtons(document);
  attachPointerGlow(document);   // только .field-body и [data-glow]: свет курсора — акцент, 1–3 элемента на экран
  attachSwitches(document);
  attachChecks(document);
  attachDisclosures(document);
  attachCards(document);

  // диалоги и шторки: [data-open="#id"] открывает, [data-close] закрывает, клик по подложке закрывает, шторку можно смахнуть
  for (const dlg of document.querySelectorAll('dialog')) {
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(dlg)));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); });
    attachSwipeToClose(dlg);
  }
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDialog(document.querySelector(b.dataset.open))));

  const toast = (tone, text) => { const box = $('toasts'); return box ? pushToast(box, { tone, text }) : null; };
  return { cosmos, wrap, toast };
}

/** Сегментированный переключатель: клик переключает aria-*, плашка (.pill-ink / .tab-ink) едет «каплей». */
export function wireSegmented(root, onChange) {
  const attr = root.querySelector('[aria-checked]') ? 'aria-checked' : 'aria-selected';
  const items = [...root.querySelectorAll(`[${attr}]`)];
  const setActive = (el, immediate) => {
    items.forEach((it) => it.setAttribute(attr, it === el ? 'true' : 'false'));
    moveInk(root, el, undefined, { immediate });
  };
  items.forEach((it) => it.addEventListener('click', () => { setActive(it, false); onChange?.(it); }));
  let ready = false;
  requestAnimationFrame(() => { setActive(items.find((it) => it.getAttribute(attr) === 'true') || items[0], true); ready = true; });
  // контейнер меняет ширину, когда активный пункт становится жирным — перецеливаем плашку без снапа
  // если группа только что появилась из скрытого (ширина была 0) — ставим плашку сразу, без анимации
  let lastW = root.offsetWidth;
  new ResizeObserver(() => { const w = root.offsetWidth, appeared = !lastW && w; lastW = w;
    if (ready && w) setActive(items.find((it) => it.getAttribute(attr) === 'true'), appeared); }).observe(root);
}
