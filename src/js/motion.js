// cosmos-kit — motion.js: пружинная физика интерфейса + мелкие DOM-хелперы движения.
// Ядро (Spring, Motion, enter/exit, pressable, rubber, flip) перенесено без изменений из
// ~/projects/video-downloader/vydra/static/spring.js — оно уже было независимо от логики «выдры».
// Добавлены обобщённые хелперы, которые в «выдре» жили внутри app.js (не переносился целиком,
// т.к. завязан на конкретный интерфейс): attachPointerGlow, moveInk, attachSwipeToClose.
// Проход «кнопки» (см. CHANGELOG): attachButtons — нажатие/наведение/магнит/фокус одним вызовом,
// buttonState — состояния idle/busy/done без скачка ширины; moveInk теперь едет пружиной.
// pressable оставлен для совместимости — новым сайтам нужен attachButtons.

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).get('motion') === '0';
const FINE = matchMedia('(hover: hover) and (pointer: fine)');   // мышь/трекпад: есть hover, точный указатель

const active = new Set();
let raf = 0;
let last = 0;

function tick(now) {
  raf = 0;
  const dt = Math.min(0.048, Math.max(0.001, (now - last) / 1000));
  last = now;
  for (const s of active) s._step(dt);
  if (active.size) raf = requestAnimationFrame(tick);
}
function schedule(s) {
  active.add(s);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}

/** Пружина одного числа. */
export class Spring {
  /**
   * @param {object} o
   * @param {number} [o.response=0.42] период, с (меньше — резче)
   * @param {number} [o.damping=0.86] доля критического демпфирования (1 — без отскока)
   * @param {number} [o.value=0] стартовое значение
   * @param {number} [o.epsilon=0.001] порог покоя (в единицах значения)
   * @param {(v:number)=>void} [o.onUpdate]
   * @param {()=>void} [o.onRest]
   */
  constructor(o = {}) {
    this.response = o.response ?? 0.42;
    this.damping = o.damping ?? 0.86;
    this.value = o.value ?? 0;
    this.target = this.value;
    this.velocity = 0;
    this.epsilon = o.epsilon ?? 0.001;
    this.onUpdate = o.onUpdate || null;
    this.onRest = o.onRest || null;
    this._resolvers = [];
  }
  get moving() { return active.has(this); }
  /** Новая цель; текущая скорость сохраняется (или задаётся явно — velocity handoff после жеста). */
  set(target, { velocity, immediate } = {}) {
    if (velocity != null) this.velocity = velocity;
    this.target = target;
    if (immediate || REDUCED) { this.snap(target); return this; }
    if (Math.abs(this.value - target) < this.epsilon && Math.abs(this.velocity) < this.epsilon) { this._settle(); return this; }
    schedule(this);
    return this;
  }
  snap(v) {
    this.value = this.target = v; this.velocity = 0;
    active.delete(this);
    this.onUpdate?.(v);
    this._settle();
    return this;
  }
  /** Промис, который разрешается, когда пружина остановится. */
  get settled() { return active.has(this) ? new Promise((r) => this._resolvers.push(r)) : Promise.resolve(); }
  stop() { active.delete(this); this.velocity = 0; return this; }
  retune(response, damping) { if (response) this.response = response; if (damping != null) this.damping = damping; return this; }
  _settle() { const rs = this._resolvers; this._resolvers = []; rs.forEach((r) => r()); this.onRest?.(); }
  _step(dt) {
    const w = (2 * Math.PI) / this.response;
    const k = w * w, c = 2 * this.damping * w;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    const scale = Math.max(1, Math.abs(this.target) * 0.001);
    if (Math.abs(this.velocity) < this.epsilon * 12 * scale && Math.abs(this.value - this.target) < this.epsilon * scale) {
      this.value = this.target; this.velocity = 0;
      active.delete(this);
      this.onUpdate?.(this.value);
      this._settle();
      return;
    }
    this.onUpdate?.(this.value);
  }
}

/**
 * Набор пружин, пишущих в transform/opacity элемента. Все свойства — только transform/opacity/filter,
 * чтобы браузер не делал layout. Пример: springs.to({ x: 0, y: 0, s: 1, o: 1 }).
 */
export class Motion {
  constructor(el, { response = 0.42, damping = 0.86, origin } = {}) {
    this.el = el;
    this.props = {};
    this.defaults = { response, damping };
    this._dirty = false;
    this._blur = 0;
    if (origin) el.style.transformOrigin = origin;
  }
  _spring(name, init) {
    if (!this.props[name]) {
      const s = new Spring({ ...this.defaults, value: init, epsilon: name === 'o' || name === 's' || name === 'sx' || name === 'sy' ? 0.0015 : name === 'r' || name === 'rx' || name === 'ry' ? 0.02 : 0.05 });
      s.onUpdate = () => this._apply();
      this.props[name] = s;
    }
    return this.props[name];
  }
  /** Мгновенно выставить значения (без анимации). */
  from(values) {
    for (const [k, v] of Object.entries(values)) this._spring(k, v).snap(v);
    this._apply();
    return this;
  }
  /** Анимировать к значениям; opts.velocity — {x: px/s, ...}; opts.response/damping — переопределение. */
  to(values, opts = {}) {
    const ps = [];
    for (const [k, v] of Object.entries(values)) {
      const s = this._spring(k, k === 'o' || k === 's' || k === 'sx' || k === 'sy' ? 1 : 0);
      if (opts.response || opts.damping != null) s.retune(opts.response, opts.damping);
      s.set(v, { velocity: opts.velocity?.[k], immediate: opts.immediate });
      ps.push(s.settled);
    }
    return Promise.all(ps);
  }
  get(name) { return this.props[name]?.value ?? (name === 'o' || name === 's' ? 1 : 0); }
  velocity(name) { return this.props[name]?.velocity ?? 0; }
  stop() { for (const s of Object.values(this.props)) s.stop(); }
  _apply() {
    if (this._dirty) return;
    this._dirty = true;
    queueMicrotask(() => {
      this._dirty = false;
      const p = this.props, st = this.el.style;
      const x = p.x?.value ?? 0, y = p.y?.value ?? 0;
      const s = p.s?.value ?? 1, sx = p.sx?.value ?? 1, sy = p.sy?.value ?? 1;
      const r = p.r?.value ?? 0, rx = p.rx?.value ?? 0, ry = p.ry?.value ?? 0;
      const parts = [];
      if (rx || ry) parts.push('perspective(720px)');
      if (x || y) parts.push(`translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`);
      if (r) parts.push(`rotate(${r.toFixed(2)}deg)`);
      if (rx) parts.push(`rotateX(${rx.toFixed(2)}deg)`);
      if (ry) parts.push(`rotateY(${ry.toFixed(2)}deg)`);
      if (s !== 1 || sx !== 1 || sy !== 1) parts.push(`scale(${(s * sx).toFixed(4)}, ${(s * sy).toFixed(4)})`);
      st.transform = parts.length ? parts.join(' ') : '';
      if (p.o) st.opacity = String(Math.max(0, Math.min(1, p.o.value)));
      if (p.b) { const b = Math.max(0, p.b.value); st.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : ''; }
    });
  }
}

const motions = new WeakMap();
/** Единственный Motion на элемент — чтобы новые анимации подхватывали текущие скорости. */
export function motionOf(el, opts) {
  let m = motions.get(el);
  if (!m) { m = new Motion(el, opts); motions.set(el, m); }
  return m;
}

/** Появление: снизу, размытым, прозрачным → на место. */
export function enter(el, { dy = 14, dx = 0, scale = 0.96, blur = 8, delay = 0, response = 0.6, damping = 0.9 } = {}) {
  if (REDUCED) return Promise.resolve();
  const m = motionOf(el);
  m.from({ x: dx, y: dy, s: scale, o: 0, b: blur });
  const go = () => m.to({ x: 0, y: 0, s: 1, o: 1, b: 0 }, { response, damping });
  if (delay) return new Promise((r) => setTimeout(() => go().then(r), delay));
  return go();
}
/** Исчезновение: чуть вниз/вверх, размыть, растворить. */
export function exit(el, { dy = 8, dx = 0, scale = 0.97, blur = 6, response = 0.3, damping = 1 } = {}) {
  if (REDUCED) return Promise.resolve();
  const m = motionOf(el);
  return m.to({ x: dx, y: dy, s: scale, o: 0, b: blur }, { response, damping });
}

/** Нажатие, следующее за указателем: сразу вниз при pointerdown, пружиной обратно при отпускании.
    Пример: pressable(document, '.btn, .card, .chip-btn, .tab, .pills button', { scale: 0.97 }); */
export function pressable(root, selector, { scale = 0.97 } = {}) {
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest(selector);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (REDUCED) return;
    const m = motionOf(el);
    m.to({ s: scale }, { response: 0.12, damping: 1 });
    const up = () => {
      m.to({ s: 1 }, { response: 0.38, damping: 0.8 });
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('pointerleave', up);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  }, { passive: true });
}

/** Резиновое сопротивление за границей (как у списков в iOS). */
export function rubber(offset, limit = 120, coef = 0.55) {
  const s = Math.sign(offset), d = Math.abs(offset);
  return s * ((1 - 1 / (d * coef / limit + 1)) * limit);
}

/** FLIP на пружинах: снять позиции, поменять DOM, анимировать сдвиги; removed — уходящие элементы. */
export function flip(container, mutate, removed = [], { stagger = 32, response = 0.55, damping = 0.9 } = {}) {
  if (REDUCED) { removed.forEach((el) => el.remove()); mutate(); return; }
  const first = new Map();
  for (const el of container.children) first.set(el, el.getBoundingClientRect());
  const box = container.getBoundingClientRect();
  for (const el of removed) {
    const r = first.get(el) || el.getBoundingClientRect();
    Object.assign(el.style, {
      position: 'absolute', left: `${r.left - box.left}px`, top: `${r.top - box.top}px`,
      width: `${r.width}px`, height: `${r.height}px`, margin: '0', pointerEvents: 'none', zIndex: '0',
    });
    container.append(el);
    exit(el, { dy: 0, scale: 0.94 }).then(() => el.remove());
  }
  mutate();
  let i = 0;
  for (const el of container.children) {
    if (removed.includes(el)) continue;
    const f = first.get(el);
    const l = el.getBoundingClientRect();
    const m = motionOf(el);
    if (!f) { enter(el, { delay: Math.min(i++, 8) * stagger }); continue; }
    const dx = f.left - l.left, dy = f.top - l.top;
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      m.from({ x: m.get('x') + dx, y: m.get('y') + dy });
      m.to({ x: 0, y: 0 }, { response, damping });
    }
  }
}

// ---------------------------------------------------------------------------
// Хелперы уровня страницы (в «выдре» жили внутри app.js, здесь обобщены)
// ---------------------------------------------------------------------------

/** Свет курсора по кайме/поверхности .field-body (components.css): следит за указателем и
    выставляет --mx/--my на ближайшем предке, matching selector (по умолчанию — .glass, .field-body).
    Один слушатель на весь документ, throttled через rAF. */
export function attachPointerGlow(root = document, selector = '.glass, .field-body') {
  let ev = null, ticking = 0;
  root.addEventListener('pointermove', (e) => {
    ev = e;
    if (ticking) return;
    ticking = requestAnimationFrame(() => {
      ticking = 0;
      const el = ev.target.closest?.(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((ev.clientX - r.left) / r.width * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${((ev.clientY - r.top) / r.height * 100).toFixed(1)}%`);
    });
  }, { passive: true });
}

/** Двигает плашку .tab-ink/.pill-ink/.nav-ink/.tree-ink под активным элементом группы (сегментированный
    переключатель, вкладки, ссылки навигации, текущая строка дерева) — «капля»: у плашки две кромки на своих пружинах,
    ведущая (по ходу движения) быстрее (response .26), ведомая — медленнее (.42), поэтому плашка сначала растягивается
    к цели, потом подтягивает хвост. Пишет --x/--w (axis 'x') или --y/--h (axis 'y', по умолчанию для .tree-ink).
    Первый вызов и { immediate: true } (например, на resize) — без анимации. Вызывайте при смене активного пункта и на resize. */
const inks = new WeakMap();
export function moveInk(group, activeEl, ink = group.querySelector('.pill-ink, .tab-ink, .nav-ink, .tree-ink'), { immediate = false, axis } = {}) {
  if (!ink || !activeEl) return;
  axis ||= ink.classList.contains('tree-ink') ? 'y' : 'x';
  const gb = group.getBoundingClientRect(), ab = activeEl.getBoundingClientRect();
  const a = axis === 'x' ? ab.left - gb.left + group.scrollLeft : ab.top - gb.top + group.scrollTop;
  const b = a + (axis === 'x' ? ab.width : ab.height);
  let st = inks.get(ink);
  const write = () => {
    const lo = Math.min(st.a.value, st.b.value), len = Math.abs(st.b.value - st.a.value);
    if (axis === 'x') { ink.style.setProperty('--x', `${lo.toFixed(1)}px`); ink.style.setProperty('--w', `${len.toFixed(1)}px`); }
    else { ink.style.setProperty('--y', `${lo.toFixed(1)}px`); ink.style.setProperty('--h', `${len.toFixed(1)}px`); }
  };
  if (!st) {
    st = { a: new Spring({ value: a, epsilon: 0.05 }), b: new Spring({ value: b, epsilon: 0.05 }) };
    st.a.onUpdate = st.b.onUpdate = write;
    inks.set(ink, st);
    immediate = true;
  }
  const forward = b > st.b.target;                      // вперёд: ведущая кромка — дальняя (b), назад — ближняя (a)
  st.a.retune(forward ? 0.42 : 0.26, forward ? 0.8 : 0.84);
  st.b.retune(forward ? 0.26 : 0.42, forward ? 0.84 : 0.8);
  st.a.set(a, { immediate }); st.b.set(b, { immediate });
  if (immediate) write();
}

/** Переключатель .switch: ползунок — «капля»: при смене сразу растягивается по ходу (sx 1.45) и пружиной доезжает,
    собираясь в исходную форму (response .36, damping .66 — один мягкий перелёт). Пока палец на переключателе, ползунок
    чуть шире (sx 1.2). Положение считается из размеров дорожки, CSS-правило translateX остаётся запасным без JS. */
export function attachSwitches(root = document, selector = '.switch') {
  const travel = (sw) => { const t = sw.querySelector('.switch-track'), th = sw.querySelector('.switch-thumb'); return t && th ? t.clientWidth - th.offsetWidth - 2 * th.offsetLeft : 14; };
  const sync = (sw, animate) => {
    const inp = sw.querySelector('input'), th = sw.querySelector('.switch-thumb');
    if (!inp || !th) return;
    const x = inp.checked ? travel(sw) : 0;
    const m = motionOf(th);
    if (!animate || REDUCED) { m.from({ x, sx: 1 }); return; }
    m.from({ sx: 1.45 });
    m.to({ x, sx: 1 }, { response: 0.36, damping: 0.66 });
  };
  root.querySelectorAll(selector).forEach((sw) => sync(sw, false));
  root.addEventListener('change', (e) => { const sw = e.target.closest?.(selector); if (sw) sync(sw, true); });
  root.addEventListener('pointerdown', (e) => {
    const sw = e.target.closest?.(selector); if (!sw || REDUCED) return;
    const th = sw.querySelector('.switch-thumb'); motionOf(th).to({ sx: 1.2 }, { response: 0.16, damping: 1 });
    const up = () => { motionOf(th).to({ sx: 1 }, { response: 0.3, damping: 0.7 }); sw.removeEventListener('pointerup', up); sw.removeEventListener('pointercancel', up); sw.removeEventListener('pointerleave', up); };
    sw.addEventListener('pointerup', up); sw.addEventListener('pointercancel', up); sw.addEventListener('pointerleave', up);
  }, { passive: true });
  addEventListener('resize', () => root.querySelectorAll(selector).forEach((sw) => sync(sw, false)));
}

/** Чекбокс .check и радио .radio: включение — «хлопок» коробки (0.85 → 1, damping .55) и галочка рисует себя (CSS);
    у радио точка вырастает из нуля с перелётом (damping .5), у соседей по группе — сжимается. Реальные input остаются
    в разметке — клавиатура и формы работают без JS. */
export function attachChecks(root = document, { check = '.check', radio = '.radio' } = {}) {
  const dotOf = (r) => r.querySelector('.radio-dot i');
  const syncRadio = (r, animate) => {
    const inp = r.querySelector('input'), dot = dotOf(r);
    if (!inp || !dot) return;
    const m = motionOf(dot);
    if (!animate || REDUCED) { m.from({ s: inp.checked ? 1 : 0 }); return; }
    if (inp.checked) { m.from({ s: 0 }); m.to({ s: 1 }, { response: 0.42, damping: 0.5 }); }
    else m.to({ s: 0 }, { response: 0.25, damping: 1 });
  };
  root.querySelectorAll(radio).forEach((r) => syncRadio(r, false));
  root.addEventListener('change', (e) => {
    const c = e.target.closest?.(check);
    if (c && !REDUCED) { const box = c.querySelector('.check-box'); motionOf(box).from({ s: 0.85 }); motionOf(box).to({ s: 1 }, { response: 0.36, damping: 0.55 }); }
    const r = e.target.closest?.(radio);
    if (r) { const inp = r.querySelector('input'); const all = inp.name ? root.querySelectorAll(`input[type="radio"][name="${CSS.escape(inp.name)}"]`) : [inp]; all.forEach((i) => syncRadio(i.closest(radio), true)); }
  });
}

/** Раскрытие .disclosure: кнопка-заголовок [aria-expanded] + тело на grid-template-rows 0fr → 1fr (CSS, --t-base);
    шеврон поворачивается пружиной (damping .6), содержимое въезжает сверху (enter, dy −8). */
export function attachDisclosures(root = document, selector = '.disclosure') {
  root.addEventListener('click', (e) => {
    const head = e.target.closest?.(`${selector} > .disclosure-head`); if (!head) return;
    const d = head.parentElement, open = !d.classList.contains('is-open');
    d.classList.toggle('is-open', open); head.setAttribute('aria-expanded', String(open));
    const chev = head.querySelector('.disclosure-chev'); if (chev) motionOf(chev).to({ r: open ? 90 : 0 }, { response: 0.42, damping: 0.6 });
    const inner = d.querySelector('.disclosure-inner');
    if (inner) { if (open) enter(inner, { dy: -8, scale: 1, blur: 0, response: 0.5, damping: 0.8 }); else exit(inner, { dy: -6, scale: 1, blur: 0, response: 0.24 }); }
  });
}

/** Карточки: наклон к курсору (rotateX/Y до 4°, response .35) и подъём 1.015 — только мышь; свет по поверхности
    (--mx/--my) ставит attachPointerGlow, если в его селекторе есть .card. На сенсоре и при reduced — ничего. */
export function attachCards(root = document, selector = '.card:not(.static)', { tilt = 4 } = {}) {
  if (!FINE.matches || REDUCED) return;
  let cur = null, raf = 0, ev = null;
  root.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.(selector); if (!el || el === cur || e.pointerType !== 'mouse') return;
    cur = el; motionOf(el).to({ s: 1.015 }, { response: 0.4, damping: 0.75 });
    const out = (o) => { if (el.contains(o.relatedTarget)) return; cur = null; motionOf(el).to({ s: 1, rx: 0, ry: 0 }, { response: 0.5, damping: 0.7 }); el.removeEventListener('pointerout', out); };
    el.addEventListener('pointerout', out);
  }, { passive: true });
  root.addEventListener('pointermove', (e) => {
    if (!cur) return; ev = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0; const el = cur; if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width - 0.5, py = (ev.clientY - r.top) / r.height - 0.5;
      motionOf(el).to({ rx: -py * tilt * 2, ry: px * tilt * 2 }, { response: 0.35, damping: 0.8 });
    });
  }, { passive: true });
}

/** Диалоги: открытие — плита въезжает (модалка снизу на 18px из 0.96, шторка — сбоку на 40px; на телефоне снизу),
    закрытие — уходит тем же путём и только потом dialog.close(). Esc ведёт себя так же. */
export function openDialog(dlg) {
  const box = dlg.querySelector('.modal-box, .drawer-box');
  dlg.showModal();
  if (!box) return;
  const drawer = box.classList.contains('drawer-box'), phone = matchMedia('(max-width: 680px)').matches;
  enter(box, drawer ? { dy: phone ? 48 : 0, dx: phone ? 0 : 40, scale: 1, blur: 0, response: 0.5, damping: 0.82 } : { dy: 18, scale: 0.96, blur: 6, response: 0.48, damping: 0.78 });
  if (!dlg._cosmosCancel) { dlg._cosmosCancel = true; dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(dlg); }); }
}
export function closeDialog(dlg) {
  const box = dlg.querySelector('.modal-box, .drawer-box');
  if (!box || REDUCED) { dlg.close(); return Promise.resolve(); }
  const drawer = box.classList.contains('drawer-box'), phone = matchMedia('(max-width: 680px)').matches;
  dlg.classList.add('closing');
  return exit(box, drawer ? { dy: phone ? 60 : 0, dx: phone ? 0 : 40, scale: 1, blur: 0, response: 0.3 } : { dy: 10, scale: 0.97, blur: 4, response: 0.28 })
    .then(() => { dlg.close(); dlg.classList.remove('closing'); motionOf(box).from({ x: 0, y: 0, s: 1, o: 1, b: 0 }); });
}

/** Тост: появляется снизу (enter, dy 20), уходит вниз растворяясь (exit) и только потом удаляется.
    tone: 'ok' | 'err' | 'warn' | ''. Возвращает элемент; dismissToast(el) — убрать раньше срока. */
const TOAST_ICON = { ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', err: '<path d="M12 8v5m0 3.5v.5M4.6 19h14.8a1 1 0 0 0 .87-1.5l-7.4-12.8a1 1 0 0 0-1.74 0L3.73 17.5A1 1 0 0 0 4.6 19z"/>', warn: '<path d="M12 8v5m0 3.5v.5"/><circle cx="12" cy="12" r="9"/>' };
export function pushToast(container, { tone = '', text = '', ttl = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.innerHTML = `${TOAST_ICON[tone] ? `<span class="ti"><svg viewBox="0 0 24 24">${TOAST_ICON[tone]}</svg></span>` : ''}<span class="tt"></span>`;
  el.querySelector('.tt').textContent = text;
  container.append(el);
  enter(el, { dy: 20, response: 0.5, damping: 0.78 });
  if (ttl > 0) el._toastTimer = setTimeout(() => dismissToast(el), ttl);
  return el;
}
export function dismissToast(el) {
  clearTimeout(el._toastTimer);
  return exit(el, { dy: 12, scale: 0.97, blur: 4, response: 0.3 }).then(() => el.remove());
}

/** Числа. countTo — значение едет пружиной без перелёта (damping 1, response 1.2 с: медленный старт, долгий выбег),
    пишет textContent через format. odometer — «барабан»: каждая цифра — колонка 0–9 на translateY, едет пружиной
    с лёгким перелётом (damping .78); ширина колонки фиксирована (tabular-nums), скачков нет. */
const counters = new WeakMap();
export function countTo(el, value, { response = 1.2, damping = 1, format = (v) => Math.round(v).toLocaleString('ru-RU') } = {}) {
  let sp = counters.get(el);
  if (!sp) { sp = new Spring({ value: parseFloat(el.dataset.from ?? '0') || 0, epsilon: 0.01, onUpdate: (v) => { el.textContent = format(v); } }); counters.set(el, sp); }
  sp.retune(response, damping);
  sp.set(value, { immediate: REDUCED });
  return sp.settled;
}
export function odometer(el, value, { digits, response = 0.55, damping = 0.78 } = {}) {
  const str = String(Math.max(0, Math.round(value)));
  const n = Math.max(digits || 0, str.length, el.querySelectorAll('.odo-digit').length);
  const padded = str.padStart(n, '0');
  while (el.querySelectorAll('.odo-digit').length < n) {
    const d = document.createElement('span'); d.className = 'odo-digit';
    d.innerHTML = `<span class="odo-col">${'0123456789'.split('').map((c) => `<i>${c}</i>`).join('')}</span>`;
    el.prepend(d);
  }
  el.querySelectorAll('.odo-digit').forEach((d, i) => {
    const col = d.querySelector('.odo-col'), h = d.clientHeight || parseFloat(getComputedStyle(d).height);
    const target = -parseInt(padded[i], 10) * h;
    motionOf(col).to({ y: target }, { response: response + i * 0.03, damping, immediate: REDUCED });
  });
  el.setAttribute('aria-label', str);
}

// ---------------------------------------------------------------------------
// Кнопки: нажатие, наведение, магнит, фокус, состояния — один вызов attachButtons() на страницу
// ---------------------------------------------------------------------------

const btnState = new WeakMap();   // el → { pressed, hovered, press, lift }

/** Целевой масштаб элемента из его состояния: нажат → press-масштаб, наведён → подъём, иначе 1. */
function applyScale(el, opts = {}) {
  const st = btnState.get(el);
  if (!st || REDUCED) return;
  const m = motionOf(el);
  if (st.pressed) m.to({ s: st.press }, { response: 0.09, damping: 1 });                  // вниз — мгновенно (≈120 мс), без отскока
  else if (st.hovered && FINE.matches) m.to({ s: st.lift }, { response: 0.34, damping: 0.72, ...opts });   // подъём — мягко
  else m.to({ s: 1 }, { response: 0.36, damping: opts.cancel ? 1 : 0.68, ...opts });      // отпускание — один лёгкий перелёт
}

/**
 * Единая механика кнопок кита. Селекторы — по умолчанию на классы components.css, переопределяйте при нужде.
 *   press    — что нажимается (масштаб .97; small — .90 для иконок и мелкого; soft — .985 для крупных плит); вниз response .09
 *   lift     — что чуть приподнимается при наведении (scale 1.02; small — 1.06)
 *   magnetic — что тянется к курсору (только мышь, до 6px, сила .18): только явный opt-in [data-magnetic].
 *              Главное действие (.btn.primary, .go-btn) за курсором НЕ двигается — решение пользователя: раскалённая
 *              кнопка стоит на месте, к ней идут, а не она к курсору. Магнит — для второстепенных крупных плит,
 *              если он там вообще нужен.
 * Клавиатура: Space/Enter нажимают так же, как палец; фокус с клавиатуры — короткий «вдох» (1.06 → 1).
 * Сенсор: без подъёма и магнита (нет hover); нажатие — то же. prefers-reduced-motion: всё снимается.
 */
export function attachButtons(root = document, {
  press = '.btn, .chip-btn, .icon-btn, .tab, .pills button, .card:not(.static), .crumb, .text-btn, .pager-btn, .nav a, .ghost-btn, .switch, .swatch',
  small = '.icon-btn, .pager-btn, .crumb, .tnode',
  soft = '.go-btn, .field-body, .card',
  lift = '.btn, .chip-btn, .go-btn, .icon-btn, .swatch',
  magnetic = '[data-magnetic]',
  magnetStrength = 0.18, magnetMax = 6,
} = {}) {
  const stateOf = (el) => {
    let st = btnState.get(el);
    if (!st) {
      const isSmall = el.matches(small), isSoft = el.matches(soft);
      st = { pressed: false, hovered: false, press: isSoft ? 0.985 : isSmall ? 0.90 : 0.97, lift: el.matches(lift) ? (isSmall ? 1.06 : 1.02) : 1 };
      btnState.set(el, st);
    }
    return st;
  };
  const target = (e, sel) => { const el = e.target.closest?.(`${sel}, ${press}`); return el && el.matches(sel) ? el : null; };
  const usable = (el) => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';

  // нажатие: сразу вниз при pointerdown; отпускание — пружиной с перелётом; увод указателя — отмена без перелёта
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || REDUCED) return;
    const el = e.target.closest(press);
    if (!usable(el)) return;
    const st = stateOf(el); st.pressed = true; applyScale(el);
    const up = (ev) => {
      st.pressed = false; applyScale(el, ev.type === 'pointerleave' || ev.type === 'pointercancel' ? { cancel: true } : {});
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('pointerleave', up);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  }, { passive: true });

  // клавиатура: Space/Enter — то же нажатие
  root.addEventListener('keydown', (e) => {
    if (REDUCED || e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
    const el = e.target.closest?.(press);
    if (!usable(el)) return;
    const st = stateOf(el); st.pressed = true; applyScale(el);
    const up = () => { st.pressed = false; applyScale(el); el.removeEventListener('keyup', up); el.removeEventListener('blur', up); };
    el.addEventListener('keyup', up); el.addEventListener('blur', up);
  });
  // фокус с клавиатуры — короткий вдох
  root.addEventListener('focusin', (e) => {
    if (REDUCED) return;
    const el = e.target.closest?.(press);
    if (!usable(el) || !el.matches(':focus-visible')) return;
    stateOf(el);
    motionOf(el).from({ s: 1.06 }); applyScale(el, { response: 0.45, damping: 0.6 });
  });

  // наведение (только мышь): подъём и магнит
  if (FINE.matches) {
    let magnetEl = null;
    root.addEventListener('pointerover', (e) => {
      if (REDUCED || e.pointerType !== 'mouse') return;
      const el = e.target.closest(press);
      if (!usable(el)) return;
      const st = stateOf(el);
      if (st.hovered) return;
      st.hovered = true; applyScale(el);
      if (el.matches(magnetic)) magnetEl = el;
      const out = (ev) => {
        if (el.contains(ev.relatedTarget)) return;
        st.hovered = false; applyScale(el);
        if (magnetEl === el) { magnetEl = null; motionOf(el).to({ x: 0, y: 0 }, { response: 0.5, damping: 0.62 }); }
        el.removeEventListener('pointerout', out);
      };
      el.addEventListener('pointerout', out);
    }, { passive: true });
    let mvRaf = 0, mvEv = null;
    root.addEventListener('pointermove', (e) => {
      if (!magnetEl) return;
      mvEv = e;
      if (mvRaf) return;
      mvRaf = requestAnimationFrame(() => {
        mvRaf = 0;
        const el = magnetEl; if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = (mvEv.clientX - (r.left + r.width / 2)) * magnetStrength, dy = (mvEv.clientY - (r.top + r.height / 2)) * magnetStrength;
        const cl = (v) => Math.max(-magnetMax, Math.min(magnetMax, v));
        motionOf(el).to({ x: cl(dx), y: cl(dy) }, { response: 0.4, damping: 0.8 });
      });
    }, { passive: true });
  }
}

/** Состояние кнопки без скачка ширины: 'idle' | 'busy' | 'done'. Подпись остаётся в потоке (ширина заперта
    min-width), поверх неё — спиннер или галочка, которая рисует себя. Возвращает промис окончания перехода.
    Разметка: <button class="btn"><span class="btn-label">Текст</span></button> (обёртка создаётся сама). */
export function buttonState(el, state = 'idle') {
  let label = el.querySelector(':scope > .btn-label');
  if (!label) { label = document.createElement('span'); label.className = 'btn-label'; label.append(...el.childNodes); el.append(label); }
  let fx = el.querySelector(':scope > .btn-fx');
  if (!fx) {
    fx = document.createElement('span'); fx.className = 'btn-fx'; fx.setAttribute('aria-hidden', 'true');
    fx.innerHTML = '<span class="btn-spin"></span><svg class="btn-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    el.append(fx);
  }
  const lm = motionOf(label), fm = motionOf(fx);
  el.dataset.state = state;
  if (state === 'idle') {
    el.removeAttribute('aria-busy'); el.classList.remove('is-busy', 'is-done'); el.style.minWidth = '';
    fm.to({ o: 0, s: 0.8 }, { response: 0.3, damping: 1 });
    return lm.to({ o: 1, y: 0, s: 1 }, { response: 0.45, damping: 0.72 });
  }
  el.style.minWidth = `${el.getBoundingClientRect().width}px`;
  if (state === 'busy') {
    el.setAttribute('aria-busy', 'true'); el.classList.add('is-busy'); el.classList.remove('is-done');
    lm.to({ o: 0, y: -6, s: 0.92 }, { response: 0.3, damping: 1 });
    fm.from({ s: 0.8 });
    return fm.to({ o: 1, s: 1 }, { response: 0.4, damping: 0.72 });
  }
  el.classList.remove('is-busy'); el.classList.add('is-done'); el.removeAttribute('aria-busy');
  lm.to({ o: 0, y: -6, s: 0.92 }, { response: 0.3, damping: 1 });
  fm.from({ s: 0.8 });
  return fm.to({ o: 1, s: 1 }, { response: 0.4, damping: 0.6 });
}

/** Смахивание вниз закрывает диалог-шторку (телефон): тянем за .grab, отпускание с достаточной
    скоростью/дистанцией закрывает диалог пружиной, иначе — пружиной возвращаем на место. */
export function attachSwipeToClose(dialogEl, { handleSelector = '.grab', boxSelector = '.drawer-box, .modal-box' } = {}) {
  const handle = dialogEl.querySelector(handleSelector);
  const box = dialogEl.querySelector(boxSelector);
  if (!handle || !box) return;
  let startY = 0, lastY = 0, lastT = 0, v = 0, dragging = false;
  const isPhone = () => matchMedia('(max-width: 680px)').matches;
  handle.addEventListener('pointerdown', (e) => {
    if (!isPhone() || e.target.closest('button')) return;
    dragging = true; startY = lastY = e.clientY; lastT = performance.now(); v = 0;
    motionOf(box).stop(); handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY, now = performance.now();
    v = ((e.clientY - lastY) / Math.max(1, now - lastT)) * 1000 * 0.5 + v * 0.5;
    lastY = e.clientY; lastT = now;
    motionOf(box).from({ y: dy > 0 ? dy : rubber(dy, 80) });
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    const dy = lastY - startY;
    if (dy > 110 || v > 600) {
      motionOf(box).to({ y: window.innerHeight }, { response: 0.42, damping: 0.9, velocity: { y: v } })
        .then(() => { dialogEl.close(); motionOf(box).from({ y: 0 }); });
      return;
    }
    motionOf(box).to({ y: 0 }, { response: 0.5, damping: 0.8, velocity: { y: v } });
  };
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);
}

export { REDUCED };
