
  /* ---------- the global ---------- */
  /* mountPanel(el, inst, send): a plain DOM build panel at CSS size for layout 'compact' (phones): lives, gold, wave, speed,
     pause, the tower buttons, the selected tower's upgrade / sell / target, the next wave and its send button. send(key) is
     how a button press reaches the game (default inst.key). Call the returned refresh() once per frame; it only touches
     the DOM when something changed. Optional: a host may build its own from inst.panelState(). */
  function mountPanel(el, inst, send) {
    if (!el || typeof document === 'undefined') return function () {};
    send = send || function (k) { inst.key(k); };
    var last = '';
    if (!document.getElementById('gamedna-td-panel-css')) {
      var st = document.createElement('style'); st.id = 'gamedna-td-panel-css';
      st.textContent = '.td-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px;font:13px/1.35 "Trebuchet MS","Segoe UI",system-ui,sans-serif;color:#f4ead8}' +
        '.td-b{background:#3a2e24;color:#fff4dc;border:1px solid #8a6a40;border-radius:7px;padding:7px 10px;font:inherit;min-height:36px;touch-action:manipulation}' +
        '.td-b.td-on{background:#7a5a26;border-color:#ffe08a}.td-b:disabled{opacity:.45}.td-b.td-poor .td-cost{color:#ff8a7a}.td-cost{color:#ffe27a;font-weight:700}' +
        '.td-lives{color:#ff9a8a;font-weight:700}.td-gold{color:#ffe27a;font-weight:700}.td-hint{color:#9ae07a}.td-msg{color:#ffb0a0;font-weight:700}.td-shop .td-b{flex:1 1 40%}';
      document.head.appendChild(st);
    }
    el.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('[data-td]') : null; if (b && !b.disabled) { e.preventDefault(); send(b.getAttribute('data-td')); } });
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function btn(key, label, o) { o = o || {}; return '<button data-td="' + esc(key) + '"' + (o.dis ? ' disabled' : '') + ' class="td-b' + (o.on ? ' td-on' : '') + (o.cls ? ' ' + o.cls : '') + '">' + label + '</button>'; }
    return function refresh() {
      var P = inst.panelState(); if (!P) return;
      var h = '<div class="td-row td-hud"><span class="td-lives">\u2665 ' + P.lives + '</span><span class="td-gold">\u25cf ' + P.gold + '</span><span>Wave ' + P.wave + '/' + P.waves + (P.phase === 'build' ? ' (build)' : P.countdown ? ' (next ' + P.countdown + 's)' : '') + '</span>' +
        btn('speed', P.speed >= 2 ? 'x2' : 'x1', { on: P.speed >= 2 }) + btn('pause', P.paused ? 'Resume' : 'Pause', { on: P.paused }) + '</div>';
      h += '<div class="td-row td-shop">' + P.shop.map(function (s2) { return btn('tower:' + s2.id, '<b>' + s2.key + '</b> ' + esc(s2.name) + ' <span class="td-cost">' + s2.cost + '</span>', { on: s2.on, dis: P.ended, cls: s2.can ? '' : 'td-poor' }); }).join('') + '</div>';
      if (P.sel) h += '<div class="td-row td-sel"><span><b>' + esc(P.sel.name) + '</b> Lv ' + P.sel.level + '</span>' + btn('upgrade', P.sel.upgradeCost == null ? 'Max' : 'Upgrade ' + P.sel.upgradeCost, { dis: !P.sel.canUpgrade }) + btn('sell', 'Sell +' + P.sel.refund) +
        ['first', 'strong', 'near'].map(function (p) { return btn('target:' + p, p.charAt(0).toUpperCase() + p.slice(1), { on: P.sel.priority === p }); }).join('') + '</div>';
      else if (P.mode === 'place') h += '<div class="td-row td-hint">Tap a grass cell beside the road. X cancels.</div>';
      if (P.next) h += '<div class="td-row td-next"><span>Next: ' + esc(P.next.line) + '</span>' + (P.next.canCall ? btn('wave', P.next.build ? 'Send wave' : 'Send now +' + P.next.bonus) : '') + '</div>';
      if (P.message) h += '<div class="td-row td-msg">' + esc(P.message) + '</div>';
      if (h !== last) { el.innerHTML = h; last = h; }
    };
  }
  var API = {
    version: VERSION, create: create, mountPanel: mountPanel,
    TOWERS: TOWERS, ENEMIES: ENEMIES, MAPS: MAPS, WAVES: WAVES, PRIORITIES: PRIORITIES, DEFAULTS: DEFAULTS,
    STAGE: { w: SW, h: SH, cell: CELL, map: { x: MAPX, y: MAPY }, panel: PANEL },
    text: text, drawTower: function (g, tw, t, o) { drawTower(g, tw, t || 0, o); }, drawEnemy: function (g, e, t) { drawEnemy(g, e, t || 0); },
    // for checks (node): the pure rules without drawing
    _sim: makeSim, _path: { dense: densePath, at: pathAt, build: buildMap }
  };
  root.GameDNA_TowerDefense = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
