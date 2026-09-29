# Подключение кита вручную

Обычно не нужно: `cosmos.py init` делает всё сам. Это — устройство каркаса и ручной путь для особых случаев. Пути `src/…` здесь = `kit/…` в проекте.

## Как подключить кит

**Новый сайт — из заготовки, а не с нуля.** Одна команда создаёт проект с китом в `kit/`, заготовкой страниц
(`index.html` — главная с героем, `page.html` — внутренняя) и этим навыком:
`curl -fsSL https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/create-site.sh | sh -s -- <имя>`
(Windows — `create-site.ps1`, ручной путь — `AGENT.md` в корне кита). Вся механика запускается одной строкой:
`import { bootSite } from './kit/js/site.js'; bootSite();` — сцена, шапка, меню, диалоги, тосты и движение.
В созданном проекте пути ниже читаются как `kit/…` вместо `src/…`. Ручное подключение (пункты ниже) — для
сайта, который уже существует.

1. Скопируйте (не симлинком — сайт должен быть самостоятельным репозиторием) в проект сайта:
   - `src/css/tokens.css`, `src/css/components.css`
   - `src/js/cosmos.js`, `src/js/motion.js`
   - `src/fonts/` (все `.woff2` + `fonts.css`)
   - `src/icons/sprite.svg`
   - `src/scene/plate.webp` (только если используете фон-сцену)
2. В `<head>` — в этом порядке: `fonts.css` → `tokens.css` → `components.css` → свои стили сайта.
3. `<html data-theme="dark">` — тема фиксирована. Ступень излучения — `data-accent` там же (см. ниже).
4. Каркас страницы (всё есть в `components.css`, блоки «Фон-сцена», «Верхняя навигация», «Каркас»):
   ```html
   <div class="cosmos-wrap" id="cosmos-wrap" data-comp="right" aria-hidden="true">
     <canvas class="cosmos" id="cosmos"></canvas>
     <div class="cosmos-fallback"></div>
     <div class="grain"></div>
   </div>
   <header class="topbar" id="topbar">
     <a class="brand" href="/"><svg><use href="icons/sprite.svg#i-mark"/></svg>имя</a>
     <nav class="nav"><a href="#a" aria-current="page">Раздел</a><a href="#b">Раздел</a></nav>
     <div class="topbar-actions"><a class="btn small" href="#">Действие</a>
       <button class="icon-btn menu-btn" aria-label="Меню"><svg><use href="icons/sprite.svg#i-menu"/></svg></button></div>
   </header>
   <div class="site">
     <section class="hero" id="hero"><div class="hero-inner">
       <p class="kicker">кикер</p>
       <h1 class="display">Заголовок с одним <span class="lit">освещённым</span> словом.</h1>
       <p class="lead">Подзаголовок.</p>
       <div class="hero-actions"><a class="btn primary" href="#">Главное</a><a class="btn" href="#">Второе</a></div>
     </div></section>
     <section class="section" id="a"><div class="section-head"><p class="kicker">…</p><h2>…</h2><p>…</p></div>…</section>
     <footer class="site-footer">…</footer>
   </div>
   ```
   и в модуле:
   ```js
   import { createCosmos, attachSceneScroll } from './js/cosmos.js';
   import { attachButtons, attachPointerGlow, attachSwitches, attachChecks, attachDisclosures, attachCards } from './js/motion.js';
   const wrap = document.getElementById('cosmos-wrap');
   const api = createCosmos(document.getElementById('cosmos'),
     { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches });
   if (!api.ok) wrap.classList.add('fallback');
   new ResizeObserver(() => api.resize()).observe(wrap);
   attachSceneScroll(api, { hero: document.getElementById('hero'), wrap });   // живая → за горизонтом
   addEventListener('scroll', () => topbar.classList.toggle('solid', scrollY > 40), { passive: true });
   attachButtons(document);                                   // нажатие/подъём/фокус для всех кнопок кита
   attachPointerGlow(document);                               // по умолчанию '.field-body, [data-glow]' — 1–3 элемента на экран
   attachSwitches(document); attachChecks(document); attachDisclosures(document); attachCards(document);
   // диалоги — только через openDialog()/closeDialog(), тосты — pushToast(), числа — countTo()/odometer()
   ```
   Эталон подключения — `demo/demo.js` (`boot()`), живые образцы каждой анимации с параметрами — секция «Движение» в `demo/index.html` (`#motion`).
   Внутренние страницы (не главная): `<div class="cosmos-wrap asleep">` и `api.pause()` сразу после
   создания — сцена размыта и погашена с первого кадра, без анимации появления.
5. Композиция дыры — `data-comp` на `.cosmos-wrap`: `right` (текст слева, дыра справа — по умолчанию),
   `center` (одна фраза по центру над дырой; герою класс `.hero.axis`), `far` (маленькая дыра, короткий
   герой `.hero.short`). Другое положение — свои `--bh-x/--bh-y/--bh-r` на обёртке при `--bh-anchor: custom`.
   На телефоне все композиции сами становятся «текст сверху, дыра снизу».

