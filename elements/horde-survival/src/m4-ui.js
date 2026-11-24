
  /* ---------- HUD, level-up window, banners, touch stick ---------- */
  function fmtTime(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return (s / 60 | 0) + ':' + ('0' + s % 60).slice(-2); }
  PP.panel = function (g, x, y, w, h, r, a) {
    g.fillStyle = 'rgba(6,8,16,' + (0.55 * (a == null ? 1 : a)) + ')'; rrect(g, x + 1, y + 2, w, h, r); g.fill();
    var pg = g.createLinearGradient(0, y, 0, y + h); pg.addColorStop(0, 'rgba(42,46,72,0.97)'); pg.addColorStop(1, 'rgba(18,20,36,0.98)');
    g.fillStyle = pg; rrect(g, x, y, w, h, r); g.fill();
    g.strokeStyle = 'rgba(214,190,130,0.75)'; g.lineWidth = 1.2; rrect(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; rrect(g, x + 2.5, y + 2.5, w - 5, h - 5, Math.max(1, r - 2)); g.stroke();
  };
  PP.text = function (g, s, x, y, size, color, align, weight, font) {
    g.font = (weight || 700) + ' ' + size + 'px ' + (font || this.font); g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(8,6,14,0.85)'; g.lineWidth = Math.max(2, size * 0.22); g.strokeText(s, x, y); g.fillStyle = color || '#fff'; g.fillText(s, x, y);
  };
  PP.icon = function (g, icon, x, y, s, color) {
    var custom = this.S.lib.icons && this.S.lib.icons[icon]; if (custom) { safe(custom, g, x, y, s); return; }
    g.save(); g.translate(x, y); g.lineCap = 'round'; g.lineJoin = 'round';
    var c = color || '#ffe9b0'; g.fillStyle = c; g.strokeStyle = c; g.lineWidth = s * 0.12;
    if (icon === 'bolt') { var gl = this.glowSprite('#7fe8ff'); if (gl) g.drawImage(gl, -s * 0.6, -s * 0.6, s * 1.2, s * 1.2); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(s * 0.08, -s * 0.06, s * 0.16, 0, TAU); g.fill(); g.strokeStyle = '#9eefff'; g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(-s * 0.38, s * 0.3); g.lineTo(-s * 0.05, s * 0.05); g.stroke(); }
    else if (icon === 'blades') { for (var i = 0; i < 3; i++) { g.save(); g.rotate(i * TAU / 3); g.translate(0, -s * 0.24); var bg = g.createLinearGradient(-s * 0.2, -s * 0.2, s * 0.2, s * 0.2); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#6f88c0'); g.fillStyle = bg; g.beginPath(); g.arc(0, 0, s * 0.2, 0.3, Math.PI * 1.25); g.arc(s * 0.07, -s * 0.05, s * 0.14, Math.PI * 1.2, 0.35, true); g.closePath(); g.fill(); g.restore(); } g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(0, 0, s * 0.08, 0, TAU); g.fill(); }
    else if (icon === 'pulse') { g.strokeStyle = '#ffd36a'; g.lineWidth = s * 0.1; g.beginPath(); g.arc(0, 0, s * 0.34, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(255,211,106,0.5)'; g.beginPath(); g.arc(0, 0, s * 0.2, 0, TAU); g.stroke(); g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(0, 0, s * 0.09, 0, TAU); g.fill(); }
    else if (icon === 'lance') { g.rotate(-0.75); var lg = g.createLinearGradient(-s * 0.4, 0, s * 0.4, 0); lg.addColorStop(0, 'rgba(255,214,120,0.2)'); lg.addColorStop(1, '#ffffff'); g.fillStyle = lg; g.beginPath(); g.moveTo(s * 0.44, 0); g.lineTo(s * 0.18, -s * 0.12); g.lineTo(-s * 0.44, -s * 0.04); g.lineTo(-s * 0.44, s * 0.04); g.lineTo(s * 0.18, s * 0.12); g.closePath(); g.fill(); }
    else if (icon === 'boots') { g.fillStyle = '#b57a48'; g.beginPath(); g.moveTo(-s * 0.18, -s * 0.36); g.lineTo(s * 0.06, -s * 0.36); g.lineTo(s * 0.06, s * 0.08); g.lineTo(s * 0.36, s * 0.16); g.lineTo(s * 0.36, s * 0.32); g.lineTo(-s * 0.2, s * 0.32); g.closePath(); g.fill(); g.strokeStyle = '#e8f6ff'; g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(-s * 0.44, -s * 0.1); g.lineTo(-s * 0.26, -s * 0.1); g.moveTo(-s * 0.46, s * 0.06); g.lineTo(-s * 0.28, s * 0.06); g.stroke(); }
    else if (icon === 'heart' || icon === 'ration') { g.fillStyle = icon === 'heart' ? '#ff6b7d' : '#e8b06a'; g.beginPath(); g.moveTo(0, s * 0.34); g.bezierCurveTo(-s * 0.5, 0, -s * 0.3, -s * 0.42, 0, -s * 0.16); g.bezierCurveTo(s * 0.3, -s * 0.42, s * 0.5, 0, 0, s * 0.34); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-s * 0.16, -s * 0.12, s * 0.07, s * 0.05, -0.6, 0, TAU); g.fill(); }
    else if (icon === 'magnet') { g.strokeStyle = '#d84a4a'; g.lineWidth = s * 0.16; g.beginPath(); g.arc(0, -s * 0.02, s * 0.24, Math.PI, 0); g.lineTo(s * 0.24, s * 0.3); g.moveTo(-s * 0.24, -s * 0.02); g.lineTo(-s * 0.24, s * 0.3); g.stroke(); g.fillStyle = '#dfe6f0'; g.fillRect(-s * 0.33, s * 0.2, s * 0.18, s * 0.14); g.fillRect(s * 0.15, s * 0.2, s * 0.18, s * 0.14); }
    else if (icon === 'hourglass') { g.fillStyle = '#c9a25a'; g.fillRect(-s * 0.26, -s * 0.38, s * 0.52, s * 0.08); g.fillRect(-s * 0.26, s * 0.3, s * 0.52, s * 0.08); g.fillStyle = 'rgba(200,230,255,0.85)'; g.beginPath(); g.moveTo(-s * 0.2, -s * 0.3); g.lineTo(s * 0.2, -s * 0.3); g.lineTo(0, 0); g.lineTo(s * 0.2, s * 0.3); g.lineTo(-s * 0.2, s * 0.3); g.lineTo(0, 0); g.closePath(); g.fill(); g.fillStyle = '#ffd36a'; g.beginPath(); g.moveTo(-s * 0.12, s * 0.3); g.lineTo(s * 0.12, s * 0.3); g.lineTo(0, s * 0.12); g.closePath(); g.fill(); }
    else if (icon === 'might') { g.fillStyle = '#ff9a50'; g.beginPath(); g.moveTo(0, -s * 0.4); g.quadraticCurveTo(s * 0.34, -s * 0.05, s * 0.18, s * 0.26); g.quadraticCurveTo(0, s * 0.42, -s * 0.18, s * 0.26); g.quadraticCurveTo(-s * 0.34, -s * 0.05, 0, -s * 0.4); g.fill(); g.fillStyle = '#ffe08a'; g.beginPath(); g.moveTo(0, -s * 0.1); g.quadraticCurveTo(s * 0.14, s * 0.1, 0, s * 0.28); g.quadraticCurveTo(-s * 0.14, s * 0.1, 0, -s * 0.1); g.fill(); }
    else if (icon === 'ring') { g.strokeStyle = '#ffd36a'; g.lineWidth = s * 0.1; g.beginPath(); g.ellipse(0, s * 0.06, s * 0.3, s * 0.26, 0, 0, TAU); g.stroke(); g.fillStyle = '#7fe8ff'; g.beginPath(); g.moveTo(0, -s * 0.38); g.lineTo(s * 0.1, -s * 0.24); g.lineTo(0, -s * 0.12); g.lineTo(-s * 0.1, -s * 0.24); g.closePath(); g.fill(); }
    else if (icon === 'leaf') { g.fillStyle = '#7ad06a'; g.beginPath(); g.moveTo(-s * 0.3, s * 0.3); g.quadraticCurveTo(-s * 0.3, -s * 0.3, s * 0.34, -s * 0.34); g.quadraticCurveTo(s * 0.3, s * 0.3, -s * 0.3, s * 0.3); g.fill(); g.strokeStyle = '#2f6a2a'; g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(-s * 0.3, s * 0.3); g.lineTo(s * 0.22, -s * 0.22); g.stroke(); }
    else { g.beginPath(); g.moveTo(0, -s * 0.36); g.lineTo(s * 0.3, 0); g.lineTo(0, s * 0.36); g.lineTo(-s * 0.3, 0); g.closePath(); g.fill(); }
    g.restore();
  };
  PP.drawUI = function (g) {
    var S = this.S, v = S.view, H = S.hero, rects = this.rects = [], t = S.t, i;
    var x0 = v.x, y0 = v.y, W = v.w;
    /* XP bar across the top */
    var bx = x0 + 34, bw = W - 44, by = y0 + 6, k = clamp(H.xp / H.need, 0, 1);
    g.fillStyle = 'rgba(6,8,16,0.75)'; rrect(g, bx, by, bw, 10, 5); g.fill();
    var xg = g.createLinearGradient(bx, 0, bx + bw, 0); xg.addColorStop(0, '#3d7dff'); xg.addColorStop(1, '#7fe8ff');
    if (k > 0) { g.fillStyle = xg; rrect(g, bx + 1.5, by + 1.5, Math.max(7, (bw - 3) * k), 7, 3.5); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; rrect(g, bx + 3, by + 2, Math.max(4, (bw - 6) * k), 2, 1); g.fill(); }
    g.strokeStyle = 'rgba(214,190,130,0.8)'; g.lineWidth = 1; rrect(g, bx + 0.5, by + 0.5, bw - 1, 9, 4.5); g.stroke();
    rects.push({ name: 'xpBar', x: bx, y: by, w: bw, h: 10 });
    /* level medallion */
    var mx = x0 + 20, my = y0 + 13;
    g.fillStyle = 'rgba(6,8,16,0.6)'; g.beginPath(); g.arc(mx + 1, my + 2, 13, 0, TAU); g.fill();
    var mg = g.createRadialGradient(mx - 4, my - 5, 1, mx, my, 13); mg.addColorStop(0, '#5a6aa8'); mg.addColorStop(1, '#1c2140'); g.fillStyle = mg; g.beginPath(); g.arc(mx, my, 12, 0, TAU); g.fill();
    g.strokeStyle = '#d6be82'; g.lineWidth = 1.6; g.beginPath(); g.arc(mx, my, 12, 0, TAU); g.stroke();
    this.text(g, String(H.level), mx, my + 1, H.level > 9 ? 11 : 13, '#fff3cf', 'center', 800);
    this.text(g, 'LV', mx, my + 15, 6.5, '#d6be82', 'center', 800);
    rects.push({ name: 'level', x: mx - 13, y: my - 13, w: 26, h: 32 });
    /* timer and kills */
    var dur = num(S.P.duration, 200) * 1000, left = dur - S.t;
    this.text(g, fmtTime(S.t), x0 + W / 2, y0 + 31, 18, '#ffffff', 'center', 800);
    var dawnLeft = (dur + num(S.P.dawn, 90) * 1000) - S.t, sub = S.bossSeen ? (S.boss >= 0 ? 'Dawn in ' + fmtTime(dawnLeft) : '') : left < 60000 ? 'Colossus wakes in ' + fmtTime(left) : '';
    if (sub) this.text(g, sub, x0 + W / 2, y0 + 47, 8.5, left < 15000 || S.boss >= 0 ? '#ff9a7a' : '#ffe9b0', 'center', 700);
    rects.push({ name: 'timer', x: x0 + W / 2 - 50, y: y0 + 20, w: 100, h: sub ? 34 : 22 });
    var kx = x0 + W - 12;
    this.text(g, String(H.kills), kx, y0 + 29, 13, '#ffffff', 'right', 800);
    g.font = '800 13px ' + this.font; var kw = g.measureText(String(H.kills)).width;
    this.skull(g, kx - kw - 10, y0 + 29);
    rects.push({ name: 'kills', x: kx - kw - 20, y: y0 + 20, w: kw + 22, h: 18 });
    /* weapon and passive slots */
    var sx = x0 + 8, sy = y0 + 32, n = 0;
    for (i = 0; i < H.weapons.length; i++) { this.slot(g, sx + n * 23, sy, H.weapons[i].id, S.lib.weapons[H.weapons[i].id], H.weapons[i].lv, true); n++; }
    var pn = 0; for (var id in H.passives) { this.slot(g, sx + pn * 19, sy + 25, id, S.lib.upgrades[id], H.passives[id], false); pn++; }
    rects.push({ name: 'slots', x: sx - 1, y: sy - 1, w: Math.max(n * 23, pn * 19) + 2, h: pn ? 46 : 24 });
    /* boss bar */
    if (S.boss >= 0 || (S.bossSeen && S.phase === 'won' && S.endT < 800)) {
      var bk = clamp(S.bossHp / (S.bossMax || 1), 0, 1), BW = Math.min(360, W - 120), BX = x0 + W / 2 - BW / 2, BY = y0 + v.h - 26;
      this.panel(g, BX - 8, BY - 15, BW + 16, 30, 7);
      this.text(g, S.bossDef ? S.bossDef.name : 'Boss', x0 + W / 2, BY - 6, 8.5, '#ffd9a0', 'center', 800, this.title);
      g.fillStyle = 'rgba(0,0,0,0.6)'; rrect(g, BX, BY, BW, 8, 4); g.fill();
      var gg = g.createLinearGradient(0, BY, 0, BY + 8); gg.addColorStop(0, '#ff7a5a'); gg.addColorStop(1, '#9a1c22');
      if (bk > 0) { g.fillStyle = gg; rrect(g, BX + 1, BY + 1, Math.max(6, (BW - 2) * bk), 6, 3); g.fill(); }
      rects.push({ name: 'bossBar', x: BX - 8, y: BY - 15, w: BW + 16, h: 30 });
    }
    /* wave alert */
    if (S.alert && S.alert.t < 2200) {
      var ak = S.alert.t / 2200, aa = ak < 0.1 ? ak / 0.1 : ak > 0.8 ? (1 - ak) / 0.2 : 1, ay = y0 + 70;
      g.globalAlpha = aa; this.text(g, S.alert.text, x0 + W / 2, ay, 12, S.alert.color || '#ffcf9a', 'center', 800, this.title); g.globalAlpha = 1;
      rects.push({ name: 'alert', x: x0 + W / 2 - 120, y: ay - 9, w: 240, h: 18 });
    }
    /* touch stick */
    var st = this.stick; if (st && st.on) {
      g.fillStyle = 'rgba(10,12,24,0.35)'; g.beginPath(); g.arc(st.x0, st.y0, 30, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,240,200,0.5)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(255,240,200,0.75)'; g.beginPath(); g.arc(st.x0 + st.dx * 30, st.y0 + st.dy * 30, 11, 0, TAU); g.fill();
      rects.push({ name: 'stick', x: st.x0 - 30, y: st.y0 - 30, w: 60, h: 60 });
    }
    if (S.modal) this.modal(g, rects);
    if ((S.phase === 'won' || S.phase === 'lost') && S.endT > 500) this.banner(g, rects);
  };
  PP.skull = function (g, x, y) {
    g.fillStyle = '#e9e2c8'; g.beginPath(); g.arc(x, y - 1, 5, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(x + 3, y + 5); g.lineTo(x - 3, y + 5); g.closePath(); g.fill();
    g.fillStyle = '#1a1420'; g.beginPath(); g.arc(x - 2, y, 1.4, 0, TAU); g.arc(x + 2, y, 1.4, 0, TAU); g.fill();
  };
  PP.slot = function (g, x, y, id, def, lv, big) {
    var s = big ? 21 : 17;
    g.fillStyle = 'rgba(6,8,16,0.7)'; rrect(g, x, y, s, s, 4); g.fill();
    g.strokeStyle = big ? 'rgba(214,190,130,0.85)' : 'rgba(160,170,200,0.6)'; g.lineWidth = 1; rrect(g, x + 0.5, y + 0.5, s - 1, s - 1, 4); g.stroke();
    if (def) this.icon(g, def.icon, x + s / 2, y + s / 2 - 1, s * 0.82, def.color);
    var mx = def ? (def.levels ? def.levels.length : def.max || 5) : 5;
    for (var p = 0; p < mx; p++) { g.fillStyle = p < lv ? '#ffd36a' : 'rgba(255,255,255,0.2)'; g.fillRect(x + 2 + p * ((s - 4) / mx), y + s - 3, (s - 4) / mx - 1, 1.6); }
  };
  PP.cardRects = function () {
    var S = this.S, v = S.view, M = S.modal; if (!M) return [];
    var n = M.choices.length, cw = Math.min(150, (v.w - 40) / n - 10), ch = Math.min(142, v.h - 110), gap = 12, tot = n * cw + (n - 1) * gap, x = v.x + v.w / 2 - tot / 2, y = v.y + v.h / 2 - ch / 2 + 16, out = [];
    for (var i = 0; i < n; i++) out.push({ x: x + i * (cw + gap), y: y, w: cw, h: ch, i: i });
    return out;
  };
  PP.modal = function (g, rects) {
    var S = this.S, v = S.view, M = S.modal, cr = this.cardRects(), k = clamp(M.t / 260, 0, 1);
    g.fillStyle = 'rgba(8,8,20,' + 0.55 * k + ')'; g.fillRect(v.x, v.y, v.w, v.h);
    var ty = v.y + v.h / 2 - cr[0].h / 2 - 12;
    g.save(); g.globalAlpha = k; g.translate(v.x + v.w / 2, ty); var ts = backOut(k); g.scale(ts, ts);
    var rb = g.createLinearGradient(0, -12, 0, 12); rb.addColorStop(0, '#8a2c2c'); rb.addColorStop(1, '#4a1418');
    g.fillStyle = rb; g.beginPath(); g.moveTo(-104, -11); g.lineTo(104, -11); g.lineTo(116, 0); g.lineTo(104, 11); g.lineTo(-104, 11); g.lineTo(-116, 0); g.closePath(); g.fill();
    g.strokeStyle = '#e6c27a'; g.lineWidth = 1.2; g.stroke();
    this.text(g, 'LEVEL UP!', 0, 0.5, 15, '#fff1c2', 'center', 800, this.title);
    g.restore();
    rects.push({ name: 'levelTitle', x: v.x + v.w / 2 - 118, y: ty - 12, w: 236, h: 24 });
    for (var i = 0; i < cr.length; i++) {
      var r = cr[i], c = M.choices[i], sel = i === M.sel, ck = clamp((M.t - 80 - i * 70) / 260, 0, 1), lift = sel ? -6 : 0, yy = r.y + (1 - backOut(ck)) * 40 + lift;
      if (ck <= 0) continue;
      g.save(); g.globalAlpha = Math.min(1, ck * 1.5);
      if (sel) { var gl = this.glowSprite(c.type === 'weapon' ? '#7fe8ff' : '#ffd36a'); if (gl) { g.globalAlpha *= 0.5 + 0.15 * Math.sin(M.t / 160); g.drawImage(gl, r.x - 30, yy - 30, r.w + 60, r.h + 60); g.globalAlpha = Math.min(1, ck * 1.5); } }
      this.panel(g, r.x, yy, r.w, r.h, 9);
      if (sel) { g.strokeStyle = '#ffe9a8'; g.lineWidth = 2.2; rrect(g, r.x - 1, yy - 1, r.w + 2, r.h + 2, 10); g.stroke(); }
      var cx = r.x + r.w / 2, iy = yy + 40;
      var ig = g.createRadialGradient(cx - 6, iy - 8, 2, cx, iy, 26); ig.addColorStop(0, c.type === 'weapon' ? '#34507a' : c.type === 'heal' ? '#5a3a2a' : '#4a3a6a'); ig.addColorStop(1, '#141628');
      g.fillStyle = ig; g.beginPath(); g.arc(cx, iy, 24, 0, TAU); g.fill(); g.strokeStyle = 'rgba(230,200,140,0.9)'; g.lineWidth = 1.4; g.stroke();
      this.icon(g, c.icon, cx, iy, 34, c.color);
      var tag = c.type === 'heal' ? 'RESTORE' : c.isNew ? 'NEW' : 'LV ' + c.level;
      g.font = '800 7.5px ' + this.font; var tw = g.measureText(tag).width + 10;
      g.fillStyle = c.isNew ? '#d8a33a' : c.type === 'heal' ? '#a0503a' : '#3f5f9a'; rrect(g, cx - tw / 2, iy + 19, tw, 11, 5.5); g.fill();
      this.text(g, tag, cx, iy + 24.8, 7.5, '#ffffff', 'center', 800);
      var L = this.cardLayout(g, c, r.w, r.h);
      this.text(g, c.name, cx, yy + L.nameY, L.nameSize, '#fff1c2', 'center', 800, this.title);
      g.font = '600 ' + L.size + 'px ' + this.font; g.fillStyle = '#d6dcf0'; g.textAlign = 'center'; g.textBaseline = 'top';
      for (var ln = 0; ln < L.lines.length; ln++) g.fillText(L.lines[ln], cx, yy + L.textTop + ln * L.lh);
      if (L.pips) for (var p = 0; p < c.max; p++) { var pw = 9, px0 = cx - c.max * (pw + 3) / 2 + p * (pw + 3); g.fillStyle = p < c.level - 1 ? '#ffd36a' : p === c.level - 1 ? (Math.sin(M.t / 120) > 0 ? '#fff6d0' : '#ffd36a') : 'rgba(255,255,255,0.18)'; rrect(g, px0, yy + L.pipY, pw, L.pipH, 2); g.fill(); }
      g.restore();
      rects.push({ name: 'card', x: r.x, y: yy, w: r.w, h: r.h, i: i });
    }
    this.text(g, 'Left / Right to choose, Z to take', v.x + v.w / 2, cr[0].y + cr[0].h + 18, 8, 'rgba(230,230,245,0.8)', 'center', 600);
  };
  /* one card's text layout in card px: the name, the effect text wrapped to the card and shrunk (8.5 -> 7 px) until it ends 4 px above
     the level pips, which sit at the bottom; text that still does not fit is cut with an ellipsis. Pure: the card check calls it too. */
  PP.cardLayout = function (g, c, w, h) {
    var pips = c.max > 1 && c.type !== 'heal', pipH = 4, pipY = h - 14, textTop = 99, limit = (pips ? pipY : h - 6) - 4, inner = w - 16, sizes = [8.5, 8, 7.5, 7], out = null;
    var nameSize = 10.5; g.font = '800 ' + nameSize + 'px ' + this.title; while (nameSize > 8 && g.measureText(c.name || '').width > inner) { nameSize -= 0.5; g.font = '800 ' + nameSize + 'px ' + this.title; }
    for (var k = 0; k < sizes.length; k++) {
      var sz = sizes[k], lh = Math.round(sz * 1.28 * 10) / 10; g.font = '600 ' + sz + 'px ' + this.font;
      var lines = this.lines(g, c.text, inner);
      out = { size: sz, lh: lh, lines: lines, textTop: textTop, textBottom: textTop + (lines.length - 1) * lh + sz * 1.15, inner: inner, pips: pips, pipY: pipY, pipH: pipH, nameY: 88, nameSize: nameSize, limit: limit };
      if (out.textBottom <= limit) return out;
    }
    g.font = '600 ' + out.size + 'px ' + this.font;
    while (out.lines.length > 1 && out.textBottom > limit) {
      out.lines.pop(); var last = out.lines[out.lines.length - 1].replace(/[ ,.]*$/, '');
      while (last.indexOf(' ') > 0 && g.measureText(last + '...').width > inner) last = last.slice(0, last.lastIndexOf(' ')).replace(/[ ,.]*$/, '');
      out.lines[out.lines.length - 1] = last + '...'; out.textBottom = textTop + (out.lines.length - 1) * out.lh + out.size * 1.15;
    }
    return out;
  };
  PP.lines = function (g, s, w) {
    var words = String(s || '').split(' '), line = '', out = [];
    for (var i = 0; i < words.length; i++) { var test = line ? line + ' ' + words[i] : words[i]; if (g.measureText(test).width > w && line) { out.push(line); line = words[i]; } else line = test; }
    if (line) out.push(line); return out;
  };
  PP.wrap = function (g, s, x, y, w, lh) {
    var words = String(s || '').split(' '), line = '', ln = 0;
    for (var i = 0; i < words.length; i++) { var test = line ? line + ' ' + words[i] : words[i]; if (g.measureText(test).width > w && line) { g.fillText(line, x, y + ln * lh); line = words[i]; ln++; } else line = test; }
    if (line) g.fillText(line, x, y + ln * lh);
  };
  PP.banner = function (g, rects) {
    var S = this.S, v = S.view, k = clamp((S.endT - 500) / 500, 0, 1), won = S.phase === 'won', y = v.y + v.h * 0.25;
    g.fillStyle = 'rgba(6,6,14,' + 0.45 * k + ')'; g.fillRect(v.x, v.y, v.w, v.h);
    g.save(); g.globalAlpha = k; g.translate(v.x + v.w / 2, y); var s = 0.8 + 0.2 * backOut(k); g.scale(s, s);
    var bg = g.createLinearGradient(-200, 0, 200, 0); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.2, won ? 'rgba(120,80,20,0.85)' : 'rgba(90,16,24,0.85)'); bg.addColorStop(0.8, won ? 'rgba(120,80,20,0.85)' : 'rgba(90,16,24,0.85)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg; g.fillRect(-220, -22, 440, 44);
    g.fillStyle = won ? '#ffd36a' : '#ff8a7a'; g.fillRect(-180, -22, 360, 1.5); g.fillRect(-180, 20.5, 360, 1.5);
    this.text(g, won ? 'DAWN BREAKS' : 'FALLEN', 0, 1, 26, won ? '#fff1c2' : '#ffd0c8', 'center', 800, this.title);
    g.restore();
    rects.push({ name: 'banner', x: v.x + v.w / 2 - 220, y: y - 22, w: 440, h: 44 });
  };
