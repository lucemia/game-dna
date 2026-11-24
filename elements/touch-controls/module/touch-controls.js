/* GameDNA I-03 · Touch controls with edge-latched input · module v1 (plain script, no dependencies, one global)
 *
 *   const tc = GameDNA_TouchControls.create({
 *     canvas: document.querySelector('canvas'),            // the game canvas (controls go below it, or over its corners)
 *     map: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
 *            a: 'KeyZ', b: 'KeyX', start: 'Enter' },       // the game's OWN key codes (a string or an array of codes)
 *     mode: 'events',                                      // 'events': touches become KeyboardEvents for the game's own handlers
 *                                                          // 'poll'  : the game reads tc.pressed(name) / tc.held(name)
 *     params: { pad: 'dpad', side: 'left', placement: 'auto', size: 'medium', ... },   // see DEFAULTS
 *     avoid: () => [{ x, y, w, h }],                       // optional: HUD rects in canvas px that controls placed OVER the canvas must miss
 *     skin: 'pixel16'                                      // optional: drawn through GameDNA_Skin when skin-api.js is loaded
 *   });
 *   In the game's fixed step, first line:  tc.step();   then (poll mode) tc.pressed('a'), tc.held('left'), tc.repeat('down'), tc.axis()
 *   tc.destroy() removes the overlay and every listener and releases every key it pressed.
 *
 * Edge latch: a press that starts and ends between two steps (a 0 ms key tap, a quick touch) is reported exactly once as
 * pressed() on the next step(), and held() is true on that step. In 'events' mode a synthesised key is kept down until a
 * step has seen it; with latch 'all' a real keyboard key-up is also held back until then (for games that only read held keys).
 * The module never consumes input it does not own: only touches that start on a visible control are stopped.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { pad: 'dpad', side: 'left', placement: 'auto', size: 'medium', opacity: 0.6, start: 'on', dirs: 8, show: 'auto', buttons: 2, latch: 'all' };
  var SIZES = { small: { cell: 10, r: 8 }, medium: { cell: 12, r: 9 }, large: { cell: 14, r: 11 } };
  var DIRS = ['up', 'down', 'left', 'right'], BTN = ['a', 'b', 'c'];
  var M = 5;   // art-pixel margin

  /* ---------- built-in pixel16 look (used when skin-api.js is not loaded) ---------- */
  var FB = {
    ink: '#06061a',
    ui: { fill: '#4c5a8a', fillTo: '#262e4e', highlight: '#c8d4f4', shadow: '#0a0e22' },
    team: { a: '#3a64d8', b: '#d85a48' },
    fx: { heal: '#4ad870', crit: '#ffb43a' },
    text: { main: '#ffffff', main2: '#c8d4ff', shadow: '#0a0c24', accent: '#ffe070', dim: '#8088a8' }
  };
  var GLYPH = {   // 5x7, used for button letters without a skin
    A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
    X: '10001,10001,01010,00100,01010,10001,10001', Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
    L: '10000,10000,10000,10000,10000,10000,11111', R: '11110,10001,10001,11110,10100,10010,10001', '?': '01110,10001,00001,00010,00100,00000,00100'
  };
  var TINY = {    // 3x5, the START / SELECT pill labels
    S: '111,100,111,001,111', T: '111,010,010,010,010', A: '010,101,111,101,101', R: '110,101,110,101,101',
    E: '111,100,110,100,111', L: '100,100,100,100,111', C: '111,100,100,100,111', P: '110,101,110,100,100', U: '101,101,101,101,111', '?': '111,001,010,000,010'
  };
  var KEYINFO = { ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
    Space: [' ', 32], Enter: ['Enter', 13], NumpadEnter: ['Enter', 13], Escape: ['Escape', 27], Tab: ['Tab', 9], Backspace: ['Backspace', 8],
    ShiftLeft: ['Shift', 16], ShiftRight: ['Shift', 16], ControlLeft: ['Control', 17], ControlRight: ['Control', 17], AltLeft: ['Alt', 18], AltRight: ['Alt', 18] };
  function keyInfo(code) {
    if (KEYINFO[code]) return KEYINFO[code];
    var m = /^Key([A-Z])$/.exec(code); if (m) return [m[1].toLowerCase(), m[1].charCodeAt(0)];
    m = /^Digit([0-9])$/.exec(code); if (m) return [m[1], 48 + +m[1]];
    return [code, 0];
  }
  function hex(c) { var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) { m = /^#([0-9a-f]{3})$/i.exec(c || ''); if (!m) return null; var s = m[1]; return [17 * parseInt(s[0], 16), 17 * parseInt(s[1], 16), 17 * parseInt(s[2], 16)]; } var n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var A = hex(a), B = hex(b); if (!A || !B) return t < 0.5 ? a : b; var o = '#'; for (var i = 0; i < 3; i++) o += ('0' + Math.round(A[i] + (B[i] - A[i]) * t).toString(16)).slice(-2); return o; }
  function lum(c) { var A = hex(c); return A ? (0.299 * A[0] + 0.587 * A[1] + 0.114 * A[2]) / 255 : 0.5; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function any(o) { for (var k in o) if (o[k]) return true; return false; }
  function inRect(x, y, r) { return r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
  function hitRect(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  function create(opt) {
    opt = opt || {};
    var P = {}; Object.keys(DEFAULTS).forEach(function (k) { P[k] = DEFAULTS[k]; });
    var L0 = opt.layout || {}; Object.keys(L0).forEach(function (k) { if (k in DEFAULTS) P[k] = L0[k]; });
    var P0 = opt.params || {}; Object.keys(P0).forEach(function (k) { if (k in DEFAULTS) P[k] = P0[k]; });
    var MODE = opt.mode === 'poll' ? 'poll' : 'events';
    var STEP_MS = num(opt.stepMs, 1000 / 60);
    var SKIN = root.GameDNA_Skin, SK = null;
    try { SK = SKIN && SKIN.resolve ? SKIN.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var PAL = SK && SK.palette ? SK.palette : FB, PIXEL = SK ? SK.pixel !== false : true;
    function tok(path, fb) { var o = PAL; path.split('.').forEach(function (k) { o = o == null ? null : o[k]; }); if (o == null || typeof o === 'object') { o = FB; path.split('.').forEach(function (k) { o = o == null ? null : o[k]; }); } return o == null || typeof o === 'object' ? fb : o; }
    function warn(m) { try { if (root.console) console.warn('GameDNA_TouchControls: ' + m); } catch (e) {} }

    /* ---------- key map ---------- */
    var MAP = opt.map || { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'KeyZ', b: 'KeyX', start: 'Enter' };
    var names = [], codesOf = {}, nameOf = {};
    Object.keys(MAP).forEach(function (n) {
      var c = MAP[n]; if (c == null || c === '') return; c = Array.isArray(c) ? c.filter(Boolean).map(String) : [String(c)]; if (!c.length) return;
      names.push(n); codesOf[n] = c; c.forEach(function (code) { if (!nameOf[code]) nameOf[code] = n; });
    });
    var src = {}, latch = {}, cnt = {}, heldNow = {}, pressedNow = {}, releasedNow = {}, holdSteps = {}, downStep = {}, synth = {}, pendUp = {}, flashUntil = {};
    names.forEach(function (n) { src[n] = {}; latch[n] = false; cnt[n] = 0; heldNow[n] = false; pressedNow[n] = false; releasedNow[n] = false; holdSteps[n] = 0; synth[n] = false; pendUp[n] = false; flashUntil[n] = 0; });
    var stepN = 0, stepWired = false, realDown = {}, kbDownStep = {}, deferred = [], timers = [], stats = { synthDown: 0, synthUp: 0, deferredUps: 0, touches: 0, consumed: 0, steps: 0 };

    /* ---------- state ---------- */
    var attached = false, visible = false, forced = null, dirty = true, raf = 0, wrap = null, cv = null, g = null, lay = null, layKey = '', safe = { l: 0, r: 0, b: 0, t: 0 }, safeProbe = null;
    var avoidWarned = false, owners = {}, touchIds = {}, stick = { x: 0, y: 0 }, firstCbs = [], touched = false, destroyed = false;
    if (typeof opt.onFirstInput === 'function') firstCbs.push(opt.onFirstInput);

    function canvasEl() { var c = opt.canvas; if (typeof c === 'string') { try { c = document.querySelector(c); } catch (e) { c = null; } } return c && c.getBoundingClientRect ? c : null; }
    function target() { try { if (opt.keyTarget) return opt.keyTarget; var a = document.activeElement; if (a && a !== document.body && !editable(a)) return a; return document.body || document; } catch (e) { return document; } }
    function editable(el) { return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''))); }

    function fireKey(type, code, tgt) {
      try {
        var k = keyInfo(code), ev = new KeyboardEvent(type, { code: code, key: k[0], bubbles: true, cancelable: true, composed: true });
        try { Object.defineProperty(ev, 'keyCode', { get: function () { return k[1]; } }); Object.defineProperty(ev, 'which', { get: function () { return k[1]; } }); } catch (e) {}
        ev.__gamedna = true;
        (tgt && tgt.isConnected !== false ? tgt : target()).dispatchEvent(ev);
      } catch (e) {}
    }
    function synthDown(n) {
      if (MODE !== 'events') return;
      if (pendUp[n]) {                                  // re-pressed before the held-back key-up went out
        if (stepN > downStep[n]) { pendUp[n] = false; fireKey('keyup', codesOf[n][0]); stats.synthUp++; synth[n] = false; }
        else { pendUp[n] = false; return; }             // same step: one press
      }
      if (synth[n] || realDown[codesOf[n][0]]) return;
      synth[n] = true; stats.synthDown++; fireKey('keydown', codesOf[n][0]);
    }
    function synthUp(n) {
      if (MODE !== 'events' || !synth[n]) return;
      if (stepWired && stepN < downStep[n] + 2) { pendUp[n] = true; return; }
      if (!stepWired) {                                 // step() not wired: keep it down ~2 frames so a polling game sees it
        var id = setTimeout(function () { timers = timers.filter(function (t) { return t !== id; }); if (synth[n] && !any(src[n])) { synth[n] = false; stats.synthUp++; fireKey('keyup', codesOf[n][0]); } }, 34);
        timers.push(id); return;
      }
      synth[n] = false; stats.synthUp++; fireKey('keyup', codesOf[n][0]);
    }
    function setSrc(n, id, on) {
      var s = src[n]; if (!s) return;
      var was = any(s); if (on) s[id] = true; else delete s[id]; var now = any(s);
      if (!was && now) { latch[n] = true; downStep[n] = stepN; flashUntil[n] = Date.now() + 90; if (id.charAt(0) !== 'k') synthDown(n); dirty = true; firstInput(); }
      else if (was && !now) { if (id.charAt(0) !== 'k') synthUp(n); dirty = true; }
    }
    function firstInput() { if (touched) return; touched = true; firstCbs.forEach(function (f) { try { f(); } catch (e) {} }); }

    /* ---------- keyboard (tracked for pressed()/held(); never stopped, only a key-up may be held back one step) ---------- */
    function onKeyDown(e) {
      try {
        if (e.__gamedna) return; var n = nameOf[e.code];
        if (!n || editable(e.target)) return;
        if (e.isTrusted !== false && P.show === 'auto' && forced == null && visible) setVisible(false);
        if (MODE === 'poll' && opt.preventDefault !== false) e.preventDefault();
        if (e.repeat && realDown[e.code]) return;
        realDown[e.code] = true; kbDownStep[e.code] = stepN;
        deferred = deferred.filter(function (d) { return d.code !== e.code; });
        setSrc(n, 'k:' + e.code, true);
      } catch (err) {}
    }
    function onKeyUp(e) {
      try {
        if (e.__gamedna) return; var n = nameOf[e.code]; if (!n) return;
        if (MODE === 'events' && P.latch === 'all' && stepWired && realDown[e.code] && stepN < kbDownStep[e.code] + 2) {
          e.stopImmediatePropagation(); stats.deferredUps++;                       // re-sent unchanged after the next step
          deferred.push({ code: e.code, tgt: e.target, step: kbDownStep[e.code] }); return;
        }
        realDown[e.code] = false; setSrc(n, 'k:' + e.code, false);
      } catch (err) {}
    }
    function flushDeferred(all) {
      var keep = [];
      deferred.forEach(function (d) {
        if (all || stepN >= d.step + 2) { realDown[d.code] = false; var n = nameOf[d.code]; if (n) setSrc(n, 'k:' + d.code, false); fireKey('keyup', d.code, d.tgt); }
        else keep.push(d);
      });
      deferred = keep;
    }
    function releaseAll() {
      flushDeferred(true);
      Object.keys(owners).forEach(function (id) { setOwner(id, []); }); owners = {}; touchIds = {}; stick.x = stick.y = 0;
      names.forEach(function (n) { Object.keys(src[n]).forEach(function (id) { if (id.charAt(0) === 'k') realDown[id.slice(2)] = false; setSrc(n, id, false); }); });
      names.forEach(function (n) { if (pendUp[n] || synth[n]) { pendUp[n] = false; synth[n] = false; stats.synthUp++; fireKey('keyup', codesOf[n][0]); } });
      dirty = true;
    }

    /* ---------- gamepad (standard mapping) ---------- */
    var PADMAP = { up: 12, down: 13, left: 14, right: 15, a: 0, b: 1, c: 2, start: 9, select: 8 };
    function pollPad() {
      if (opt.gamepad === false) return;
      try {
        var pads = root.navigator && navigator.getGamepads ? navigator.getGamepads() : null, gp = null;
        if (pads) for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
        if (!gp) { names.forEach(function (n) { if (src[n].pad) setSrc(n, 'pad', false); }); return; }
        var ax = gp.axes || [], b = gp.buttons || [], usedAny = false;
        names.forEach(function (n) {
          var on = false, bi = PADMAP[n];
          if (bi != null && b[bi]) on = !!(b[bi].pressed || b[bi].value > 0.5);
          if (n === 'left' && ax[0] < -0.5) on = true; if (n === 'right' && ax[0] > 0.5) on = true;
          if (n === 'up' && ax[1] < -0.5) on = true; if (n === 'down' && ax[1] > 0.5) on = true;
          if (on) usedAny = true;
          if (on !== !!src[n].pad) setSrc(n, 'pad', on);
        });
        if (usedAny && P.show === 'auto' && forced == null && visible) setVisible(false);
      } catch (e) {}
    }

    /* ---------- the step: the edge latch ---------- */
    function step() {
      try {
        stepWired = true; stepN++; stats.steps++;
        pollPad();
        flushDeferred(false);
        names.forEach(function (n) {
          if (pendUp[n] && stepN >= downStep[n] + 2 && !any(src[n])) { pendUp[n] = false; synth[n] = false; stats.synthUp++; fireKey('keyup', codesOf[n][0]); }
          var h = any(src[n]), p = latch[n]; latch[n] = false;
          pressedNow[n] = p; if (p) cnt[n]++;
          var held = h || p;
          releasedNow[n] = heldNow[n] && !held; heldNow[n] = held;
          holdSteps[n] = held ? holdSteps[n] + 1 : 0;
        });
      } catch (e) {}
    }
    function pressed(n) { return !!pressedNow[n]; }
    function held(n) { return !!heldNow[n]; }
    function released(n) { return !!releasedNow[n]; }
    function repeat(n, delay, rate) {
      if (pressedNow[n]) return true; if (!heldNow[n]) return false;
      var d = Math.max(1, Math.round(num(delay, 300) / STEP_MS)), r = Math.max(1, Math.round(num(rate, 80) / STEP_MS)), h = holdSteps[n];
      return h > d && (h - d - 1) % r === 0;
    }
    function axis() {
      if (P.pad === 'stick' && any(owners) && (stick.x || stick.y)) return { x: stick.x, y: stick.y };
      var x = (heldNow.right ? 1 : 0) - (heldNow.left ? 1 : 0), y = (heldNow.down ? 1 : 0) - (heldNow.up ? 1 : 0);
      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x: x, y: y };
    }

    /* ---------- visibility ---------- */
    function touchDevice() { try { return (root.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0 && root.matchMedia && matchMedia('(hover: none)').matches; } catch (e) { return false; } }
    function wantVisible() { if (forced != null) return forced; if (P.show === 'always') return true; if (P.show === 'never') return false; return visible; }
    function setVisible(v) {
      if (visible === v) return; visible = v; dirty = true;
      if (!v) { Object.keys(owners).forEach(function (id) { setOwner(id, []); }); owners = {}; touchIds = {}; }
      if (wrap) wrap.style.display = v ? 'block' : 'none';
      if (typeof opt.onShow === 'function') { try { opt.onShow(v); } catch (e) {} }
    }

    /* ---------- layout (CSS px; art px = css / px) ---------- */
    function readSafe() {
      try {
        if (!safeProbe) { safeProbe = document.createElement('div'); safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(safeProbe); }
        var cs = getComputedStyle(safeProbe); safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
      } catch (e) {}
    }
    function btnNames() { var n = Math.max(0, Math.min(3, Math.round(num(P.buttons, 2)))); return BTN.filter(function (b) { return codesOf[b]; }).slice(0, n); }
    function computeLayout(forcePx, sizeKey) {
      var de = document.documentElement, vw = de.clientWidth || root.innerWidth, vh = root.innerHeight || de.clientHeight;
      var reg = { x: 0, y: 0, w: vw, h: vh };
      if (opt.container) { try { var cr = (typeof opt.container === 'string' ? document.querySelector(opt.container) : opt.container).getBoundingClientRect(); var x0 = Math.max(0, cr.left), y0 = Math.max(0, cr.top); reg = { x: x0, y: y0, w: Math.max(0, Math.min(vw, cr.right) - x0), h: Math.max(0, Math.min(vh, cr.bottom) - y0) }; } catch (e) {} }
      var sx0 = Math.max(reg.x, safe.l), sx1 = Math.min(reg.x + reg.w, vw - safe.r), sy1 = Math.min(reg.y + reg.h, vh - safe.b);
      var c = canvasEl(), cr2 = c ? c.getBoundingClientRect() : null;
      if (cr2 && (cr2.width < 2 || cr2.height < 2)) cr2 = null;
      var S = SIZES[sizeKey || P.size] || SIZES.medium, cell = S.cell, r = S.r, bn = btnNames(), hasStart = codesOf.start && P.start !== 'off';
      var stickR = Math.round(cell * 1.5) + 1;
      var padW = P.pad === 'stick' ? 2 * stickR + 1 : 3 * cell + 2, padH = P.pad === 'stick' ? 2 * stickR + 3 : 3 * cell + 4;
      var dx = 2 * r + 5, dy = 6, nb = Math.max(1, bn.length);
      var cluW = bn.length ? (nb - 1) * dx + 2 * r + 3 : 0, cluH = bn.length ? (nb - 1) * dy + 2 * r + 5 : 0;
      var tri = nb === 3, triUp = 2 * r + 3;   // three buttons: a triangle (c above, between b and a), as wide as two
      if (tri) { cluW = dx + 2 * r + 3; cluH = triUp + dy + 2 * r + 5; }
      var stW = hasStart ? 4 * 5 - 1 + 6 : 0, stH = hasStart ? 10 : 0;
      var rowH = Math.max(padH, cluH);
      var inlineW = M + padW + (hasStart ? 3 + stW + 3 : 4) + cluW + M, stackW = M + padW + 4 + cluW + M;
      var bottomFree = cr2 ? sy1 - Math.max(reg.y, cr2.bottom) : reg.h;
      var place = ['below', 'sides', 'over'].indexOf(P.placement) >= 0 ? P.placement : 'auto';
      var areaW = sx1 - sx0;
      var px = forcePx || num(opt.pixel, 0), stacked = false;
      if (!(px >= 1)) {
        // largest whole scale that fits the width and keeps the deck under 40 % of the height; inline before stacked START
        var hMax = Math.max(1, (reg.h || vh) * 0.4), fits = function (w, h, t) { return w * t <= areaW && h * t <= hMax; }, found = false;
        var hIn = rowH + 2 * M, hSt = hIn + (hasStart ? stH + 3 : 0);
        [[4, 0], [3, 0], [4, 1], [3, 1], [2, 0], [2, 1]].some(function (c) { if (fits(c[1] ? stackW : inlineW, c[1] ? hSt : hIn, c[0])) { px = c[0]; stacked = !!c[1]; found = true; return true; } return false; });
        if (!found) { px = 2; stacked = inlineW * 2 > areaW; }
      } else stacked = inlineW * px > areaW;
      var bandH = rowH + 2 * M + (stacked && hasStart ? stH + 3 : 0);
      var room = !cr2 || bottomFree >= (bandH + 1) * px;
      var leftPad = P.side !== 'right';
      // HUD rects (canvas px -> art px at a given scale); read every layout so the controls follow the game's windows
      var hudSrc = [];
      if (cr2 && typeof opt.avoid === 'function') {
        try { var c0 = canvasEl(), kx = cr2.width / (c0.width || cr2.width), ky = cr2.height / (c0.height || cr2.height);
          (opt.avoid() || []).forEach(function (q) { if (q && isFinite(q.x) && isFinite(q.y) && q.w > 0 && q.h > 0) hudSrc.push({ x: cr2.left + q.x * kx, y: cr2.top + q.y * ky, w: q.w * kx, h: q.h * ky }); });
        } catch (e) { if (!avoidWarned) { avoidWarned = true; warn('avoid() threw: ' + (e && e.message)); } }
      }
      // beside the canvas (landscape phones with side gutters): pad in one gutter, buttons + START in the other
      var sideFit = 0;
      if (cr2 && (place === 'auto' && !room || place === 'sides')) {
        var lf = cr2.left - sx0, rf = sx1 - cr2.right, g1 = leftPad ? lf : rf, g2 = leftPad ? rf : lf;
        for (var t2 = forcePx || Math.min(4, Math.max(px, 3)); t2 >= (forcePx || 2); t2--) if (g1 >= (padW + 6) * t2 && g2 >= (Math.max(cluW, stW) + 6) * t2 && (cluH + stH + 2 * M + 3) * t2 <= sy1 - reg.y) { sideFit = t2; break; }
      }
      if (place === 'sides' && !sideFit) place = 'auto';
      if (place === 'below' && !room) place = 'auto';                       // never below into the canvas
      if (place === 'auto') place = room ? 'below' : sideFit ? 'sides' : 'over';
      if (place === 'sides') { px = sideFit; stacked = false; }
      if (place === 'over' && cr2 && !forcePx && !(num(opt.pixel, 0) >= 1)) {   // over the game: each group stays under ~30 % of the visible canvas height
        var visH = Math.min(cr2.bottom, sy1) - Math.max(cr2.top, reg.y), grpH = Math.max(padH, cluH) + 2 * M;
        var visW = Math.min(cr2.right, sx1) - Math.max(cr2.left, sx0);
        stacked = false; while (px > 2 && (grpH * px > visH * 0.25 || inlineW * px > visW)) px--;   // over the game: small, and pad and buttons never meet
        if (inlineW * px > areaW) stacked = hasStart;
        bandH = rowH + 2 * M + (stacked && hasStart ? stH + 3 : 0);
      }
      var out = { px: px, placement: place, vw: vw, vh: vh, cell: cell, r: r, stickR: stickR, buttons: bn, start: hasStart, stacked: stacked, els: {}, band: null };
      var order = bn.slice().reverse(); if (!leftPad) order = bn.slice();
      var placeButtons = function (clu) {
        if (tri) {   // b low on the inner side, a high on the outer side, c on top between them
          var inner = { name: 'b', cx: clu.x + r + 1 + (leftPad ? 0 : dx), cy: clu.y + triUp + r + 1 + dy, r: r }, outer = { name: 'a', cx: clu.x + r + 1 + (leftPad ? dx : 0), cy: clu.y + triUp + r + 1, r: r };
          out.els.buttons = [inner, outer, { name: 'c', cx: clu.x + r + 1 + Math.round(dx / 2), cy: clu.y + r + 1, r: r }]; return;
        }
        out.els.buttons = order.map(function (n, i) {   // 'a' sits on the outer side, highest
          return { name: n, cx: clu.x + r + 1 + i * dx, cy: clu.y + r + 1 + (leftPad ? nb - 1 - i : i) * dy, r: r }; }); };
      var pad, clu;
      if (place === 'sides') {
        var ax0 = Math.ceil(sx0 / px), ax1 = Math.floor(sx1 / px), cl = Math.floor(cr2.left / px), crr = Math.ceil(cr2.right / px);
        var gy1 = Math.floor(sy1 / px) - M, gmid = Math.min(gy1 - Math.ceil(Math.max(padH, cluH) / 2), Math.round((reg.y + (sy1 - reg.y) * 0.62) / px));
        var gL = [ax0, cl], gR = [crr, ax1], gp = leftPad ? gL : gR, gb = leftPad ? gR : gL;
        pad = { x: Math.round((gp[0] + gp[1] - padW) / 2), y: gmid - Math.ceil(padH / 2), w: padW, h: padH, kind: 'pad' };
        clu = { x: Math.round((gb[0] + gb[1] - cluW) / 2), y: gmid - Math.ceil(cluH / 2), w: cluW, h: cluH };
        out.els.pad = pad; placeButtons(clu);
        if (hasStart) out.els.start = { x: Math.round((gb[0] + gb[1] - stW) / 2), y: clu.y - stH - 3, w: stW, h: stH - 1, name: 'start' };
      } else {
        var box;   // art-px area the controls sit in
        if (place === 'below') {
          var by1 = Math.floor(sy1 / px), by0 = by1 - bandH;
          box = { x0: Math.ceil(sx0 / px), x1: Math.floor(sx1 / px), y0: by0, y1: by1 };
          out.band = { x: Math.floor(reg.x / px), y: by0, w: Math.ceil((reg.x + reg.w) / px) - Math.floor(reg.x / px), h: Math.ceil((reg.y + reg.h) / px) - by0 };
        } else {
          var cx0 = cr2 ? Math.max(sx0, cr2.left) : sx0, cx1 = cr2 ? Math.min(sx1, cr2.right) : sx1, cy1 = cr2 ? Math.min(sy1, cr2.bottom) : sy1;
          box = { x0: Math.ceil(cx0 / px), x1: Math.floor(cx1 / px), y0: Math.floor(cy1 / px) - bandH, y1: Math.floor(cy1 / px) };
        }
        var midY = Math.round((box.y0 + box.y1 + (stacked && hasStart ? stH + 3 : 0)) / 2);
        pad = { x: leftPad ? box.x0 + M : box.x1 - M - padW, y: midY - Math.ceil(padH / 2), w: padW, h: padH, kind: 'pad' };
        clu = { x: leftPad ? box.x1 - M - cluW : box.x0 + M, y: midY - Math.ceil(cluH / 2), w: cluW, h: cluH };
        out.els.pad = pad; placeButtons(clu);
        if (hasStart) {
          var sx = Math.round((pad.x + pad.w + clu.x) / 2 - stW / 2), sy = stacked ? box.y0 + M - 1 : box.y1 - M - stH;
          if (!leftPad) sx = Math.round((clu.x + clu.w + pad.x) / 2 - stW / 2);
          if (stacked) sx = Math.round((box.x0 + box.x1) / 2 - stW / 2);
          out.els.start = { x: sx, y: sy, w: stW, h: stH - 1, name: 'start' };
        }
      }
      // over the canvas: step up and away from the game's HUD rects
      if (place === 'over' && cr2 && hudSrc.length) {
        var hud = hudSrc.map(function (q) { return { x: Math.floor(q.x / px) - 1, y: Math.floor(q.y / px) - 1, w: Math.ceil(q.w / px) + 2, h: Math.ceil(q.h / px) + 2 }; });
        var topLimit = Math.round((Math.max(cr2.top, reg.y) + (Math.min(cr2.bottom, sy1) - Math.max(cr2.top, reg.y)) * 0.3) / px);
        var lift = function (rects, setY) { for (var k = 0; k < 300; k++) { if (!rects().some(function (a) { return hud.some(function (h) { return hitRect(a, h); }); })) return true; if (rects()[0].y - 2 < topLimit) return false; setY(-2); } return false; };
        var bb = function () { return out.els.buttons.map(function (b) { return { x: b.cx - b.r - 1, y: b.cy - b.r - 1, w: 2 * b.r + 3, h: 2 * b.r + 5 }; }); };
        var y0p = pad.y, y0b = out.els.buttons.map(function (b) { return b.cy; }), y0s = out.els.start ? out.els.start.y : 0;
        if (!lift(function () { return [pad]; }, function (d) { pad.y += d; })) { pad.y = y0p; out.blocked = true; }
        if (!lift(bb, function (d) { out.els.buttons.forEach(function (b) { b.cy += d; }); })) { out.els.buttons.forEach(function (b, i) { b.cy = y0b[i]; }); out.blocked = true; }
        if (out.els.start && !lift(function () { return [out.els.start]; }, function (d) { out.els.start.y += d; })) { out.els.start.y = y0s; out.blocked = true; }
      }
      out.key = [px, place, vw, vh, reg.x, reg.y, reg.w, reg.h, cr2 ? [cr2.left, cr2.top, cr2.width, cr2.height].map(Math.round).join(',') : '-', P.pad, P.side, P.size, P.start, P.buttons, P.opacity, safe.b, safe.l, safe.r, hudSrc.map(function (q) { return [q.x, q.y, q.w, q.h].map(Math.round).join(','); }).join(';')].join('|');
      return out;
    }
    // CSS-px geometry for hit tests
    function cssEls() {
      if (!lay) return null; var px = lay.px, e = lay.els, o = {};
      var p = e.pad; o.pad = { x: p.x * px, y: p.y * px, w: p.w * px, h: p.h * px, cx: (p.x + p.w / 2) * px, cy: (p.y + (P.pad === 'stick' ? lay.stickR + 0.5 : 1 + 1.5 * lay.cell)) * px, rr: (P.pad === 'stick' ? lay.stickR : 1.5 * lay.cell) * px };
      o.buttons = e.buttons.map(function (b) { return { name: b.name, cx: (b.cx + 0.5) * px, cy: (b.cy + 0.5) * px, r: (b.r + 1) * px }; });
      if (e.start) o.start = { x: e.start.x * px, y: e.start.y * px, w: e.start.w * px, h: e.start.h * px };
      if (lay.band) o.band = { x: lay.band.x * px, y: lay.band.y * px, w: lay.band.w * px, h: lay.band.h * px };
      return o;
    }

    /* ---------- pointers ---------- */
    function hitTest(x, y) {
      var o = cssEls(); if (!o) return null;
      var pd = o.pad, dx = x - pd.cx, dy = y - pd.cy;
      // each control's touch margin reaches out from its edge; where margins meet, the nearest edge wins (no overlap)
      var best = null, bd = 1e9, d = Math.sqrt(dx * dx + dy * dy) - pd.rr;
      if (d <= 14) { best = 'pad'; bd = d; }
      if (o.start) { var st = o.start, ex = Math.max(st.x - x, 0, x - st.x - st.w), ey = Math.max(st.y - y, 0, y - st.y - st.h), ds = Math.sqrt(ex * ex + ey * ey); if (ds <= 8 && ds < bd) { best = 'start'; bd = ds; } }
      o.buttons.forEach(function (b) { var db = Math.sqrt((x - b.cx) * (x - b.cx) + (y - b.cy) * (y - b.cy)) - b.r; if (db <= 12 && db < bd) { best = 'btn'; bd = db; } });
      return best;
    }
    function nearestBtn(x, y, o) {
      var best = null, bd = 1e9;
      (o || cssEls()).buttons.forEach(function (b) { var d = Math.sqrt((x - b.cx) * (x - b.cx) + (y - b.cy) * (y - b.cy)); if (d <= b.r + 12 && d < bd) { bd = d; best = b.name; } });
      return best;
    }
    function dirsAt(x, y) {
      var o = cssEls(); if (!o) return []; var pd = o.pad, vx = (x - pd.cx) / pd.rr, vy = (y - pd.cy) / pd.rr, len = Math.sqrt(vx * vx + vy * vy);
      if (P.pad === 'stick') { var k = Math.min(1, len); stick.x = len ? vx / len * k : 0; stick.y = len ? vy / len * k : 0; }
      if (len < (P.pad === 'stick' ? 0.3 : 0.22)) { if (P.pad === 'stick') { stick.x = stick.y = 0; } return []; }
      var ang = Math.atan2(vy, vx) * 180 / Math.PI, out = [];      // 0 = right, 90 = down
      if (+P.dirs === 4) { var q = Math.round(ang / 90); q = ((q % 4) + 4) % 4; return [['right', 'down', 'left', 'up'][q]]; }
      var a = ((ang % 360) + 360) % 360, dg = Math.round((a - 45) / 90) * 90 + 45, oct;
      if (Math.abs(a - dg) <= 20) oct = (dg / 45) % 8;                 // diagonals 40 deg wide, cardinals 50 deg
      else oct = (Math.round(a / 90) * 2) % 8;
      if ([7, 0, 1].indexOf(oct) >= 0) out.push('right'); if ([3, 4, 5].indexOf(oct) >= 0) out.push('left');
      if ([1, 2, 3].indexOf(oct) >= 0) out.push('down'); if ([5, 6, 7].indexOf(oct) >= 0) out.push('up');
      return out.filter(function (n) { return codesOf[n]; });
    }
    function setOwner(id, list) {
      var ow = owners[id]; if (!ow) return;
      ow.names.forEach(function (n) { if (list.indexOf(n) < 0) setSrc(n, 'p' + id, false); });
      list.forEach(function (n) { if (ow.names.indexOf(n) < 0) setSrc(n, 'p' + id, true); });
      ow.names = list.slice(); dirty = true;
    }
    function track(id, x, y) {
      var ow = owners[id]; if (!ow) return;
      if (ow.kind === 'pad') setOwner(id, dirsAt(x, y));
      else if (ow.kind === 'btn') { var b = nearestBtn(x, y); setOwner(id, b && codesOf[b] ? [b] : []); }
      else if (ow.kind === 'start') { var s = cssEls().start; setOwner(id, s && inRect(x, y, { x: s.x - 14, y: s.y - 14, w: s.w + 28, h: s.h + 28 }) ? ['start'] : []); }
    }
    function onPDown(e) {
      try {
        if (destroyed) return;
        if (!visible) { if (e.pointerType === 'touch' && P.show === 'auto' && forced == null && e.isTrusted !== false) { setVisible(true); relayout(true); } return; }
        if (!lay) relayout(true);
        var k = hitTest(e.clientX, e.clientY); if (!k) return;
        e.preventDefault(); e.stopImmediatePropagation(); stats.touches++; stats.consumed++;
        owners[e.pointerId] = { kind: k, names: [] }; track(e.pointerId, e.clientX, e.clientY);
      } catch (err) {}
    }
    function onPMove(e) { try { if (!owners[e.pointerId]) return; e.preventDefault(); e.stopImmediatePropagation(); track(e.pointerId, e.clientX, e.clientY); } catch (err) {} }
    function onPUp(e) {
      try {
        if (!owners[e.pointerId]) return; e.preventDefault(); e.stopImmediatePropagation();
        if (owners[e.pointerId].kind === 'pad') stick.x = stick.y = 0;
        setOwner(e.pointerId, []); delete owners[e.pointerId];
      } catch (err) {}
    }
    function onTouch(e) {   // stops scrolling, zoom and emulated mouse events for touches that belong to a control
      try {
        if (!visible) return; var mine = false, i, t;
        if (e.type === 'touchstart') { for (i = 0; i < e.changedTouches.length; i++) { t = e.changedTouches[i]; if (hitTest(t.clientX, t.clientY)) { touchIds[t.identifier] = true; mine = true; } } }
        else { for (i = 0; i < e.changedTouches.length; i++) if (touchIds[e.changedTouches[i].identifier]) mine = true; if (e.type === 'touchend' || e.type === 'touchcancel') for (i = 0; i < e.changedTouches.length; i++) delete touchIds[e.changedTouches[i].identifier]; }
        if (mine && e.cancelable) e.preventDefault();
      } catch (err) {}
    }
    function onBlur() { releaseAll(); }
    function onVis() { if (document.hidden) releaseAll(); }

    /* ---------- drawing ---------- */
    function relayout(force) {
      try {
        var want = wantVisible(); if (want !== visible) setVisible(want);
        if (!wrap || !visible) return;
        var L = computeLayout();
        // a larger size never draws smaller than a smaller one: take at least the scale the smaller sizes get here
        var order = ['small', 'medium', 'large'], si = order.indexOf(P.size), floorPx = 0;
        for (var k = 0; k < si; k++) floorPx = Math.max(floorPx, computeLayout(0, order[k]).px);
        if (floorPx > L.px) {
          var Lf = computeLayout(floorPx);
          if (Lf.placement !== 'over' || L.placement === 'over' && P.placement === 'over') L = Lf;
          else {   // the bigger deck would have to cover the game: cap at the largest smaller size that stays beside or below it
            for (var k2 = si - 1; k2 >= 0; k2--) { var Ls = computeLayout(0, order[k2]); if (Ls.placement !== 'over' || k2 === 0) { L = Ls; L.capped = order[k2]; break; } }
          }
        }
        if (!force && !dirty && L.key === layKey) return;
        var keyChanged = L.key !== layKey; lay = L; layKey = L.key;
        if (keyChanged || !cv.width) {
          var W = Math.ceil(L.vw / L.px), H = Math.ceil(L.vh / L.px), dpr = PIXEL ? 1 : Math.max(1, Math.min(3, root.devicePixelRatio || 1));
          wrap.style.width = L.vw + 'px'; wrap.style.height = L.vh + 'px';
          cv.width = PIXEL ? W : Math.ceil(W * L.px * dpr); cv.height = PIXEL ? H : Math.ceil(H * L.px * dpr);
          cv.style.width = W * L.px + 'px'; cv.style.height = H * L.px + 'px';
          g = cv.getContext('2d'); g.imageSmoothingEnabled = !PIXEL;
          if (!PIXEL) g.setTransform(L.px * dpr, 0, 0, L.px * dpr, 0, 0);
        }
        paint(); dirty = false;
      } catch (e) { warn('draw failed: ' + (e && e.message)); dirty = false; }
    }
    function frame() {
      raf = 0; if (destroyed) return;
      pollPadIdle(); relayout(false);
      var now = Date.now(); names.forEach(function (n) { if (flashUntil[n] && flashUntil[n] <= now) { flashUntil[n] = 0; dirty = true; } });
      raf = root.requestAnimationFrame ? requestAnimationFrame(frame) : 0;
    }
    function pollPadIdle() { if (!stepWired) pollPad(); }
    function isOn(n) { return any(src[n]) || flashUntil[n] > Date.now(); }
    function px1(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
    function disc(cx, cy, r, c, dy) {          // filled circle, pixel centre (cx, cy)
      dy = dy || 0; g.fillStyle = c;
      if (!PIXEL) { g.beginPath(); g.arc(cx + 0.5, cy + 0.5 + dy, r + 0.45, 0, Math.PI * 2); g.fill(); return; }
      for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r + r * 0.8 - y * y)); if (w >= 0) g.fillRect(cx - w, cy + y + dy, 2 * w + 1, 1); }
    }
    function shadedDisc(cx, cy, r, base, on) {
      var ink = tok('ink', '#06061a'), light = mix(base, '#ffffff', 0.45), dark = mix(base, ink, 0.45), body = on ? mix(base, ink, 0.28) : base, oy = on ? 1 : 0;
      g.globalAlpha *= 0.45; disc(cx, cy + (on ? 1 : 2), r + 1, ink); g.globalAlpha /= 0.45;   // pressed: the shadow hides under the sunk button
      disc(cx, cy + oy, r + 1, ink);
      if (!PIXEL) {
        var gr = g.createRadialGradient(cx - r * 0.35, cy + oy - r * 0.4, r * 0.1, cx, cy + oy, r + 0.5);
        gr.addColorStop(0, on ? body : light); gr.addColorStop(0.55, body); gr.addColorStop(1, dark);
        disc(cx, cy + oy, r, gr);
        if (on) { g.strokeStyle = ink; g.globalAlpha *= 0.35; g.lineWidth = 1.2; g.beginPath(); g.arc(cx + 0.5, cy + oy + 0.5, r - 0.6, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); g.globalAlpha /= 0.35; }
        return;
      }
      for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
        var d2 = x * x + y * y; if (d2 > r * r + r * 0.8) continue;
        var d = Math.sqrt(d2), nx = x / r, ny = y / r, l = -(0.55 * nx + 0.85 * ny), c = body;
        if (!on && l > 0.42 && d > r * 0.5) c = light;
        else if (l < -0.38 && d > r * 0.5) c = dark;
        if (on && ny < -0.55 && d > r - 2.2) c = dark;
        g.fillStyle = c; g.fillRect(cx + x, cy + y + oy, 1, 1);
      }
      if (!on) { g.fillStyle = '#ffffff'; g.fillRect(cx - Math.round(r * 0.5), cy - Math.round(r * 0.55), 2, 1); }
    }
    function bitText(str, x, y, rows, w, c1, c2, sh) {   // tiny bitmap text, rows top..bottom, c2 for the lower half
      var tbl = rows, cx = x;
      for (var i = 0; i < str.length; i++) {
        var gl = (tbl[str[i]] || tbl['?']).split(','), gw = gl[0].length;
        for (var pass = 0; pass < (sh ? 2 : 1); pass++) for (var yy = 0; yy < gl.length; yy++) for (var xx = 0; xx < gw; xx++) if (gl[yy][xx] === '1') {
          g.fillStyle = pass === 0 && sh ? sh : yy < Math.ceil(gl.length / 2) ? c1 : c2; g.fillRect(cx + xx + (pass === 0 && sh ? 0 : 0), y + yy + (pass === 0 && sh ? 1 : 0), 1, 1);
        }
        cx += gw + 1;
      }
      return cx - x - 1;
    }
    function label(str, cx, y, on, bodyC) {
      var T = { main: tok('text.main', '#fff'), main2: tok('text.main2', '#c8d4ff'), accent: tok('text.accent', '#ffe070') };
      if (!on && bodyC && Math.abs(lum(T.main) - lum(bodyC)) < 0.4) { T.main = tok('ink', '#06061a'); T.main2 = T.main; }   // dark letter on a pale disc
      if (on && bodyC && Math.abs(lum(T.accent) - lum(bodyC)) < 0.3) T.accent = Math.abs(lum(T.main) - lum(bodyC)) >= 0.3 ? T.main : '#ffffff';   // keep the pressed letter readable on its disc
      if (SK && SK.text) { try { SK.text(g, str, cx, y, { font: 'ui', align: 'center', shadow: false, color: on ? T.accent : T.main, color2: on ? T.accent : T.main2 }); return; } catch (e) {} }
      var w = str.length * 6 - 1; bitText(str, cx - Math.floor(w / 2), y, GLYPH, 5, on ? T.accent : T.main, on ? T.accent : T.main2, null);
    }
    function paint() {
      var W = Math.ceil(lay.vw / lay.px), H = Math.ceil(lay.vh / lay.px);
      g.clearRect(0, 0, W + 1, H + 1);
      var ink = tok('ink', '#06061a'), U = { fill: tok('ui.fill', '#4c5a8a'), fillTo: tok('ui.fillTo', '#262e4e'), hi: tok('ui.highlight', '#c8d4f4'), sh: tok('ui.shadow', '#0a0e22') };
      var over = lay.placement === 'over', op = Math.max(0.15, Math.min(1, num(P.opacity, 0.6))), opOn = Math.min(1, op + 0.3);
      g.globalAlpha = 1;
      if (lay.band) {    // the control deck below the game
        var b = lay.band;
        px1(b.x, b.y, b.w, b.h, U.sh); px1(b.x, b.y, b.w, 1, ink); px1(b.x, b.y + 1, b.w, 1, mix(U.fillTo, U.fill, 0.5));
        g.globalAlpha = 0.5; for (var gx = b.x + 2; gx < b.x + b.w; gx += 4) px1(gx, b.y + b.h - 3, 2, 1, U.fillTo); g.globalAlpha = 1;
      }
      // pad
      var pad = lay.els.pad, cell = lay.cell;
      g.globalAlpha = over ? (DIRS.some(isOn) ? opOn : op) : 1;
      if (P.pad === 'stick') drawStick(pad, ink, U); else drawDpad(pad.x + 1, pad.y + 1, cell, ink, U);
      // buttons
      var cols = { a: tok('team.b', '#d85a48'), b: tok('team.a', '#3a64d8'), c: tok('fx.heal', '#4ad870') };
      lay.els.buttons.forEach(function (bt) {
        var on = isOn(bt.name); g.globalAlpha = over ? (on ? opOn : op) : 1;
        shadedDisc(bt.cx, bt.cy, bt.r, cols[bt.name] || U.fill, on);
        label(String(opt.labels && opt.labels[bt.name] || bt.name).toUpperCase().slice(0, 1), bt.cx, bt.cy - 3 + (on ? 1 : 0), on, on ? mix(cols[bt.name] || U.fill, ink, 0.28) : cols[bt.name] || U.fill);
      });
      if (lay.els.start) {
        var s = lay.els.start, on = isOn('start'); g.globalAlpha = over ? (on ? opOn : op) : 1;
        var oy = on ? 1 : 0;
        g.globalAlpha *= 0.45; px1(s.x + 1, s.y + 2, s.w, s.h, ink); g.globalAlpha = over ? (on ? opOn : op) : 1;
        px1(s.x + 1, s.y + oy, s.w - 2, s.h, ink); px1(s.x, s.y + 1 + oy, s.w, s.h - 2, ink);
        px1(s.x + 1, s.y + 1 + oy, s.w - 2, s.h - 2, on ? mix(U.fillTo, ink, 0.3) : U.fillTo);
        px1(s.x + 2, s.y + 1 + oy, s.w - 4, 1, on ? mix(U.fillTo, ink, 0.5) : U.fill);
        var txt = String(opt.labels && opt.labels.start || 'START').toUpperCase().slice(0, 5), tw = txt.length * 4 - 1;
        if (!PIXEL) {   // smooth skins: the skin's ui font family for the label
          var fam = SK && SK.fonts && SK.fonts.ui && SK.fonts.ui.family || 'system-ui, sans-serif';
          g.font = '700 5.5px ' + fam; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = on ? tok('text.accent', '#ffe070') : lum(U.fillTo) > 0.6 ? ink : tok('text.main2', '#c8d4ff');
          g.fillText(txt, s.x + s.w / 2, s.y + oy + (s.h - 1) / 2 + 0.3); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
        } else {
        var lightPill = lum(U.fillTo) > 0.6, lc1 = lightPill ? ink : tok('text.main2', '#c8d4ff'), lc2 = lightPill ? ink : tok('text.dim', '#8088a8');
        bitText(txt, s.x + Math.floor((s.w - tw) / 2), s.y + 2 + oy, TINY, 3, on ? tok('text.accent', '#ffe070') : lc1, on ? tok('text.accent', '#ffe070') : lc2);
        }
      }
      g.globalAlpha = 1;
    }
    function drawDpad(x0, y0, c, ink, U) {
      var arms = { up: [x0 + c, y0, c, c], down: [x0 + c, y0 + 2 * c, c, c], left: [x0, y0 + c, c, c], right: [x0 + 2 * c, y0 + c, c, c] };
      var base = U.fillTo, light = U.fill, dark = mix(U.fillTo, ink, 0.5), pressedC = mix(U.fillTo, ink, 0.4), a0 = g.globalAlpha;
      g.globalAlpha = a0 * 0.45; px1(x0 + c - 1, y0 + 1, c + 2, 3 * c + 2, ink); px1(x0 - 1, y0 + c + 1, 3 * c + 2, c + 2, ink); g.globalAlpha = a0;
      px1(x0 + c - 1, y0 - 1, c + 2, 3 * c + 2, ink); px1(x0 - 1, y0 + c - 1, 3 * c + 2, c + 2, ink);
      px1(x0 + c, y0, c, 3 * c, base); px1(x0, y0 + c, 3 * c, c, base);
      // bevel: top / left edges light, bottom / right edges dark (outer edges only)
      px1(x0 + c, y0, c, 1, light); px1(x0, y0 + c, c, 1, light); px1(x0 + 2 * c, y0 + c, c, 1, light);
      px1(x0 + c, y0, 1, c, light); px1(x0 + c, y0 + 2 * c, 1, c, light); px1(x0, y0 + c, 1, c, light);
      px1(x0 + c, y0 + 3 * c - 1, c, 1, dark); px1(x0, y0 + 2 * c - 1, c, 1, dark); px1(x0 + 2 * c, y0 + 2 * c - 1, c, 1, dark);
      px1(x0 + 2 * c - 1, y0, 1, c, dark); px1(x0 + 2 * c - 1, y0 + 2 * c, 1, c, dark); px1(x0 + 3 * c - 1, y0 + c, 1, c, dark);
      var t = Math.max(3, Math.floor(c / 3)), arrowC = Math.abs(lum(U.hi) - lum(base)) > 0.3 ? U.hi : ink;
      DIRS.forEach(function (n) {
        var a = arms[n], on = codesOf[n] && isOn(n), ax = a[0], ay = a[1];
        if (on) { px1(ax, ay, c, c, pressedC); if (n === 'up' || n === 'down') { px1(ax, ay, 1, c, dark); } if (n === 'left' || n === 'right' || n === 'up') px1(ax, ay, c, 1, dark); }
        var shR = [], col = on ? tok('text.accent', '#ffe070') : arrowC, sh = PIXEL ? ink : 'rgba(0,0,0,0)', mx = ax + Math.floor(c / 2), my = ay + Math.floor(c / 2) + (on ? 1 : 0);
        for (var i = 0; i < t; i++) {
          var half = i;  // row i of the arrow, apex first
          var rows = { up: [mx - half, my - Math.floor(t / 2) + i, 2 * half + 1, 1], down: [mx - half, my + Math.floor(t / 2) - i, 2 * half + 1, 1],
            left: [mx - Math.floor(t / 2) + i - 1, my - half, 1, 2 * half + 1], right: [mx + Math.floor(t / 2) - i, my - half, 1, 2 * half + 1] }[n];
          shR.push(rows);
        }
        shR.forEach(function (q) { px1(q[0], q[1] + 1, q[2], q[3], sh); }); shR.forEach(function (q) { px1(q[0], q[1], q[2], q[3], col); });
      });
      // centre dimple
      var cx = x0 + c + Math.floor(c / 2), cy = y0 + c + Math.floor(c / 2), dr = Math.max(1, Math.floor(c / 5));
      disc(cx, cy, dr + 1, mix(U.fillTo, ink, 0.3)); disc(cx, cy, dr, mix(U.fillTo, ink, 0.55));
    }
    function drawStick(pad, ink, U) {
      var R = lay.stickR, cx = pad.x + R, cy = pad.y + R, a0 = g.globalAlpha, on = DIRS.some(isOn);
      g.globalAlpha = a0 * 0.45; disc(cx, cy + 2, R + 1, ink); g.globalAlpha = a0;
      disc(cx, cy, R + 1, ink); disc(cx, cy, R, mix(U.fillTo, ink, 0.25)); disc(cx, cy, R - 2, mix(U.fillTo, ink, 0.45));
      var ticks = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      DIRS.forEach(function (n) { var t = ticks[n], lit = codesOf[n] && isOn(n); px1(cx + t[0] * (R - 3) - (t[0] ? 0 : 1), cy + t[1] * (R - 3) - (t[1] ? 0 : 1), t[0] ? 1 : 3, t[1] ? 1 : 3, lit ? tok('text.accent', '#ffe070') : U.fill); });
      var kr = Math.round(R * 0.52), reach = R - kr - 1, vx = stick.x, vy = stick.y;
      if (!(vx || vy) && on) { vx = (isOn('right') ? 1 : 0) - (isOn('left') ? 1 : 0); vy = (isOn('down') ? 1 : 0) - (isOn('up') ? 1 : 0); var l = Math.sqrt(vx * vx + vy * vy) || 1; vx /= l; vy /= l; }
      shadedDisc(cx + Math.round(vx * reach), cy + Math.round(vy * reach), kr, U.fill, false);
    }

    /* ---------- attach / destroy ---------- */
    var LIS = [];
    function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); LIS.push([t, ev, fn, o]); }
    function attach() {
      if (attached || destroyed) return api; attached = true;
      on(root, 'keydown', onKeyDown, true); on(root, 'keyup', onKeyUp, true);
      on(root, 'blur', onBlur, false); on(document, 'visibilitychange', onVis, false);
      on(root, 'pointerdown', onPDown, true); on(root, 'pointermove', onPMove, true); on(root, 'pointerup', onPUp, true); on(root, 'pointercancel', onPUp, true);
      ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (t) { on(root, t, onTouch, { capture: true, passive: false }); });
      on(root, 'resize', function () { readSafe(); dirty = true; }, false); on(root, 'orientationchange', function () { readSafe(); dirty = true; }, false);
      var mk = function () {
        if (destroyed || wrap) return;
        wrap = document.createElement('div'); wrap.setAttribute('data-gamedna', 'touch-controls');
        wrap.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none;z-index:' + (opt.zIndex || 2147483000) + ';display:none';
        cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated;image-rendering:crisp-edges;pointer-events:none';
        wrap.appendChild(cv); document.body.appendChild(wrap); readSafe();
        if (P.show === 'auto' && forced == null && touchDevice()) visible = true;
        if (visible || wantVisible()) { visible = false; setVisible(true); }
        relayout(true); if (!raf && root.requestAnimationFrame) raf = requestAnimationFrame(frame);
      };
      if (document.body) mk(); else on(document, 'DOMContentLoaded', mk, false);
      return api;
    }
    function destroy() {
      if (destroyed) return; releaseAll(); destroyed = true;
      timers.forEach(clearTimeout); timers = [];
      LIS.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) {} }); LIS = [];
      if (raf && root.cancelAnimationFrame) cancelAnimationFrame(raf); raf = 0;
      try { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); if (safeProbe && safeProbe.parentNode) safeProbe.parentNode.removeChild(safeProbe); } catch (e) {}
      wrap = cv = g = null; attached = false;
    }

    var api = {
      version: VERSION, mode: MODE,
      step: step, pressed: pressed, held: held, released: released, repeat: repeat, axis: axis,
      count: function (n) { return cnt[n] || 0; },
      press: function (n) { if (src[n]) setSrc(n, 'script', true); },
      release: function (n) { if (src[n]) setSrc(n, 'script', false); },
      tap: function (n) { if (src[n]) { setSrc(n, 'script', true); setSrc(n, 'script', false); } },
      releaseAll: releaseAll, attach: attach, destroy: destroy,
      show: function (v) { forced = v === true || v === false ? v : null; dirty = true; relayout(true); return visible; },
      visible: function () { return visible; },
      setParams: function (o) { o = o || {}; Object.keys(o).forEach(function (k) { if (k in DEFAULTS) P[k] = o[k]; }); if (P.show !== 'auto' && forced == null) setVisible(P.show === 'always'); dirty = true; layKey = ''; relayout(true); },
      params: function () { var o = {}; Object.keys(P).forEach(function (k) { o[k] = P[k]; }); return o; },
      onFirstInput: function (fn) { if (typeof fn === 'function') firstCbs.push(fn); },
      layout: function () { relayout(false); return lay && visible ? { placement: lay.placement, px: lay.px, stacked: lay.stacked, size: lay.capped || P.size, rects: cssEls() } : null; },
      state: function () {
        var o = { mode: MODE, visible: visible, step: stepN, stepWired: stepWired, stats: JSON.parse(JSON.stringify(stats)), names: {} };
        names.forEach(function (n) { o.names[n] = { held: heldNow[n], pressed: pressedNow[n], count: cnt[n], down: any(src[n]), sources: Object.keys(src[n]) }; });
        return o;
      }
    };
    if (opt.attach !== false) attach();
    return api;
  }

  root.GameDNA_TouchControls = { version: VERSION, create: create, defaults: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
