/* GameDNA C-14 · Toasts & unlock pop-ups (toasts) · module v1.1.1 (plain script, no dependencies, one global)
 *
 *   const toasts = GameDNA_Toasts.create({
 *     bounds: { x: 0, y: 0, w: 640, h: 360 },     // the screen in native (logical) px, or a function returning it
 *     uiRects: () => [{ x, y, w, h }],            // HUD, windows, banners, captions: toasts never cover them
 *     params: { edge: 'top-right', max: 3, hold: 2800, ... }   // see DEFAULTS
 *   });
 *   toasts.push(kind, title, { text, count, key, icon, rarity, accent, label, hold, priority })
 *        // kind: achievement | quest | item | unlock | level | info | warning
 *   toasts.update(stepMs)        // every fixed step, in every scene (0 holds every timer)
 *   toasts.draw(ctx)             // last in the frame, in screen coordinates, on top of the HUD
 *
 * Achievement, quest-update and item-get notices that slide in from a screen edge, stack, glide when the stack changes,
 * auto-dismiss with a visible timer line, merge duplicates into one card with a punching "×3" badge, queue when more arrive
 * than fit ("+2 more" chip, the visible ones leave sooner while others wait), keep inside a safe area and move around every
 * rect the game reports. Never pauses or takes input. Smooth glassy cards on HD canvases; a crisp pixel card with built-in
 * 5×7 / 3×5 bitmap fonts and 7×7 icons on native pixel canvases. Every motion is a function of the clock given to update():
 * ?t=&freeze=1 screenshots are deterministic. Never throws from push / update / draw.
 */
(function (root) {
  'use strict';
  var DEFAULTS = { edge: 'top-right', max: 3, hold: 2800, merge: 'on', enter: 'slide', size: 0, margin: 0, theme: 'dusk', progress: 'on', render: 'auto', more: 'on' };
  var EDGES = { 'top-right': 1, 'top-left': 1, 'top': 1, 'bottom-right': 1, 'bottom-left': 1, 'bottom': 1 };
  var ENTER = 380, EXIT = 300, MINSHOW = 1100, QCAP = 24;
  var FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var KINDS = {
    achievement: { label: 'Achievement unlocked', icon: 'trophy', accent: '#ffc53d', hold: 1.4 },
    quest:       { label: 'Quest updated', icon: 'flag', accent: '#5fc8ff', hold: 1.15 },
    item:        { label: 'Received', icon: 'gem', accent: '#7fe39a', hold: 1 },
    unlock:      { label: 'Unlocked', icon: 'lock', accent: '#c48bff', hold: 1.15 },
    level:       { label: 'Level up', icon: 'arrow', accent: '#ff9e4a', hold: 1.2 },
    info:        { label: 'Notice', icon: 'info', accent: '#a9b7d6', hold: 0.9 },
    warning:     { label: 'Warning', icon: 'alert', accent: '#ff6457', hold: 1.1 }
  };
  var RARITY = { common: '#c9d1e2', uncommon: '#7fe39a', rare: '#5ab0ff', epic: '#c07cff', legendary: '#ffb340' };
  var THEMES = {
    dusk:  { top: 'rgba(40,36,58,0.94)', bot: 'rgba(22,19,32,0.94)', edge: 'rgba(255,255,255,0.13)', rim: 'rgba(0,0,0,0.55)', title: '#f6f3ff', text: '#b9b3cf', shadow: 'rgba(4,2,12,0.55)', track: 'rgba(255,255,255,0.08)', px: ['#1c1828', '#2a2540', '#0a0812', '#4a4366'] },
    frost: { top: 'rgba(250,251,255,0.96)', bot: 'rgba(226,232,244,0.96)', edge: 'rgba(255,255,255,0.9)', rim: 'rgba(30,36,60,0.28)', title: '#1b1f30', text: '#5a6280', shadow: 'rgba(20,24,48,0.35)', track: 'rgba(30,40,80,0.10)', px: ['#e6ebf5', '#ffffff', '#3a4060', '#c4ccdf'] },
    ink:   { top: 'rgba(8,8,12,0.97)', bot: 'rgba(8,8,12,0.97)', edge: 'rgba(255,255,255,0.0)', rim: 'rgba(255,255,255,0.55)', title: '#ffffff', text: '#d0d0d8', shadow: 'rgba(0,0,0,0.5)', track: 'rgba(255,255,255,0.14)', px: ['#08080c', '#08080c', '#e8e8f0', '#30303c'] }
  };
  /* ---------- bitmap fonts for the crisp (native pixel) card: key char + one base-32 digit per row ---------- */
  var F5S = "0ehjlphe14c4444e2eh1248v3v2421he426aiv225vgu11he668guhhe7v1248888ehhehhe9ehhf12cAehhvhhhBuhhuhhuCehgggheDuhhhhhuEvgguggvFvggugggGehgnhhfHhhhvhhhIe44444eJ72222icKhikokihLggggggvMhrllhhhNhhpljhhOehhhhhePuhhugggQehhhlidRuhhukihSfgge11uTv444444UhhhhhheVhhhhha4WhhhlllaXhha4ahhYhha4444Zv1248gv!4444404?eh12404.0000004,0000048:0040040'4480000-000e000+044v440/11248gg(2488842)8422248%op248j3&cik8lid#aavavaa×0ha4ah0\"aa00000*04lel40=00v0v00<248g842>8421248";
  var F3S = "075557126227261247361216455711574616634757771222875757975716A25755B65656C34443D65556E74647F74644G34553H55755I72227J11152K55655L44447M57755N65555O25552P65644Q25563R65655S34216T72222U55557V55552W55775X55255Y55222Z71247!22202.00002-00700+02720/11244:02020'22000×05250?61202(24442)21112,00024%51245#57575&25253=07070\"55000*05250";
  function decodeFont(s, rows, cols) {
    var out = {}, i, r;
    for (i = 0; i + rows < s.length + 1; i += rows + 1) {
      var g = [], lo = cols, hi = -1;
      for (r = 0; r < rows; r++) { var v = parseInt(s.charAt(i + 1 + r), 32) || 0; g.push(v); for (var c = 0; c < cols; c++) if (v & (1 << (cols - 1 - c))) { if (c < lo) lo = c; if (c > hi) hi = c; } }
      out[s.charAt(i)] = { rows: g, lo: hi < 0 ? 0 : lo, w: hi < 0 ? 2 : hi - lo + 1 };
    }
    return out;
  }
  var FONTS = { big: { g: decodeFont(F5S, 7, 5), h: 7, cols: 5, space: 3 }, small: { g: decodeFont(F3S, 5, 3), h: 5, cols: 3, space: 2 } };
  /* ---------- 7×7 pixel icons (crisp); a = accent, l = light, d = dark, w = white; a 1 px outline is added ---------- */
  var PXI = {
    trophy: ['lllllll', 'lalaaad', '.laaad.', '..lad..', '...a...', '..aad..', '.ddddd.'],
    flag:   ['waaaaa.', 'wlaaaad', 'wlaaad.', 'waaaaad', 'w......', 'w......', 'w......'],
    gem:    ['..lla..', '.llaaa.', 'lllaaad', '.laaad.', '..aad..', '...d...', '.......'],
    lock:   ['.www...', 'w...w..', 'w......', 'lllllll', 'laaadaa', 'laaadaa', 'ddddddd'],
    arrow:  ['...l...', '..lla..', '.llaaa.', 'llaaaad', '..aad..', '..aad..', '..ddd..'],
    info:   ['.aaaaa.', 'aaawaaa', 'aaaaaaa', 'aawwaaa', 'aaawaaa', 'aawwwaa', '.aaaaa.'],
    alert:  ['...a...', '..awa..', '..awa..', '.aawaa.', '.aaaaa.', 'aaawaaa', 'aaaaaaa'],
    coin:   ['..lla..', '.lwaaa.', 'llwaaad', 'llaaaad', 'laaaadd', '.aaadd.', '..ddd..'],
    heart:  ['.ll.ad.', 'lwlaaad', 'llaaaad', '.laaad.', '..aad..', '...d...', '.......'],
    star:   ['...l...', '..lla..', 'lllaaad', '.laaad.', '..aad..', '.la.ad.', '.l...d.'],
    leaf:   ['....ll.', '..llla.', '.llaad.', '.laadd.', '..add..', '.d.....', 'd......'],
    potion: ['..lll..', '...a...', '..lal..', '.laaad.', '.awaad.', '.aaadd.', '..ddd..'],
    pouch:  ['.d...d.', '..ddd..', '..lal..', '.laaad.', 'lwaaadd', 'laaaadd', '.ddddd.'],
    sword:  ['......w', '.....w.', '....w..', 'd..w...', '.dw....', '.ad....', 'a..d...']
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function easeIn(u) { u = clamp(u, 0, 1); return u * u * u; }
  // spring-ish overshoot for entering cards: 0 -> ~1.06 -> 1
  function backOut(u) { u = clamp(u, 0, 1); var s = 1.6; u -= 1; return 1 + u * u * ((s + 1) * u + s); }
  function bump(a) { if (a < 0 || a > 320) return 0; if (a < 60) return easeOut(a / 60); var u = (a - 60) / 260; return Math.exp(-u * 4) * Math.cos(u * Math.PI * 1.3); }
  function hash(a, b) { var h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function devScale(ctx) { try { var m = ctx.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { return 1; } }
  function hexRGB(h) { var s = String(h || '#ffffff').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; var n = parseInt(s.slice(0, 6), 16); if (!isFinite(n)) n = 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixHex(a, b, k) { var x = hexRGB(a), y = hexRGB(b); return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * k) + ',' + Math.round(x[1] + (y[1] - x[1]) * k) + ',' + Math.round(x[2] + (y[2] - x[2]) * k) + ')'; }
  function lum(h) { var c = hexRGB(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function rgba(h, a) { var c = hexRGB(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hit(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }

  /* ---------- smooth vector icons, centred on 0,0, radius r ---------- */
  function iconPath(g, name, r) {
    g.beginPath();
    if (name === 'trophy') {
      g.moveTo(-r * 0.62, -r * 0.78); g.lineTo(r * 0.62, -r * 0.78); g.quadraticCurveTo(r * 0.6, r * 0.12, 0, r * 0.25); g.quadraticCurveTo(-r * 0.6, r * 0.12, -r * 0.62, -r * 0.78);
      g.rect(-r * 0.12, r * 0.2, r * 0.24, r * 0.38); g.rect(-r * 0.45, r * 0.55, r * 0.9, r * 0.24);
    } else if (name === 'flag') {
      g.rect(-r * 0.62, -r * 0.85, r * 0.16, r * 1.7);
      g.moveTo(-r * 0.46, -r * 0.82); g.quadraticCurveTo(-r * 0.05, -r * 1.0, r * 0.25, -r * 0.78); g.quadraticCurveTo(r * 0.5, -r * 0.62, r * 0.78, -r * 0.74); g.lineTo(r * 0.78, r * 0.06);
      g.quadraticCurveTo(r * 0.5, r * 0.18, r * 0.25, r * 0.02); g.quadraticCurveTo(-r * 0.05, -r * 0.2, -r * 0.46, -r * 0.02); g.closePath();
    } else if (name === 'gem') {
      g.moveTo(-r * 0.45, -r * 0.7); g.lineTo(r * 0.45, -r * 0.7); g.lineTo(r * 0.85, -r * 0.2); g.lineTo(0, r * 0.85); g.lineTo(-r * 0.85, -r * 0.2); g.closePath();
    } else if (name === 'lock') {
      g.rect(-r * 0.7, -r * 0.12, r * 1.4, r * 0.98);
      g.moveTo(-r * 0.48, -r * 0.12); g.lineTo(-r * 0.48, -r * 0.42); g.arc(0, -r * 0.42, r * 0.48, Math.PI, Math.PI * 1.85); g.lineTo(r * 0.34, -r * 0.62); g.arc(0, -r * 0.42, r * 0.3, Math.PI * 1.82, Math.PI, true); g.lineTo(-r * 0.3, -r * 0.12); g.closePath();
    } else if (name === 'arrow') {
      g.moveTo(0, -r * 0.88); g.lineTo(r * 0.8, -r * 0.05); g.lineTo(r * 0.3, -r * 0.05); g.lineTo(r * 0.3, r * 0.82); g.lineTo(-r * 0.3, r * 0.82); g.lineTo(-r * 0.3, -r * 0.05); g.lineTo(-r * 0.8, -r * 0.05); g.closePath();
    } else if (name === 'alert') {
      g.moveTo(0, -r * 0.88); g.lineTo(r * 0.92, r * 0.78); g.lineTo(-r * 0.92, r * 0.78); g.closePath();
    } else if (name === 'coin') {
      g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    } else if (name === 'leaf') {
      g.moveTo(-r * 0.7, r * 0.7); g.bezierCurveTo(-r * 0.9, -r * 0.3, -r * 0.1, -r * 0.9, r * 0.8, -r * 0.8); g.bezierCurveTo(r * 0.75, r * 0.1, r * 0.1, r * 0.75, -r * 0.55, r * 0.55); g.lineTo(-r * 0.7, r * 0.85); g.closePath();
    } else if (name === 'potion') {
      g.rect(-r * 0.2, -r * 0.9, r * 0.4, r * 0.42); g.moveTo(r * 0.72, r * 0.28); g.arc(0, r * 0.28, r * 0.62, 0, Math.PI * 2);
    } else if (name === 'pouch') {
      g.moveTo(-r * 0.32, -r * 0.55); g.lineTo(-r * 0.55, -r * 0.88); g.lineTo(r * 0.55, -r * 0.88); g.lineTo(r * 0.32, -r * 0.55);
      g.bezierCurveTo(r * 0.95, -r * 0.2, r * 0.95, r * 0.85, 0, r * 0.85); g.bezierCurveTo(-r * 0.95, r * 0.85, -r * 0.95, -r * 0.2, -r * 0.32, -r * 0.55); g.closePath();
    } else if (name === 'sword') {
      g.moveTo(r * 0.85, -r * 0.85); g.lineTo(r * 0.75, -r * 0.45); g.lineTo(-r * 0.2, r * 0.5); g.lineTo(-r * 0.5, r * 0.2); g.lineTo(r * 0.45, -r * 0.75); g.closePath();
      g.moveTo(-r * 0.62, r * 0.12); g.lineTo(-r * 0.12, r * 0.62); g.lineTo(-r * 0.22, r * 0.72); g.lineTo(-r * 0.72, r * 0.22); g.closePath();
      g.moveTo(-r * 0.42, r * 0.5); g.lineTo(-r * 0.78, r * 0.86); g.lineTo(-r * 0.86, r * 0.78); g.lineTo(-r * 0.5, r * 0.42); g.closePath();
    } else if (name === 'heart') {
      g.moveTo(0, r * 0.82); g.bezierCurveTo(-r * 1.1, r * 0.05, -r * 0.75, -r * 0.95, 0, -r * 0.42); g.bezierCurveTo(r * 0.75, -r * 0.95, r * 1.1, r * 0.05, 0, r * 0.82);
    } else if (name === 'star') {
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r * 0.9; if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath();
    } else {   // info: a disc (the glyph is cut in by drawIconSmooth)
      g.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    }
  }
  function drawIconSmooth(g, name, r, ink) {
    iconPath(g, name, r); g.fillStyle = ink; g.fill('nonzero');
    // inner marks in the badge colour
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    if (name === 'info') { g.beginPath(); g.arc(0, -r * 0.42, r * 0.13, 0, Math.PI * 2); g.fill(); g.fillRect(-r * 0.1, -r * 0.18, r * 0.2, r * 0.66); }
    if (name === 'alert') { g.fillRect(-r * 0.09, -r * 0.3, r * 0.18, r * 0.62); g.beginPath(); g.arc(0, r * 0.52, r * 0.1, 0, Math.PI * 2); g.fill(); }
    if (name === 'lock') { g.beginPath(); g.arc(0, r * 0.28, r * 0.15, 0, Math.PI * 2); g.fill(); g.fillRect(-r * 0.06, r * 0.3, r * 0.12, r * 0.3); }
    if (name === 'gem') { g.globalAlpha = 0.45; g.beginPath(); g.moveTo(-r * 0.85, -r * 0.2); g.lineTo(r * 0.85, -r * 0.2); g.lineTo(r * 0.85, -r * 0.14); g.lineTo(-r * 0.85, -r * 0.14); g.fill(); g.beginPath(); g.moveTo(-r * 0.2, -r * 0.7); g.lineTo(0, r * 0.85); g.lineTo(-r * 0.08, -r * 0.7); g.fill(); }
    if (name === 'coin') { g.beginPath(); g.arc(0, 0, r * 0.58, 0, Math.PI * 2); g.lineWidth = r * 0.1; g.stroke(); g.globalAlpha = 0.55; g.beginPath(); g.arc(0, 0, r * 0.44, Math.PI * 1.05, Math.PI * 1.6); g.lineWidth = r * 0.14; g.lineCap = 'round'; g.stroke(); }
    if (name === 'potion') { g.globalAlpha = 0.6; g.beginPath(); g.arc(-r * 0.2, r * 0.12, r * 0.14, 0, Math.PI * 2); g.fill(); }
    if (name === 'leaf') { g.globalAlpha = 0.6; g.lineWidth = r * 0.09; g.lineCap = 'round'; g.beginPath(); g.moveTo(-r * 0.5, r * 0.6); g.quadraticCurveTo(r * 0.05, -r * 0.05, r * 0.62, -r * 0.62); g.stroke(); }
    g.restore();
  }

  function create(opt) {
    opt = opt || {};
    var P = {}, k0; for (k0 in DEFAULTS) P[k0] = DEFAULTS[k0]; set(opt.params);
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var t = 0, seq = 0, cards = [], queue = [], chip = null, drawn = [], warned = {}, lastView = null, mode = null, MC = {}, PXC = {}, stats = { pushes: 0, merges: 0, entered: 0, exits: 0, noroom: 0, drops: 0, maxQueue: 0, errors: 0 };
    var meas = null;

    function set(o) { if (o) for (var key in o) if (key in DEFAULTS && o[key] != null && o[key] !== '') P[key] = typeof DEFAULTS[key] === 'number' ? (+o[key] || 0) : String(o[key]); if (!EDGES[P.edge]) P.edge = 'top-right'; }
    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; if (root.console) console.warn('[GameDNA_Toasts] ' + msg); }
    function emit(info) { if (typeof opt.debug === 'function') try { opt.debug(info); } catch (e) {} }
    function B() {
      var b = opt.bounds; if (typeof b === 'function') try { b = b(); } catch (e) { b = null; warn('bounds', 'bounds() threw'); }
      if (b && isFinite(+b.w) && +b.w > 0 && isFinite(+b.h) && +b.h > 0) return { x: +b.x || 0, y: +b.y || 0, w: +b.w, h: +b.h };
      return lastView || { x: 0, y: 0, w: 640, h: 360 };
    }
    function avoid() {
      var f = opt.uiRects || opt.getObstacles, list = f;
      if (typeof f === 'function') try { list = f(); } catch (e) { list = null; warn('ui', 'uiRects() threw: ' + (e && e.message)); }
      var out = [];
      if (list && list.length) for (var i = 0; i < list.length; i++) {
        var r = list[i]; if (!r) continue;
        var x = +(r.x != null ? r.x : r[0]), y = +(r.y != null ? r.y : r[1]), w = +(r.w != null ? r.w : r.width != null ? r.width : r[2]), h = +(r.h != null ? r.h : r.height != null ? r.height : r[3]);
        if (isFinite(x) && isFinite(y) && w > 0 && h > 0) out.push({ x: x, y: y, w: w, h: h });
      }
      return out;
    }
    function crispGuess() {
      if (P.render === 'crisp') return true; if (P.render === 'smooth') return false;
      if (SK) return !!SK.pixel;
      return mode != null ? mode : B().w <= 400;
    }
    function TH() {
      if (P.theme === 'skin' && SK) {
        var tk = function (p, d) { try { var v = SK.token(p); return typeof v === 'string' && v.charAt(0) === '#' ? v : d; } catch (e) { return d; } };
        var f = tk('ui.fill', '#1c1828'), f2 = tk('ui.fillTo', f), ed = tk('ui.edge', '#4a4366');
        return { top: rgba(f, 0.95), bot: rgba(f2, 0.95), edge: rgba(tk('ui.highlight', '#ffffff'), 0.18), rim: rgba(ed, 0.9), title: tk('text.main', '#f6f3ff'), text: tk('text.dim', '#b9b3cf'), shadow: 'rgba(0,0,0,0.5)', track: 'rgba(255,255,255,0.1)', px: [f, f2, tk('ink', '#0a0812'), ed] };
      }
      return THEMES[P.theme] || THEMES.dusk;
    }
    // unit sizes: S = title px in smooth mode; sc = bitmap scale in crisp mode
    function SZ() { var w = B().w; return +P.size > 0 ? clamp(+P.size, 6, 32) : clamp(Math.round(w / 52), 10, 22); }
    function SC() { var w = B().w; return +P.size > 0 ? clamp(Math.round(+P.size / 7), 1, 4) : clamp(Math.floor(w / 300) + 1, 1, 4); }
    function MARGIN() { var w = B().w; return +P.margin > 0 ? +P.margin : Math.max(4, Math.round(w * 0.022)); }
    function GAP(crisp) { return crisp ? 2 * SC() : Math.round(SZ() * 0.5); }

    /* ---------- text ---------- */
    function mctx() { if (!meas) meas = mk(4, 4).getContext('2d'); return meas; }
    function fontCss(px, weight) { return weight + ' ' + px + 'px ' + FAMILY; }
    function tw(str, px, weight, spacing) {
      var key = str + '|' + px + '|' + weight + '|' + (spacing || 0); if (MC[key] != null) return MC[key];
      var g = mctx(); g.font = fontCss(px, weight); var w = g.measureText(str).width + (spacing || 0) * Math.max(0, str.length - 1);
      if (Object.keys(MC).length > 800) MC = {}; return (MC[key] = w);
    }
    function bw(str, font, sc) {   // bitmap width
      var F = FONTS[font], w = 0, s = String(str).toUpperCase();
      for (var i = 0; i < s.length; i++) { var ch = s.charAt(i), gl = F.g[ch]; w += (ch === ' ' ? F.space : gl ? gl.w : F.space) + 1; }
      return Math.max(0, w - 1) * sc;
    }
    function fit(str, maxW, measure) {   // truncate with an ellipsis to fit
      str = String(str == null ? '' : str); if (measure(str) <= maxW) return str;
      var s = str; while (s.length > 1 && measure(s + '…') > maxW) s = s.slice(0, -1);
      return s.replace(/\s+$/, '') + '…';
    }
    function fitBitmap(str, maxW, font, sc) {
      str = String(str == null ? '' : str).toUpperCase(); if (bw(str, font, sc) <= maxW) return str;
      var s = str; while (s.length > 1 && bw(s + '..', font, sc) > maxW) s = s.slice(0, -1);
      return s.replace(/\s+$/, '') + '..';
    }
    function drawBitmap(g, str, x, y, font, sc, col) {
      var F = FONTS[font], s = String(str).toUpperCase(); g.fillStyle = col;
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i), gl = F.g[ch];
        if (ch === ' ' || !gl) { x += (F.space + 1) * sc; continue; }
        for (var r = 0; r < F.h; r++) { var bits = gl.rows[r]; for (var c = gl.lo; c < gl.lo + gl.w; c++) if (bits & (1 << (F.cols - 1 - c))) g.fillRect(x + (c - gl.lo) * sc, y + r * sc, sc, sc); }
        x += (gl.w + 1) * sc;
      }
    }

    /* ---------- cards ---------- */
    function titleOf(c) { return String(c.title).indexOf('{n}') >= 0 ? String(c.title).split('{n}').join(String(c.count)) : String(c.title); }
    function badgeOf(c) { return c.count > 1 && c.kind !== 'warning' && c.kind !== 'info' && c.kind !== 'quest' && String(c.title).indexOf('{n}') < 0 ? '×' + c.count : ''; }
    function holdOf(c) { var h = (c.hold > 0 ? c.hold : +P.hold * ((KINDS[c.kind] || KINDS.info).hold || 1)); if (queue.length) h = Math.max(MINSHOW, h * (queue.length > 2 ? 0.45 : 0.65)); return h; }
    function measureCard(c, crisp) {
      var b = B(), m = MARGIN(), maxW = Math.max(40, Math.min(b.w - 2 * m, crisp ? Math.round(b.w * 0.5) : Math.round(b.w * 0.44)));
      var title = titleOf(c), badge = badgeOf(c), L;
      if (crisp) {
        var sc = SC(), pad = 3 * sc, ic = 9 * sc, strip = 2 * sc, bW = badge ? bw(badge, 'big', sc) + 3 * sc : 0;
        var inner = maxW - strip - pad - ic - 3 * sc - pad;
        var tl = fitBitmap(title, inner - bW, 'big', sc), lb = fitBitmap(c.label, inner, 'small', sc), tx = c.text ? fitBitmap(c.text, inner, 'small', sc) : '';
        var cw = Math.max(bw(tl, 'big', sc) + bW, bw(lb, 'small', sc), tx ? bw(tx, 'small', sc) : 0);
        var w = clamp(strip + pad + ic + 3 * sc + cw + pad, Math.round(b.w * 0.3), maxW), h = pad + 5 * sc + 2 * sc + 7 * sc + (tx ? 2 * sc + 5 * sc : 0) + pad;
        L = { crisp: true, w: w, h: h, sc: sc, pad: pad, ic: ic, strip: strip, title: tl, label: lb, text: tx, badge: badge };
      } else {
        var S = SZ(), padS = Math.round(S * 0.68), icD = Math.round(S * 2.3), lpx = Math.max(9, Math.round(S * 0.72)), tpx = Math.max(9, Math.round(S * 0.82)), lsp = S * 0.06;
        var badgeW = badge ? tw(badge, Math.round(S * 0.86), 800) + S * 0.9 : 0, gapI = Math.round(S * 0.75);
        var innerS = maxW - padS - icD - gapI - padS;
        var ttl = fit(title, innerS - (badge ? badgeW + S * 0.4 : 0), function (s) { return tw(s, S, 700); });
        var lbl = fit(c.label.toUpperCase(), innerS, function (s) { return tw(s, lpx, 800, lsp); });
        var txt = c.text ? fit(c.text, innerS, function (s) { return tw(s, tpx, 500); }) : '';
        var cwS = Math.max(tw(ttl, S, 700) + (badge ? badgeW + S * 0.4 : 0), tw(lbl, lpx, 800, lsp), txt ? tw(txt, tpx, 500) : 0);
        var textH = lpx * 1.25 + S * 1.25 + (txt ? tpx * 1.35 : 0);
        var hS = Math.round(Math.max(icD, textH) + padS * 2);
        var wS = Math.round(clamp(padS + icD + gapI + cwS + padS + S * 0.3, Math.round(b.w * 0.26), maxW));
        L = { crisp: false, w: wS, h: hS, S: S, pad: padS, ic: icD, gapI: gapI, lpx: lpx, tpx: tpx, lsp: lsp, title: ttl, label: lbl, text: txt, badge: badge, badgeW: badgeW, textH: textH };
      }
      return L;
    }
    function lay(c, crisp) { if (!c.L || c.L.crisp !== crisp || c.L.rev !== c.rev || c.L.bw !== B().w) { c.L = measureCard(c, crisp); c.L.rev = c.rev; c.L.bw = B().w; } return c.L; }
    function side() { var e = P.edge; return { top: e.indexOf('top') === 0, right: e.indexOf('right') > 0, left: e.indexOf('left') > 0 }; }
    function xFor(w) { var b = B(), m = MARGIN(), s = side(); return s.right ? b.x + b.w - m - w : s.left ? b.x + m : Math.round(b.x + (b.w - w) / 2); }
    // first y at or after `y` (top stacks; before, for bottom stacks) where a card of w×h touches no UI rect
    function column(x, y0, w, h, rects, pad) {
      var b = B(), m = MARGIN(), s = side(), y = y0, x1 = x, room = Math.floor(m / 2);
      for (var n = 0; n < 24; n++) {
        var r = { x: x, y: y, w: w, h: h }, blocker = null;
        for (var i = 0; i < rects.length; i++) if (hit(r, rects[i], pad)) { blocker = rects[i]; break; }
        if (!blocker) break;
        // a rect that clips the column's inner side by a hair (<= 2 px past the gap): nudge the card toward the edge instead
        var need = s.right ? blocker.x + blocker.w + pad + 1 - x : s.left ? x + w + pad + 1 - blocker.x : 0;
        if (need > 0 && need <= pad + 3 && ((s.right && blocker.x < x && x + need + w <= b.x + b.w - room) || (s.left && blocker.x + blocker.w > x + w && x - need >= b.x + room))) { x += s.right ? need : -need; continue; }
        y = s.top ? blocker.y + blocker.h + pad + 1 : blocker.y - pad - 1 - h;
      }
      return { x: x, y: y, nudge: x - x1, ok: s.top ? y + h <= b.y + b.h - m : y >= b.y + m };
    }
    // the edge column first; when it has no room (units or HUD fill the corner), the nearest x beside a blocking rect, same row
    function slot(y, w, h, rects) {
      var b = B(), m = MARGIN(), x0 = xFor(w), pad = Math.max(2, Math.round(GAP(crispGuess()) * 0.6)), best = column(x0, y, w, h, rects, pad);
      if (best.ok) return best;
      var xs = [];
      for (var i = 0; i < rects.length; i++) { xs.push(Math.round(rects[i].x - pad - 1 - w)); xs.push(Math.round(rects[i].x + rects[i].w + pad + 1)); }
      xs = xs.filter(function (x) { return x >= b.x + m && x + w <= b.x + b.w - m; }).sort(function (p, q) { return Math.abs(p - x0) - Math.abs(q - x0) || p - q; });
      for (var k = 0; k < xs.length; k++) { var c = column(xs[k], y, w, h, rects, pad); if (c.ok) { c.alt = true; return c; } }
      return best;
    }
    function cardX(c, L) { return c.alt && c.tx != null ? c.tx : xFor(L.w) + (c.nudge || 0); }
    // target slots for every card (in arrival order), the "+N more" chip, and promotion from the queue
    function layout() {
      var b = B(), m = MARGIN(), s = side(), crisp = crispGuess(), gap = GAP(crisp), rects = avoid();
      var cur = s.top ? b.y + m : b.y + b.h - m, i, c, L, sl, escAll = false;
      for (i = 0; i < cards.length; i++) {
        c = cards[i]; L = lay(c, crisp);
        var k = c.phase === 'out' ? 1 - easeIn((t - c.outT) / EXIT) : 1, hh = L.h * k + gap * k;   // a leaving card's slot collapses
        sl = slot(s.top ? cur : cur - L.h, L.w, L.h, rects);
        if (c.hidden) { if (c.phase === 'out' || !sl.ok) continue; c.hidden = false; c.phase = 'in'; c.born = t; c.y = sl.y; c.vy = 0; emit({ event: 'show', id: c.id, title: titleOf(c) }); }
        else if (!sl.ok && c.phase !== 'out') {   // no legal slot now (a window opened over the stack): fade out in place, keep the card, come back later
          c.hidden = true; c.hideT = t; c.hideCover = false; if (c.y != null) for (var q0 = 0; q0 < rects.length; q0++) if (hit({ x: cardX(c, L), y: c.y, w: L.w, h: L.h }, rects[q0], 0)) c.hideCover = true; stats.noroom++; emit({ event: 'hide', id: c.id, why: 'noroom', title: titleOf(c) }); continue;
        }
        if (c.phase === 'out' && c.ty != null) {   // a leaving card follows small reflows, never a jump (a window took the column): then it keeps its spot
          if (sl.ok && Math.abs(sl.y - c.ty) <= L.h + gap + 2 && Math.abs(sl.x - c.tx) <= 3) c.ty = sl.y;
          cur = s.top ? Math.max(cur, c.ty) + hh : Math.min(cur, c.ty + L.h) - hh; continue;
        }
        var oldX = c.tx != null && c.y != null ? cardX(c, L) : null, oldTy = c.ty;
        c.tx = sl.x; c.ty = sl.y; c.alt = !!sl.alt; c.nudge = sl.nudge || 0;
        if (oldX != null && c.phase !== 'out' && (Math.abs(cardX(c, L) - oldX) > 3 || Math.abs(c.ty - oldTy) > L.h + gap + 2)) {   // the slot jumped (not a reflow, which moves it a little per step): vanish here, fade in there (never slide across other cards)
          c.rel = { t: t, x: oldX, y: c.y }; c.y = c.ty; c.vy = 0; emit({ event: 'relocate', id: c.id, title: titleOf(c) });
        }
        if (c.y == null) { c.y = c.ty; c.vy = 0; }
        var cr = { x: c.tx, y: c.y, w: L.w, h: L.h }; c.esc = escAll; for (var q = 0; q < rects.length; q++) if (hit(cr, rects[q], 0)) { c.esc = true; break; }
        if (c.esc && c.phase !== 'out') escAll = true;   // the cards behind an escaping one move as fast
        cur = s.top ? Math.max(cur, sl.y) + hh : Math.min(cur, sl.y + L.h) - hh;
      }
      // promote waiting cards while there is a free slot and room
      var live = cards.filter(function (q) { return q.phase !== 'out'; }).length;
      while (queue.length && live < Math.max(1, Math.round(+P.max) || 1)) {
        c = queue[0]; L = lay(c, crisp);
        sl = slot(s.top ? cur : cur - L.h, L.w, L.h, rects);
        if (!sl.ok) { if (!c.waitNoted) { c.waitNoted = 1; emit({ event: 'wait', id: c.id, why: 'noroom' }); } break; }
        queue.shift(); c.phase = 'in'; c.born = t; c.holdT = t; c.tx = sl.x; c.alt = !!sl.alt; c.ty = sl.y; c.y = sl.y; c.vy = 0; cards.push(c); live++; stats.entered++;
        emit({ event: 'enter', id: c.id, kind: c.kind, title: titleOf(c), count: c.count });
        cur = s.top ? sl.y + L.h + gap : sl.y - gap;
      }
      // the "+N more" chip after the stack
      if (queue.length && P.more !== 'off') {
        var txt = '+' + queue.length + ' more', cw = crisp ? bw(txt, 'small', SC()) + 6 * SC() : tw(txt, Math.round(SZ() * 0.72), 700) + SZ() * 1.3, ch = crisp ? 9 * SC() : Math.round(SZ() * 1.55);
        sl = slot(s.top ? cur : cur - ch, cw, ch, rects);
        if (!chip) chip = { y: sl.y, vy: 0, born: t };
        chip.text = txt; chip.w = cw; chip.h = ch; chip.tx = sl.x; chip.ty = sl.y; chip.ok = sl.ok;
      } else if (chip) { chip = null; }
    }
    function lifecycle(h) {
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (c.hidden && c.phase !== 'out') { c.holdT += h; continue; }   // a hidden card's timer waits
        if (c.phase === 'in' && t - c.born >= ENTER) c.phase = 'hold';
        if (c.phase !== 'out' && t - c.holdT >= holdOf(c)) { c.phase = 'out'; c.outT = t; c.why = 'timeout'; stats.exits++; emit({ event: 'exit', id: c.id, why: 'timeout', title: titleOf(c) }); }
      }
      cards = cards.filter(function (c) { return !(c.phase === 'out' && t - c.outT >= EXIT); });
    }
    // springs of different stiffness must never push one card into the next: keep stack order with a small gap
    function unstack() {
      var s = side(), crisp = crispGuess(), g = Math.max(1, Math.round(GAP(crisp) / 2)), prev = null;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i]; if (c.hidden || c.phase === 'out' || c.y == null) continue;
        var L = lay(c, crisp);
        if (prev) {
          if (s.top && c.y < prev.y + prev.h + g) { c.y = prev.y + prev.h + g; if (c.vy < 0) c.vy = 0; }
          if (!s.top && c.y + L.h > prev.y - g) { c.y = prev.y - g - L.h; if (c.vy > 0) c.vy = 0; }
        }
        prev = { y: c.y, h: L.h };
      }
    }
    function spring(o, h) {
      if (o.ty == null) return;
      if (o.y == null || Math.abs(o.ty - o.y) > B().h) { o.y = o.ty; o.vy = 0; return; }
      if (o.esc) { o.y = o.ty; o.vy = 0; return; }   // a UI rect appeared over the card: step out of it at once (a glide would cover it)
      var k = 380, d = 2 * Math.sqrt(k) * 0.82, s = h / 1000;
      o.vy += (k * (o.ty - o.y) - d * o.vy) * s; o.y += o.vy * s;
      if (Math.abs(o.ty - o.y) < 0.05 && Math.abs(o.vy) < 0.5) { o.y = o.ty; o.vy = 0; }
    }

    /* ---------- public: push ---------- */
    function push(kind, title, o) {
      try {
        if (kind && typeof kind === 'object') { o = kind; kind = o.kind; title = o.title; }
        o = o || {}; kind = KINDS[kind] ? kind : 'info';
        if (title == null || title === '') title = KINDS[kind].label;
        var n = o.count === 0 ? 0 : Math.max(1, Math.round(+o.count || 1)), key = o.key != null ? String(o.key) : kind + '|' + title;
        stats.pushes++;
        if (P.merge !== 'off') {
          var all = cards.filter(function (c) { return c.phase !== 'out'; }).concat(queue);
          for (var i = 0; i < all.length; i++) if (all[i].key === key && !(all[i].phase && t - all[i].born > 3 * +P.hold * ((KINDS[all[i].kind] || KINDS.info).hold || 1))) {   // a card already up 3 holds takes no more merges
            var c = all[i]; c.count += n; c.rev++; c.punchT = t; if (c.phase) c.holdT = Math.max(c.holdT, t);
            if (o.text != null) c.text = String(o.text); if (o.label) c.label = String(o.label);
            stats.merges++; emit({ event: 'merge', id: c.id, key: key, count: c.count, title: titleOf(c) }); return c.id;
          }
        }
        var K = KINDS[kind], acc = o.accent || (o.rarity && RARITY[o.rarity]) || K.accent;
        var card = { id: ++seq, kind: kind, key: key, title: String(title), text: o.text != null && o.text !== '' ? String(o.text) : '', label: String(o.label || (kind === 'item' && o.rarity && o.rarity !== 'common' ? o.rarity.charAt(0).toUpperCase() + o.rarity.slice(1) + ' item' : K.label)),
          icon: PXI[o.icon] ? o.icon : K.icon, accent: acc, rarity: o.rarity || null, count: Math.max(1, n), hold: +o.hold || 0, rev: 0, punchT: -1e9, phase: null, born: 0, holdT: 0, y: null, vy: 0 };
        if (o.priority === 'high') { var j = 0; while (j < queue.length && queue[j].priority === 'high') j++; card.priority = 'high'; queue.splice(j, 0, card); }
        else queue.push(card);
        if (queue.length > QCAP) {   // drop the oldest low-priority waiting card
          var di = -1; for (var q = 0; q < queue.length; q++) if (queue[q].priority !== 'high' && (queue[q].kind === 'info' || di < 0)) { di = q; if (queue[q].kind === 'info') break; }
          var dropped = queue.splice(di < 0 ? 0 : di, 1)[0]; stats.drops++; emit({ event: 'drop', id: dropped.id, title: titleOf(dropped) });
        }
        stats.maxQueue = Math.max(stats.maxQueue, queue.length);
        emit({ event: 'push', id: card.id, kind: kind, title: titleOf(card), queued: queue.length });
        return card.id;
      } catch (e) { stats.errors++; warn('push', 'push failed: ' + (e && e.message)); return 0; }
    }

    /* ---------- public: update ---------- */
    function update(dt) {
      try {
        dt = +dt; if (!isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 1000);
        if (dt === 0) { layout(); return; }
        var n = Math.max(1, Math.ceil(dt / (1000 / 60) - 1e-6)), h = dt / n;
        for (var i = 0; i < n; i++) {
          t += h; lifecycle(h); layout();
          for (var j = 0; j < cards.length; j++) spring(cards[j], h);
          unstack();
          if (chip) spring(chip, h);
        }
      } catch (e) { stats.errors++; warn('update', 'update failed: ' + (e && e.message)); }
    }

    /* ---------- drawing ---------- */
    function anim(c, L) {
      if (c.hidden) return { dx: 0, dy: 0, sc: 1, al: 0 };   // no room: gone at once (a fade would sit over the window or the card that takes the slot)
      var s = side(), a = t - c.born, out = c.phase === 'out' ? clamp((t - c.outT) / EXIT, 0, 1) : 0, inU = clamp(a / ENTER, 0, 1);
      var dist = c.alt ? 24 : (L.w + MARGIN() + 16), dx = 0, dy = 0, sc = 1, al = 1;
      var dirX = s.right ? 1 : s.left ? -1 : 0, dirY = s.top ? -1 : 1;
      if (P.enter === 'pop') { sc = inU < 1 ? 0.6 + 0.4 * backOut(inU) : 1; al = easeOut(inU * 1.6); }
      else if (P.enter === 'fade') { al = easeOut(inU); dy = -dirY * 10 * (1 - easeOut(inU)) * (L.crisp ? L.sc / 2 : SZ() / 14); }
      else if (c.alt) { al = easeOut(inU * 1.4); }   // a card beside a blocking rect fades in where it rests (a slide would cross the rect)
      else { var e = Math.min(1, backOut(inU)); if (dirX) dx = dirX * dist * (1 - e); else dy = dirY * (L.h + MARGIN() + 12) * (1 - e); al = clamp(inU * 3, 0, 1); }   // no overshoot past the rest spot (it could touch a rect beside the column)
      if (out > 0) {
        var eo = easeIn(out);
        if (P.enter === 'slide' && c.why !== 'noroom' && !c.alt) { if (dirX) dx += dirX * dist * 0.6 * eo; else dy += dirY * (L.h * 0.6) * eo; }
        else sc *= 1 - 0.08 * eo;
        al *= 1 - easeOut(out);
      }
      return { dx: dx, dy: dy, sc: sc, al: al };
    }
    function drawCardSmooth(g, c, L, x, y, A, ds) {
      var T = TH(), S = L.S, w = L.w, h = L.h, r = Math.round(S * 0.7), acc = c.accent, now = t - c.born;
      g.save();
      g.globalAlpha *= A.al;
      g.translate(x + A.dx + w / 2, y + A.dy + h / 2); if (A.sc !== 1) g.scale(A.sc, A.sc); g.translate(-w / 2, -h / 2);
      // soft shadow, then the glass body
      g.save(); g.shadowColor = T.shadow; g.shadowBlur = S * 1.3 * ds; g.shadowOffsetY = S * 0.35 * ds;
      g.beginPath(); g.roundRect(0, 0, w, h, r); var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, T.top); gr.addColorStop(1, T.bot); g.fillStyle = gr; g.fill(); g.restore();
      g.save(); g.beginPath(); g.roundRect(0, 0, w, h, r); g.clip();
      // accent wash from the icon side
      var wash = g.createRadialGradient(L.pad + L.ic / 2, h / 2, 0, L.pad + L.ic / 2, h / 2, w * 0.75); wash.addColorStop(0, rgba(acc, 0.24)); wash.addColorStop(1, rgba(acc, 0)); g.fillStyle = wash; g.fillRect(0, 0, w, h);
      // merge flash
      var pb = bump(t - c.punchT); if (pb > 0) { g.fillStyle = rgba(acc, 0.16 * pb); g.fillRect(0, 0, w, h); }
      // achievement / rare: a light sweep across the card after it lands
      var rich = c.kind === 'achievement' || c.kind === 'unlock' || c.rarity === 'epic' || c.rarity === 'legendary';
      if (rich) { var su = (now - ENTER * 0.25) / 520; if (su > 0 && su < 1) {   // a narrow additive light band crossing the card after it lands
        var sx = -S * 3 + su * (w + S * 6); g.save(); g.globalCompositeOperation = 'lighter'; g.beginPath(); g.moveTo(sx - S * 1.2, h); g.lineTo(sx + S * 0.2, 0); g.lineTo(sx + S * 1.6, 0); g.lineTo(sx + S * 0.2, h); g.closePath();
        var sg = g.createLinearGradient(sx - S * 1.2, 0, sx + S * 1.6, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,248,225,' + (0.34 * Math.sin(su * Math.PI) + 0.08).toFixed(3) + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sg; g.fill(); g.restore(); } }
      // timer line
      if (P.progress !== 'off') {
        var hold = holdOf(c), left = c.phase === 'out' ? 0 : clamp(1 - (t - c.holdT) / hold, 0, 1), ph = Math.max(2, Math.round(S * 0.16));
        g.fillStyle = T.track; g.fillRect(0, h - ph, w, ph);
        var pg = g.createLinearGradient(0, 0, w, 0); pg.addColorStop(0, rgba(acc, 0.55)); pg.addColorStop(1, rgba(acc, 0.95)); g.fillStyle = pg; g.fillRect(0, h - ph, w * left, ph);
      }
      g.restore();
      // rims: inner highlight and an accent edge (gold double rim for achievements)
      g.lineWidth = 1; g.beginPath(); g.roundRect(0.5, 0.5, w - 1, h - 1, r); g.strokeStyle = rich ? rgba(acc, 0.75) : T.rim; g.stroke();
      g.beginPath(); g.roundRect(1.5, 1.5, w - 3, h - 3, Math.max(1, r - 1)); g.strokeStyle = T.edge; g.stroke();
      // icon badge with glow
      var icx = L.pad + L.ic / 2, icy = h / 2, ir = L.ic / 2, ib = 1 + 0.18 * bump(now - ENTER * 0.5) + 0.12 * pb;
      var glow = g.createRadialGradient(icx, icy, ir * 0.4, icx, icy, ir * 1.7); glow.addColorStop(0, rgba(acc, 0.45)); glow.addColorStop(1, rgba(acc, 0)); g.fillStyle = glow; g.beginPath(); g.arc(icx, icy, ir * 1.7, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(icx, icy); g.scale(ib, ib);
      var bg = g.createLinearGradient(0, -ir, 0, ir); bg.addColorStop(0, mixHex(acc, '#ffffff', 0.35)); bg.addColorStop(1, mixHex(acc, '#000000', 0.25)); g.fillStyle = bg; g.beginPath(); g.arc(0, 0, ir, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(1, S * 0.1); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(0, 0, ir - g.lineWidth / 2, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.save(); g.translate(0, ir * 0.04); g.globalAlpha *= 0.35; drawIconSmooth(g, c.icon, ir * 0.62, '#000'); g.restore();
      g.translate(0, -ir * 0.04); drawIconSmooth(g, c.icon, ir * 0.62, mixHex(acc, '#1a1426', 0.82));
      g.restore();
      // sparkles around an achievement badge
      if (c.kind === 'achievement' && now < 1400) { g.save(); g.beginPath(); g.rect(-S, -S, L.pad + L.ic + L.gapI * 0.6 + S, h + 2 * S); g.clip(); }   // never over the text column
      if (c.kind === 'achievement' && now < 1400) for (var i = 0; i < 6; i++) {
        var u = clamp((now - 120 - i * 70) / 700, 0, 1); if (u <= 0 || u >= 1) continue;
        var ang = hash(c.id, i) * Math.PI * 2, rr = ir + S * 0.6 * easeOut(u), sz = S * 0.2 * (1 - u);
        var px = icx + Math.cos(ang) * rr, py = icy + Math.sin(ang) * rr; g.fillStyle = rgba('#fff6d0', 1 - u);
        g.beginPath(); g.moveTo(px, py - sz * 2); g.lineTo(px + sz * 0.5, py); g.lineTo(px, py + sz * 2); g.lineTo(px - sz * 0.5, py); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(px - sz * 2, py); g.lineTo(px, py + sz * 0.5); g.lineTo(px + sz * 2, py); g.lineTo(px, py - sz * 0.5); g.closePath(); g.fill();
      }
      if (c.kind === 'achievement' && now < 1400) g.restore();
      // text column
      var tx = L.pad + L.ic + L.gapI, ty = Math.round((h - L.textH) / 2);
      g.textBaseline = 'top'; g.textAlign = 'left';
      g.font = fontCss(L.lpx, 800); g.fillStyle = mixHex(acc, T.title, 0.1); if ('letterSpacing' in g) g.letterSpacing = L.lsp.toFixed(1) + 'px';
      g.fillText(L.label, tx, ty);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      var tY = ty + L.lpx * 1.25;
      g.font = fontCss(S, 700); g.fillStyle = T.title; g.fillText(L.title, tx, tY);
      if (L.text) { g.font = fontCss(L.tpx, 500); g.fillStyle = T.text; g.fillText(L.text, tx, tY + S * 1.25); }
      // ×N badge
      if (L.badge) {
        var bx = tx + tw(L.title, S, 700) + S * 0.4, bh = Math.round(S * 1.2), bwid = L.badgeW, bk = 1 + 0.32 * pb;
        g.save(); g.translate(bx + bwid / 2, tY + S * 0.55); g.scale(bk, bk);
        g.beginPath(); g.roundRect(-bwid / 2, -bh / 2, bwid, bh, bh / 2); g.fillStyle = rgba(acc, 0.9); g.fill();
        g.font = fontCss(Math.round(S * 0.86), 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = mixHex(acc, '#140f1e', 0.85); g.fillText(L.badge, 0, S * 0.04);
        g.restore();
      }
      g.restore();
    }
    function pxIcon(name, acc) {
      var key = name + '|' + acc; if (PXC[key]) return PXC[key];
      var rows = PXI[name] || PXI.info, c = mk(9, 9), g = c.getContext('2d'), col = { a: acc, l: mixHex(acc, '#ffffff', 0.5), d: mixHex(acc, '#000000', 0.4), w: '#ffffff' }, x, y;
      var on = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < 7 && yy < 7 && rows[yy].charAt(xx) !== '.'; };
      g.fillStyle = '#0a0812';
      for (y = -1; y < 8; y++) for (x = -1; x < 8; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x + 1, y + 1, 1, 1);
      for (y = 0; y < 7; y++) for (x = 0; x < 7; x++) { var ch = rows[y].charAt(x); if (ch !== '.') { g.fillStyle = col[ch] || acc; g.fillRect(x + 1, y + 1, 1, 1); } }
      return (PXC[key] = c);
    }
    function drawCardCrisp(g, c, L, x, y, A) {
      var T = TH(), sc = L.sc, w = L.w, h = L.h, acc = c.accent, now = t - c.born, pb = bump(t - c.punchT);
      x = Math.round(x + A.dx); y = Math.round(y + A.dy);
      if (A.sc !== 1) { var shrink = Math.round((1 - A.sc) * h / 2); y += shrink; h = Math.max(4, h - 2 * shrink); }
      g.save();
      var steps = 4, al = Math.round(A.al * steps) / steps; if (al <= 0) { g.restore(); return; } g.globalAlpha *= al;   // stepped fade
      var px = T.px;
      g.fillStyle = px[2]; g.fillRect(x, y, w, h);                                       // outline
      g.fillStyle = px[0]; g.fillRect(x + sc, y + sc, w - 2 * sc, h - 2 * sc);           // body
      g.fillStyle = px[1]; g.fillRect(x + sc, y + sc, w - 2 * sc, Math.max(sc, Math.floor((h - 2 * sc) / 2)));   // lighter top half
      g.fillStyle = px[3]; g.fillRect(x + sc, y + sc, w - 2 * sc, sc);                  // top highlight line
      g.fillStyle = acc; g.fillRect(x + sc, y + sc, L.strip, h - 2 * sc);              // accent strip
      if (pb > 0.3) { g.fillStyle = rgba(acc, 0.35); g.fillRect(x + sc, y + sc, w - 2 * sc, h - 2 * sc); }
      var rich = c.kind === 'achievement' || c.kind === 'unlock' || c.rarity === 'epic' || c.rarity === 'legendary';
      if (rich) { var su = (now - ENTER * 0.6) / 800; if (su > 0 && su < 1) { var sx = Math.round(x + su * (w + h)); g.fillStyle = 'rgba(255,255,255,0.28)'; for (var yy = 0; yy < h - 2 * sc; yy += sc) { var xx = sx - yy; if (xx > x + sc && xx < x + w - 3 * sc) g.fillRect(xx, y + sc + yy, 2 * sc, sc); } } }
      // icon
      var ic = pxIcon(c.icon, acc), hop = (now > ENTER * 0.5 && now < ENTER * 0.5 + 120) || pb > 0.5 ? sc : 0;   // hops 1 px as the card lands
      g.imageSmoothingEnabled = false;
      g.drawImage(ic, x + L.strip + L.pad, Math.round(y + (h - L.ic) / 2) - hop, L.ic, L.ic);
      var tx = x + L.strip + L.pad + L.ic + 3 * sc, ty = y + L.pad;
      drawBitmap(g, L.label, tx, ty, 'small', sc, lum(T.title.charAt(0) === '#' ? T.title : '#ffffff') > 0.5 ? acc : mixHex(acc, '#000000', 0.45));
      var tc = T.title.charAt(0) === '#' ? T.title : '#ffffff', lightText = lum(tc) > 0.5;
      if (lightText) drawBitmap(g, L.title, tx + sc, ty + 7 * sc + sc, 'big', sc, px[2]);   // drop under light text
      drawBitmap(g, L.title, tx, ty + 7 * sc, 'big', sc, tc);
      if (L.text) drawBitmap(g, L.text, tx, ty + 7 * sc + 9 * sc, 'small', sc, T.text);
      if (L.badge) { var bx = tx + bw(L.title, 'big', sc) + 3 * sc, by = ty + 7 * sc - (pb > 0.4 ? sc : 0); if (lightText) drawBitmap(g, L.badge, bx + sc, by + sc, 'big', sc, px[2]); drawBitmap(g, L.badge, bx, by, 'big', sc, lightText ? acc : mixHex(acc, '#000000', 0.45)); }
      if (P.progress !== 'off') { var left = c.phase === 'out' ? 0 : clamp(1 - (t - c.holdT) / holdOf(c), 0, 1); g.fillStyle = px[3]; g.fillRect(x + sc + L.strip, y + h - 2 * sc, w - 2 * sc - L.strip, sc); g.fillStyle = acc; g.fillRect(x + sc + L.strip, y + h - 2 * sc, Math.round((w - 2 * sc - L.strip) * left), sc); }
      g.restore();
      return { x: x, y: y, w: w, h: h };
    }
    function drawChip(g, crisp, ds, ui) {
      if (!chip || !chip.ok || !cards.some(function (c) { return !c.hidden && c.phase !== 'out'; })) return null;
      for (var q = 0; q < ui.length; q++) if (hit({ x: chip.tx, y: chip.y, w: chip.w, h: chip.h }, ui[q], 0)) return null;
      var T = TH(), x = chip.tx, y = Math.round(chip.y), w = chip.w, h = chip.h, a = clamp((t - chip.born) / 200, 0, 1);
      g.save(); g.globalAlpha *= crisp ? (a < 0.5 ? 0.5 : 1) : a;
      if (crisp) { var sc = SC(); g.fillStyle = T.px[2]; g.fillRect(x, y, w, h); g.fillStyle = T.px[1]; g.fillRect(x + sc, y + sc, w - 2 * sc, h - 2 * sc); drawBitmap(g, chip.text, x + 3 * sc, y + 2 * sc, 'small', sc, T.text); }
      else {
        var S = SZ(); g.shadowColor = T.shadow; g.shadowBlur = S * 0.8 * ds; g.shadowOffsetY = S * 0.2 * ds;
        g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fillStyle = T.bot; g.fill(); g.shadowColor = 'rgba(0,0,0,0)';
        g.strokeStyle = T.rim; g.lineWidth = 1; g.stroke();
        g.font = fontCss(Math.round(S * 0.72), 700); g.fillStyle = T.text; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(chip.text, x + w / 2, y + h / 2 + 0.5);
      }
      g.restore();
      return { x: x, y: y, w: w, h: h };
    }
    function settled(c) { return c.phase === 'hold' && !c.hidden && !(c.rel && t - c.rel.t < 280) && c.ty != null && Math.abs(c.y - c.ty) < 0.5; }
    function draw(ctx) {
      if (!ctx) return;
      drawn = [];
      try {
        var ds = devScale(ctx), crisp;
        if (P.render === 'crisp') crisp = true; else if (P.render === 'smooth') crisp = false; else if (SK) crisp = !!SK.pixel; else crisp = ds < 1.5 && !!ctx.canvas && ctx.canvas.width <= 512;
        mode = crisp;
        if (!opt.bounds && ctx.canvas) lastView = { x: 0, y: 0, w: Math.round(ctx.canvas.width / ds), h: Math.round(ctx.canvas.height / ds) };
        var ui = cards.length ? avoid() : [];
        for (var i = 0; i < cards.length; i++) {
          var c = cards[i];
          try {
            var L = lay(c, crisp), A = anim(c, L); if (A.al <= 0) continue;
            var x = cardX(c, L), y = c.y != null ? c.y : c.ty, fading = false;
            if (c.rel && t - c.rel.t < 280) { var ra = t - c.rel.t; fading = true; if (ra < 140) continue; A.al *= (ra - 140) / 140; if (A.al <= 0) continue; }   // re-slotted: gone from the old spot at once (another card may take it), fades in at the new one
            if ((!c.esc || c.hidden || fading || c.phase === 'out') && y != null) { var cov = false; for (var q = 0; q < ui.length; q++) if (hit({ x: x, y: y, w: L.w, h: L.h }, ui[q], 0)) { cov = true; break; } if (cov) continue; }   // a window over this spot now (opened after this step's update, or over a card fading away): skip it
            if (crisp) { var R = drawCardCrisp(ctx, c, L, x, y, A); if (R && A.al > 0.05) drawn.push({ id: c.id, kind: c.kind, key: c.key, title: titleOf(c), count: c.count, phase: c.phase, settled: settled(c), x: R.x, y: R.y, w: R.w, h: R.h, alpha: A.al }); }
            else { drawCardSmooth(ctx, c, L, x, y, A, ds); if (A.al > 0.05) drawn.push({ id: c.id, kind: c.kind, key: c.key, title: titleOf(c), count: c.count, phase: c.phase, settled: settled(c), x: x + A.dx + L.w * (1 - A.sc) / 2, y: y + A.dy + L.h * (1 - A.sc) / 2, w: L.w * A.sc, h: L.h * A.sc, alpha: A.al }); }
          } catch (e) { stats.errors++; warn('draw' + c.id, 'draw failed: ' + (e && e.message)); }
        }
        var CR = drawChip(ctx, crisp, ds, cards.length ? ui : avoid()); if (CR) drawn.push({ id: 'more', kind: 'more', title: chip.text, x: CR.x, y: CR.y, w: CR.w, h: CR.h, alpha: 1 });
      } catch (e) { stats.errors++; warn('draw', 'draw failed: ' + (e && e.message)); }
    }

    var api = {
      push: push,
      show: function (o) { return push(o); },
      update: update,
      draw: draw,
      dismiss: function (id) { for (var i = 0; i < cards.length; i++) if (cards[i].id === id && cards[i].phase !== 'out') { cards[i].phase = 'out'; cards[i].outT = t; cards[i].why = 'dismiss'; emit({ event: 'exit', id: id, why: 'dismiss' }); return true; } queue = queue.filter(function (q) { return q.id !== id; }); return false; },
      clear: function (now) { if (now) { cards = []; } else cards.forEach(function (c) { if (c.phase !== 'out') { c.phase = 'out'; c.outT = t; c.why = 'clear'; } }); queue = []; chip = null; emit({ event: 'clear' }); },
      setParams: function (o) { set(o); cards.forEach(function (c) { c.rev++; }); queue.forEach(function (c) { c.rev++; }); },
      params: function () { var o = {}; for (var k in P) o[k] = P[k]; return o; },
      count: function () { return cards.filter(function (c) { return c.phase !== 'out'; }).length; },
      queued: function () { return queue.length; },
      busy: function () { return false; },   // toasts never block input
      rects: function () { var crisp = crispGuess(), out = cards.filter(function (c) { return !c.hidden; }).map(function (c) { var L = lay(c, crisp); return { x: c.tx, y: c.ty, w: L.w, h: L.h, id: c.id }; }); if (chip && chip.ok) out.push({ x: chip.tx, y: chip.ty, w: chip.w, h: chip.h, id: 'more' }); return out; },
      lastDrawn: function () { return drawn.slice(); },
      time: function () { return t; },
      stats: function () { var o = {}; for (var k in stats) o[k] = stats[k]; o.onScreen = api.count(); o.queue = queue.length; return o; },
      state: function () { return { t: t, cards: cards.map(function (c) { return { id: c.id, kind: c.kind, title: titleOf(c), count: c.count, phase: c.phase, hidden: !!c.hidden, y: c.y, ty: c.ty, age: t - c.born }; }), queue: queue.map(function (c) { return { id: c.id, kind: c.kind, title: titleOf(c), count: c.count }; }) }; }
    };
    return api;
  }

  root.GameDNA_Toasts = { create: create, version: '1.1.1', kinds: Object.keys(KINDS), icons: Object.keys(PXI), defaults: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
