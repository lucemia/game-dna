/* GameDNA A-01 Active-time gauge battle, module v1. Plain script, no dependencies, one global: GameDNA_ATB.
   Owns: battle clock, gauges, haste/slow, ready FIFO, action queue, wait/active pause, battle end, gauge drawing.
   The host owns: combatant data, menus, damage, animations. See module/README.md. Include verbatim; do not edit. */
(function (root) {
  'use strict';
  var TICK_MS = 1000 / 60;
  var COL = {
    out: '#0a0c24', empty: '#1a1c3e', emptyTop: '#0e1030',
    charge: ['#fff8c8', '#f6c840', '#c08a18', '#7a5410'], haste: ['#f0ffd0', '#a8f060', '#5aa82a', '#2a5a14'],
    slow: ['#f0e0ff', '#b08af0', '#6a4ab8', '#34206a'], white: ['#ffffff', '#ffffff', '#e8ecff', '#a8b4f0'],
    queued: ['#e0fbff', '#6ad8f0', '#2a8ab8', '#144a6a'], enemy: ['#ffd8d0', '#f05a50', '#b42a3a', '#6a1424'],
    enemyFull: ['#fffbe0', '#ffe868', '#ffc030', '#b07818']
  };
  // 5x7 pixel glyphs for the mode plate (original)
  var GL = {
    A: '01110100011000111111100011000110001', C: '01110100011000010000100001000101110', E: '11111100001000011110100001000011111',
    I: '11100010000100001000010000100011100', T: '11111001000010000100001000010000100', V: '10001100011000110001100010101000100',
    W: '10001100011000110101101011101110001', '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110',
    '2': '01110100010000100010001000100011111', '5': '11111100001111000001000011000101110', '7': '11111000010001000100010000100001000',
    '.': '00000000000000000000000000000000100', 'x': '00000000001000101010001000101010001', ' ': '00000000000000000000000000000000000'
  };
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function rect(g, x, y, w, h, c) { if (w <= 0 || h <= 0) return; g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function glyphW(ch) { var b = GL[ch] || GL[' ']; if (ch === '1' || ch === 'I') return 4; if (ch === '.') return 3; return b ? 5 : 5; }
  function textW(s) { var w = 0; for (var i = 0; i < s.length; i++) w += (s[i] === ' ' ? 3 : glyphW(s[i])) + 1; return Math.max(0, w - 1); }
  function text(g, s, x, y, col, sh) {
    [[1, sh], [0, col]].forEach(function (p) {
      if (!p[1]) return; var cx = x; g.fillStyle = p[1];
      for (var i = 0; i < s.length; i++) {
        var ch = s[i], b = GL[ch]; if (ch === ' ') { cx += 4; continue; }
        var off = (ch === '1' || ch === 'I') ? 0 : 0;
        for (var k = 0; k < 35; k++) if (b && b[k] === '1') { var gx = k % 5, gy = (k / 5) | 0; if ((ch === '1' || ch === 'I') && gx > 3) continue; if (ch === '.' && gx > 2) continue; g.fillRect(cx + gx - off + p[0], y + gy + p[0], 1, 1); }
        cx += glyphW(ch) + 1;
      }
    });
  }
  // the gauge bar: 1px outline with clipped corners, dark interior, fill with light top row, dark bottom row, dark cap
  function bar(g, x, y, w, h, fr, C, tag) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    rect(g, x + 1, y, w - 2, 1, COL.out); rect(g, x + 1, y + h - 1, w - 2, 1, COL.out); rect(g, x, y + 1, 1, h - 2, COL.out); rect(g, x + w - 1, y + 1, 1, h - 2, COL.out);
    var iw = w - 2, ih = h - 2; rect(g, x + 1, y + 1, iw, ih, COL.empty); rect(g, x + 1, y + 1, iw, 1, COL.emptyTop);
    if (!C) { for (var k = 0; k < iw; k += 3) rect(g, x + 1 + k, y + 1 + (ih >> 1), 1, 1, '#3a3e66'); return; }
    var fw = Math.round(Math.max(0, Math.min(1, fr)) * iw); if (fw <= 0) return;
    rect(g, x + 1, y + 1, fw, ih, C[1]); rect(g, x + 1, y + 1, fw, 1, C[0]);
    if (ih > 2) rect(g, x + 1, y + h - 2, fw, 1, C[2]);
    if (fw < iw) rect(g, x + fw, y + 1, 1, ih, C[3]); else rect(g, x + iw, y + 1, 1, ih, C[0]);
    if (tag) { rect(g, x + 1, y + 1, 3, ih, tag[1]); rect(g, x + 1, y + 1, 3, 1, tag[0]); rect(g, x + 4, y + 1, 1, ih, COL.out); }   // status tag on full bars
  }

  function create(o) {
    o = o || {};
    var P = { mode: o.mode === 'wait' ? 'wait' : 'active', speed: o.speed == null ? 1 : +o.speed, partyStatus: o.partyStatus || 'none', startSpread: o.startSpread == null ? 0.55 : o.startSpread };
    var cb = {
      isAlive: o.isAlive || function () { return true; }, onHeroReady: o.onHeroReady || function () { }, onMenuCancel: o.onMenuCancel || function () { },
      chooseEnemyAction: o.chooseEnemyAction || function () { return null; }, performAction: o.performAction || function (a, done) { done(); },
      onBattleEnd: o.onBattleEnd || function () { }
    };
    var R = rng(o.seed == null ? 1 : o.seed), C = {}, order = [], ready = [], queue = [], menu = null, busy = null, over = null, tick = 0, vis = 0, acc = 0;
    (o.combatants || []).forEach(function (c) {
      C[c.id] = { id: c.id, side: c.side === 'enemy' ? 'enemy' : 'party', speed: +c.speed || 20, gauge: R() * P.startSpread, state: 'charge', dead: false, defending: false, st: null, stUntil: 0, actStart: -99 };
      order.push(c.id);
    });
    function alive(id) { var c = C[id]; return !!c && !c.dead; }
    function living(side) { return order.filter(function (id) { return C[id].side === side && alive(id); }); }
    function status(c) { if (c.st) return c.st; return c.side === 'party' && P.partyStatus !== 'none' ? P.partyStatus : null; }
    function rate(c) { var s = status(c); return (c.speed + 20) * P.speed * (s === 'haste' ? 1.5 : s === 'slow' ? 0.5 : 1) / 9000; }
    function clockRuns() { return !over && !(P.mode === 'wait' && menu); }
    function closeMenu(why) { if (menu) { var id = menu; menu = null; cb.onMenuCancel(id, why); } }
    function syncDeaths() {
      order.forEach(function (id) {
        var c = C[id]; if (c.dead || cb.isAlive(id)) return;
        c.dead = true; c.state = 'dead'; c.gauge = 0; c.defending = false;
        ready = ready.filter(function (r) { return r !== id; });
        queue = queue.filter(function (a) { return a.actor !== id; });
        if (menu === id) closeMenu('dead');
      });
      if (!over) {
        var res = !living('enemy').length ? 'win' : !living('party').length ? 'lose' : null;
        if (res) { over = res; ready = []; queue = []; closeMenu('end'); cb.onBattleEnd(res); }
      }
    }
    function retarget(a) {
      if (a.target == null || alive(a.target) || !C[a.target]) return true;
      var pool = living(C[a.target].side); if (!pool.length) return false;
      a.target = pool[0]; return true;
    }
    function startNext() {
      while (queue.length && !busy && !over) {
        var a = queue.shift(), c = C[a.actor];
        if (!alive(a.actor) || !retarget(a)) { if (alive(a.actor)) { c.state = 'charge'; c.gauge = 0; } continue; }
        c.state = 'acting'; c.actStart = vis; busy = a;
        var token = a, fired = false;
        cb.performAction(a, function () {
          if (fired || busy !== token) return; fired = true; busy = null;
          if (alive(a.actor)) { c.state = 'charge'; c.gauge = 0; }
          syncDeaths();
        });
      }
    }
    function step() {
      vis++;
      syncDeaths();
      if (over) return;
      var run = clockRuns();
      if (run) {
        tick++;
        order.forEach(function (id) {
          var c = C[id]; if (c.dead) return;
          if (c.st && tick >= c.stUntil) c.st = null;
          if (c.state !== 'charge') return;
          c.gauge = Math.min(1, c.gauge + rate(c));
          if (c.gauge < 1) return;
          if (c.side === 'party') { c.state = 'ready'; c.defending = false; ready.push(id); }
          else {
            var foes = living('party'); if (!foes.length) return;
            var a = cb.chooseEnemyAction(id);
            if (a) { a.actor = id; c.state = 'queued'; queue.push(a); } else c.gauge = 0;
          }
        });
        startNext();   // the queue runs while a menu is open in active mode
      }
      if (!menu && ready.length && !over && living('enemy').length) { menu = ready[0]; cb.onHeroReady(menu); }
    }
    var api = {
      // advance: no argument = exactly one 60 Hz tick; with dtMs = as many ticks as fit (max 15)
      update: function (dtMs) {
        if (dtMs == null) { step(); return; }
        acc = Math.min(acc + dtMs, TICK_MS * 15); while (acc >= TICK_MS) { acc -= TICK_MS; step(); }
      },
      // the hero whose menu is open confirms a command; {defend: true} applies at once (no queue)
      submit: function (heroId, action) {
        var c = C[heroId]; if (!c || c.dead || over || c.state !== 'ready') return false;
        ready = ready.filter(function (r) { return r !== heroId; }); if (menu === heroId) menu = null;
        action = action || {}; action.actor = heroId;
        if (action.defend) { c.defending = true; c.state = 'charge'; c.gauge = 0; return true; }
        c.state = 'queued'; queue.push(action); if (clockRuns()) startNext(); return true;
      },
      menuClosed: function () { menu = null; },            // only if the host closes a menu without submitting
      set: function (p) { for (var k in p) if (k in P) P[k] = k === 'speed' ? +p[k] : p[k]; },
      setSpeed: function (id, speed) { if (C[id]) C[id].speed = +speed; },
      setStatus: function (id, kind, seconds) { var c = C[id]; if (!c) return; c.st = kind || null; c.stUntil = tick + Math.round((seconds == null ? 20 : seconds) * 60); },
      get: function (id) { var c = C[id]; return c ? { gauge: c.gauge, state: c.state, status: status(c), defending: c.defending } : null; },
      ticksToFull: function (speed, kind) { return Math.ceil(9000 / ((speed + 20) * P.speed * (kind === 'haste' ? 1.5 : kind === 'slow' ? 0.5 : 1))); },
      clockRuns: clockRuns, isOver: function () { return over; }, menuHero: function () { return menu; }, acting: function () { return busy ? busy.actor : null; },
      queue: function () { return queue.slice(); }, ready: function () { return ready.slice(); }, params: function () { return P; },
      // white overlay alpha for an enemy that just started acting: 0.4 on alternate 3-frame steps for 18 frames, else 0
      flashAlpha: function (id) { var c = C[id]; if (!c || c.side !== 'enemy' || !busy || busy.actor !== id) return 0; var t = vis - c.actStart; return t < 18 && Math.floor(t / 3) % 2 === 0 ? 0.4 : 0; },
      // party row layout: never overlaps. nameW/hpW = measured text widths. Returns null if the gauge would be < minGauge.
      layoutRow: function (r) {
        var gap = r.gap == null ? 6 : r.gap, min = r.minGauge == null ? 40 : r.minGauge, h = r.h || 6;
        var hpRight = r.x + r.nameW + gap + r.hpW, gx = hpRight + gap, gw = r.right - gx;
        if (r.hpRight != null && r.hpRight >= hpRight) { hpRight = r.hpRight; gx = hpRight + gap; gw = r.right - gx; }
        if (gw < min) return null;
        return { nameX: r.x, hpRight: hpRight, gauge: { x: gx, y: r.y + 1, w: gw, h: h } };
      },
      drawGauge: function (g, id, x, y, w, h) {
        var c = C[id]; if (!c) return; var s = status(c), tag = s === 'haste' ? COL.haste : s === 'slow' ? COL.slow : null;
        if (c.dead) return bar(g, x, y, w, h, 0, null);
        if (c.state === 'ready') return bar(g, x, y, w, h, 1, Math.floor(vis / 6) % 4 === 3 ? COL.charge : COL.white, tag);
        if (c.state !== 'charge') return bar(g, x, y, w, h, 1, COL.queued, tag);
        bar(g, x, y, w, h, c.gauge, tag || COL.charge);
      },
      // enemies: list of {id, x, footY}; 22x4 bar centred on x, top = footY + 2, kept inside [0, fieldH)
      drawEnemyGauges: function (g, list, fieldH) {
        list.forEach(function (e) {
          var c = C[e.id]; if (!c || c.dead) return;
          var y = Math.min((fieldH || 9999) - 5, Math.round(e.footY) + 2), x = Math.round(e.x - 11);
          bar(g, x, y, 22, 4, c.state === 'charge' ? c.gauge : 1, c.state === 'charge' ? (status(c) === 'slow' ? COL.slow : status(c) === 'haste' ? COL.haste : COL.enemy) : COL.enemyFull);
        });
      },
      // mode plate, e.g. "ACTIVE x1.0"; pause bars after the text while the wait clock is stopped. Returns {w, h}.
      drawModePlate: function (g, x, y) {
        var paused = P.mode === 'wait' && menu && !over, s = (P.mode === 'wait' ? 'WAIT' : 'ACTIVE') + ' x' + P.speed.toFixed(P.speed * 4 % 2 ? 2 : 1);
        var tw = textW(s), w = tw + 10 + (paused ? 8 : 0), h = 13;
        rect(g, x, y, w, h, COL.out); rect(g, x + 1, y + 1, w - 2, h - 2, paused ? '#3a2a6a' : '#1c2458'); rect(g, x + 1, y + 1, w - 2, 1, paused ? '#8a72d8' : '#5a6ac0');
        text(g, s, x + 5, y + 3, paused ? '#ffe070' : '#e8ecff', '#0a0c30');
        if (paused) { rect(g, x + 5 + tw + 3, y + 3, 2, 7, '#ffe070'); rect(g, x + 5 + tw + 6, y + 3, 2, 7, '#ffe070'); }
        return { w: w, h: h };
      }
    };
    return api;
  }
  root.GameDNA_ATB = { create: create, version: '1.0.0' };
})(typeof window !== 'undefined' ? window : this);
