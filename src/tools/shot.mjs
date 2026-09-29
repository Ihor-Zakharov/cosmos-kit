#!/usr/bin/env node
/**
 * cosmos-shot — браузерная проверка сайта на cosmos-kit: то, что видно только в живой странице.
 * Без зависимостей: Node ≥ 22 (встроенный WebSocket) + любой Chrome/Chromium/Edge (из WSL — Windows Chrome).
 *
 *   node kit/tools/shot.mjs                      все страницы (cosmos.json "pages" или *.html в корне), ширины 1440 и 390
 *   node kit/tools/shot.mjs index.html --w 390   одна страница, одна ширина
 *   node kit/tools/shot.mjs --base http://127.0.0.1:8790/ --pages /      уже запущенное приложение
 *   node kit/tools/shot.mjs --full               ещё и снимок всей страницы (<страница>-<ширина>-full.png)
 * Страницы отдаёт сам (встроенный статический сервер) или командой из cosmos.json "serve" ("… --port {port}").
 * Снимки — .cosmos/shots/<страница>-<ширина>.png (только первый экран: дёшево смотреть модели).
 * Выход: 0 — ошибок нет, 1 — есть, 3 — браузер не найден (проверка пропущена).
 *
 * Коды: B1 ошибка в консоли/исключение · B2 горизонтальная прокрутка · B3 файл не загрузился (4xx/5xx, сбой)
 *       B4 больше одного раскалённого действия на экране · B5 <h1> не один · B6 цель нажатия < 24px (телефон)
 *       B7 текст мельче 12px (моно — 11px) · B8 битая картинка · B9 пустая таблица/список без .empty
 *       B10 (после «применить») пропали записи или текст по сравнению с эталоном .cosmos/baseline.json
 */
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { join, dirname, extname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer as netServer } from 'node:net';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findRoot(d) { for (let x = resolve(d); ; x = dirname(x)) { if (existsSync(join(x, 'cosmos.json'))) return x; if (dirname(x) === x) return resolve(d); } }
const ROOT = findRoot(process.cwd());
let CFG = {};
try { CFG = JSON.parse(readFileSync(join(ROOT, 'cosmos.json'), 'utf8')); } catch {}
const OUT = join(ROOT, '.cosmos', 'shots');
// эталон «до кита» (cosmos.py init в режиме «применить» снимает его: --baseline); done сравнивает с ним (B10)
let BASE = null; const BASE_OUT = {};
try { if (!argv.includes('--baseline')) BASE = JSON.parse(readFileSync(join(ROOT, '.cosmos', 'baseline.json'), 'utf8')); } catch {}
const WIDTHS = (opt('--w') || '1440,390').split(',').map(Number);

if (typeof WebSocket === 'undefined') { console.log('· B0  нужен Node ≥ 22 (встроенный WebSocket) — браузерная проверка пропущена'); process.exit(3); }

// ---------------- браузер ----------------
const WSL = existsSync('/proc/version') && /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
function which(cmd) { try { return execSync(`command -v ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } }
function browsers() {
  const c = [];
  if (process.env.COSMOS_CHROME) c.push(process.env.COSMOS_CHROME);
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) { const p = which(n); if (p) c.push(p); }
  c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  // Chromium от playwright — раньше Windows Chrome: локальный быстрее и без портов Windows (нужны libnss3/libnspr4 — setup --tools)
  const pw = join(process.env.HOME || '', '.cache/ms-playwright');
  if (existsSync(pw)) for (const d of readdirSync(pw).sort().reverse()) for (const b of ['chrome-linux64/chrome', 'chrome-linux/chrome']) c.push(join(pw, d, b));
  if (WSL || process.platform === 'win32') {
    const pre = process.platform === 'win32' ? 'C:' : '/mnt/c';
    c.push(`${pre}/Program Files/Google/Chrome/Application/chrome.exe`, `${pre}/Program Files (x86)/Google/Chrome/Application/chrome.exe`,
      `${pre}/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, `${pre}/Program Files/Microsoft/Edge/Application/msedge.exe`);
  }
  return [...new Set(c)].filter((p) => existsSync(p));
}
const freePort = () => new Promise((r) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
// порт отладки браузера — из 9300–9399: высокие порты Windows часто резервирует (Hyper-V), и Chrome из WSL их не займёт
const tryPort = (p) => new Promise((r) => { const s = netServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });
// занятость проверяем и со стороны Windows: порт, который держит чужой Chrome на Windows, из WSL может выглядеть свободным
const answers = async (p) => { try { await getJSON(`http://127.0.0.1:${p}/json/version`, 400); return true; } catch { return false; } };   // таймаут соединения — порт свободен
// для Windows-браузера порт не «пробуем занять»: в зеркальной сети WSL такая проба на время запирает порт и для Windows
async function debugPort(win) { for (let p = 9300 + Math.floor(Math.random() * 50); p < 9400; p++) if ((win || await tryPort(p)) && !(await answers(p))) return p; return freePort(); }
// kill() из WSL гасит только обёртку interop, сам chrome.exe остаётся: закрываем по имени своего профиля
function killWin(profile) {
  if (!WSL) return;
  const tag = profile.split('\\').pop();
  try { execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='chrome.exe' or name='msedge.exe'\\" | Where-Object { $_.CommandLine -match '${tag}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
    { cwd: '/mnt/c', stdio: 'ignore', timeout: 15000 }); } catch {}
}
async function getJSON(url, ms = 1500) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await (await fetch(url, { signal: c.signal })).json(); } finally { clearTimeout(t); } }

async function launch() {
  for (const exe of browsers()) {
    const win = exe.endsWith('.exe');
    const port = await debugPort(win);
    let profile = join(tmpdir(), `cosmos-shot-${port}`);
    if (win && WSL) { try { profile = execSync('cmd.exe /c echo %TEMP%', { cwd: '/mnt/c', stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + `\\cosmos-shot-${port}`; } catch { continue; } }
    const args = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--mute-audio', '--disable-extensions', '--force-color-profile=srgb', ...(win ? [] : ['--no-sandbox']), 'about:blank'];
    const proc = spawn(exe, args, { stdio: 'ignore', cwd: win && WSL ? '/mnt/c' : undefined, detached: false });
    let dead = false; proc.on('exit', () => { dead = true; }); proc.on('error', () => { dead = true; });
    for (let i = 0; i < 40 && !dead; i++) {
      try { const v = await getJSON(`http://127.0.0.1:${port}/json/version`, 800); if (v.webSocketDebuggerUrl) return { proc, port, exe, profile, win, ws: v.webSocketDebuggerUrl }; } catch {}
      await sleep(250);
    }
    try { proc.kill(); } catch {}
    if (win) killWin(profile);
  }
  return null;
}

class CDP {
  constructor(url) { this.id = 0; this.wait = new Map(); this.on = new Map(); this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data);
      if (m.id && this.wait.has(m.id)) { const { ok, no } = this.wait.get(m.id); this.wait.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); }
      else if (m.method) (this.on.get(m.method) || []).forEach((f) => f(m.params, m.sessionId)); };
    this.ready = new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}, sessionId) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((ok, no) => { this.wait.set(id, { ok, no }); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); no(new Error('timeout ' + method)); } }, 30000); }); }
  listen(ev, f) { if (!this.on.has(ev)) this.on.set(ev, []); this.on.get(ev).push(f); }
}

// ---------------- страницы ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.bin': 'application/octet-stream', '.mp4': 'video/mp4', '.webm': 'video/webm' };
async function staticServer() {
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}/`, stop: () => srv.close() };
}
async function appServer(cmd) {
  const port = await freePort();
  const proc = spawn(cmd.replaceAll('{port}', String(port)), { shell: true, cwd: ROOT, stdio: 'ignore', env: { ...process.env, COSMOS_SHOT: '1' } });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 80; i++) { try { const r = await fetch(base); if (r.status < 500) return { base, stop: () => { try { process.kill(-proc.pid); } catch {} try { proc.kill(); } catch {} } }; } catch {} await sleep(250); }
  try { proc.kill(); } catch {}
  throw new Error(`приложение не поднялось: ${cmd}`);
}
function pageList() {
  if (pos.length) return pos;
  if (opt('--pages')) return opt('--pages').split(',');
  if (Array.isArray(CFG.pages) && CFG.pages.length) return CFG.pages;
  return readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
}

// аудит в странице: всё считаем по живому DOM
const AUDIT = `(() => {
  const vw = innerWidth, vh = innerHeight, vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0 && !el.closest('dialog:not([open])'); };
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) return s + '#' + el.id; if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.'); return s; };
  const path = (el) => { const p = []; for (let x = el; x && x !== document.body && p.length < 3; x = x.parentElement) p.unshift(sel(x)); return p.join(' > '); };
  const over = document.documentElement.scrollWidth - vw;
  const wide = []; if (over > 1) for (const el of document.body.querySelectorAll('*')) { const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width <= vw * 2 && vis(el) && !el.closest('.cosmos-wrap') && ![...el.children].some((c) => c.getBoundingClientRect().right > vw + 1)) { wide.push(path(el) + ' (+' + Math.round(r.right - vw) + 'px)'); if (wide.length > 2) break; } }
  const h1 = [...document.querySelectorAll('h1')].filter(vis).length;
  const prim = [...document.querySelectorAll('.btn.primary, .go-btn')].filter(vis);
  let maxPrim = 0, where = '';
  const H = document.documentElement.scrollHeight;
  for (let y = 0; y < H; y += vh * 0.9) { const top = y - scrollY; const n = prim.filter((b) => { const r = b.getBoundingClientRect(); return r.bottom > top && r.top < top + vh; });
    if (n.length > maxPrim) { maxPrim = n.length; where = n.map(path).join(' | '); } }
  const small = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode()) && small.length < 3;) { if (!n.textContent.trim() || !n.parentElement) continue; const e = n.parentElement;
    if (e.closest('.cosmos-wrap, svg, [aria-hidden="true"]')) continue; const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize);
    const min = /mono/i.test(cs.fontFamily) ? 11 : 12;   // мелкий моно (кикеры, мета, числа) — приём кита, но не мельче 11px
    if (fs < min && vis(e)) small.push(path(e) + ' ' + fs + 'px'); }
  const tiny = []; if (vw < 700) for (const el of document.querySelectorAll('a, button, input, select, textarea, [role=button], [role=tab]')) {
    if (!vis(el) || el.closest('.prose, p, li, td') || el.type === 'hidden') continue; const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) { tiny.push(path(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height)); if (tiny.length > 2) break; } }
  const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.getAttribute('src')).slice(0, 3);
  // пустые контейнеры данных без пустого состояния: чаще всего это не «нет данных», а не запустившийся рендер
  const hollow = [];
  if (![...document.querySelectorAll('.empty')].some(vis)) {
    for (const t of document.querySelectorAll('table')) if (vis(t) && !t.querySelector('tbody tr, tr td')) hollow.push(path(t));
    for (const l of document.querySelectorAll('.list, ul.items, ol.items')) if (vis(l) && !l.children.length) hollow.push(path(l));
  }
  const text = (document.body.innerText || '').replace(/\\s+/g, ' ').trim().length;
  const rows = document.querySelectorAll('tbody tr, tr td:first-child, .list > *, li, .item, .card').length;
  return JSON.stringify({ over, wide, h1, maxPrim, where, small, tiny, broken, hollow: hollow.slice(0, 3), text, rows, title: document.title });
})()`;

// ---------------- запуск ----------------
const items = [];
const add = (lvl, where, code, msg, fix = '') => items.push({ lvl, where, code, msg, fix });
const b = await launch();
if (!b) { console.log('· B0  браузер не найден (Chrome/Chromium/Edge; путь можно дать в COSMOS_CHROME) — браузерная проверка пропущена'); process.exit(3); }
if (argv.includes('--probe')) {                                        // cosmos.py setup: есть ли рабочий браузер
  console.log('браузер: ' + b.exe);
  try { const c = new CDP(b.ws); await c.ready; await c.send('Browser.close'); } catch {}
  try { b.proc.kill(); } catch {} if (b.win) { await sleep(300); killWin(b.profile); }
  process.exit(0);
}
let srv;
try {
  srv = opt('--base') ? { base: opt('--base'), stop() {} } : CFG.serve ? await appServer(CFG.serve) : await staticServer();
} catch (e) { console.log(`✗ B3  ${e.message}`); try { b.proc.kill(); } catch {} process.exit(1); }
mkdirSync(OUT, { recursive: true });
const cdp = new CDP(b.ws); await cdp.ready;
const shots = [];
try {
  for (const pg of pageList()) {
    const url = new URL(pg.replace(/^\//, ''), srv.base).href;
    const name = (pg.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '').replace(/[^\w.-]+/g, '_') || 'index');
    for (const w of WIDTHS) {
      const where = `${pg}@${w}`;
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const errs = [], bad = [];
      cdp.listen('Runtime.exceptionThrown', (p, sid) => { if (sid === s) errs.push(p.exceptionDetails.exception?.description?.split('\n')[0] || p.exceptionDetails.text); });
      cdp.listen('Runtime.consoleAPICalled', (p, sid) => { if (sid === s && p.type === 'error') errs.push(p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160)); });
      cdp.listen('Network.responseReceived', (p, sid) => { if (sid === s && p.response.status >= 400) bad.push(`${p.response.status} ${p.response.url.replace(srv.base, '/')}`); });
      cdp.listen('Network.loadingFailed', (p, sid) => { if (sid === s && !p.canceled && p.errorText !== 'net::ERR_ABORTED') bad.push(`${p.errorText} ${p.requestId}`); });
      await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable'].map((m) => cdp.send(m, {}, s)));
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: w < 700 }, s);
      const loaded = new Promise((r) => { cdp.listen('Page.loadEventFired', (p, sid) => { if (sid === s) r(); }); setTimeout(r, 15000); });
      await cdp.send('Page.navigate', { url }, s);
      await loaded; await sleep(1400);                                    // сцена, шрифты, появление
      let a = {};
      try { a = JSON.parse((await cdp.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true }, s)).result.value); }
      catch (e) { add('err', where, 'B1', 'аудит не выполнился: ' + e.message); }
      await cdp.send('Runtime.evaluate', { expression: 'scrollTo(0,0)' }, s); await sleep(250);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, s);
      const file = join(OUT, `${name}-${w}.png`); writeFileSync(file, Buffer.from(shot.data, 'base64')); shots.push(relative(ROOT, file));
      if (argv.includes('--full') && w >= 1000) {                        // вся страница — только широкая (телефон — первый экран)                                     // вся страница — для глаз и cosmos-critic (дороже смотреть)
        const m = await cdp.send('Page.getLayoutMetrics', {}, s); const hh = Math.min(Math.ceil(m.cssContentSize.height), 9000);
        const full = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: hh, scale: 1 } }, s);
        const ff = join(OUT, `${name}-${w}-full.png`); writeFileSync(ff, Buffer.from(full.data, 'base64')); shots.push(relative(ROOT, ff));
      }
      for (const e of [...new Set(errs)].slice(0, 3)) add('err', where, 'B1', e, 'открыть страницу, исправить скрипт');
      for (const e of [...new Set(bad)].filter((x) => !/favicon/.test(x)).slice(0, 4)) add('err', where, 'B3', e, 'путь к файлу/кит в kit/');
      if (a.over > 1) add('err', where, 'B2', `горизонтальная прокрутка +${a.over}px: ${(a.wide || []).join('; ') || '?'}`, 'minmax(0,1fr) в гридах, max-width:100%, перенос длинных строк');
      if (a.maxPrim > 1) add('err', where, 'B4', `на одном экране раскалённых действий: ${a.maxPrim} (${a.where})`, 'одно .btn.primary на экран, остальные — .btn');
      if (a.h1 !== undefined && a.h1 !== 1) add('warn', where, 'B5', `<h1> видно: ${a.h1}`, 'ровно один заголовок страницы');
      for (const t of a.tiny || []) add('warn', where, 'B6', `цель нажатия ${t}`, 'кнопка/ссылка ≥ 24×24, главные — 40–44px');
      for (const t of a.small || []) add('warn', where, 'B7', `мелкий текст ${t}`, 'текст ≥ 13px; мельче — только моно-числа');
      for (const t of a.broken || []) add('err', where, 'B8', `картинка не загрузилась ${t}`, 'путь / формат');
      for (const t of a.hollow || []) add('err', where, 'B9', `пусто: ${t} — ни одной строки и нет .empty`, 'данные не отрисовались? (скрипт не запустился: import() после DOMContentLoaded, ошибка в пути) — или покажите блок empty');
      if (BASE && BASE[where]) {                                         // режим «применить»: сравнение с тем, что было до кита
        const b0 = BASE[where];
        if (b0.rows >= 3 && a.rows < b0.rows * 0.5) add('err', where, 'B10', `пропали записи: было ${b0.rows}, стало ${a.rows}`, 'логика сломана при переводе — вернуть рендер/обработчики, менять только классы');
        else if (b0.text >= 200 && a.text < b0.text * 0.5) add('err', where, 'B10', `пропал текст: было ${b0.text} знаков, стало ${a.text}`, 'содержимое страницы потеряно при переводе — вернуть');
      }
      if (argv.includes('--baseline')) (BASE_OUT[where] = { text: a.text, rows: a.rows });
      await cdp.send('Target.closeTarget', { targetId });
    }
  }
} finally {
  try { await cdp.send('Browser.close'); } catch {}
  try { b.proc.kill(); } catch {}
  if (b.win) { await sleep(300); killWin(b.profile); }
  srv?.stop();
}
const errs = items.filter((i) => i.lvl === 'err').length;
for (const i of items.slice(0, 40)) console.log(`${i.lvl === 'err' ? '✗' : '·'} ${i.where}  ${i.code}  ${i.msg}${i.fix ? '  → ' + i.fix : ''}`);
console.log(`снимки: ${shots.join(' ')}`);
console.log(items.length ? `cosmos-shot: ошибок ${errs}, предупреждений ${items.length - errs}` : `cosmos-shot: OK (${shots.length} снимков)`);
if (argv.includes('--baseline')) { writeFileSync(join(ROOT, '.cosmos', 'baseline.json'), JSON.stringify(BASE_OUT)); console.log('эталон: .cosmos/baseline.json'); process.exit(0); }
try { writeFileSync(join(ROOT, '.cosmos', 'shot.json'), JSON.stringify({ epoch: Date.now() / 1000, pass: errs === 0, errors: errs, shots })); } catch {}
process.exit(errs ? 1 : 0);
