// C-03 pixel-font demo: a riverside night scene drawn at 256x224; every letter on the canvas goes through the module.
// ?t=<ms>&freeze=1 steps the demo clock to t in fixed 1000/60 steps and renders once (deterministic). ?<param>=<value> overrides.
'use strict';
const W = 256, H = 224, STEP = 1000 / 60;
const cv = document.getElementById('cv'), g = cv.getContext('2d');
g.imageSmoothingEnabled = false;
const SK = window.GameDNA_Skin ? GameDNA_Skin.resolve('pixel16') : null;
const Q = new URLSearchParams(location.search);
const FREEZE = Q.get('freeze') === '1', T0 = Q.has('t') ? Math.max(0, +Q.get('t') || 0) : null;

const PARAMS = [
  { key: 'font', type: 'seg', options: ['regular', 'mono', 'small'], default: 'regular' },
  { key: 'scale', type: 'seg', options: ['1', '2'], default: '1' },
  { key: 'shadow', type: 'seg', options: ['drop', 'outline', 'both', 'none'], default: 'drop' },
  { key: 'color', type: 'select', options: ['white', 'gold', 'cyan', 'green', 'title'], default: 'white' },
  { key: 'cps', type: 'range', min: 10, max: 120, step: 5, default: 40 },
  { key: 'blipEvery', type: 'range', min: 1, max: 6, step: 1, default: 2 },
  { key: 'pause', type: 'range', min: 0, max: 400, step: 20, default: 160 },
  { key: 'width', type: 'range', min: 120, max: 224, step: 4, default: 224 },
  { key: 'view', type: 'seg', options: ['scene', 'glyphs'], default: 'scene' }
];
const P = {};
PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? Q.get(p.key) : p.default; if (p.type === 'range') P[p.key] = +P[p.key]; });

let blipsThisSecond = 0, audio = null, soundOn = false;
const PF = GameDNA_PixelFont.create({
  skin: 'pixel16',
  params: { font: P.font, scale: +P.scale, shadow: P.shadow, color: P.color, cps: P.cps, blipEvery: P.blipEvery, pause: P.pause },
  onBlip: ch => { blipsThisSecond++; if (soundOn) blip(ch); }
});

// ---------- dialogue script (original lines) ----------
const LINES = [
  { who: 'Ferryman', text: 'The river runs high tonight.{p200} Keep to the {gold}lantern road{/} and you will reach the mill by dawn.' },
  { who: 'Ferryman', text: 'Bring me {cyan}3 river pearls{/} and I will row you across. {red}Do not{/} wake the old heron!' },
  { who: 'Wren', text: 'Pack checked: {green}+42 HP{/}, {gold}2,450 coins{/}, one bent key. Words wrap to the box and never jump while typing.' },
  { who: 'Ferryman', text: 'Symbols too: 100% {#ff9a5a}[ok]{/} #7 @ 9:45 … {purple}Thistlewhisker{/} says hello.' }
];
const S = { t: 0, line: 0, wait: 0, gold: 2450, goldShown: 2450, hp: 120, blipFlash: 0, tick: 0 };
// The dialogue window has a fixed size; a line that needs more rows is split into pages with PF.wrap.
const DLG = { y: 152, h: 66 };
function linesPerPage() { return Math.max(1, Math.floor((DLG.h - 12 - PF.height()) / PF.lineHeight()) + 1); }
function startLine(i) {
  S.line = i % LINES.length; S.page = 0; S.wait = 0;
  const rows = PF.wrap(LINES[S.line].text, textWidth()), n = linesPerPage();
  S.pages = []; for (let k = 0; k < rows.length; k += n) S.pages.push(rows.slice(k, k + n).join('\n'));
  startPage();
}
function startPage() { S.wait = 0; PF.typewriter('dlg', S.pages[S.page] || '', { width: textWidth(), restart: true }); }
function nextPage() { if (S.page + 1 < S.pages.length) { S.page++; startPage(); } else startLine(S.line + 1); }
function textWidth() { return Math.min(+P.width, 224); }
function advance() {             // the confirm key: first press completes the line, second goes on
  if (!PF.skip('dlg')) return;
  nextPage();
}

// ---------- scene art (procedural, seeded) ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const BG = (() => {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const b = c.getContext('2d'), r = rng(7);
  const sky = ['#0b0a24', '#121134', '#1a1744', '#241c52', '#33215c', '#46285f'];
  sky.forEach((col, i) => { b.fillStyle = col; b.fillRect(0, i * 14, W, 14); });
  for (let i = 0; i < 4; i++) { b.fillStyle = sky[i + 1]; for (let x = (i * 3) % 4; x < W; x += 4) b.fillRect(x, (i + 1) * 14 - 1, 2, 1); }
  for (let i = 0; i < 60; i++) { b.fillStyle = r() < 0.25 ? '#fff6d8' : '#8a8cc8'; b.fillRect(Math.floor(r() * W), Math.floor(r() * 70), 1, 1); }
  // moon
  // hand-set pixel disc (no anti-aliasing) with a dithered halo ring, clear of the HUD windows
  const MX = 224, MY = 48, MR = 8;
  for (let y = -MR - 4; y <= MR + 4; y++) for (let x = -MR - 4; x <= MR + 4; x++) {
    const d = x * x + y * y;
    if (d <= MR * MR + MR * 0.6) { b.fillStyle = d > (MR - 1.5) * (MR - 1.5) && x + y > 4 ? '#e8d8a8' : '#fff2c8'; b.fillRect(MX + x, MY + y, 1, 1); }
    else if (d <= (MR + 3) * (MR + 3) && (x + y) % 2 === 0) { b.fillStyle = '#3a3070'; b.fillRect(MX + x, MY + y, 1, 1); }
  }
  b.fillStyle = '#e8d8a8'; b.fillRect(MX - 4, MY - 3, 3, 2); b.fillRect(MX + 2, MY + 2, 2, 2); b.fillRect(MX - 2, MY + 4, 2, 1);
  // far hills
  const ridge = (y0, amp, col, seed) => { const q = rng(seed); let y = y0; b.fillStyle = col; for (let x = 0; x < W; x++) { y += (q() - 0.5) * 1.6; y += (y0 - y) * 0.05; b.fillRect(x, Math.round(y + Math.sin(x / 23) * amp), 1, H); } };
  ridge(78, 5, '#2a2050', 3); ridge(92, 4, '#1e1a40', 5);
  // mill silhouette
  b.fillStyle = '#141230'; b.fillRect(40, 66, 18, 28); b.fillRect(36, 62, 26, 5); b.fillRect(44, 56, 10, 7);
  b.fillStyle = '#ffd25a'; b.fillRect(46, 74, 3, 3); b.fillRect(52, 82, 2, 3);
  b.fillStyle = '#141230'; for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2 + 0.4; for (let k = 2; k < 18; k++) b.fillRect(Math.round(49 + Math.cos(ang) * k), Math.round(58 + Math.sin(ang) * k), 2, 2); }
  // near bank and trees
  b.fillStyle = '#16233a'; b.fillRect(0, 104, W, 30);
  b.fillStyle = '#1c2e46'; for (let x = 0; x < W; x += 2) b.fillRect(x, 104 + ((x * 7) % 5 === 0 ? 0 : 1), 2, 1);
  const tree = (x, h) => { b.fillStyle = '#0e1a2a'; for (let k = 0; k < h; k++) { const w = Math.max(1, Math.round((k / h) * 9)); b.fillRect(x - w, 104 - h + k, w * 2 + 1, 1); } b.fillRect(x, 104, 2, 4); };
  [[12, 26], [24, 18], [228, 30], [242, 20], [214, 16]].forEach(t => tree(t[0], t[1]));
  // river
  b.fillStyle = '#10284a'; b.fillRect(0, 118, W, 30); b.fillStyle = '#163a62'; b.fillRect(0, 118, W, 2);
  // dock
  b.fillStyle = '#5a3a22'; b.fillRect(150, 112, 70, 4); b.fillStyle = '#3a2412'; b.fillRect(150, 116, 70, 1); [154, 172, 190, 208].forEach(x => b.fillRect(x, 116, 3, 14));
  // signpost
  b.fillStyle = '#4a2e18'; b.fillRect(110, 92, 2, 22); b.fillStyle = '#8a5a30'; b.fillRect(96, 88, 34, 11); b.fillStyle = '#b07a44'; b.fillRect(96, 88, 34, 1); b.fillStyle = '#3a2210'; b.fillRect(96, 99, 34, 1);
  return c;
})();
function drawScene() {
  g.drawImage(BG, 0, 0);
  // water shimmer + lantern reflections (clock driven)
  const ph = Math.floor(S.t / 120);
  for (let i = 0; i < 26; i++) { const x = (i * 37 + ph * (1 + (i % 3))) % (W + 8) - 4, y = 122 + ((i * 11) % 24); g.fillStyle = i % 3 ? '#2a5a8a' : '#4a8ac0'; g.fillRect(x, y, 3 + (i % 4), 1); }
  [[160, 104], [214, 104]].forEach(([x, y], i) => {
    const fl = (Math.floor(S.t / 180) + i) % 3;
    g.fillStyle = '#2a1a0e'; g.fillRect(x, y - 2, 2, 10); g.fillStyle = '#ffd25a'; g.fillRect(x - 1, y - 6, 4, 4); g.fillStyle = fl ? '#fff2a0' : '#ffb03a'; g.fillRect(x, y - 5, 2, 2);
    g.fillStyle = 'rgba(255,210,90,0.18)'; g.fillRect(x - 4, y - 9, 10, 10);
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#c08a3a' : '#ffd25a'; g.fillRect(x - 1 + ((k + ph) % 3) - 1, 124 + k * 4, 3, 1); }
  });
  // boat with ferryman
  const bob = Math.floor(S.t / 400) % 2;
  g.fillStyle = '#3a2412'; g.fillRect(118, 132 + bob, 30, 4); g.fillStyle = '#6a4424'; g.fillRect(116, 130 + bob, 34, 3); g.fillStyle = '#8a5a30'; g.fillRect(116, 130 + bob, 34, 1);
  g.fillStyle = '#2e3a5a'; g.fillRect(136, 118 + bob, 6, 12); g.fillStyle = '#e8c8a0'; g.fillRect(137, 114 + bob, 4, 4); g.fillStyle = '#5a4a8a'; g.fillRect(135, 112 + bob, 8, 3); g.fillRect(137, 110 + bob, 4, 2);
  g.fillStyle = '#c8a070'; for (let k = 0; k < 16; k++) g.fillRect(132 - k, 116 + bob + k, 1, 1);
}

// ---------- screen ----------
function frame(r, st) { return SK ? SK.frame(g, r, st || {}) : (g.fillStyle = '#262e4e', g.fillRect(r.x, r.y, r.w, r.h), { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }); }
function render() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (P.view === 'glyphs') return renderGlyphs();
  drawScene();
  // sign in the world: small font, no shadow, dark ink
  PF.draw(g, 'MILL 2', 113, 90, { font: 'small', scale: 1, shadow: 'none', color: '#2a1608', align: 'center' });
  PF.draw(g, '▶', 125, 91, { font: 'small', scale: 1, shadow: 'none', color: '#2a1608' });
  // title
  PF.draw(g, 'Lantern Road', W / 2, 42, { scale: 2, shadow: 'both', color: 'title', align: 'center', font: 'regular' });
  PF.draw(g, 'CHAPTER II · THE CROSSING', W / 2, 62, { font: 'small', scale: 1, shadow: 'drop', color: 'dim', align: 'center' });
  // HUD (small font, tabular digits)
  const hud = frame({ x: 4, y: 4, w: 82, h: 28 }, { team: 'a' });
  PF.draw(g, 'WREN', hud.x + 1, hud.y + 1, { font: 'small', scale: 1, shadow: 'drop', color: 'gold' });
  PF.draw(g, 'HP {white}' + S.hp + '{/}/150', hud.x + hud.w - 1, hud.y + 1, { font: 'small', scale: 1, shadow: 'drop', color: 'blue', align: 'right' });
  g.fillStyle = '#0a0e22'; g.fillRect(hud.x + 1, hud.y + 10, hud.w - 2, 4); g.fillStyle = '#4ad870'; g.fillRect(hud.x + 2, hud.y + 11, Math.round((hud.w - 4) * S.hp / 150), 2);
  const gw = frame({ x: W - 74, y: 4, w: 70, h: 20 }, { team: 'n' });
  PF.draw(g, 'GOLD', gw.x + 1, gw.y + 2, { font: 'small', scale: 1, shadow: 'drop', color: 'gold' });
  PF.draw(g, String(Math.round(S.goldShown)).padStart(5, '0'), gw.x + gw.w - 1, gw.y + 1, { font: 'mono', scale: 1, shadow: 'drop', align: 'right', color: 'white' });
  // dialogue window
  const L = LINES[S.line], dy = DLG.y;
  const dw = frame({ x: 8, y: dy, w: 240, h: DLG.h }, { team: 'n' });
  const nameW = PF.measure(L.who.toUpperCase(), { font: 'small', scale: 1 }) + 12;
  frame({ x: 14, y: dy - 7, w: nameW, h: 11 }, { role: 'plate' });
  PF.draw(g, L.who.toUpperCase(), 14 + nameW / 2, dy - 5, { font: 'small', scale: 1, shadow: 'drop', color: 'gold', align: 'center' });
  PF.drawTyped(g, 'dlg', dw.x + 4, dw.y + 7, { cursor: true });
  if (S.pages.length > 1) PF.draw(g, (S.page + 1) + '/' + S.pages.length, dw.x + dw.w - 4, dw.y + dw.h - 10, { font: 'small', scale: 1, shadow: 'drop', color: 'dim', align: 'right' });
}
function renderGlyphs() {
  g.fillStyle = '#10142e'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, y, W, 1); }
  let ascii = ''; for (let i = 33; i < 127; i++) ascii += String.fromCharCode(i);
  const row = (s, y, op) => PF.draw(g, s, 8, y, Object.assign({ scale: 1, shadow: 'drop' }, op));
  PF.draw(g, 'REGULAR 6x8', 8, 6, { font: 'small', scale: 1, color: 'dim' });
  row(ascii.slice(0, 32).replace(/\{/g, '{{'), 14, { font: 'regular' }); row(ascii.slice(32, 64).replace(/\{/g, '{{'), 25, { font: 'regular' }); row(ascii.slice(64).replace(/\{/g, '{{'), 36, { font: 'regular' });
  PF.draw(g, 'SMALL 5x7', 8, 52, { font: 'small', scale: 1, color: 'dim' });
  row(ascii.slice(0, 47).replace(/\{/g, '{{'), 60, { font: 'small' }); row(ascii.slice(47).replace(/\{/g, '{{'), 68, { font: 'small' });
  PF.draw(g, 'Sphinx of black quartz, judge my vow.', 8, 84, { font: 'regular', scale: 1 });
  PF.draw(g, 'Sphinx of black quartz, judge my vow. 0123456789', 8, 96, { font: 'small', scale: 1 });
  PF.draw(g, '12,450 ', 8, 108, { font: 'mono', scale: 1 }); PF.draw(g, '{gold}♥ 3  {cyan}MP 18/40  {red}POISON  {green}+42', 56, 108, { font: 'regular', scale: 1 });
  PF.draw(g, 'Outline', 8, 122, { scale: 2, shadow: 'outline', color: 'gold' });
  PF.draw(g, 'Both', 100, 122, { scale: 2, shadow: 'both', color: 'cyan' });
  PF.draw(g, 'None', 168, 122, { scale: 2, shadow: 'none', color: 'white' });
  PF.draw(g, 'Fit: a label far too long for its slot', 8, 146, { fit: 112, font: 'regular', scale: 1 });
  g.fillStyle = '#3a4270'; g.fillRect(8, 156, 112, 1);
  PF.draw(g, 'Wrapped to 104 px: colour codes like {gold}these{/} carry over the line break.', 136, 146, { width: 104, font: 'small', scale: 1 });
  PF.drawTyped(g, 'dlg', 8, 172);
}

// ---------- clock ----------
function step() {
  S.t += STEP; S.tick++;
  PF.update(STEP);
  if (PF.done('dlg')) { S.wait += STEP; if (S.wait >= 1800) nextPage(); }
  if (S.tick % 240 === 120) { S.gold += 137; S.hp = S.hp > 60 ? S.hp - 23 : 150; }
  S.goldShown += Math.sign(S.gold - S.goldShown) * Math.min(Math.abs(S.gold - S.goldShown), 3);
}

// ---------- sound (opt-in, user gesture) ----------
function blip(ch) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), v = audio.createGain(), f = 520 + ((ch.charCodeAt(0) * 37) % 9) * 40;
    o.type = 'square'; o.frequency.value = f; v.gain.value = 0.035; v.gain.setTargetAtTime(0, audio.currentTime + 0.02, 0.015);
    o.connect(v); v.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.06);
  } catch (e) { /* no audio */ }
}

// ---------- UI ----------
function applyParams() {
  PF.setParams({ font: P.font, scale: +P.scale, shadow: P.shadow, color: P.color, cps: P.cps, blipEvery: P.blipEvery, pause: P.pause });
  startLine(S.line);
}
function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
function buildControls() {
  const box = document.getElementById('controls'); if (!box) return;
  const labels = { font: 'Font', scale: 'Scale', shadow: 'Shadow', color: 'Default colour', cps: 'Characters / second', blipEvery: 'Blip every n letters', pause: 'Pause after . ! ? (ms)', width: 'Wrap width (px)', view: 'View' };
  PARAMS.forEach(p => {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('label'); lab.textContent = labels[p.key];
    if (p.type === 'range') {
      const out = document.createElement('output'); out.textContent = P[p.key]; lab.appendChild(out); row.appendChild(lab);
      const inp = document.createElement('input'); Object.assign(inp, { type: 'range', min: p.min, max: p.max, step: p.step, value: P[p.key] });
      const fill = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); fill();
      inp.oninput = () => { P[p.key] = +inp.value; out.textContent = inp.value; fill(); applyParams(); syncURL(); };
      row.appendChild(inp);
    } else if (p.type === 'select') {
      row.appendChild(lab); const sel = document.createElement('select');
      p.options.forEach(o => { const op = document.createElement('option'); op.value = op.textContent = o; sel.appendChild(op); }); sel.value = P[p.key];
      sel.onchange = () => { P[p.key] = sel.value; applyParams(); syncURL(); }; row.appendChild(sel);
    } else {
      row.appendChild(lab); const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'radiogroup');
      p.options.forEach(o => { const b = document.createElement('button'); b.textContent = o === '1' || o === '2' ? o + '×' : o; b.setAttribute('aria-checked', String(P[p.key]) === o);
        b.onclick = () => { P[p.key] = o; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); applyParams(); syncURL(); }; seg.appendChild(b); });
      row.appendChild(seg);
    }
    box.appendChild(row);
  });
  document.getElementById('next').onclick = () => advance();
  document.getElementById('replay').onclick = () => startLine(S.line);
  const snd = document.getElementById('sound'); snd.onclick = () => { soundOn = !soundOn; snd.setAttribute('aria-pressed', soundOn); snd.textContent = soundOn ? 'Sound on' : 'Sound off'; };
  addEventListener('keydown', e => { if ((e.key === 'z' || e.key === 'Z' || e.key === 'Enter') && !/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); advance(); } });
  cv.addEventListener('pointerdown', () => advance());
}
function fit() {
  const avail = Math.max(256, Math.min(cv.parentElement.parentElement.clientWidth - 12, 900)), k = Math.max(1, Math.min(3, Math.floor(avail / W)));
  cv.style.width = W * k + 'px'; cv.style.height = H * k + 'px';
  const si = document.getElementById('scaleinfo'); if (si) si.textContent = '256×224 native · ' + k + '×';
}
setInterval(() => { const st = document.getElementById('status'); if (st) st.textContent = PF.done('dlg') ? 'Line ' + (S.line + 1) + '/' + LINES.length + ' done · Z for next' : 'Typing · ' + blipsThisSecond + ' blips/s'; blipsThisSecond = 0; }, 1000);

buildControls(); addEventListener('resize', fit); fit();
startLine(0);
if (FREEZE && T0 !== null) {
  const n = Math.floor(T0 / STEP); for (let i = 0; i < n; i++) step(); render();
  document.documentElement.dataset.frozen = '1';
} else {
  if (T0) { const n = Math.floor(T0 / STEP); for (let i = 0; i < n; i++) step(); }
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { step(); acc -= STEP; } render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
