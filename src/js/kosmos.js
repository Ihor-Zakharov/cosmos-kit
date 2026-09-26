// cosmos-kit — kosmos.js: движение трёх компонентов по мотивам KOCMOC (см. css/kosmos.css). Всё на пружинах motion.js,
// только transform и opacity; при prefers-reduced-motion — мгновенно или неподвижно.
import { Spring, motionOf, REDUCED } from './motion.js';

/** Пульс «в такт»: из центра host расходится кольцо (.pulse-ring): масштаб .6 → 2.4 пружиной без перелёта
    (response .9, damping 1), прозрачность гаснет к концу (response 1.0). Ядро (.beat-dot/.glyph) вздрагивает
    (1.18 → 1, damping .55). Несколько вызовов подряд — несколько колец, каждое живёт ≈ 1 с. Для «живых» индикаторов,
    прихода события, такта; не для декора по таймеру без смысла. */
export function pulse(host, { scale = 2.4, kick = 1.18 } = {}) {
  if (REDUCED) return;
  const ring = document.createElement('span');
  ring.className = 'pulse-ring';
  host.append(ring);
  const m = motionOf(ring);
  m.from({ s: 0.6, o: 1 });
  m.to({ s: scale }, { response: 0.9, damping: 1 });
  m.to({ o: 0 }, { response: 1.0, damping: 1 }).then(() => ring.remove());
  const core = host.querySelector('.beat-dot, .glyph');
  if (core) { motionOf(core).from({ s: kick }); motionOf(core).to({ s: 1 }, { response: 0.5, damping: 0.55 }); }
}

/** Кольцо-индикатор .hud-ring: --p едет пружиной (response .9, damping .9) — дуга догоняет значение с едва заметным
    перелётом; число внутри — барабан (motion.js: odometer), передайте его через odo. */
const ringSprings = new WeakMap();
export function hudRing(el, p, { odo } = {}) {
  let sp = ringSprings.get(el);
  if (!sp) { sp = new Spring({ value: 0, epsilon: 0.0005, onUpdate: (v) => el.style.setProperty('--p', v.toFixed(4)) }); sp.retune(0.9, 0.9); ringSprings.set(el, sp); }
  sp.set(Math.max(0, Math.min(1, p)), { immediate: REDUCED });
  if (odo) odo(Math.round(p * 100));
}

/** Терминальный список .hud-list: строки печатаются по очереди — каждая въезжает слева (x −8 → 0, o 0 → 1,
    response .4) с шагом 70 мс; вызывать при появлении HUD на экране. */
export function hudType(list, { stagger = 70 } = {}) {
  const rows = [...list.querySelectorAll('div')];
  rows.forEach((row, i) => {
    row.classList.add('typing');
    const m = motionOf(row);
    if (REDUCED) { row.classList.remove('typing'); m.from({ x: 0, o: 1 }); return; }
    m.from({ x: -8, o: 0 });
    setTimeout(() => { row.classList.remove('typing'); m.to({ x: 0, o: 1 }, { response: 0.4, damping: 0.85 }); }, i * stagger);
  });
}
