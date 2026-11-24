/* GameDNA C-08 - Draining HP bar (draining-hp-bar) - module v1.0.1 (plain script, no dependencies, one global)
 *
 *   var bars = GameDNA_DrainingHpBar.create({ params: { hold: 450, drain: 0.7, ... } });
 *   bars.set(id, hp, max)          // every fixed step (or whenever HP changes): the module sees drops and gains itself
 *   bars.reset(id, hp, max)        // new battle / new wave / respawn: jump to the value, no animation
 *   bars.update(stepMs)            // every fixed step (0 holds every timer)
 *   bars.draw(ctx, id, x, y, w, h, { style: 'boss' | 'party' | 'unit', label, text })
 *
 * On damage the fill drops at once and a lagging "loss" segment in a contrasting colour stays where the HP was, holds
 * for a moment, then drains down to the new value; hits that land while it holds or drains extend the hold (up to a cap)
 * and merge into one segment. On heal a "gain" segment appears first, then the fill rises to meet it. Low HP pulses.
 * The same bar draws as a big boss bar (frame, name, ticks, shake), a party HUD bar or a small over-head bar in world
 * space, smooth on HD canvases and crisp (whole pixels, flat colours, bitmap digits) on native pixel canvases.
 * Every curve is a function of the clock given to update(): ?t=&freeze=1 stills are deterministic. state(id) and
 * curve(id) expose the values for tests. Never throws from set / update / draw. ASCII source.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.1';
  var DEFAULTS = { hold: 450, holdCap: 1600, drain: 0.7, ease: 'smooth', gainHold: 240, fill: 0.9, low: 0.25, pulse: 'on', shake: 2, flash: 'on', theme: 'auto', render: 'auto', ticks: 0, number: 'roll' };
  var RANGES = { hold: [0, 3000], holdCap: [0, 6000], drain: [0.05, 5], gainHold: [0, 2000], fill: [0.05, 5], low: [0, 0.9], shake: [0, 6], ticks: [0, 20] };
  var GAIN_IN = 120, FLASH = 160, MIN_TWEEN = 140, MAX_TWEEN = 1100, NUM_ROLL = 380, HIDE_AFTER = 1400, HIDE_FADE = 320, CURVE_N = 900;
  var FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  /* themes: fill = [light, mid, dark], loss = the lagging segment, gain = the heal preview, low = the fill colour at low HP */
  var THEMES = {
    crimson: { fill: ['#ff7a74', '#e0303f', '#8c1428'], loss: '#ffd98a', gain: '#9dffc6', low: '#ff5a24', lowHi: '#ffd8a8', track: ['#1a0c12', '#2c1520'], ink: '#0b0509', rim: '#e8c47c' },
    verdant: { fill: ['#b4f57a', '#4cc25c', '#1f7a3c'], loss: '#ff5a4e', gain: '#c4fff4', low: '#ffb03a', lowHi: '#ffe08a', track: ['#0c140f', '#16241b'], ink: '#05090a', rim: '#cfe8c0' },
    azure:   { fill: ['#9fdcff', '#3f92f2', '#1c4aa6'], loss: '#ff8a96', gain: '#d2fff0', low: '#ff9a4a', lowHi: '#ffd8a8', track: ['#0b0f1c', '#151d33'], ink: '#04060c', rim: '#bcd6ff' },
    amber:   { fill: ['#ffe08a', '#f39a2c', '#a8501a'], loss: '#fff4e0', gain: '#9dffc6', low: '#ff5a2a', lowHi: '#ffd0a0', track: ['#170d06', '#2a1a0c'], ink: '#0a0603', rim: '#ffe2a8' }
  };
  /* 3x5 bitmap font (crisp labels and numbers): char + 5 rows, each a base-32 digit of 3 bits */
  var F3S = "075557126227261247361216455711574616634757771222875757975716A25755B65656C34443D65556E74647F74644G34553H55755I72227J11152K55655L44447M57755N65555O25552P65644Q25563R65655S34216T72222U55557V55552W55575X55255Y55222Z71247!22202.00002-00700+02720/11244:02020'22000?61202(24442)21112,00024%51245";
  var FONT3 = (function () { var o = {}, i, r; for (i = 0; i + 5 < F3S.length + 1; i += 6) { var g = []; for (r = 0; r < 5; r++) g.push(parseInt(F3S.charAt(i + 1 + r), 32) || 0); o[F3S.charAt(i)] = g; } return o; })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function ease(kind, u) {
    u = clamp(u, 0, 1);
    if (kind === 'linear') return u;
    if (kind === 'out') return 1 - (1 - u) * (1 - u) * (1 - u);
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // smooth (in-out cubic)
  }
  var RGBC = {};
  function rgb(c) {
    var v = RGBC[c]; if (v) return v;
    var s = String(c || '#000').trim(), m;
    if (s.charAt(0) === '#') { if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]; var n = parseInt(s.slice(1, 7), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    else if ((m = s.match(/rgba?\(([^)]+)\)/))) { var p = m[1].split(','); v = [+p[0] || 0, +p[1] || 0, +p[2] || 0]; }
    else v = [128, 128, 128];
    return (RGBC[c] = v);
  }
  function mix(a, b, k) { var A = rgb(a), B = rgb(b); k = clamp(k, 0, 1); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * k) + ',' + Math.round(A[1] + (B[1] - A[1]) * k) + ',' + Math.round(A[2] + (B[2] - A[2]) * k) + ')'; }
  function rgba(c, a) { var A = rgb(c); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h - r);
    g.arcTo(x + w, y + h, x + w - r, y + h, r); g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
  }
  function text3(g, str, x, y, u, col) {   // crisp 3x5 text, top-left at (x, y), pixel size u
    g.fillStyle = col; str = String(str).toUpperCase();
    for (var i = 0; i < str.length; i++) { var gl = FONT3[str.charAt(i)]; if (gl) for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) if (gl[r] & (4 >> c)) g.fillRect(x + c * u, y + r * u, u, u); x += 4 * u; }
  }
  function text3W(str, u) { return Math.max(0, String(str).length * 4 * u - u); }

  function create(options) {
    var o = options || {}, P = {}, bars = {}, order = [], clock = 0, frameDrawn = [], drawnStamp = -1, warned = {};
    var ST = { sets: 0, damages: 0, heals: 0, merges: 0, drains: 0, fills: 0, resets: 0, errors: 0, updates: 0, draws: 0 };
    var SK = null;
    try { if (o.skin != null && o.skin !== false && root.GameDNA_Skin) SK = root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; if (root.console) console.warn('[GameDNA_DrainingHpBar] ' + msg); }
    function emit(ev) { if (typeof o.debug === 'function') try { o.debug(ev); } catch (e) { } }
    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) {
        var v = p[k] != null && p[k] !== '' ? p[k] : P[k] != null ? P[k] : DEFAULTS[k];
        if (typeof DEFAULTS[k] === 'number') { v = num(v, DEFAULTS[k]); if (RANGES[k]) v = clamp(v, RANGES[k][0], RANGES[k][1]); }
        else v = String(v);
        P[k] = v;
      }
    }
    setParams(o.params);

    function tween(from, to, dur, kind) { return { from: from, to: to, t: 0, dur: Math.max(1, dur), kind: kind }; }
    function tv(tw) { return tw.from + (tw.to - tw.from) * ease(tw.kind, tw.t / tw.dur); }
    function newBar(id, hp, max) {
      var b = { id: id, hp: hp, max: max, main: hp, gainTop: hp, ghost: hp, numFrom: hp, num: hp, numT: NUM_ROLL,
        phase: 'idle', holdLeft: 0, chain: 0, drainTw: null, gainPhase: 'idle', gainLeft: 0, fillTw: null, gainTw: null,
        flashT: 1000, hitN: 0, idle: 1e9, low: false, curve: [] };
      bars[id] = b; order.push(id); return b;
    }
    function cleanNum(v, d) { v = +v; return isFinite(v) ? v : d; }

    /* ---------- the model: main <= gainTop <= hp <= ghost (all in HP units) ---------- */
    function set(id, hp, max, opt) {
      try {
        if (id == null) return; ST.sets++;
        var b = bars[id];
        var M = cleanNum(max, b ? b.max : NaN); if (!(M > 0)) M = b ? b.max : Math.max(1, cleanNum(hp, 1));
        hp = clamp(cleanNum(hp, b ? b.hp : M), 0, M);
        if (!b) { newBar(id, hp, M); emit({ event: 'track', id: id, hp: hp, max: M }); return; }
        if (opt && opt.snap) { reset(id, hp, M); return; }
        if (M !== b.max) { b.max = M; b.main = Math.min(b.main, M); b.gainTop = Math.min(b.gainTop, M); b.ghost = Math.min(b.ghost, M); }
        var old = b.hp;
        if (hp === old) return;
        b.hp = hp; b.idle = 0;
        b.numFrom = b.num; b.numT = 0;
        if (hp < old) damage(b, old, hp); else gain(b, old, hp);
        b.low = b.hp > 0 && b.hp / b.max <= P.low;
      } catch (e) { ST.errors++; warn('set', 'set() failed: ' + e.message); }
    }
    function damage(b, old, hp) {
      ST.damages++;
      var merging = b.phase === 'hold' || b.phase === 'drain';
      b.ghost = Math.max(b.ghost, old);              // the loss segment keeps the highest value of the chain
      b.main = Math.min(b.main, hp);                 // the fill drops at once
      b.gainTop = Math.min(b.gainTop, hp);
      if (b.gainTw && b.gainTw.to > hp) b.gainTw = null;
      if (b.fillTw && b.fillTw.to > hp) { b.fillTw = null; }
      if (b.main >= b.hp) { b.gainPhase = 'idle'; b.fillTw = null; b.gainTw = null; }
      if (!merging) b.chain = 0; else ST.merges++;
      var left = Math.max(0, P.holdCap - b.chain);
      b.holdLeft = Math.min(P.hold, left);
      b.flashT = 0; b.hitN++;
      emit({ event: merging ? 'merge' : 'damage', id: b.id, from: old, to: hp, ghost: b.ghost, hold: b.holdLeft });
      if (b.holdLeft > 0) { b.phase = 'hold'; b.drainTw = null; }
      else if (b.phase === 'drain' && b.drainTw) b.drainTw = tween(b.ghost, b.hp, drainDur(b, b.ghost, b.hp), 'out');   // capped chain: keep draining, no slow restart
      else startDrain(b);
    }
    function gain(b, old, hp) {
      ST.heals++;
      if (b.ghost < hp) { b.ghost = hp; if (b.phase !== 'idle') { b.phase = 'idle'; b.drainTw = null; b.chain = 0; } }
      b.gainTw = tween(b.gainTop, hp, GAIN_IN, 'out');
      if (b.gainPhase === 'fill' && b.fillTw) { var cur = tv(b.fillTw); b.main = cur; b.fillTw = tween(cur, hp, fillDur(b, cur, hp), 'out'); }
      else { b.gainPhase = 'hold'; b.gainLeft = P.gainHold + GAIN_IN; }
      emit({ event: 'heal', id: b.id, from: old, to: hp });
    }
    function drainDur(b, from, to) { return clamp(Math.abs(from - to) / b.max / P.drain * 1000, MIN_TWEEN, Math.max(MAX_TWEEN, 0.35 / P.drain * 1000)); }
    function fillDur(b, from, to) { return clamp(Math.abs(to - from) / b.max / P.fill * 1000, MIN_TWEEN, Math.max(MAX_TWEEN, 0.35 / P.fill * 1000)); }
    function startDrain(b) { b.phase = 'drain'; b.drainTw = tween(b.ghost, b.hp, drainDur(b, b.ghost, b.hp), P.ease === 'linear' || P.ease === 'out' ? P.ease : 'smooth'); ST.drains++; emit({ event: 'drain', id: b.id, from: b.ghost, to: b.hp, ms: Math.round(b.drainTw.dur) }); }
    function reset(id, hp, max) {
      try {
        if (id == null) return;
        var b = bars[id], M = cleanNum(max, b ? b.max : NaN); if (!(M > 0)) M = b ? b.max : Math.max(1, cleanNum(hp, 1));
        hp = clamp(cleanNum(hp, M), 0, M);
        if (!b) b = newBar(id, hp, M);
        b.max = M; b.hp = b.main = b.gainTop = b.ghost = b.num = b.numFrom = hp; b.numT = NUM_ROLL;
        b.phase = 'idle'; b.gainPhase = 'idle'; b.drainTw = b.fillTw = b.gainTw = null; b.holdLeft = b.gainLeft = b.chain = 0; b.flashT = 1000; b.idle = 1e9;
        b.low = b.hp > 0 && b.hp / b.max <= P.low;
        ST.resets++; emit({ event: 'reset', id: id, hp: hp, max: M });
      } catch (e) { ST.errors++; warn('reset', 'reset() failed: ' + e.message); }
    }
    function stepBar(b, dt) {
      b.idle += dt; if (b.flashT < 1000) b.flashT += dt;
      if (b.numT < NUM_ROLL) { b.numT = Math.min(NUM_ROLL, b.numT + dt); }
      b.num = b.numFrom + (b.hp - b.numFrom) * ease('out', b.numT / NUM_ROLL);
      // loss segment: hold, then drain
      if (b.phase === 'hold') {
        b.chain += dt; b.holdLeft -= dt;
        if (b.holdLeft <= 0) startDrain(b);
      } else if (b.phase === 'drain' && b.drainTw) {
        b.chain += dt; b.drainTw.to = b.hp; b.drainTw.t += dt;
        b.ghost = Math.max(b.hp, tv(b.drainTw));
        if (b.drainTw.t >= b.drainTw.dur || b.ghost <= b.hp + 1e-9) { b.ghost = b.hp; b.phase = 'idle'; b.drainTw = null; b.chain = 0; emit({ event: 'drained', id: b.id, hp: b.hp }); }
      }
      // gain segment: grow in, hold, then the fill rises
      if (b.gainTw) { b.gainTw.t += dt; b.gainTop = Math.min(b.hp, tv(b.gainTw)); if (b.gainTw.t >= b.gainTw.dur) { b.gainTop = b.hp; b.gainTw = null; } }
      if (b.gainPhase === 'hold') {
        b.gainLeft -= dt;
        if (b.gainLeft <= 0) { b.gainPhase = 'fill'; b.fillTw = tween(b.main, b.hp, fillDur(b, b.main, b.hp), 'out'); ST.fills++; emit({ event: 'fill', id: b.id, from: b.main, to: b.hp }); }
      } else if (b.gainPhase === 'fill' && b.fillTw) {
        b.fillTw.t += dt; b.main = Math.min(b.hp, tv(b.fillTw));
        if (b.fillTw.t >= b.fillTw.dur) { b.main = b.hp; b.gainPhase = 'idle'; b.fillTw = null; b.gainTop = b.hp; emit({ event: 'filled', id: b.id, hp: b.hp }); }
      }
      if (b.gainPhase === 'idle' && b.main < b.hp && !b.gainTw) b.main = b.hp;   // safety: never stuck below the value
      if (b.main > b.hp) b.main = b.hp;
      if (b.ghost < b.hp) b.ghost = b.hp;
      if (b.ghost > b.hp && b.phase === 'idle') { b.phase = 'hold'; b.holdLeft = P.hold; }
      b.low = b.hp > 0 && b.hp / b.max <= P.low;
      b.curve.push([Math.round(clock), r2(b.hp), r2(b.main), r2(b.gainTop), r2(b.ghost), b.phase.charAt(0) + b.gainPhase.charAt(0)]);
      if (b.curve.length > CURVE_N) b.curve.splice(0, b.curve.length - CURVE_N);
    }
    function r2(v) { return Math.round(v * 100) / 100; }
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        ST.updates++; clock += dt;
        if (dt > 0) for (var i = 0; i < order.length; i++) { var b = bars[order[i]]; if (b) stepBar(b, dt); }
      } catch (e) { ST.errors++; warn('update', 'update() failed: ' + e.message); }
    }

    /* ---------- drawing ---------- */
    function themeFor(style, o2) {
      var name = o2 && o2.theme || P.theme;
      if (name === 'skin' && SK) {
        var tk = function (p, d) { try { var v = SK.token(p); return typeof v === 'string' && v !== p ? v : d; } catch (e) { return d; } };
        var base = THEMES.crimson, f = tk('bars.hp', tk('team.a', base.fill[1]));
        return { fill: [mix(f, '#ffffff', 0.35), f, mix(f, '#000000', 0.45)], loss: tk('fx.hot', base.loss), gain: tk('fx.heal', base.gain), low: tk('bars.hpLow', tk('fx.crit', base.low)),
          lowHi: base.lowHi, track: [tk('ui.well', tk('ink', base.track[0])), tk('ui.fill', base.track[1])], ink: tk('ink', base.ink), rim: tk('ui.highlight', base.rim) };
      }
      if (THEMES[name]) return THEMES[name];
      if (o2 && (o2.team === 'ally' || o2.team === 'a' || o2.team === 'hero' || o2.team === 'party')) return THEMES.verdant;
      if (o2 && (o2.team === 'foe' || o2.team === 'b' || o2.team === 'enemy')) return THEMES.crimson;
      return style === 'party' ? THEMES.verdant : THEMES.crimson;
    }
    function draw(ctx, id, x, y, w, h, o2) {
      try {
        if (!ctx || !ctx.fillRect) return;
        var b = bars[id]; o2 = o2 || {};
        if (!b) { if (o2.hp != null) { set(id, o2.hp, o2.max); b = bars[id]; } if (!b) { warn('noid' + id, 'draw(): no bar "' + id + '" yet; call set(id, hp, max) first'); return; } }
        x = num(x, 0); y = num(y, 0); w = num(w, 0); h = num(h, 0);
        if (!(w > 0) || !(h > 0)) return;
        if (drawnStamp !== ST.updates) { drawnStamp = ST.updates; frameDrawn = []; }
        ST.draws++;
        var style = o2.style === 'boss' || o2.style === 'unit' ? o2.style : 'party';
        var T = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        var sx = Math.sqrt(T.a * T.a + T.b * T.b) || 1, sy = Math.sqrt(T.c * T.c + T.d * T.d) || 1;
        var cw = ctx.canvas ? ctx.canvas.width : 1e4;
        var crisp = P.render === 'crisp' || (P.render !== 'smooth' && (ctx.imageSmoothingEnabled === false || cw <= 512 || (SK && SK.pixel)));
        // visibility (over-head bars hide when full and idle)
        var alpha = clamp(num(o2.alpha, 1), 0, 1);
        var hideFull = o2.hideFull != null ? !!o2.hideFull : style === 'unit';
        if (hideFull) {
          var busy = b.hp < b.max || b.ghost > b.hp + 1e-6 || b.main < b.hp - 1e-6;
          var fade = busy ? 1 : clamp(1 - (b.idle - HIDE_AFTER) / HIDE_FADE, 0, 1);
          if (b.hp <= 0 && b.ghost <= 1e-6) fade = clamp(1 - (b.idle - 500) / HIDE_FADE, 0, 1);
          alpha *= fade;
        }
        if (alpha <= 0.004) return;
        var u = crisp ? Math.max(1, Math.round(sy)) : sy;
        var X = T.a * x + T.c * y + T.e, Y = T.b * x + T.d * y + T.f, W = w * sx, H = h * sy;
        if (crisp) { X = Math.round(X); Y = Math.round(Y); W = Math.max(u, Math.round(W)); H = Math.max(u, Math.round(H)); }
        var th = themeFor(style, o2);
        // shake on hit (boss full, party half, unit none)
        var shk = style === 'boss' ? 1 : style === 'party' ? 0.5 : 0, dx = 0, dy = 0;
        if (o2.shake === false) shk = 0;
        if (shk && P.shake > 0 && b.flashT < 260) {
          var k = 1 - b.flashT / 260, amp = P.shake * shk * k * k * (crisp ? u : sy);
          dx = Math.sin(b.flashT / 16 + b.hitN * 1.7) * amp; dy = Math.cos(b.flashT / 21 + b.hitN) * amp * 0.5;
          if (crisp) { dx = Math.round(dx / u) * u; dy = Math.round(dy / u) * u; }
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = (ctx.globalAlpha == null ? 1 : ctx.globalAlpha) * alpha;
        var R = { x: X + dx, y: Y + dy, w: W, h: H, u: u, sy: sy };
        if (crisp) drawCrisp(ctx, b, R, style, th, o2); else drawSmooth(ctx, b, R, style, th, o2);
        ctx.restore();
        frameDrawn.push({ id: id, style: style, x: Math.round(X), y: Math.round(Y), w: Math.round(W), h: Math.round(H), alpha: +alpha.toFixed(3), crisp: crisp,
          hp: b.hp, max: b.max, main: r2(b.main), gainTop: r2(b.gainTop), ghost: r2(b.ghost), phase: b.phase, gain: b.gainPhase, low: b.low, canvasW: cw, canvasH: ctx.canvas ? ctx.canvas.height : 0 });
      } catch (e) { ST.errors++; warn('draw', 'draw() failed: ' + e.message); try { ctx.restore(); } catch (e2) { } }
    }
    function segX(R, b, v) { return R.x + R.w * clamp(v / b.max, 0, 1); }
    function pulseK(b) { return P.pulse === 'on' && b.low ? 0.5 + 0.5 * Math.sin(clock / 900 * Math.PI * 2) : 0; }
    function lossCol(b, th) { var fk = P.flash === 'on' ? clamp(1 - b.flashT / FLASH, 0, 1) : 0; return mix(th.loss, '#ffffff', fk * 0.75); }

    function drawSmooth(g, b, R, style, th, o2) {
      var X = R.x, Y = R.y, W = R.w, H = R.h, s = R.sy, rad = style === 'boss' ? Math.min(H * 0.32, 6 * s) : H / 2;
      var pk = pulseK(b), lowMix = b.low ? 0.65 + 0.35 * pk : 0;
      // frame / plate
      if (style === 'boss') {
        var pad = Math.max(2, Math.round(H * 0.22)), fx = X - pad, fy = Y - pad, fw = W + pad * 2, fh = H + pad * 2;
        g.save();
        g.shadowColor = b.low && P.pulse === 'on' ? rgba(th.low, 0.35 + 0.45 * pk) : 'rgba(0,0,0,0.55)'; g.shadowBlur = (b.low ? 10 + 8 * pk : 8) * s; g.shadowOffsetY = b.low ? 0 : 2 * s;
        rr(g, fx, fy, fw, fh, rad + pad); var pg = g.createLinearGradient(0, fy, 0, fy + fh); pg.addColorStop(0, '#2a2230'); pg.addColorStop(1, '#100b12'); g.fillStyle = pg; g.fill();
        g.restore();
        rr(g, fx + 0.5 * s, fy + 0.5 * s, fw - s, fh - s, rad + pad - 0.5 * s); g.strokeStyle = rgba(th.rim, 0.55); g.lineWidth = Math.max(1, s); g.stroke();
        // end-cap ornaments: small metal diamonds
        for (var side = 0; side < 2; side++) {
          var cx = side ? fx + fw : fx, cy = fy + fh / 2, dr = Math.max(3, fh * 0.42);
          g.beginPath(); g.moveTo(cx, cy - dr); g.lineTo(cx + dr * 0.72, cy); g.lineTo(cx, cy + dr); g.lineTo(cx - dr * 0.72, cy); g.closePath();
          var dg = g.createLinearGradient(cx, cy - dr, cx, cy + dr); dg.addColorStop(0, '#fff1c8'); dg.addColorStop(0.45, th.rim); dg.addColorStop(1, '#6a4a22'); g.fillStyle = dg; g.fill();
          g.strokeStyle = '#1a1008'; g.lineWidth = Math.max(1, s * 0.9); g.stroke();
          g.fillStyle = b.low ? mix(th.low, '#ffffff', pk * 0.5) : '#3a1a2a'; g.beginPath(); g.arc(cx, cy, dr * 0.26, 0, Math.PI * 2); g.fill();
        }
      } else {
        g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = (style === 'unit' ? 2 : 4) * s; g.shadowOffsetY = (style === 'unit' ? 0.5 : 1) * s;
        rr(g, X - s, Y - s, W + 2 * s, H + 2 * s, rad + s); g.fillStyle = th.ink; g.fill(); g.restore();
      }
      // track
      g.save(); rr(g, X, Y, W, H, rad); g.clip();
      var tg = g.createLinearGradient(0, Y, 0, Y + H); tg.addColorStop(0, th.track[0]); tg.addColorStop(1, th.track[1]); g.fillStyle = tg; g.fillRect(X, Y, W, H);
      if (style === 'boss') { g.fillStyle = 'rgba(255,255,255,0.035)'; for (var hx = X - H; hx < X + W; hx += 6 * s) { g.beginPath(); g.moveTo(hx, Y + H); g.lineTo(hx + H, Y); g.lineTo(hx + H + 2 * s, Y); g.lineTo(hx + 2 * s, Y + H); g.fill(); } }
      // loss segment [hp, ghost]
      var xHp = segX(R, b, b.hp), xGh = segX(R, b, b.ghost), xMain = segX(R, b, b.main), xGain = segX(R, b, b.gainTop);
      if (xGh - xHp > 0.25) {
        var lc = lossCol(b, th), lg = g.createLinearGradient(0, Y, 0, Y + H); lg.addColorStop(0, mix(lc, '#ffffff', 0.35)); lg.addColorStop(0.55, lc); lg.addColorStop(1, mix(lc, '#000000', 0.25));
        g.fillStyle = lg; g.fillRect(xHp, Y, xGh - xHp, H);
        if (b.phase === 'drain') { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(xGh - Math.max(1, s), Y, Math.max(1, s), H); }
      }
      // gain segment [main, gainTop], with a moving shimmer
      if (xGain - xMain > 0.25) {
        var gg = g.createLinearGradient(0, Y, 0, Y + H); gg.addColorStop(0, mix(th.gain, '#ffffff', 0.45)); gg.addColorStop(1, th.gain);
        g.fillStyle = gg; g.fillRect(xMain, Y, xGain - xMain, H);
        g.save(); g.beginPath(); g.rect(xMain, Y, xGain - xMain, H); g.clip(); g.fillStyle = 'rgba(255,255,255,0.45)';
        var step = Math.max(5, H * 1.4), off = (clock * 0.045 * s) % step;
        for (var sx2 = xMain - H - step + off; sx2 < xGain + H; sx2 += step) { g.beginPath(); g.moveTo(sx2, Y + H); g.lineTo(sx2 + H * 0.8, Y); g.lineTo(sx2 + H * 0.8 + step * 0.35, Y); g.lineTo(sx2 + step * 0.35, Y + H); g.fill(); }
        g.restore();
      }
      // main fill [0, main]
      if (xMain - X > 0.25) {
        var c0 = mix(th.fill[0], th.lowHi, lowMix), c1 = mix(th.fill[1], th.low, lowMix), c2 = mix(th.fill[2], mix(th.low, '#000000', 0.5), lowMix);
        if (pk > 0) { c0 = mix(c0, '#ffffff', 0.5 * pk); c1 = mix(c1, '#fff0d8', 0.38 * pk); }
        var mg = g.createLinearGradient(0, Y, 0, Y + H); mg.addColorStop(0, c0); mg.addColorStop(0.45, c1); mg.addColorStop(1, c2);
        g.fillStyle = mg; g.fillRect(X, Y, xMain - X, H);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(X, Y + H * 0.12, xMain - X, Math.max(1, H * 0.22));   // gloss band
        if (b.low && P.pulse === 'on') { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(th.lowHi, 0.12 + 0.38 * pk); g.fillRect(X, Y, xMain - X, H); g.restore(); }   // low-HP inner glow
        g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(xMain - Math.max(1, s), Y, Math.max(1, s), H);       // bright cap
      }
      // hit flash over the fill and the new loss segment
      if (P.flash === 'on' && b.flashT < FLASH) { g.fillStyle = 'rgba(255,255,255,' + (0.3 * (1 - b.flashT / FLASH)).toFixed(3) + ')'; g.fillRect(X, Y, xMain - X, H); }
      // ticks
      var ticks = P.ticks > 0 ? P.ticks : style === 'boss' ? 4 : 0;
      if (o2.ticks != null) ticks = num(o2.ticks, ticks);
      if (ticks > 1) { g.fillStyle = 'rgba(0,0,0,0.42)'; for (var i = 1; i < ticks; i++) g.fillRect(Math.round(X + W * i / ticks), Y, Math.max(1, s * 0.9), H); }
      // inner top shadow and rim
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(X, Y, W, Math.max(1, s * 0.8));
      g.restore();
      rr(g, X, Y, W, H, rad); g.strokeStyle = 'rgba(255,255,255,' + (style === 'unit' ? 0.12 : 0.18) + ')'; g.lineWidth = Math.max(1, s * 0.6); g.stroke();
      // hit spark at the fill edge
      if (b.flashT < 200 && style !== 'unit') {
        var sk = 1 - b.flashT / 200, ex = segX(R, b, b.hp), sr = style === 'boss' ? H * 1.6 : H * 1.1, sg = g.createRadialGradient(ex, Y + H / 2, 0, ex, Y + H / 2, sr);
        sg.addColorStop(0, 'rgba(255,255,255,' + ((style === 'boss' ? 0.8 : 0.5) * sk).toFixed(3) + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = sg; g.fillRect(ex - sr, Y + H / 2 - sr, sr * 2, sr * 2); g.restore();
      }
      // labels
      var label = o2.label, txt = textFor(b, o2);
      if ((label || txt) && style !== 'unit') {
        var fs = style === 'boss' ? Math.max(9 * s, Math.min(16 * s, H * 0.95)) : Math.max(8 * s, Math.min(12 * s, H * 1.25)), ty = style === 'boss' ? Y - Math.max(2, Math.round(H * 0.22)) - 3 * s : Y - 2 * s;
        g.textBaseline = 'alphabetic'; g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 3 * s; g.shadowOffsetY = 1 * s;
        if (label) { g.font = (style === 'boss' ? '700 ' : '600 ') + fs.toFixed(1) + 'px ' + FAMILY; g.textAlign = 'left'; g.fillStyle = '#f6f0ff'; if (g.letterSpacing != null) g.letterSpacing = (style === 'boss' ? fs * 0.08 : 0).toFixed(1) + 'px'; g.fillText(style === 'boss' ? String(label).toUpperCase() : String(label), X + (style === 'boss' ? 2 * s : 0), ty); if (g.letterSpacing != null) g.letterSpacing = '0px'; }
        if (txt) { g.font = '700 ' + (fs * 0.85).toFixed(1) + 'px ' + FAMILY; g.textAlign = 'right'; g.fillStyle = b.low ? mix(th.lowHi, '#ffffff', 0.3) : '#e8e2f2'; g.fillText(txt, X + W - (style === 'boss' ? 2 * s : 0), ty); }
        g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0;
      }
    }
    function textFor(b, o2) {
      var mode = o2.text; if (!mode) return '';
      var v = P.number === 'roll' ? Math.round(b.num) : b.hp;
      if (mode === 'percent') return Math.ceil(v / b.max * 100) + '%';
      if (mode === 'hp') return String(Math.round(v));
      return Math.round(v) + '/' + Math.round(b.max);
    }
    function drawCrisp(g, b, R, style, th, o2) {
      var X = R.x, Y = R.y, W = R.w, H = R.h, u = R.u, pk = pulseK(b), lowStep = b.low ? (P.pulse === 'on' ? (Math.floor(clock / 225) % 2) : 1) : 0;
      var xp = function (v) { return Math.round((X + W * clamp(v / b.max, 0, 1)) / u) * u; };
      var cap = function (v) { return Math.round(v / u) * u; };
      // frame
      if (style === 'boss') {
        var pad = 2 * u;
        g.fillStyle = th.ink; g.fillRect(X - pad - u, Y - pad, W + 2 * pad + 2 * u, H + 2 * pad); g.fillRect(X - pad, Y - pad - u, W + 2 * pad, H + 2 * pad + 2 * u);
        g.fillStyle = b.low && lowStep ? th.low : '#5a4a3a'; g.fillRect(X - pad, Y - pad, W + 2 * pad, u); g.fillRect(X - pad, Y + H + pad - u, W + 2 * pad, u);
        g.fillRect(X - pad, Y - pad, u, H + 2 * pad); g.fillRect(X + W + pad - u, Y - pad, u, H + 2 * pad);
        g.fillStyle = th.rim; g.fillRect(X - pad + u, Y - pad, W + 2 * pad - 2 * u, u);
        // end caps: small pixel diamonds (ink outline, rim-coloured core)
        for (var sd = 0; sd < 2; sd++) {
          var cx = sd ? X + W + pad : X - pad - u, cy = Y + cap(H / 2) - u, DW = [1, 3, 5, 3, 1], CW = [0, 1, 3, 1, 0];
          for (var rI = 0; rI < 5; rI++) { g.fillStyle = th.ink; g.fillRect(cx - (DW[rI] >> 1) * u, cy + (rI - 2) * u, DW[rI] * u, u); if (CW[rI]) { g.fillStyle = rI === 1 ? '#fff1c8' : th.rim; g.fillRect(cx - (CW[rI] >> 1) * u, cy + (rI - 2) * u, CW[rI] * u, u); } }
        }
      } else {
        g.fillStyle = th.ink; g.fillRect(X - u, Y - u, W + 2 * u, H + 2 * u);
      }
      // track
      g.fillStyle = th.track[1]; g.fillRect(X, Y, W, H);
      g.fillStyle = th.track[0]; g.fillRect(X, Y, W, u);
      var xMain = xp(b.main), xGain = xp(b.gainTop), xHp = xp(b.hp), xGh = xp(b.ghost);
      if (b.ghost > b.hp && xGh === xHp) xGh = xHp + u;                       // a loss is never invisible
      if (xGh > xHp) { var lc = lossCol(b, th); g.fillStyle = mix(lc, '#000000', 0.18); g.fillRect(xHp, Y, xGh - xHp, H); g.fillStyle = lc; g.fillRect(xHp, Y, xGh - xHp, Math.max(u, H - u)); if (H >= 3 * u) { g.fillStyle = mix(lc, '#ffffff', 0.5); g.fillRect(xHp, Y, xGh - xHp, u); } }
      if (xGain > xMain) {
        g.fillStyle = th.gain; g.fillRect(xMain, Y, xGain - xMain, H);
        var ph = Math.floor(clock / 125) % 2; g.fillStyle = mix(th.gain, '#ffffff', 0.6);
        for (var gx = xMain + ((ph + xMain / u) % 2 === 0 ? 0 : u); gx < xGain; gx += 2 * u) g.fillRect(gx, Y, u, u);
      }
      if (xMain > X) {
        var base = b.low ? (lowStep ? th.lowHi : th.low) : th.fill[1], hi = b.low ? mix(base, '#ffffff', 0.45) : th.fill[0], lo = b.low ? mix(th.low, '#000000', 0.4) : th.fill[2];
        g.fillStyle = base; g.fillRect(X, Y, xMain - X, H);
        if (H >= 2 * u) { g.fillStyle = hi; g.fillRect(X, Y, xMain - X, u); }
        if (H >= 4 * u) { g.fillStyle = lo; g.fillRect(X, Y + H - u, xMain - X, u); }
      }
      if (P.flash === 'on' && b.flashT < FLASH && Math.floor(b.flashT / 40) % 2 === 0 && xGh > xHp) { g.fillStyle = '#ffffff'; g.fillRect(xHp, Y, xGh - xHp, H); }
      var ticks = P.ticks > 0 ? P.ticks : style === 'boss' ? 4 : 0; if (o2.ticks != null) ticks = num(o2.ticks, ticks);
      if (ticks > 1) { g.fillStyle = 'rgba(0,0,0,0.45)'; for (var i = 1; i < ticks; i++) g.fillRect(cap(X + W * i / ticks), Y + u, u, Math.max(u, H - u)); }
      var label = o2.label, txt = textFor(b, o2);
      if ((label || txt) && style !== 'unit') {
        var ty = Y - (style === 'boss' ? 2 * u + 7 * u : 7 * u), sh = '#1a1020';
        if (label) { text3(g, label, X + u, ty + u, u, sh); text3(g, label, X, ty, u, '#ffffff'); }
        if (txt) { var tw = text3W(txt, u), tx = X + W - tw; text3(g, txt, tx + u, ty + u, u, sh); text3(g, txt, tx, ty, u, b.low && lowStep ? th.lowHi : '#e8ecff'); }
      }
    }

    function snapshot(b) {
      return { id: b.id, hp: b.hp, max: b.max, main: r2(b.main), gainTop: r2(b.gainTop), ghost: r2(b.ghost), phase: b.phase, gain: b.gainPhase,
        loss: r2(b.ghost - b.hp), gainSeg: r2(b.gainTop - b.main), holdLeft: Math.max(0, Math.round(b.holdLeft)), chain: Math.round(b.chain), low: b.low,
        number: Math.round(b.num), flash: b.flashT < FLASH, idle: Math.round(Math.min(b.idle, 1e7)) };
    }
    var api = {
      version: VERSION,
      set: set,
      reset: reset,
      update: update,
      draw: draw,
      setParams: function (p) { setParams(p); },
      params: function () { var c = {}; for (var k in P) c[k] = P[k]; return c; },
      has: function (id) { return !!bars[id]; },
      remove: function (id) { if (!bars[id]) return; delete bars[id]; var i = order.indexOf(id); if (i >= 0) order.splice(i, 1); },
      clear: function () { bars = {}; order = []; },
      shown: function (id) { var b = bars[id]; return b ? Math.round(b.num) : null; },
      busy: function (id) { var b = bars[id]; return !!b && (b.phase !== 'idle' || b.gainPhase !== 'idle'); },
      state: function (id) { if (id != null) return bars[id] ? snapshot(bars[id]) : null; var out = []; for (var i = 0; i < order.length; i++) out.push(snapshot(bars[order[i]])); return out; },
      curve: function (id) { var b = bars[id]; return b ? b.curve.slice() : []; },
      lastDrawn: function () { return frameDrawn.slice(); },
      stats: function () { var c = { bars: order.length, clock: Math.round(clock) }; for (var k in ST) c[k] = ST[k]; return c; },
      time: function () { return clock; }
    };
    return api;
  }

  root.GameDNA_DrainingHpBar = { create: create, version: VERSION, defaults: DEFAULTS, themes: THEMES };
})(typeof window !== 'undefined' ? window : this);
