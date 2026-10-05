// Sticks — этикетки ХАССП. Один ES-модуль без сборки, работает на GitHub Pages и офлайн.
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const p2 = n => String(n).padStart(2, '0');
const fmt = d => { d = new Date(d); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const loc = d => { d = new Date(d); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- состояние ----------
const S = {
  items: [], emp: [], tpls: [], presets: [], bgImg: '', sel: new Set(), tab: 'print', q: '', fav: false, hq: '',
  s: { theme: 'kitchen', ac: '#ffb020', sc: 100, haptics: true, anim: true, wake: false, hist: 'month',
       co: '', bg: 'none', bgd: 80, tpl: 'std', mode: 'roll', def: '', cnt: { d: '', n: 0 } }
};
const vib = p => { if (S.s.haptics && navigator.vibrate) navigator.vibrate(p); };
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }

// ---------- IndexedDB (kv + история) ----------
const dbp = new Promise((ok, no) => {
  const r = indexedDB.open('sticks', 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('hist', { keyPath: 'id', autoIncrement: true }).createIndex('ts', 'ts'); };
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const rq = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const st = async (n, m = 'readonly') => (await dbp).transaction(n, m).objectStore(n);
const kvGet = async k => rq((await st('kv')).get(k));
const kvSet = async (k, v) => rq((await st('kv', 'readwrite')).put(v, k));
const hAll = async () => (await rq((await st('hist')).getAll())).sort((a, b) => b.ts - a.ts);
const hAdd = async r => rq((await st('hist', 'readwrite')).add(r));
const hDel = async id => rq((await st('hist', 'readwrite')).delete(id));
const hClear = async () => rq((await st('hist', 'readwrite')).clear());
async function hPrune() { // месяц = 30 дней, сутки = 24 ч, выкл = ничего не пишем
  if (S.s.hist === 'off') return;
  const cut = Date.now() - (S.s.hist === 'day' ? 864e5 : 30 * 864e5);
  const c = (await st('hist', 'readwrite')).index('ts').openCursor(IDBKeyRange.upperBound(cut));
  c.onsuccess = () => { const x = c.result; if (x) { x.delete(); x.continue(); } };
}
const save = () => kvSet('data', { items: S.items, emp: S.emp, tpls: S.tpls, presets: S.presets, s: S.s }).catch(() => toast('Не удалось сохранить'));
function applyUI() {
  const r = document.documentElement;
  r.dataset.theme = S.s.theme; r.style.setProperty('--ac', S.s.ac); r.style.fontSize = S.s.sc + '%';
  document.body.classList.toggle('noanim', !S.s.anim);
  const dim = `color-mix(in srgb,var(--bg) ${S.s.bgd}%,transparent)`, B = document.body.style;
  const P = { none: '', aurora: 'radial-gradient(900px 500px at 8% 0,color-mix(in srgb,var(--ac) 30%,transparent),transparent),radial-gradient(700px 500px at 100% 100%,#4cc2ff33,transparent)', grid: 'linear-gradient(var(--ln) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,var(--ln) 1px,transparent 1px) 0 0/28px 28px', dots: 'radial-gradient(var(--ln) 1.5px,transparent 1.7px) 0 0/22px 22px' };
  B.background = S.s.bg === 'img' && S.bgImg ? `linear-gradient(${dim},${dim}),url(${S.bgImg}) center/cover no-repeat` : (P[S.s.bg] || '');
  B.backgroundColor = '';
  try { localStorage.setItem('sticks.ui', JSON.stringify({ theme: S.s.theme, ac: S.s.ac, sc: S.s.sc })); } catch (e) {}
}
function migrate() { // перенос данных старой версии (localStorage nls_*)
  try {
    const g = k => JSON.parse(localStorage.getItem(k) || 'null');
    const p = g('nls_products') || g('nls_nomenclature'); if (!p) return null;
    const o = g('nls_settings') || {};
    return { items: p.map(x => ({ id: String(x.id ?? uid()), name: String(x.name || ''), shelf: +x.shelfLife || 72, temp: x.temp || '+2...+6°C', al: x.allergens || '', fav: false })).filter(x => x.name),
      emp: (o.employees || '').split('\n').map(x => x.trim()).filter(Boolean),
      s: { def: o.defaultEmployee || '', theme: ({ dark: 'kitchen', light: 'paper', blue: 'steel', green: 'kitchen' })[o.theme] || 'kitchen' } };
  } catch (e) { return null; }
}

// ---------- библиотеки: локально → CDN ----------
const LIB = { qrcode: ['vendor/qrcode.min.js', 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'], xlsx: ['vendor/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'] };
const GL = { qrcode: 'qrcode', xlsx: 'XLSX' };
async function lib(n) {
  if (window[GL[n]]) return;
  for (const u of LIB[n]) {
    try { await new Promise((ok, no) => { const s = document.createElement('script'); s.src = u; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = no; document.head.append(s); }); if (window[GL[n]]) return; } catch (e) {}
  }
  throw new Error('lib ' + n);
}

// ---------- этикетка ----------
function qr(d, px) {
  const ph = t => `<div class="nq" style="width:100%;height:100%">${t}</div>`;
  if (!window.qrcode) return ph('QR');
  try {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; // кириллица в UTF-8
    const q = qrcode(0, 'M'); q.addData(d.raw, 'Byte'); q.make();
    const n = q.getModuleCount(); let p = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" width="100%" height="100%" shape-rendering="crispEdges"><path d="${p}"/></svg>`;
  } catch (e) { return ph('QR!'); }
}
const PX = 3.7795, MG = 1.5;
const clamp = (n, a, b) => Math.min(b, Math.max(a, +n || 0));
const r1 = n => Math.round(n * 10) / 10, r3 = n => Math.round(n * 1000) / 1000;
const SAFE_IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, SAFE_C = /^#[0-9a-f]{3,8}$/i;
const tx = (v, fs, b, al, c, cond) => ({ t: 'text', v, fs, b, al, c: c || '#000000', cond: cond || '' });
const gr = (a, av, b2, bv, fs = 10) => ({ t: 'grid', a, av, b2, bv, fs });
const ALG = tx('⚠ АЛЛЕРГЕНЫ: {al}', 9, 1, 'left', '#cc0000', 'al'), CO = tx('{co}', 7, 0, 'center', '#000000', 'co'), QR = px => ({ t: 'qr', px }), HR = { t: 'hr' };
const BUILT = [
  { id: 'std', n: 'Стандарт 90×60', w: 90, h: 60, locked: 1, blocks: [tx('{name}', 16, 1, 'center'), HR, gr('Вскрыто', '{open}', 'Годен до', '{exp}'), gr('Хранение', '{temp}', 'Вскрыл', '{by}'), gr('Партия', '{batch}', '', ''), ALG, QR(56), CO] },
  { id: 'cmp', n: 'Компакт 58×40', w: 58, h: 40, locked: 1, blocks: [tx('{name}', 12, 1, 'center'), gr('Вск.', '{open}', 'До', '{exp}', 9), gr('Хран.', '{temp}', 'Кто', '{by}', 9), ALG, QR(38)] },
  { id: 'big', n: 'Крупный срок 100×70', w: 100, h: 70, locked: 1, blocks: [tx('{name}', 15, 1, 'center'), { t: 'box', a: 'Годен до', v: '{exp}', fs: 18 }, gr('Вскрыто', '{open}', 'Хранение', '{temp}'), gr('Вскрыл', '{by}', 'Партия', '{batch}'), ALG, QR(56), CO] },
  { id: 'mini', n: 'Мини 40×30', w: 40, h: 30, locked: 1, blocks: [tx('{name}', 10, 1, 'center'), gr('Вск.', '{open}', 'До', '{exp}', 7), tx('{by} · {batch}', 7, 0, 'center')] }
];
// элемент макета: свободная позиция в мм (x, y, w, h) — типы text, field, qr, line, rect, img
function cleanEl(e) {
  if (!e || !['text', 'field', 'qr', 'line', 'rect', 'img'].includes(e.t)) return null;
  const col = c => SAFE_C.test(c || '') ? c : '#000000';
  const o = { id: String(e.id || uid()), t: e.t, x: clamp(e.x, -50, 300), y: clamp(e.y, -50, 400), w: clamp(e.w, 1, 300), h: clamp(e.h, .2, 400) };
  if (e.t === 'text') Object.assign(o, { v: String(e.v ?? '').slice(0, 300), fs: clamp(e.fs || 10, 3, 120), b: e.b ? 1 : 0, i: e.i ? 1 : 0, al: ['left', 'right'].includes(e.al) ? e.al : 'center', c: col(e.c), af: e.af === 0 ? 0 : 1, cond: ['al', 'co'].includes(e.cond) ? e.cond : '' });
  if (e.t === 'field') Object.assign(o, { a: String(e.a ?? '').slice(0, 100), v: String(e.v ?? '').slice(0, 300), fs: clamp(e.fs || 10, 3, 120), al: ['center', 'right'].includes(e.al) ? e.al : 'left', c: col(e.c), bd: clamp(e.bd, 0, 5), af: e.af === 0 ? 0 : 1, cond: ['al', 'co'].includes(e.cond) ? e.cond : '' });
  if (e.t === 'qr') o.h = o.w;
  if (e.t === 'line') o.c = col(e.c);
  if (e.t === 'rect') Object.assign(o, { c: col(e.c), th: clamp(e.th || 1, .5, 8) });
  if (e.t === 'img') Object.assign(o, { src: SAFE_IMG.test(e.src || '') ? e.src : '', of: e.of === 'cover' ? 'cover' : 'contain', op: e.op == null ? 1 : clamp(e.op, .1, 1) });
  return o;
}
function toEls(t) { // старые блочные макеты → свободные элементы
  const W = t.w - 2 * MG, els = []; let y = MG;
  const lh = fs => fs * 1.25 / PX, add = (o, h) => { els.push(cleanEl({ id: uid(), x: MG, y, w: W, h, ...o })); y += h + .8; };
  for (const b of t.blocks || []) {
    if (b.t === 'text') add({ t: 'text', v: b.v, fs: b.fs, b: b.b, al: b.al, c: b.c, cond: b.cond }, lh(b.fs) * (String(b.v).includes('{name}') ? 2 : 1));
    else if (b.t === 'grid') { const h = lh(b.fs * 1.75), w = (W - 1) / 2; [[b.a, b.av, MG], [b.b2, b.bv, MG + w + 1]].forEach(([a, v, x]) => { if (a || v) els.push(cleanEl({ id: uid(), t: 'field', x, y, w, h, a, v, fs: b.fs, c: String(v).includes('{exp}') ? '#cc0000' : '#000000' })); }); y += h + .8; }
    else if (b.t === 'box') add({ t: 'field', a: b.a, v: b.v, fs: b.fs, al: 'center', c: '#cc0000', bd: 1.5 }, lh(b.fs * 1.75) + 1);
    else if (b.t === 'qr') { const s = (b.px || 56) / PX; els.push(cleanEl({ id: uid(), t: 'qr', x: (t.w - s) / 2, y, w: s, h: s })); y += s + .8; }
    else if (b.t === 'hr') add({ t: 'line', c: '#000000' }, .3);
    else if (b.t === 'img') add({ t: 'img', src: b.src, of: 'contain' }, +b.h || 10);
  }
  return els;
}
function fixTpl(t) {
  if (!t || !t.id) return null;
  const o = { id: String(t.id), n: String(t.n || 'Макет').slice(0, 60), w: clamp(t.w || 58, 15, 200), h: clamp(t.h || 40, 15, 300), blocks: t.blocks, els: t.els };
  if (!Array.isArray(o.els)) { if (!Array.isArray(o.blocks)) return null; o.els = toEls(o); }
  o.els = o.els.map(cleanEl).filter(Boolean).slice(0, 80); delete o.blocks; return o;
}
BUILT.forEach(t => { t.els = toEls(t); delete t.blocks; });
const tplAll = () => [...BUILT, ...S.tpls];
const curTpl = id => tplAll().find(t => t.id === (id || S.s.tpl)) || BUILT[0];
function data(j, co = S.s.co) {
  const o = new Date(j.open), e = (j.noExp || !j.shelf) ? null : new Date(+o + j.shelf * 36e5);
  const raw = `НАЗВАНИЕ: ${j.name}\nВСКРЫТО: ${fmt(o)}\nГОДЕН ДО: ${e ? fmt(e) : '—'}\nВСКРЫЛ: ${j.by}\nПАРТИЯ: ${j.batch}\nХРАНЕНИЕ: ${j.temp}`;
  return { name: esc(j.name || '___'), open: fmt(o), exp: e ? fmt(e) : '__________', temp: esc(j.temp || '___'), by: esc(j.by || '___'), batch: esc(j.batch || '___'), al: esc(j.al || ''), co: esc(co || ''), raw, e };
}
const R = (v, d) => esc(v || '').replace(/\{(name|open|exp|temp|by|batch|al|co)\}/g, (m, k) => d[k]);
const posS = e => `left:${e.x}mm;top:${e.y}mm;width:${e.w}mm;height:${e.t === 'qr' ? e.w : e.h}mm`;
function elHTML(e, d, ed) {
  if (!ed && ((e.cond === 'al' && !d.al) || (e.cond === 'co' && !d.co))) return '';
  const at = `class="el${e.t === 'line' ? ' ln' : ''}" data-id="${e.id}"${e.af ? ' data-af="1"' : ''}`, p = posS(e), f = n => `font-size:calc(var(--sf,1)*${n}px)`;
  switch (e.t) {
    case 'text': return `<div ${at} style="${p};${f(e.fs)};font-weight:${e.b ? 800 : 400};font-style:${e.i ? 'italic' : 'normal'};text-align:${e.al};color:${e.c}">${R(e.v, d)}</div>`;
    case 'field': return `<div ${at} style="${p};text-align:${e.al};border:${e.bd || 0}px solid #000;padding:${e.bd ? 1 : 0}px"><div style="${f(e.fs * .75)}">${R(e.a, d)}</div><div style="${f(e.fs)};font-weight:800;color:${e.c}">${R(e.v, d)}</div></div>`;
    case 'qr': return `<div ${at} style="${p}">${qr(d)}</div>`;
    case 'line': return `<div ${at} style="${p};background:${e.c}"></div>`;
    case 'rect': return `<div ${at} style="${p};border:${e.th || 1}px solid ${e.c}"></div>`;
    case 'img': return `<div ${at} style="${p}">${SAFE_IMG.test(e.src) ? `<img src="${e.src}" alt="" style="width:100%;height:100%;object-fit:${e.of};opacity:${e.op ?? 1}">` : '<div class="nq" style="width:100%;height:100%">картинка</div>'}</div>`;
  } return '';
}
function labelEl(d, t = curTpl(), ed) { const e = document.createElement('div'); e.className = 'lbl'; e.style.cssText = `width:${t.w}mm;height:${t.h}mm`; e.innerHTML = t.els.map(x => elHTML(x, d, ed)).join(''); return e; }
function fitOne(n) { let s = 1; n.style.setProperty('--sf', 1); while ((n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1) && s > .35) { s -= .05; n.style.setProperty('--sf', s.toFixed(2)); } }
const fitEls = root => root.querySelectorAll('.el[data-af]').forEach(fitOne); // автоподбор: текст не вылезает за свой блок
function status(i) {
  if (!i.printed || i.noExp || !i.open) return null;
  const l = +new Date(i.open) + (i.ps ?? i.shelf) * 36e5 - Date.now();
  return l <= 0 ? ['bad', '⛔ истёк'] : l < 4 * 36e5 ? ['bad', '⚠ < 4 ч'] : l < 12 * 36e5 ? ['warn', '⚠ скоро'] : ['ok', '✓ свежий'];
}

// ---------- печать ----------
async function doPrint(jobs, tpl) {
  const t = tpl || curTpl(), root = $('#pr'), roll = S.s.mode === 'roll';
  root.innerHTML = ''; root.className = roll ? 'roll' : 'sheet';
  for (const j of jobs) for (let k = 0; k < j.copies; k++) root.append(labelEl(j.d, t));
  document.body.classList.add('printing');
  fitEls(root);
  $('#pst').textContent = roll ? `@page{size:${t.w}mm ${t.h}mm;margin:0}` : '@page{size:A4;margin:8mm}';
  await sleep(80); window.print();
}
addEventListener('afterprint', () => { document.body.classList.remove('printing'); $('#pr').innerHTML = ''; });

async function log(j, d) {
  if (S.s.hist === 'off') return;
  try { await hAdd({ ts: Date.now(), name: j.name, open: fmt(j.open), exp: d.e ? fmt(d.e) : '', by: j.by, batch: j.batch, temp: j.temp, al: j.al, copies: j.copies, tpl: curTpl().n }); }
  catch (e) { toast('История недоступна'); }
}
function batchNo() {
  const t = new Date(), k = `${p2(t.getDate())}${p2(t.getMonth() + 1)}${String(t.getFullYear()).slice(2)}`;
  if (S.s.cnt.d !== k) S.s.cnt = { d: k, n: 0 };
  S.s.cnt.n++; save(); return `${k}-${p2(S.s.cnt.n)}`;
}
const jobOf = i => ({ id: i.id, name: i.name, shelf: i.shelf, temp: i.temp, al: i.al, open: loc(Date.now()), by: S.s.def, batch: '', noExp: false, copies: 1 });
function stamp(i, j) { if (!i) return; Object.assign(i, { open: j.open, by: j.by, batch: j.batch, noExp: j.noExp, ps: j.shelf, printed: Date.now() }); }

// ---------- экспорт / шаринг ----------
async function makeFile(head, rows, name, sheet) {
  try {
    await lib('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]); ws['!cols'] = head.map(h => ({ wch: Math.max(12, String(h).length + 4) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
    return new File([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], name + '.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch (e) { // без библиотеки — CSV, открывается в Excel
    const csv = '\ufeff' + [head, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    toast('Excel-библиотека недоступна — сохранён CSV'); return new File([csv], name + '.csv', { type: 'text/csv' });
  }
}
async function deliver(file, share) {
  if (share && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function shareText(t) {
  if (navigator.share) { try { await navigator.share({ text: t }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(t); toast('Скопировано в буфер'); } catch (e) { toast('Не удалось поделиться'); }
}
const HEAD = ['Дата печати', 'Наименование', 'Вскрыто', 'Годен до', 'Вскрыл', 'Партия', 'Хранение', 'Аллергены', 'Копий', 'Шаблон'];
const hRow = r => [fmt(r.ts), r.name, r.open, r.exp, r.by, r.batch, r.temp, r.al, r.copies, r.tpl];

// ---------- окно этикетки ----------
let J = null, M = null;
function openSheet(it) {
  J = jobOf(it);
  M = document.createElement('div'); M.className = 'md';
  M.innerHTML = `<div class="sh"><div class="hd"><b>${esc(J.name)}</b><button data-a="x" aria-label="Закрыть">✕</button></div><div id="pv" class="pv"></div>
  <label>Название<input data-k="name" value="${esc(J.name)}"></label>
  <div class="r2"><label>Вскрыто<input type="datetime-local" data-k="open" value="${J.open}"></label><button class="chip" data-a="now">Сейчас</button></div>
  <label>Срок годности, ч<input type="number" min="1" data-k="shelf" value="${J.shelf}"></label>
  <div class="chips">${[12, 24, 48, 72, 120, 168, 720].map(h => `<button class="chip" data-a="sh" data-h="${h}">${h < 24 ? h + ' ч' : h / 24 + ' д'}</button>`).join('')}</div>
  <label class="ck"><input type="checkbox" data-k="noExp"> Срок не известен</label>
  <label>Вскрыл<input data-k="by" list="el" value="${esc(J.by)}"></label><datalist id="el">${S.emp.map(e => `<option value="${esc(e)}">`).join('')}</datalist>
  <div class="r2"><label>Партия<input data-k="batch" value=""></label><button class="chip" data-a="auto">Авто</button></div>
  <label>Хранение<input data-k="temp" value="${esc(J.temp)}"></label><label>Аллергены<input data-k="al" value="${esc(J.al)}"></label>
  <div class="r2"><span>Копий</span><div class="st"><button data-a="m">−</button><b id="cp">1</b><button data-a="p">＋</button></div></div>
  <div class="acts"><button class="pri" data-a="print">🖨 Печать</button><button data-a="share">Поделиться</button></div><button data-a="savei" style="width:100%;margin-top:8px">💾 Запомнить срок и хранение в карточке</button></div>`;
  M.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; J[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value; drawPv(); });
  M.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (e.target === M || a === 'x') return closeSheet();
    if (!a) return;
    const set = (k, v) => { J[k] = v; const i = $(`[data-k=${k}]`, M); if (i) i.value = v; drawPv(); };
    if (a === 'now') set('open', loc(Date.now()));
    else if (a === 'sh') set('shelf', +e.target.dataset.h);
    else if (a === 'auto') set('batch', batchNo());
    else if (a === 'm' || a === 'p') { J.copies = Math.min(99, Math.max(1, J.copies + (a === 'p' ? 1 : -1))); $('#cp', M).textContent = J.copies; }
    else if (a === 'savei') { const it = S.items.find(x => x.id === J.id); if (it && J.name.trim()) { Object.assign(it, { name: J.name.trim(), shelf: J.shelf || it.shelf, temp: J.temp, al: J.al }); save(); drawList(); toast('Карточка обновлена'); } }
    else if (a === 'share') { const d = data(J); shareText(`${J.name}\nВскрыто: ${d.open}\nГоден до: ${d.exp}\nВскрыл: ${J.by || '—'}\nПартия: ${J.batch || '—'}\nХранение: ${J.temp}`); }
    else if (a === 'print') {
      if (!J.name.trim()) return toast('Укажите название');
      const d = data(J), j = { ...J }; stamp(S.items.find(x => x.id === j.id), j); save(); log(j, d); vib([10, 40, 10]); closeSheet(); drawList(); await doPrint([{ d, copies: j.copies }]);
    }
  });
  document.body.append(M); drawPv();
}
function closeSheet() { M?.remove(); M = null; J = null; }
function drawInto(pv, d, t = curTpl()) {
  const e = labelEl(d, t); pv.innerHTML = ''; pv.append(e); fitEls(pv);
  const px = t.w * 3.7795, k = Math.min(1, (pv.clientWidth - 12) / px);
  e.style.transformOrigin = '0 0'; e.style.transform = `scale(${k})`; pv.style.height = (t.h * 3.7795 * k + 12) + 'px';
}
function drawPv() { if (M) drawInto($('#pv', M), data(J)); }
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// ---------- вкладка «Печать» ----------
function drawList() {
  const box = $('#list'); if (!box) return;
  const q = S.q.toLowerCase();
  const L = S.items.filter(i => (!S.fav || i.fav) && i.name.toLowerCase().includes(q)).sort((a, b) => (!!b.fav - !!a.fav) || a.name.localeCompare(b.name, 'ru'));
  box.innerHTML = L.map(i => { const s = status(i); return `<div class="card"><input type="checkbox" data-a="sel" data-id="${i.id}" ${S.sel.has(i.id) ? 'checked' : ''} aria-label="Выбрать"><div class="i" data-a="open" data-id="${i.id}"><b>${esc(i.name)}</b><small>${i.shelf} ч · ${esc(i.temp)}${i.al ? ' · ⚠ ' + esc(i.al) : ''}</small></div>${s ? `<span class="b ${s[0]}">${s[1]}</span>` : ''}<button data-a="fav" data-id="${i.id}" aria-label="Избранное">${i.fav ? '⭐' : '☆'}</button><button data-a="del" data-id="${i.id}" aria-label="Удалить">✕</button></div>`; }).join('') || '<p class="m">Пусто. Добавьте позицию выше или импортируйте Excel в «Настройках».</p>';
  const f = $('#fab'); if (f) f.innerHTML = S.sel.size ? `<button data-a="pall">🖨 Печать выбранных (${S.sel.size})</button>` : '';
}
function renderPrint() {
  $('#v').innerHTML = `<div class="bar"><input id="q" type="search" placeholder="Поиск продукта" value="${esc(S.q)}"><button id="favb" class="chip ${S.fav ? 'on' : ''}">⭐</button></div>
  <div class="bar"><input id="nn" placeholder="Новая позиция"><button id="add" class="chip">＋ Добавить</button></div><div id="list" class="list"></div><div id="fab" class="fab"></div>`;
  drawList();
}
async function printSel() {
  const b = batchNo(), jobs = [];
  for (const id of S.sel) { const i = S.items.find(x => x.id === id); if (!i) continue; const j = jobOf(i); j.batch = b; const d = data(j); stamp(i, j); await log(j, d); jobs.push({ d, copies: 1 }); }
  S.sel.clear(); save(); drawList(); vib([10, 40, 10]); if (jobs.length) await doPrint(jobs);
}
function addItem() {
  const n = $('#nn').value.trim(); if (!n) return;
  if (S.items.some(i => i.name.toLowerCase() === n.toLowerCase())) return toast('Такая позиция уже есть');
  S.items.push({ id: uid(), name: n, shelf: 72, temp: '+2...+6°C', al: '', fav: false }); $('#nn').value = ''; save(); drawList(); vib(10);
}
function viewClick(e) {
  const b = e.target.closest('[data-a],#favb,#add'); if (!b) return;
  const id = b.dataset.id, it = S.items.find(x => x.id === id), a = b.dataset.a || b.id;
  if (a === 'open' && it) openSheet(it);
  else if (a === 'sel') { b.checked ? S.sel.add(id) : S.sel.delete(id); drawList(); }
  else if (a === 'fav' && it) { it.fav = !it.fav; save(); drawList(); }
  else if (a === 'del' && it) { if (confirm(`Удалить «${it.name}»?`)) { S.items = S.items.filter(x => x !== it); S.sel.delete(id); save(); drawList(); } }
  else if (a === 'favb') { S.fav = !S.fav; b.classList.toggle('on', S.fav); drawList(); }
  else if (a === 'add') addItem();
  else if (a === 'pall') printSel();
}

// ---------- вкладка «История» ----------
async function renderHist() {
  const all = await hAll(), q = S.hq.toLowerCase(), L = all.filter(r => !q || (r.name + r.by + r.batch).toLowerCase().includes(q));
  let day = '';
  $('#v').innerHTML = `<div class="sec"><h3>Хранить историю</h3><div class="chips">${[['month', 'Месяц'], ['day', 'Только сутки'], ['off', 'Отключена']].map(([k, t]) => `<button class="chip ${S.s.hist === k ? 'on' : ''}" data-h="${k}">${t}</button>`).join('')}</div><p class="m" style="margin-top:6px">Записей: ${all.length}. Старые удаляются автоматически.</p></div>
  <div class="bar"><input id="hq" type="search" placeholder="Поиск" value="${esc(S.hq)}"></div>
  <div class="chips" style="margin-bottom:8px"><button class="chip" id="hx">📊 Excel</button><button class="chip" id="hs">📤 Поделиться</button><button class="chip" id="hc">🗑 Очистить</button></div>
  <div id="hl">${L.map(r => { const dd = fmt(r.ts).slice(0, 10), h = dd !== day ? `<div class="dh">${dd}</div>` : ''; day = dd; return `${h}<div class="row"><b>${esc(r.name)} ×${r.copies}</b><button data-a="hd" data-id="${r.id}" aria-label="Удалить запись">✕</button><small>${fmt(r.ts).slice(11)} · до ${esc(r.exp || '—')} · ${esc(r.by || '—')} · ${esc(r.batch || '—')}</small></div>`; }).join('') || '<p class="m">Записей нет.</p>'}</div>`;
  const rows = L.map(hRow), name = 'sticks-history-' + loc(Date.now()).slice(0, 10);
  $('#v').onclick = async e => {
    const h = e.target.closest('[data-h]')?.dataset.h, a = e.target.closest('[data-a]')?.dataset.a;
    if (h) { if (h === 'off' && all.length && confirm('Удалить уже сохранённую историю?')) await hClear(); S.s.hist = h; save(); await hPrune(); renderHist(); }
    else if (a === 'hd') { await hDel(+e.target.closest('[data-id]').dataset.id); renderHist(); }
    else if (e.target.id === 'hx' || e.target.id === 'hs') { if (!rows.length) return toast('Нечего экспортировать'); await deliver(await makeFile(HEAD, rows, name, 'История'), e.target.id === 'hs'); }
    else if (e.target.id === 'hc') { if (confirm('Удалить всю историю?')) { await hClear(); renderHist(); } }
  };
  $('#hq').oninput = e => { S.hq = e.target.value; clearTimeout(renderHist.t); renderHist.t = setTimeout(async () => { const p = e.target.selectionStart; await renderHist(); const i = $('#hq'); i.focus(); i.setSelectionRange(p, p); }, 250); };
}

async function shrink(f, max, alpha) {
  const u = URL.createObjectURL(f), im = new Image(); im.src = u;
  try { await im.decode(); } finally { setTimeout(() => URL.revokeObjectURL(u), 3000); }
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
  const x = c.getContext('2d'); if (!alpha) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL(alpha ? 'image/png' : 'image/jpeg', .75);
}
// ---------- вкладка «Макет»: визуальный редактор ----------
const E = { id: '', sel: '', zoom: 1, snap: true, grid: false, k: 1, drag: null, H: {}, last: 0, mode: '', dt: {} };
const NAME = { text: 'Текст', field: 'Поле: подпись + значение', qr: 'QR-код', line: 'Линия', rect: 'Рамка', img: 'Картинка' };
const VARS = ['name', 'open', 'exp', 'temp', 'by', 'batch', 'al', 'co'];
const T = () => curTpl(E.id), EL = id => T().els.find(x => x.id === id);
const sample = () => data({ name: 'Сливки 33%', open: loc(Date.now()), shelf: 72, temp: '+2...+6°C', by: S.emp[0] || 'Иванов И.', batch: '041026-01', al: 'молоко', noExp: false }, S.s.co || 'Ваша компания');
const hh = () => (E.H[E.id] ||= { u: [], r: [] });
const stateStr = () => { const t = T(); return JSON.stringify({ w: t.w, h: t.h, els: t.els }); };
const pushH = s => { const H = hh(); if (H.u[H.u.length - 1] !== s) H.u.push(s); if (H.u.length > 60) H.u.shift(); H.r = []; };
const mut = (fn, keep) => { const now = Date.now(); if (!keep || now - E.last > 700) pushH(stateStr()); E.last = keep ? now : 0; fn(); save(); drawEd(); if (!keep) drawPanel(); };
function undo(redo) { const H = hh(), from = redo ? H.r : H.u, to = redo ? H.u : H.r; if (!from.length) return; to.push(stateStr()); const s = JSON.parse(from.pop()); Object.assign(T(), s); E.sel = EL(E.sel) ? E.sel : ''; save(); drawEd(); drawPanel(); }
const hgt = e => e.t === 'qr' ? e.w : e.h;

function drawEd() {
  const t = T(), box = $('#cvs'); if (!box) return;
  const cw = box.parentElement.clientWidth - 26, hmax = innerHeight * (matchMedia('(min-width:900px)').matches ? .6 : .32);
  E.k = Math.max(.3, Math.min(8, Math.min(cw / (t.w * PX), hmax / (t.h * PX)) * E.zoom));
  box.style.cssText = `width:${t.w * PX * E.k}px;height:${t.h * PX * E.k}px`;
  const d = sample();
  box.innerHTML = `<div class="sc" style="width:${t.w}mm;height:${t.h}mm;transform:scale(${E.k});--u:${1 / E.k}"><div class="lbl${E.grid ? ' gr' : ''}" style="width:${t.w}mm;height:${t.h}mm">${t.els.map(x => elHTML(x, d, true)).join('')}</div><div class="ov"></div></div>`;
  fitEls(box); placeSel();
}
function placeSel(gl = []) {
  const ov = $('#cvs .ov'); if (!ov) return; const e = EL(E.sel);
  ov.innerHTML = (e ? `<div class="sb" style="${posS(e)}"><i class="hd" data-hd></i></div>` : '') + gl.map(([a, g]) => `<i class="gl ${a}" style="${a === 'v' ? 'left' : 'top'}:${g}mm"></i>`).join('');
  const el = $('#info'); if (!el) return;
  el.textContent = e ? `X ${r1(e.x)} · Y ${r1(e.y)} · ${r1(e.w)}×${r1(hgt(e))} мм${e.t === 'qr' && e.w < 12 ? ' · ⚠ QR меньше 12 мм читается хуже' : ''}` : `Этикетка ${T().w}×${T().h} мм · масштаб ${Math.round(E.zoom * 100)}%`;
}
function drawPanel() {
  const pn = $('#pn'); if (!pn) return; const t = T(), e = EL(E.sel); if (E.sel && !e) E.sel = '';
  const num = (k, l) => `<label>${l}<input type="number" step=".5" data-p="${k}" value="${r1(e[k] ?? 0)}"></label>`, ab = (a, k) => `<button data-al="${a}">${k}</button>`;
  const sel = (k, opts, cur) => `<select data-p="${k}">${opts.map(([v, n]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  let h = '';
  if (e) {
    const txt = e.t === 'text' || e.t === 'field';
    h += `<div class="sec"><div class="hd"><b>${NAME[e.t]}</b>${txt ? '<button data-a="edit">✏ Писать</button>' : ''}</div>`;
    h += `<div class="m" style="margin:8px 0 4px">Выровнять по горизонтали</div><div class="al">${ab('l', '⇤ Слева')}${ab('c', '⇔ Центр')}${ab('r', '⇥ Справа')}</div><div class="m" style="margin:8px 0 4px">Выровнять по вертикали</div><div class="al">${ab('t', '⤒ Сверху')}${ab('m', '⇕ Центр')}${ab('b', '⤓ Снизу')}</div>`;
    if (txt) {
      h += `<div class="r2" style="margin-top:10px"><span class="st"><button data-fs="-1">A−</button><b>${e.fs}</b><button data-fs="1">A＋</button></span><span class="chips">${e.t === 'text' ? `<button class="chip ${e.b ? 'on' : ''}" data-tg="b"><b>Ж</b></button><button class="chip ${e.i ? 'on' : ''}" data-tg="i"><i>К</i></button>` : ''}${[['left', '⬅'], ['center', '⬌'], ['right', '➡']].map(([k, i]) => `<button class="chip ${e.al === k ? 'on' : ''}" data-ta="${k}">${i}</button>`).join('')}</span></div>`;
      h += `<div class="r2"><label>Цвет<input type="color" data-p="c" value="${e.c}"></label><label class="ck"><input type="checkbox" data-p="af" ${e.af ? 'checked' : ''}> Автоподбор размера</label></div><label>Показывать<select data-p="cond">${[['', 'Всегда'], ['al', 'Только если есть аллергены'], ['co', 'Только если указана компания']].map(([k, n]) => `<option value="${k}" ${e.cond === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    }
    if (e.t === 'field') h += `<label>Рамка${sel('bd', [[0, 'нет'], [1, '1 px'], [1.5, '1.5 px'], [2, '2 px'], [3, '3 px']], e.bd)}</label>`;
    if (e.t === 'line' || e.t === 'rect') h += `<label>Цвет<input type="color" data-p="c" value="${e.c}"></label>` + (e.t === 'rect' ? `<label>Толщина, px<input type="number" step=".5" data-p="th" value="${e.th}"></label>` : '');
    if (e.t === 'img') h += `<label>Вписывание${sel('of', [['contain', 'Целиком'], ['cover', 'Заполнить']], e.of)}</label><label>Прозрачность<input type="range" min="10" max="100" step="5" data-p="op" value="${Math.round((e.op ?? 1) * 100)}"></label><button data-a="repl">📷 Заменить картинку</button>`;
    h += `<details style="margin-top:8px"><summary>Точные размеры, мм</summary><div class="r2">${num('x', 'X')}${num('y', 'Y')}</div><div class="r2">${num('w', 'Ширина')}${e.t === 'qr' ? '' : num('h', 'Высота')}</div></details>`;
    h += `<div class="chips" style="margin-top:10px"><button data-a="dup">⧉ Дубль</button><button data-a="fw">▲ Вперёд</button><button data-a="bk">▼ Назад</button>${txt ? '<button data-a="spl">🔤 Орфография</button>' : ''}<button data-a="rm" style="color:var(--bd)">🗑 Удалить</button></div></div>`;
  } else h += `<div class="sec"><p class="m">Нажмите на элемент этикетки, чтобы выбрать его. Тащите пальцем или мышью — розовые линии подскажут выравнивание. Точка в углу меняет размер. Нажмите на выбранный текст ещё раз — и пишите прямо на этикетке.</p></div>`;
  h += `<details class="sec" data-d="lab" ${(E.dt.lab ?? !e) ? 'open' : ''}><summary>Этикетка</summary><label>Название макета<input data-t="n" value="${esc(t.n)}"></label><div class="r2"><label>Ширина, мм<input type="number" data-t="w" value="${t.w}"></label><label>Высота, мм<input type="number" data-t="h" value="${t.h}"></label></div><div class="chips">${['58x40', '50x30', '40x30', '90x60', '100x70', '100x150'].map(z => `<button class="chip" data-sz="${z}">${z.replace('x', '×')}</button>`).join('')}<button class="chip" data-a="rot">⟳ Повернуть</button></div></details>`;
  h += `<details class="sec" data-d="tools" ${(E.dt.tools ?? !e) ? 'open' : ''}><summary>Инструменты</summary><div class="chips"><button data-a="splall">🔤 Проверить орфографию</button><button data-a="dist">↕ Равномерно по вертикали</button><button data-a="test">🖨 Тестовая печать</button></div><div class="chips" style="margin-top:8px"><button class="chip ${E.snap ? 'on' : ''}" data-a="snap">🧲 Привязка</button><button class="chip ${E.grid ? 'on' : ''}" data-a="grid">▦ Сетка 5 мм</button></div></details>`;
  pn.innerHTML = h;
}
function alignEl(d) {
  const e = EL(E.sel), t = T(); if (!e) return; const h = hgt(e);
  mut(() => { if (d === 'l') e.x = MG; if (d === 'c') e.x = r3((t.w - e.w) / 2); if (d === 'r') e.x = r3(t.w - e.w - MG); if (d === 't') e.y = MG; if (d === 'm') e.y = r3((t.h - h) / 2); if (d === 'b') e.y = r3(t.h - h - MG); }); vib(8);
}
function distribute() {
  const t = T(), L = t.els.filter(e => !(e.t === 'img' && e.w >= t.w * .95 && e.h >= t.h * .95)).sort((a, b) => a.y - b.y); if (L.length < 2) return toast('Нужно хотя бы два элемента');
  const sum = L.reduce((s, e) => s + hgt(e), 0), gap = (t.h - 2 * MG - sum) / (L.length - 1); if (gap < 0) return toast('Элементы не помещаются по высоте — уменьшите их');
  mut(() => { let y = MG; L.forEach(e => { e.y = r3(y); y += hgt(e) + gap; }); }); toast('Расставлено равномерно');
}
function addEl(kind) {
  const t = T(), W = t.w, H = t.h, mid = (w, h) => ({ x: r3((W - w) / 2), y: r3((H - h) / 2) });
  const mk = { text: () => { const w = Math.min(W - 2 * MG, 40), h = 6; return { t: 'text', v: 'Текст', fs: 11, b: 1, al: 'center', ...mid(w, h), w, h }; },
    field: () => { const w = Math.min(W - 2 * MG, 30), h = 8; return { t: 'field', a: 'Подпись', v: '{name}', fs: 10, ...mid(w, h), w, h }; },
    qr: () => { const w = Math.max(8, Math.min(14, W - 2 * MG, H - 2 * MG)); return { t: 'qr', ...mid(w, w), w }; },
    line: () => ({ t: 'line', c: '#000000', x: MG, y: r3(H / 2), w: W - 2 * MG, h: .35 }),
    rect: () => ({ t: 'rect', c: '#000000', th: 1, x: MG, y: MG, w: W - 2 * MG, h: H - 2 * MG }) }[kind]();
  mut(() => { const e = cleanEl({ id: uid(), ...mk }); t.els.push(e); E.sel = e.id; });
  if (kind === 'text' || kind === 'field') setTimeout(startEdit, 30);
}
async function addImg(f) {
  const t = T(), m = E.mode;
  try {
    const src = await shrink(f, m === 'bg' ? 1200 : 500, m !== 'bg');
    if (m === 'repl') { const e = EL(E.sel); if (e) mut(() => { e.src = src; }); return; }
    const r = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i.naturalWidth / i.naturalHeight || 1); i.onerror = () => ok(1); i.src = src; });
    if (m === 'bg') mut(() => { const e = cleanEl({ id: uid(), t: 'img', x: 0, y: 0, w: t.w, h: t.h, src, of: 'cover' }); t.els.unshift(e); E.sel = e.id; });
    else { const w = Math.min(t.w / 3, 24); mut(() => { const e = cleanEl({ id: uid(), t: 'img', x: MG, y: MG, w, h: w / r, src, of: 'contain' }); t.els.push(e); E.sel = e.id; }); }
  } catch (er) { toast('Не удалось открыть изображение'); }
}

// перетаскивание и изменение размера (палец или мышь), привязка к краям, центрам и соседям
function dragStart(ev) {
  const hd = ev.target.closest('[data-hd]'), n = ev.target.closest('.el');
  if (!hd && !n) { if (E.sel) { E.sel = ''; closeEdit(); placeSel(); drawPanel(); } return; }
  const id = hd ? E.sel : n.dataset.id, e = EL(id); if (!e) return; ev.preventDefault();
  E.drag = { mode: hd ? 'size' : 'move', sx: ev.clientX, sy: ev.clientY, ox: e.x, oy: e.y, ow: e.w, oh: hgt(e), moved: false, was: E.sel === id, id, pre: stateStr() };
  const fresh = E.sel !== id; E.sel = id; vib(6); if (fresh) { closeEdit(); drawPanel(); } placeSel();
  addEventListener('pointermove', dragMove); addEventListener('pointerup', dragEnd); addEventListener('pointercancel', dragEnd);
}
function dragMove(ev) {
  const D = E.drag, e = D && EL(D.id), t = T(); if (!e) return;
  if (!D.moved) { if (Math.hypot(ev.clientX - D.sx, ev.clientY - D.sy) < 4) return; D.moved = true; pushH(D.pre); }
  const s = 1 / (E.k * PX), dx = (ev.clientX - D.sx) * s, dy = (ev.clientY - D.sy) * s, gl = [];
  if (D.mode === 'move') {
    let nx = D.ox + dx, ny = D.oy + dy;
    if (E.snap) {
      const X = [0, t.w / 2, t.w], Y = [0, t.h / 2, t.h], th = 6 * s;
      t.els.forEach(o => { if (o.id !== e.id && !(o.t === 'img' && o.w >= t.w * .95 && o.h >= t.h * .95)) { X.push(o.x, o.x + o.w / 2, o.x + o.w); Y.push(o.y, o.y + hgt(o) / 2, o.y + hgt(o)); } });
      const f = (p, size, G) => { let b = null; for (const off of [0, size / 2, size]) for (const g of G) { const d = g - (p + off); if (Math.abs(d) < th && (!b || Math.abs(d) < Math.abs(b.d))) b = { d, g }; } return b; };
      const bx = f(nx, e.w, X), by = f(ny, hgt(e), Y);
      if (bx) { nx += bx.d; gl.push(['v', bx.g]); } if (by) { ny += by.d; gl.push(['h', by.g]); }
    }
    e.x = r3(nx); e.y = r3(ny);
  } else {
    let w = Math.max(2, D.ow + dx), h = Math.max(e.t === 'line' ? .2 : 2, D.oh + dy);
    if (e.t === 'qr') w = h = Math.max(w, h); e.w = r1(w); if (e.t !== 'qr') e.h = r1(h);
  }
  const n = $(`#cvs .el[data-id="${e.id}"]`); if (n) { n.style.cssText = n.style.cssText.replace(/(left|top|width|height):[^;]+;?/g, '') + ';' + posS(e); if (n.dataset.af) fitOne(n); }
  placeSel(gl);
}
function dragEnd() {
  removeEventListener('pointermove', dragMove); removeEventListener('pointerup', dragEnd); removeEventListener('pointercancel', dragEnd);
  const D = E.drag; E.drag = null; if (!D) return; const e = EL(D.id);
  if (D.moved) { save(); placeSel(); drawPanel(); } else if (D.was && e && (e.t === 'text' || e.t === 'field')) startEdit();
}

// писать прямо на этикетке
function closeEdit() { const o = $('#ied'); if (!o) return; o.remove(); drawPanel(); }
function startEdit() {
  const e = EL(E.sel), box = $('#cvs'); if (!e || !box || (e.t !== 'text' && e.t !== 'field')) return; closeEdit();
  const k = E.k * PX, touch = matchMedia('(pointer:coarse)').matches, fz = n => Math.round(Math.max(touch ? 16 : 11, n * E.k));
  const inp = (key, fs, multi) => multi ? `<textarea rows="2" data-k="${key}" spellcheck="true" lang="ru" style="font-size:${fz(fs)}px">${esc(e[key] ?? '')}</textarea>` : `<input data-k="${key}" spellcheck="true" lang="ru" style="font-size:${fz(fs)}px" value="${esc(e[key] ?? '')}">`;
  const o = document.createElement('div'); o.id = 'ied';
  o.style.cssText = `left:${box.offsetLeft + Math.max(0, e.x * k - 4)}px;top:${box.offsetTop + Math.max(0, e.y * k - 4)}px;width:${Math.max(e.w * k + 8, 200)}px`;
  o.innerHTML = (e.t === 'text' ? inp('v', e.fs, 1) : inp('a', e.fs * .75) + inp('v', e.fs)) + `<div class="chips">${VARS.map(x => `<button class="chip" data-var="${x}">{${x}}</button>`).join('')}<button class="chip on" data-done>Готово</button></div>`;
  box.parentElement.append(o); let cur = o.querySelector('[data-k]'); cur.focus(); cur.select?.(); o.scrollIntoView({ block: 'nearest' });
  o.oninput = ev => { const el = ev.target, key = el.dataset.k; if (key) mut(() => { e[key] = el.value.slice(0, 300); }, true); };
  o.onfocusin = ev => { if (ev.target.dataset.k) cur = ev.target; };
  o.onkeydown = ev => { if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.target.tagName === 'INPUT' || ev.ctrlKey))) { ev.preventDefault(); closeEdit(); } };
  o.onfocusout = ev => { if (!o.contains(ev.relatedTarget)) setTimeout(() => { if ($('#ied') === o && !o.contains(document.activeElement)) closeEdit(); }, 150); };
  o.onpointerdown = ev => {
    const b = ev.target.closest('[data-var]');
    if (b) { ev.preventDefault(); const a = cur.selectionStart ?? cur.value.length, z = cur.selectionEnd ?? a, v = `{${b.dataset.var}}`; cur.value = cur.value.slice(0, a) + v + cur.value.slice(z); cur.focus(); cur.setSelectionRange(a + v.length, a + v.length); cur.dispatchEvent(new Event('input', { bubbles: true })); }
    else if (ev.target.closest('[data-done]')) { ev.preventDefault(); closeEdit(); }
  };
}

// орфография: LanguageTool онлайн, без связи — базовые правила
function localCheck(s) {
  const m = [], add = (re, f) => { for (const x of s.matchAll(re)) m.push(f(x)); };
  add(/ {2,}/g, x => ({ offset: x.index, length: x[0].length, message: 'Лишние пробелы', replacements: [{ value: ' ' }] }));
  add(/ +([,.;:!?])/g, x => ({ offset: x.index, length: x[0].length, message: 'Пробел перед знаком препинания', replacements: [{ value: x[1] }] }));
  add(/([,;:!?])(?=[^\s\d)\]»"'])/g, x => ({ offset: x.index, length: 1, message: 'Нет пробела после знака препинания', replacements: [{ value: x[1] + ' ' }] }));
  add(/(^|\s)([А-Яа-яЁёA-Za-z]{2,}) \2(?=\s|$)/gi, x => ({ offset: x.index + x[1].length, length: x[0].length - x[1].length, message: 'Повтор слова', replacements: [{ value: x[2] }] }));
  return m;
}
const FIELDS = e => e.t === 'text' ? ['v'] : e.t === 'field' ? ['a', 'v'] : [];
function segs(ids) {
  const out = []; let txt = '';
  T().els.filter(e => !ids || ids.includes(e.id)).forEach(e => FIELDS(e).forEach(k => {
    const s = String(e[k] || ''); let last = 0;
    const push = (a, b) => { if (s.slice(a, b).trim()) { out.push({ id: e.id, k, a, start: txt.length, len: b - a }); txt += s.slice(a, b) + '\n'; } };
    for (const m of s.matchAll(/\{\w+\}/g)) { push(last, m.index); last = m.index + m[0].length; } push(last, s.length);
  }));
  return { out, txt };
}
async function spell(ids) {
  const { out, txt } = segs(ids); if (!txt.trim()) return toast('Нет текста для проверки');
  toast('Проверяю…'); let ms, online = true;
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ text: txt, language: 'ru-RU' }), signal: ctl.signal });
    clearTimeout(tm); if (!r.ok) throw 0; ms = (await r.json()).matches || [];
  } catch (e) { online = false; ms = []; out.forEach(g => localCheck(txt.slice(g.start, g.start + g.len)).forEach(m => ms.push({ ...m, offset: g.start + m.offset }))); }
  const L = [];
  for (const m of ms) {
    const g = out.find(x => m.offset >= x.start && m.offset < x.start + x.len), el = g && EL(g.id); if (!el) continue;
    const pos = g.a + (m.offset - g.start); L.push({ id: g.id, k: g.k, pos, len: m.length, word: String(el[g.k]).substr(pos, m.length), msg: m.message || 'Возможная ошибка', reps: (m.replacements || []).slice(0, 5).map(r => r.value) });
  }
  showSpell(L, online);
}
function showSpell(L, online) {
  const md = document.createElement('div'); md.className = 'md';
  const draw = () => { md.innerHTML = `<div class="sh"><div class="hd"><b>Орфография${online ? '' : ' · офлайн, базовые правила'}</b><button data-x>✕</button></div>${L.length ? L.map((i, n) => `<div class="sec"><b>«${esc(i.word)}»</b><p class="m">${esc(i.msg)}</p><div class="chips">${i.reps.map((r, j) => `<button class="chip" data-n="${n}" data-r="${j}">${esc(r) || '(убрать)'}</button>`).join('')}<button class="chip" data-n="${n}" data-ig>Пропустить</button></div></div>`).join('') : '<p style="padding:14px 0">✓ Ошибок не найдено</p>'}<p class="m">${online ? 'Текст макета (без переменных) отправляется на сервер languagetool.org.' : 'Сервер проверки недоступен.'}</p></div>`; };
  md.onclick = ev => {
    const b = ev.target.closest('button'); if (ev.target === md || b?.hasAttribute('data-x')) return md.remove(); if (!b) return;
    const n = +b.dataset.n, i = L[n]; if (!i) return;
    if (b.dataset.r !== undefined) {
      const el = EL(i.id), cur = String(el?.[i.k] ?? '');
      if (cur.substr(i.pos, i.len) !== i.word) { toast('Текст изменился — запустите проверку заново'); return md.remove(); }
      const rep = i.reps[+b.dataset.r]; mut(() => { el[i.k] = cur.slice(0, i.pos) + rep + cur.slice(i.pos + i.len); });
      L.forEach(o => { if (o !== i && o.id === i.id && o.k === i.k && o.pos > i.pos) o.pos += rep.length - i.len; }); vib(8);
    }
    L.splice(n, 1); draw();
  };
  draw(); document.body.append(md);
}

function cloneT(t, n) { return { id: uid(), n, w: t.w, h: t.h, els: t.els.map(e => ({ ...JSON.parse(JSON.stringify(e)), id: uid() })) }; }
function renderCons() {
  const all = tplAll(); if (!all.some(t => t.id === E.id)) E.id = S.s.tpl;
  const t = T(), lock = !!t.locked, v = $('#v'), on = S.s.tpl === t.id; E.sel = ''; E.drag = null;
  v.innerHTML = `<div class="sec"><label>Макет<select id="cs">${all.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${x.locked ? '🔒 ' : ''}${esc(x.n)}</option>`).join('')}</select></label>
  <div class="chips"><button data-c="new">＋ Новый</button><button data-c="cp">⧉ Копия</button>${lock ? '' : '<button data-c="del">🗑</button>'}<button data-c="exp">📤 Файл</button><button data-c="imp">📥 Загрузить</button><button data-c="use" class="chip ${on ? 'on' : ''}">${on ? '✓ Используется' : 'Использовать'}</button></div></div>`
  + (lock ? `<div id="cpv" class="pv"></div><p class="m">Встроенный макет нельзя менять — нажмите «Копия» и редактируйте её.</p>`
  : `<div class="edl"><div class="stk"><div class="tb" id="tb"><button data-add="text">＋ Текст</button><button data-add="field">＋ Поле</button><button data-add="qr">＋ QR</button><button data-add="line">＋ Линия</button><button data-add="rect">＋ Рамка</button><button data-add="logo">🖼 Логотип</button><button data-add="bg">🌄 Фон</button><button data-sp title="Проверка орфографии">🔤 Орфография</button><span class="sp"></span><button data-u="u" title="Отменить">↶</button><button data-u="r" title="Вернуть">↷</button><button data-z="-1">−</button><button data-z="1">＋</button><button data-z="0" title="По размеру">⤢</button></div><div class="cvw"><div id="cvs"></div></div><div id="info" class="m"></div></div><div id="pn"></div></div><input type="file" id="cimg" accept="image/*" hidden>`)
  + `<input type="file" id="timp" accept=".json,application/json" hidden>`;
  v.onchange = async ev => {
    const id = ev.target.id;
    if (id === 'cs') { E.id = ev.target.value; renderCons(); }
    else if (id === 'cimg') { const f = ev.target.files[0]; ev.target.value = ''; if (f) addImg(f); }
    else if (id === 'timp') { const f = ev.target.files[0]; ev.target.value = ''; if (!f) return; try { const j = JSON.parse(await f.text()), o = fixTpl({ ...(j.t || j), id: uid() }); if (!o) throw 0; S.tpls.push(o); E.id = o.id; save(); renderCons(); toast('Макет загружен'); } catch (er) { toast('Файл не похож на макет Sticks'); } }
  };
  v.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.c === 'new') { const n = { id: uid(), n: 'Мой макет ' + (S.tpls.length + 1), w: 58, h: 40 }; n.els = toEls({ w: 58, h: 40, blocks: [tx('{name}', 12, 1, 'center'), gr('Вскрыто', '{open}', 'Годен до', '{exp}', 9), QR(38)] }); S.tpls.push(n); E.id = n.id; save(); renderCons(); }
    else if (d.c === 'cp') { const n = cloneT(t, t.n.replace(/ \(копия\)$/, '') + ' (копия)'); S.tpls.push(n); E.id = n.id; save(); renderCons(); toast('Копия создана'); }
    else if (d.c === 'del') { if (confirm(`Удалить макет «${t.n}»?`)) { S.tpls = S.tpls.filter(x => x.id !== t.id); if (S.s.tpl === t.id) S.s.tpl = 'std'; E.id = S.s.tpl; save(); renderCons(); } }
    else if (d.c === 'use') { S.s.tpl = t.id; save(); renderCons(); toast('Макет выбран для печати'); }
    else if (d.c === 'exp') deliver(new File([JSON.stringify({ sticks: 'template', v: 2, t: { n: t.n, w: t.w, h: t.h, els: t.els } })], (t.n.replace(/[^\wА-Яа-я-]+/g, '_') || 'maket') + '.json', { type: 'application/json' }), true);
    else if (d.c === 'imp') $('#timp').click();
    else if (lock) return;
    else if (d.add === 'logo' || d.add === 'bg') { E.mode = d.add; $('#cimg').click(); }
    else if (d.add) addEl(d.add);
    else if (d.sp !== undefined) spell();
    else if (d.u) undo(d.u === 'r');
    else if (d.z !== undefined) { E.zoom = d.z === '0' ? 1 : clamp(E.zoom * (+d.z > 0 ? 1.25 : .8), .5, 4); drawEd(); closeEdit(); }
  };
  if (lock) { drawInto($('#cpv'), sample(), t); return; }
  $('#cvs').onpointerdown = dragStart;
  const pn = $('#pn');
  pn.oninput = ev => {
    const el = ev.target, k = el.dataset.p, tk = el.dataset.t;
    if (tk) { mut(() => { const x = T(); if (tk === 'n') x.n = el.value.slice(0, 60); else x[tk] = clamp(el.value, 15, tk === 'w' ? 200 : 300); }, true); return; }
    const e = EL(E.sel); if (!k || !e) return;
    let val = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.type === 'range' ? +el.value / 100 : (el.type === 'number' || k === 'bd') ? +el.value : el.value;
    if (k === 'w' || k === 'h') val = Math.max(1, val || 1);
    mut(() => { e[k] = val; if (e.t === 'qr' && k === 'w') e.h = e.w; }, true);
  };
  pn.onclick = ev => {
    const sm = ev.target.closest('summary'); if (sm) { const d = sm.parentNode; setTimeout(() => { E.dt[d.dataset.d] = d.open; }); return; }
    const b = ev.target.closest('button'); if (!b) return; const d = b.dataset, e = EL(E.sel), a = d.a;
    if (d.al) return alignEl(d.al);
    if (d.sz) { const [w, h] = d.sz.split('x').map(Number); return mut(() => { T().w = w; T().h = h; }); }
    if (d.fs && e) return mut(() => { e.fs = clamp(e.fs + +d.fs, 3, 120); });
    if (d.tg && e) return mut(() => { e[d.tg] = e[d.tg] ? 0 : 1; });
    if (d.ta && e) return mut(() => { e.al = d.ta; });
    if (a === 'edit') startEdit();
    else if (a === 'repl') { E.mode = 'repl'; $('#cimg').click(); }
    else if (a === 'dup' && e) mut(() => { const c = { ...JSON.parse(JSON.stringify(e)), id: uid(), x: e.x + 2, y: e.y + 2 }; T().els.push(c); E.sel = c.id; });
    else if ((a === 'fw' || a === 'bk') && e) mut(() => { const L = T().els, i = L.indexOf(e), j = i + (a === 'fw' ? 1 : -1); if (j >= 0 && j < L.length) [L[i], L[j]] = [L[j], L[i]]; });
    else if (a === 'rm' && e) mut(() => { T().els = T().els.filter(x => x !== e); E.sel = ''; });
    else if (a === 'spl' && e) spell([e.id]);
    else if (a === 'splall') spell();
    else if (a === 'dist') distribute();
    else if (a === 'rot') mut(() => { const x = T(); [x.w, x.h] = [x.h, x.w]; });
    else if (a === 'snap') { E.snap = !E.snap; drawPanel(); }
    else if (a === 'grid') { E.grid = !E.grid; drawEd(); drawPanel(); }
    else if (a === 'test') doPrint([{ d: sample(), copies: 1 }], T());
  };
  drawEd(); drawPanel();
}
addEventListener('resize', () => { if (S.tab === 'cons' && $('#cvs') && !E.drag && !$('#ied')) drawEd(); });
addEventListener('keydown', ev => {
  if (S.tab !== 'cons' || !$('#cvs') || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || M) return;
  const e = EL(E.sel), k = ev.key.toLowerCase();
  if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); undo(ev.shiftKey); }
  else if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); undo(true); }
  else if (!e) return;
  else if ((ev.ctrlKey || ev.metaKey) && k === 'd') { ev.preventDefault(); mut(() => { const c = { ...JSON.parse(JSON.stringify(e)), id: uid(), x: e.x + 2, y: e.y + 2 }; T().els.push(c); E.sel = c.id; }); }
  else if (k === 'delete' || k === 'backspace') { ev.preventDefault(); mut(() => { T().els = T().els.filter(x => x !== e); E.sel = ''; }); }
  else if (k.startsWith('arrow')) { ev.preventDefault(); const st = ev.shiftKey ? 2 : .5; mut(() => { if (k === 'arrowleft') e.x = r3(e.x - st); if (k === 'arrowright') e.x = r3(e.x + st); if (k === 'arrowup') e.y = r3(e.y - st); if (k === 'arrowdown') e.y = r3(e.y + st); }, true); placeSel(); }
  else if (k === 'enter' && (e.t === 'text' || e.t === 'field')) { ev.preventDefault(); startEdit(); }
});

// ---------- вкладка «Настройки» ----------
let wl = null;
async function wake() { try { if (S.s.wake && 'wakeLock' in navigator && document.visibilityState === 'visible') wl = await navigator.wakeLock.request('screen'); else { await wl?.release(); wl = null; } } catch (e) {} }
document.addEventListener('visibilitychange', wake);
let dip = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); dip = e; $('#inst').hidden = false; });
addEventListener('appinstalled', () => { $('#inst').hidden = true; toast('Установлено'); });
const tog = (k, t) => `<label class="ck"><input type="checkbox" data-s="${k}" ${S.s[k] ? 'checked' : ''}> ${t}</label>`;
function renderSet() {
  const ac = ['#ffb020', '#3ddc97', '#4cc2ff', '#ff6b8b', '#b794ff'];
  $('#v').innerHTML = `<div class="sec"><h3>Внешний вид</h3><div class="sw">${[['kitchen', '#0f1a15'], ['paper', '#f4f2ec'], ['steel', '#0e1621'], ['oled', '#000']].map(([k, c]) => `<button data-th="${k}" style="background:${c};${S.s.theme === k ? 'outline:3px solid var(--ac)' : ''}" aria-label="Тема ${k}"></button>`).join('')}</div>
  <div class="sw" style="margin-top:8px">${ac.map(c => `<button data-ac="${c}" style="background:${c};width:34px;height:34px;min-height:0"></button>`).join('')}</div>
  <h3 style="margin-top:10px">Фон</h3><div class="chips">${[['none', 'Нет'], ['aurora', 'Сияние'], ['grid', 'Сетка'], ['dots', 'Точки'], ['img', 'Своё фото']].map(([k, t]) => `<button class="chip ${S.s.bg === k ? 'on' : ''}" data-bg="${k}">${t}</button>`).join('')}</div>
  ${S.s.bg === 'img' ? `<label>Затемнение: ${S.s.bgd}%<input type="range" min="40" max="95" step="5" data-s="bgd" value="${S.s.bgd}"></label>` : ''}<label>Размер интерфейса: ${S.s.sc}%<input type="range" min="85" max="130" step="5" data-s="sc" value="${S.s.sc}"></label>${tog('anim', 'Плавные эффекты')}${tog('haptics', 'Вибрация при нажатии (Android)')}${tog('wake', 'Не гасить экран')}</div>
  <div class="sec"><h3>Печать</h3><label>Название компании (для этикетки)<input data-s="co" placeholder="Например: Кафе «Лето»" value="${esc(S.s.co)}"></label>
  <label>Макет этикетки<select data-s="tpl">${tplAll().map(t => `<option value="${t.id}" ${S.s.tpl === t.id ? 'selected' : ''}>${esc(t.n)}</option>`).join('')}</select></label><p class="m">Свои макеты — на вкладке «Макет».</p>
  <label>Режим<select data-s="mode"><option value="roll" ${S.s.mode === 'roll' ? 'selected' : ''}>Рулон / термопринтер (Datamax): 1 этикетка = 1 стикер</option><option value="sheet" ${S.s.mode === 'sheet' ? 'selected' : ''}>Лист A4 (несколько этикеток)</option></select></label></div>
  <div class="sec"><h3>Пресеты (быстрое переключение)</h3><p class="m">Запоминают компанию, макет, режим печати и сотрудника по умолчанию. Удобно, если программа стоит на общем ПК.</p>${S.presets.map(x => `<div class="row"><b>${esc(x.n)}</b><span><button data-pa="${x.id}">Применить</button><button data-pd="${x.id}" aria-label="Удалить пресет">✕</button></span><small>${esc(x.co || 'без названия компании')} · ${esc(curTpl(x.tpl).n)}</small></div>`).join('')}<button data-x="ps" style="margin-top:8px">＋ Сохранить текущие настройки как пресет</button></div>
  <div class="sec"><h3>Сотрудники</h3><textarea rows="4" id="emp" placeholder="По одному на строку">${esc(S.emp.join('\n'))}</textarea>
  <label>По умолчанию<select data-s="def"><option value="">—</option>${S.emp.map(e => `<option ${S.s.def === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label></div>
  <div class="sec"><h3>Данные</h3><div class="chips"><button data-x="imp">📥 Импорт сырья (Excel/CSV)</button><button data-x="tpl">📄 Шаблон Excel</button><button data-x="exi">📊 Сырьё в Excel</button><button data-x="bk">💾 Резервная копия</button><button data-x="rs">♻️ Восстановить</button><button data-x="rst" style="color:var(--bd)">Сбросить всё</button></div><input type="file" id="fi" hidden></div>
  <div class="sec"><h3>Приложение</h3><button id="inst2">⬇ Установить на устройство</button><p class="m" style="margin-top:6px">iPhone: «Поделиться» → «На экран Домой». Работает без интернета после первой загрузки.</p><p class="m">Sticks 2.0 · NEURAL_ARCHITECT_PREMIUM++ · @ASV_PROD</p></div>`;
  const v = $('#v');
  v.oninput = e => { const k = e.target.dataset.s; if (k && e.target.type !== 'checkbox' && k !== 'tpl' && k !== 'mode' && k !== 'def') { S.s[k] = k === 'sc' ? +e.target.value : e.target.value; applyUI(); save(); } if (e.target.id === 'emp') { S.emp = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); save(); } };
  v.onchange = e => { const k = e.target.dataset.s; if (!k) { if (e.target.id === 'fi') fileIn(e); return; } S.s[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value; applyUI(); save(); if (k === 'wake') wake(); if (k === 'sc') renderSet(); };
  if (v._bi) v.removeEventListener('input', v._bi);
  v.addEventListener('input', v._bi = e => { if (e.target.dataset.s === 'bgd') { S.s.bgd = +e.target.value; applyUI(); save(); } });
  v.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.th) { S.s.theme = b.dataset.th; applyUI(); save(); renderSet(); }
    else if (b.dataset.ac) { S.s.ac = b.dataset.ac; applyUI(); save(); }
    else if (b.dataset.pa) applyPreset(b.dataset.pa);
    else if (b.dataset.pd) { S.presets = S.presets.filter(x => x.id !== b.dataset.pd); save(); drawPs(); renderSet(); }
    else if (b.dataset.x === 'ps') { const n = (prompt('Название пресета', S.s.co || 'Пресет ' + (S.presets.length + 1)) || '').trim(); if (!n) return; const x = { id: uid(), n: n.slice(0, 40), co: S.s.co, tpl: S.s.tpl, mode: S.s.mode, def: S.s.def }; S.presets.push(x); S.s.preset = x.id; save(); drawPs(); renderSet(); toast('Пресет сохранён'); }
    else if (b.dataset.bg) { if (b.dataset.bg === 'img' && !S.bgImg) { fmode = 'bg'; $('#fi').accept = 'image/*'; $('#fi').click(); return; } S.s.bg = b.dataset.bg; applyUI(); save(); renderSet(); }
    else if (b.id === 'inst2') { if (dip) { dip.prompt(); } else toast('Меню браузера → «Установить приложение»'); }
    else if (b.dataset.x && b.dataset.x !== 'ps') act(b.dataset.x);
  };
  $('#emp').addEventListener('blur', renderSet);
}
let fmode = '';
const act = async x => {
  if (x === 'imp') { fmode = 'imp'; $('#fi').accept = '.xlsx,.xls,.csv'; $('#fi').click(); }
  else if (x === 'rs') { fmode = 'rs'; $('#fi').accept = '.json'; $('#fi').click(); }
  else if (x === 'tpl') deliver(await makeFile(['Наименование', 'Срок_ч', 'Температура', 'Аллергены'], [['Молоко 3,2%', 72, '+2...+6°C', 'молоко']], 'sticks-template', 'Сырьё'));
  else if (x === 'exi') deliver(await makeFile(['Наименование', 'Срок_ч', 'Температура', 'Аллергены'], S.items.map(i => [i.name, i.shelf, i.temp, i.al]), 'sticks-items', 'Сырьё'), true);
  else if (x === 'bk') { const f = new File([JSON.stringify({ v: 3, items: S.items, emp: S.emp, tpls: S.tpls, presets: S.presets, s: S.s, hist: await hAll() })], 'sticks-backup-' + loc(Date.now()).slice(0, 10) + '.json', { type: 'application/json' }); deliver(f, true); }
  else if (x === 'rst') { if (confirm('Удалить ВСЕ данные приложения?')) { await hClear(); await kvSet('data', null); await kvSet('bg', ''); localStorage.removeItem('sticks.ui'); location.reload(); } }
};
async function fileIn(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    if (fmode === 'bg') { S.bgImg = await shrink(f, 1280, false); await kvSet('bg', S.bgImg); S.s.bg = 'img'; applyUI(); save(); renderSet(); return toast('Фон установлен'); }
    if (fmode === 'rs') {
      const d = JSON.parse(await f.text()); if (!Array.isArray(d.items)) throw Error('формат'); S.items = d.items; S.presets = Array.isArray(d.presets) ? d.presets : []; S.emp = d.emp || []; S.tpls = (d.tpls || []).map(fixTpl).filter(Boolean); Object.assign(S.s, d.s || {});
      if (S.s.hist !== 'off') for (const r of d.hist || []) { delete r.id; await hAdd(r).catch(() => {}); }
      await hPrune(); save(); applyUI(); renderSet(); return toast('Данные восстановлены');
    }
    await lib('xlsx');
    const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let n = 0;
    rows.forEach((r, k) => {
      const name = String(r['Наименование'] || r['Название'] || r['Name'] || r['Продукт'] || '').trim(); if (!name) return;
      const shelf = parseInt(r['Срок_ч'] || r['Срок'] || r['ShelfLife']) || 72, temp = r['Температура'] || r['Хранение'] || '+2...+6°C', al = r['Аллергены'] || '';
      const ex = S.items.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (ex) Object.assign(ex, { shelf, temp, al }); else S.items.push({ id: uid() + k, name, shelf, temp, al, fav: false });
      n++;
    });
    save(); toast(`Загружено позиций: ${n}`);
  } catch (err) { toast('Ошибка файла: ' + err.message); }
}

// ---------- пресеты ----------
function applyPreset(id) {
  const x = S.presets.find(p => p.id === id); if (!x) return;
  Object.assign(S.s, { co: x.co, tpl: tplAll().some(t => t.id === x.tpl) ? x.tpl : 'std', mode: x.mode, def: x.def, preset: id });
  save(); drawPs(); go(S.tab); toast('Пресет: ' + x.n);
}
function drawPs() {
  const el = $('#ps'); el.hidden = !S.presets.length; if (el.hidden) return;
  el.innerHTML = S.presets.map(x => `<option value="${x.id}" ${S.s.preset === x.id ? 'selected' : ''}>${esc(x.n)}</option>`).join('');
}
// ---------- запуск ----------
const VIEWS = { print: renderPrint, cons: renderCons, hist: renderHist, set: renderSet };
function go(t) {
  S.tab = t; const v = $('#v'); v.onclick = v.oninput = v.onchange = v.onpointerdown = v.onmousedown = null; v.replaceWith(v.cloneNode(false)); // сброс слушателей между вкладками
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  VIEWS[t](); if (t === 'print') { $('#v').onclick = viewClick; $('#v').oninput = e => { if (e.target.id === 'q') { S.q = e.target.value; drawList(); } }; $('#v').onkeydown = e => { if (e.key === 'Enter' && e.target.id === 'nn') addItem(); }; }
  $('#v').scrollTop = 0;
}
document.addEventListener('pointerdown', e => { if (e.target.closest('button,.card,.chip')) vib(8); });
$('#nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.t); };
$('#inst').onclick = () => dip?.prompt();
$('#ps').onchange = e => applyPreset(e.target.value);
const net = () => $('#net').classList.toggle('off', !navigator.onLine);
addEventListener('online', net); addEventListener('offline', net);
setInterval(() => { $('#clk').textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); if (S.tab === 'print' && !M) drawList(); }, 30000);

(async () => {
  let d = null; try { d = await kvGet('data'); } catch (e) { toast('Хранилище недоступно — данные не сохранятся'); }
  if (!d) d = migrate();
  if (d) { S.items = d.items || []; S.emp = d.emp || []; S.tpls = (d.tpls || []).map(fixTpl).filter(Boolean); S.presets = Array.isArray(d.presets) ? d.presets : []; Object.assign(S.s, d.s || {}); }
  if (/ВЛАВАШЕ/i.test(S.s.co)) S.s.co = ''; // в программе не должно быть названия конкретной компании
  try { S.bgImg = (await kvGet('bg')) || ''; } catch (e) {} if (S.s.bg === 'img' && !S.bgImg) S.s.bg = 'none';
  applyUI(); drawPs(); net(); $('#clk').textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  lib('qrcode').then(() => { if (M) drawPv(); }).catch(() => {});
  hPrune().catch(() => {}); setInterval(() => hPrune().catch(() => {}), 36e5); wake();
  const t = new URLSearchParams(location.search).get('tab'); go(VIEWS[t] ? t : 'print');
  if ('serviceWorker' in navigator) { const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Приложение обновлено — перезапустите для новой версии'); }); navigator.serviceWorker.register('sw.js').catch(() => {}); }
})();
