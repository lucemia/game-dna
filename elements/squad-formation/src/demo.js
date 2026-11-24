"use strict";
// A-12 squad formation demo: a raider camp at dusk. Everything runs on a fixed 60 Hz step; ?t=<ms>&freeze=1 renders one frame.
(() => {
  const W = 320, H = 224, STEP = 1000 / 60, LOOP = 17000;
  const qs = new URLSearchParams(location.search);
  const FREEZE = qs.has("t") ? Math.max(0, +qs.get("t") || 0) : null, FROZEN = FREEZE !== null && qs.get("freeze") === "1";
  const cv = document.getElementById("cv"), g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;

  // ---------- params (element.json defaults, ?key=value overrides) ----------
  const PARAMS = { backGuard: "on", backWeak: 1.25, backMelee: 0.5, autoArrange: "on", tags: "off" /* demo default: one marker per unit; the module default is on */, autoStepMs: 300, autoMs: 1800, face: "left" };
  for (const k in PARAMS) if (qs.has(k)) PARAMS[k] = typeof PARAMS[k] === "number" ? +qs.get(k) : qs.get(k);

  // ---------- tiny 3x5 font (captions) ----------
  const F3 = {
    A: "25755", B: "65656", C: "34443", D: "65556", E: "74647", F: "74644", G: "34553", H: "55755", I: "72227", J: "11152", K: "55655",
    L: "44447", M: "57555", N: "65555", O: "25552", P: "65644", Q: "25573", R: "65655", S: "34216", T: "72222", U: "55557", V: "55552",
    W: "55575", X: "55255", Y: "55222", Z: "71247", 0: "75557", 1: "26227", 2: "61247", 3: "61216", 4: "55711", 5: "74616", 6: "34757",
    7: "71222", 8: "75757", 9: "75716", "!": "22202", ".": "00002", ":": "02020", "-": "00700", "+": "02720", "x": "05250", "'": "22000", ",": "00024",
  };
  function glyphs3(str, x, y, col, sc) {
    g.fillStyle = col;
    for (const ch of String(str)) {
      const gl = F3[ch] || F3[ch.toUpperCase()];
      if (gl) for (let r = 0; r < 5; r++) { const bits = gl.charCodeAt(r) - 48; for (let c = 0; c < 3; c++) if (bits & (4 >> c)) g.fillRect(x + c * sc, y + r * sc, sc, sc); }
      x += 4 * sc;
    }
  }
  const w3 = (s, sc) => String(s).length * 4 * sc - sc;
  function say(str, x, y, col, sc = 1, align = "left") {
    if (align === "center") x = Math.round(x - w3(str, sc) / 2); else if (align === "right") x -= w3(str, sc);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) glyphs3(str, x + dx * sc, y + dy * sc, "#120c18", sc);
    glyphs3(str, x, y, col, sc);
  }

  // ---------- sprites (original 16x21 figures, facing left; enemies are mirrored) ----------
  const BODY = [
    "................",
    "................",
    "......oooo......",
    ".....ohhhho.....",
    "....ohHhhhho....",
    "....ohhhhhho....",
    "....osshhhho....",
    "...oseSshhho....",
    "....osSSsho.....",
    ".....oossoo.....",
    "....obBBbbbo....",
    "...obBBbbbbdo...",
    "...osBbbbbbdo...",
    "...osobbbbddo...",
    "....oddddddo....",
    "....ogggggggo...",
    "....opppPPPo....",
    "....oppo.oPPo...",
    "....oppo.oPPo...",
    "...okkko.okkko..",
    "...oooo..oooo...",
  ];
  const HAT = ["........oo......", ".......oHho.....", "......ohhhho....", "...oooohhhhoooo."];
  const BASE = { o: "#1a1220", s: "#eab58c", S: "#c48a64", e: "#1a1220", k: "#3a2618", p: "#4a3a2e", P: "#33281f" };
  const GEAR = {
    sword: [[2, 5, 1, 7, "#e8eef6"], [1, 5, 1, 1, "#ffffff"], [1, 12, 3, 1, "#b08a3a"], [2, 13, 1, 2, "#6a4422"], [10, 10, 4, 6, "#2e5cc0"], [11, 11, 2, 4, "#e8c060"], [10, 10, 4, 1, "#7aa0ee"]],
    spear: [[2, 0, 1, 2, "#ffffff"], [1, 1, 3, 2, "#c8d4e0"], [2, 3, 1, 17, "#7a5030"], [2, 9, 1, 1, "#e8c060"]],
    bow: [[1, 6, 1, 1, "#8a5a2a"], [0, 7, 1, 8, "#a8703a"], [1, 15, 1, 1, "#8a5a2a"], [2, 7, 1, 8, "#e8e0c8"], [11, 9, 2, 6, "#6a4422"], [11, 8, 1, 1, "#e8e0c8"], [12, 8, 1, 1, "#e8e0c8"]],
    staff: [[2, 4, 1, 16, "#6a4422"], [1, 1, 3, 3, "#9a6aff"], [2, 1, 1, 1, "#f0e8ff"], [1, 2, 1, 1, "#d8c8ff"]],
    rod: [[2, 4, 1, 16, "#c8a050"], [1, 1, 3, 1, "#ffe8a0"], [2, 0, 1, 4, "#ffe8a0"]],
    axe: [[2, 7, 1, 12, "#6a4422"], [0, 7, 2, 4, "#c8d0d8"], [0, 7, 1, 4, "#ffffff"], [3, 8, 1, 2, "#8a96a4"]],
    club: [[1, 6, 3, 4, "#8a5a32"], [2, 10, 1, 9, "#6a4422"], [1, 7, 1, 1, "#c89a62"], [3, 6, 1, 1, "#4a2a14"]],
    hexrod: [[2, 4, 1, 16, "#3a2a2a"], [1, 1, 3, 3, "#5ae08a"], [2, 1, 1, 1, "#e8ffe8"]],
  };
  function bake(pal, gear, hat) {
    const mk = mode => {
      const c = document.createElement("canvas"); c.width = 16; c.height = 21;
      const x = c.getContext("2d");
      const put = (px, py, col) => { x.fillStyle = mode === "white" ? "#ffffff" : mode === "grey" ? grey(col) : col; x.fillRect(px, py, 1, 1); };
      BODY.forEach((row, y) => [...row].forEach((ch, i) => { const col = pal[ch] || BASE[ch]; if (ch !== "." && col) put(i, y, col); }));
      if (hat) HAT.forEach((row, y) => [...row].forEach((ch, i) => { const col = pal[ch] || BASE[ch]; if (ch !== "." && col) put(i, y, col); }));
      for (const [gx, gy, gw, gh, col] of GEAR[gear]) for (let yy = 0; yy < gh; yy++) for (let xx = 0; xx < gw; xx++) put(gx + xx, gy + yy, col);
      return c;
    };
    return { normal: mk("normal"), white: mk("white"), grey: mk("grey") };
  }
  function grey(hex) { const n = parseInt(hex.slice(1), 16); const v = Math.round((((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.5 + (n & 255) * 0.2) * 0.55); return `rgb(${v},${v},${v + 10})`; }

  const CLASSES = {
    knight: { name: "Knight", hp: 62, atk: 15, def: 8, reach: "melee", gear: "sword", pal: { h: "#9aa6b8", H: "#e0e8f4", b: "#2e5cc0", B: "#6a94ea", d: "#1c3a80", g: "#e8c060" } },
    lancer: { name: "Lancer", hp: 50, atk: 13, def: 6, reach: "melee", gear: "spear", pal: { h: "#c08040", H: "#e8b070", b: "#2a8a8a", B: "#62c8c0", d: "#165858", g: "#3a2a1a" } },
    archer: { name: "Archer", hp: 38, atk: 12, def: 3, reach: "ranged", gear: "bow", pal: { h: "#3a7a3a", H: "#6ab85a", b: "#4a8a3a", B: "#86c46a", d: "#2a5424", g: "#8a5a2a" } },
    mage: { name: "Mage", hp: 34, atk: 14, def: 2, reach: "magic", gear: "staff", hat: true, pal: { h: "#6a3aa8", H: "#a878e8", b: "#5a2a8a", B: "#9a62d0", d: "#381858", g: "#e8c060" } },
    cleric: { name: "Cleric", hp: 40, atk: 9, def: 4, reach: "magic", gear: "rod", pal: { h: "#e8e0d0", H: "#ffffff", b: "#d8d0c0", B: "#ffffff", d: "#9a9080", g: "#c8a050" } },
    brigand: { name: "Brigand", hp: 44, atk: 13, def: 4, reach: "melee", gear: "axe", pal: { h: "#c03a2a", H: "#f07050", b: "#7a4a2a", B: "#a87048", d: "#4a2a14", g: "#2a1a10" } },
    brute: { name: "Brute", hp: 70, atk: 16, def: 6, reach: "melee", gear: "club", pal: { h: "#4a3a3a", H: "#7a6060", b: "#6a2a2a", B: "#a0483a", d: "#3a1414", g: "#c8a050", s: "#c89068", S: "#9a6448" } },
    bowman: { name: "Bowman", hp: 34, atk: 12, def: 2, reach: "ranged", gear: "bow", pal: { h: "#3a3040", H: "#5a4a60", b: "#5a3a3a", B: "#8a5a50", d: "#3a2020", g: "#8a5a2a" } },
    hexer: { name: "Hexer", hp: 30, atk: 13, def: 1, reach: "magic", gear: "hexrod", hat: true, pal: { h: "#2a3a2a", H: "#4a6a4a", b: "#2a4a3a", B: "#4a7a5a", d: "#142a1e", g: "#5ae08a" } },
  };
  for (const k in CLASSES) CLASSES[k].art = bake(CLASSES[k].pal, CLASSES[k].gear, CLASSES[k].hat);
  // field figures: 24x32 from the shared pixel kit (PXS.fighter); the 16x21 bakes above stay as the editor's cell art
    const BIG = {
      knight: { head: "helm", gear: "sword", shield: ["#c8ccd8", "#ffffff", "#8a90a4", "#2e5cc0"], pal: { h: "#9aa6b8", H: "#e0e8f4", x: "#5c6880", b: "#2e5cc0", B: "#6a94ea", d: "#1c3a80", g: "#16306a", p: "#7a8498", P: "#565e72", k: "#3a4052", K: "#8a94a8" } },
    lancer: { head: "hair", gear: "spear", pal: { h: "#c08040", H: "#e8b070", x: "#8a5424", b: "#2a8a8a", B: "#62c8c0", d: "#165858", g: "#3a2a1a" } },
    archer: { head: "hood", gear: "bow", pal: { h: "#3a7a3a", H: "#6ab85a", x: "#245226", b: "#4a8a3a", B: "#86c46a", d: "#2a5424", g: "#8a5a2a" } },
    mage: { head: "hat", gear: "staff", robe: true, pal: { h: "#e8d8a8", H: "#fff4d0", x: "#b8a070", t: "#6a3aa8", T: "#a878e8", u: "#42206e", b: "#5a2a8a", B: "#9a62d0", d: "#381858", g: "#e8c060" } },
    cleric: { head: "hood", gear: "rod", robe: true, pal: { h: "#e8e0d0", H: "#ffffff", x: "#b0a690", b: "#d8d0c0", B: "#ffffff", d: "#9a9080", g: "#c8a050" } },
    brigand: { head: "band", gear: "axe", pal: { h: "#3a2a22", H: "#5a4434", x: "#221610", t: "#c03a2a", T: "#f07050", u: "#8a2018", b: "#7a4a2a", B: "#a87048", d: "#4a2a14", g: "#2a1a10" } },
    brute: { head: "hair", gear: "club", beard: true, pal: { h: "#4a3a3a", H: "#7a6060", x: "#2a1e1e", b: "#6a2a2a", B: "#a0483a", d: "#3a1414", g: "#c8a050", s: "#c89068", S: "#9a6448" } },
    bowman: { head: "hood", gear: "bow", pal: { h: "#4a3c54", H: "#6e5c7a", x: "#2c2234", b: "#5a3a3a", B: "#8a5a50", d: "#3a2020", g: "#8a5a2a" } },
    hexer: { head: "hat", gear: "hexrod", robe: true, pal: { h: "#8a8478", H: "#b0a898", x: "#5a564c", t: "#2a3a2a", T: "#4a6a4a", u: "#142016", b: "#2a4a3a", B: "#4a7a5a", d: "#142a1e", g: "#5ae08a", s: "#c8b89a", S: "#9a8a6c" } },
};
  const FW = window.GameDNA_PixelScene ? 24 : 16, FH = window.GameDNA_PixelScene ? 32 : 21;
  for (const k in CLASSES) CLASSES[k].field = window.GameDNA_PixelScene ? GameDNA_PixelScene.fighter(BIG[k]) : CLASSES[k].art;

  let uid = 0;
  const unit = (cls, team) => { const c = CLASSES[cls]; return { id: (team === "a" ? "p" : "e") + (uid++), cls, name: c.name, hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def, reach: c.reach, team, art: c.art.normal, px: null, py: null, flash: 0, push: 0, lunge: 0 }; };
  const PARTY = ["archer", "mage", "lancer", "cleric", "knight"].map(c => unit(c, "a"));
  const FOES = ["brigand", "brute", "bowman", "hexer"].map(c => unit(c, "b"));
  const byCls = (list, cls) => list.find(u => u.cls === cls);
  // the opening line-up is deliberately wrong: archer and mage in front, knight behind
  const BAD = [byCls(PARTY, "archer"), byCls(PARTY, "mage"), byCls(PARTY, "lancer"), byCls(PARTY, "cleric"), byCls(PARTY, "knight"), null];
  const FOE_SLOTS = [byCls(FOES, "brigand"), byCls(FOES, "brute"), null, byCls(FOES, "bowman"), byCls(FOES, "hexer"), null];

  // ---------- the module ----------
  const sf = GameDNA_SquadFormation.create({
    view: { x: 0, y: 0, w: W, h: H },
    params: PARAMS,
    unit: { flip: () => false },
    autoplay: () => script.on,
    debug: e => { if (e.event === "deploy") onDeploy(e); if (e.event === "swap" || e.event === "move") readoutMove(e); },
  });
  sf.attach(cv, { w: W, h: H });
  // 2 x 3 slots per side, 40 px between ranks so a 32 px figure and its HP bar never touch the next unit
  const AREA = { a: { x: 190, y: 98, w: 112, h: 120, face: "left" }, b: { x: 18, y: 98, w: 112, h: 120, face: "right" } }, MIDY = 158;
  function placeOf(u) {
    const p = sf.spot(u, AREA[u.team]); if (!p) return { x: 0, y: 0 };
    return { x: p.x + Math.round((p.y - MIDY) * (u.team === "a" ? -0.3 : 0.3)), y: p.y + 8 };
  }
  function reset() {
    for (const u of PARTY.concat(FOES)) { u.hp = u.maxHp; u.flash = 0; u.push = 0; u.lunge = 0; }
    sf.squad({ id: "party", team: "a", name: "Wardens", slots: BAD.slice() });
    sf.squad({ id: "raiders", team: "b", name: "Raiders", slots: FOE_SLOTS.slice() });
    for (const u of PARTY.concat(FOES)) { const p = placeOf(u); u.px = p.x; u.py = p.y; }
    acts.length = 0; pops.length = 0; fireQueue.length = 0; caption = null;
  }

  // ---------- actions ----------
  const acts = [], pops = [], embers = [];
  let caption = null, clock = 0;
  const log = [];
  function note(html) { log.unshift(html); log.length = Math.min(log.length, 6); readoutDirty = true; }
  const living = list => list.filter(u => u.hp > 0);
  function aimFor(att, squad, reach) {   // the demo AI: the target this reach hurts most (back row for arrows and spells), then the weakest
    const pool = sf.targetsFor(att, squad, reach);
    let best = null, bs = -1;
    for (const t of pool) { const h = sf.hit(att, t, reach), sc = h.mul * 1000 + t.hp; if (h.ok && sc > bs) { bs = sc; best = t; } }
    return { pool, target: reach === "melee" ? sf.pickTarget(att, squad, reach) : best };
  }
  function queue(kind, att, squad, reach, delay = 0) {
    if (!att || att.hp <= 0) return;
    acts.push({ kind, att, squad, reach, t: -delay, done: false });
  }
  function startAct(a) {
    const can = sf.canStrike(a.att, a.reach);
    if (!can.ok) {                                      // e.g. Hard wall: a melee fighter in the back row cannot swing at all
      a.target = null; a.pool = []; a.t = Math.max(a.t, 500);
      note(`<b class="${a.att.team === "a" ? "o" : "x"}">${a.att.name}</b> (${a.reach}, ${sf.rowOf(a.att)} row) <span class="x">cannot strike from the back row</span>`);
      pops.push(popAt(a.att, "CAN'T REACH", "#ffc040", true));
      caption = { text: a.att.name.toUpperCase() + ": NO MELEE FROM THE BACK", t: 0, team: a.att.team };
      return;
    }
    const { pool, target } = aimFor(a.att, a.squad, a.reach);
    a.target = target; a.pool = pool;
    const enemyRows = sf.getSquad(a.squad);
    const shielded = enemyRows ? enemyRows.slots.filter(u => u && u.hp > 0 && pool.indexOf(u) < 0) : [];
    const col = a.att.team === "a" ? "o" : "x";
    note(`<b class="${col}">${a.att.name}</b> (${a.reach}, ${sf.rowOf(a.att)} row) &rarr; can hit: ${pool.map(u => `<b>${u.name}</b>`).join(", ") || "nobody"}` +
      (shielded.length ? ` &middot; <span class="k">shielded: ${shielded.map(u => u.name).join(", ")}</span>` : ""));
    caption = { text: a.att.name.toUpperCase() + (a.reach === "melee" ? (a.att.team === "a" ? " STRIKES" : " CHARGES") : a.reach === "ranged" ? " LOOSES ARROWS" : a.att.team === "a" ? " CASTS A SPELL" : " CASTS A HEX"), t: 0, team: a.att.team };
  }
  function impact(a) {
    const t = a.target; if (!t || t.hp <= 0) return;
    const h = sf.hit(a.att, t, a.reach);
    if (!h.ok) { if (h.cause === "guard") pops.push(popAt(t, "SHIELDED", "#8ac8ff", true)); return; }
    const base = Math.max(1, a.att.atk + 4 - t.def), dmg = Math.max(1, Math.round(base * h.mul));
    t.hp = Math.max(0, t.hp - dmg); t.flash = 14; t.push = a.att.team === "a" ? -3 : 3;
    pops.push(Object.assign(popAt(t, String(dmg), h.mul > 1 ? "#ffb04a" : h.mul < 1 ? "#c8c8d8" : "#ffffff", false, h.mul !== 1 ? "x" + h.mul : null), { owner: t }));
    note(`&nbsp;&nbsp;hits <b>${t.name}</b> (${h.row} row): ${base} &times; ${h.mul} = <b>${dmg}</b>` + (h.why.length ? ` <span class="${h.mul > 1 ? "f" : "k"}">&middot; ${h.why.join("; ")}</span>` : ""));
  }
  // a pop sits over its own target: above the head, else beside it on the open side, never over another unit's sprite
  function popAt(t, text, col, small, sub) {
    const w = (small ? w3(text, 1) : w3(text, 2)) + (sub ? w3(sub, 1) + 3 : 0), hgt = small ? 7 : 12;
    const boxes = PARTY.concat(FOES).filter(u => u !== t && u.hp > 0).map(u => ({ x: u.px - FW / 2, y: u.py - FH - 1, w: FW, h: FH + 3 }));
    // row tags and HP bars (also the target's own) stay readable: drawn beside the feet, see drawUnit
    for (const u of PARTY.concat(FOES)) if (u.hp > 0) { const bx = Math.round(u.px - 11), by = u.py + 3; boxes.push({ x: bx - 1, y: by - 1, w: 24, h: 5 }); }
    const hitAny = r => boxes.some(b => r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h);
    const side = t.team === "a" ? -1 : 1;
    const cl = x => Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, x));
    const cands = [[t.px, t.py - FH - 11], [cl(t.px + side * (w / 2 + 14)), t.py - 26], [t.px, t.py + 10], [cl(t.px - side * (w / 2 + 14)), t.py - 26], [t.px, t.py - FH - 23]].concat(t.py + 30 < H ? [[t.px, t.py + 22]] : []).map(([x, y]) => [cl(x), y]);
    const tw = small ? w3(text, 1) : w3(text, 2);
    for (const [x, y] of cands) { const r = { x: x - tw / 2 - 1, y: y - 14, w: w + 2, h: hgt + 16 }; /* covers the pop's rise */ if (!hitAny(r)) return { x, y, text, col, t: 0, small, sub }; }
    return { x: cands[1][0], y: cands[1][1], text, col, t: 0, small, sub };
  }
  function stepActs() {
    if (!acts.length && fireQueue.length) fire(fireQueue.shift(), true);
    const a = acts[0]; if (!a) return;
    a.t += STEP;
    if (a.t < 0) return;
    if (!a.started) { a.started = true; startAct(a); }
    const T = a.t, att = a.att, tg = a.target;
    if (a.reach === "melee" && tg) {
      const dir = att.team === "a" ? -1 : 1, home = placeOf(att), reachX = tg.px - dir * 30;
      const f = T < 420 ? easeIO(T / 420) : T < 640 ? 1 : T < 1000 ? 1 - easeIO((T - 640) / 360) : 0;
      att.px = Math.round(home.x + (reachX - home.x) * f); att.py = Math.round(home.y + (tg.py - home.y) * f);
      att.lunge = T > 420 && T < 520 ? dir * 3 : 0;
      if (!a.hit && T >= 470) { a.hit = true; impact(a); }
    } else if (tg) {
      att.lunge = T < 300 ? (att.team === "a" ? -1 : 1) * Math.round(Math.sin(T / 300 * Math.PI) * 2) : 0;
      if (!a.hit && T >= 760) { a.hit = true; impact(a); }
    }
    if (T >= 1150) { a.done = true; const p = placeOf(att); att.px = p.x; att.py = p.y; att.lunge = 0; acts.shift(); }
  }
  const easeIO = t => (t = Math.max(0, Math.min(1, t)), t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const fireQueue = [];
  function fire(kind, fromQueue) {
    if (sf.busy()) { note('<span class="x">deploy the formation first</span>'); return; }
    if (acts.length && !fromQueue) {
      if (fireQueue.length < 3) { fireQueue.push(kind); note(`<span class="k">queued: ${kind} (after the current action)</span>`); }
      else note('<span class="x">queue full: wait for the current actions</span>');
      return;
    }
    if (kind === "melee") queue("charge", byCls(FOES, "brute").hp > 0 ? byCls(FOES, "brute") : byCls(FOES, "brigand"), "party", "melee");
    if (kind === "ranged") queue("volley", byCls(FOES, "bowman"), "party", "ranged");
    if (kind === "magic") queue("hex", byCls(FOES, "hexer"), "party", "magic");
    if (kind === "strike") {
      const line = living(PARTY).sort((p, q) => sf.slotOf(p) - sf.slotOf(q));
      const shooter = line.find(u => u.reach === "ranged") || line.find(u => u.reach === "magic"), melee = line.filter(u => u.reach === "melee");
      if (shooter) queue("shot", shooter, "raiders", shooter.reach);
      melee.slice(0, 2).forEach((m, i) => queue("strike", m, "raiders", "melee", i ? 150 : 150));
    }
  }

  // ---------- demo script (loops every 15 s while nobody touches anything) ----------
  const script = { on: !qs.has("manual"), T: 0 };
  const CUES = [
    [0, () => { reset(); caption = { text: "RAIDERS AT THE CAMP", t: 0, team: "b" }; }],
    [900, () => sf.open(["party"], { title: "FORMATION", enemy: "raiders" })],
    [5200, () => fire("melee")],
    [6900, () => fire("ranged")],
    [8600, () => fire("magic")],
    [10400, () => fire("strike")],
    [14100, () => {        // the payoff of the shield rule: the raiders' front row falls, and melee now reaches their back row
      for (const u of FOES) if (sf.rowOf(u) === "front" && u.hp > 0) { u.hp = 0; u.flash = 14; pops.push({ x: u.px, y: u.py - 16, text: "DOWN", col: "#ff8a7a", t: 0, small: true }); }
      caption = { text: "THEIR FRONT ROW FALLS", t: 0, team: "a" };
      note('<span class="f">front row fallen: their back row is exposed to melee</span>');
    }],
    [14900, () => queue("strike", byCls(PARTY, "knight").hp > 0 ? byCls(PARTY, "knight") : byCls(PARTY, "lancer"), "raiders", "melee")],
  ];
  function scriptStep() {
    const prev = script.T % LOOP; script.T += STEP; const now = script.T % LOOP;
    for (const [at, fn] of CUES) if ((now >= at && (prev < at || now < prev)) || (script.T - STEP <= 0 && at === 0)) fn();
  }
  function stopScript(reason) { if (!script.on) return; script.on = false; statusEl.innerHTML = "<b>your turn</b> &middot; " + reason; }
  function onDeploy(e) {
    note(`<b class="o">DEPLOY</b> ${e.how}${e.auto ? " (autopilot)" : ""}: ${e.changed} slot${e.changed === 1 ? "" : "s"} changed &middot; front: ${sf.members("party", true).filter(m => m.row === "front").map(m => m.unit.name).join(", ")}`);
    caption = { text: "FORMATION SET", t: 0, team: "a" };
  }
  function readoutMove(e) { /* the editor's own swaps are visible on screen; the log keeps attacks */ }

  // ---------- scenery (baked once) ----------
  const scenery = (() => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const s = c.getContext("2d");
    const dot = (x, y, col, w = 1, h = 1) => { s.fillStyle = col; s.fillRect(x, y, w, h); };
    const sky = ["#14122a", "#1d1a3a", "#2a2248", "#3c2a54", "#5a3458", "#7e4258", "#a8564e", "#cc7448", "#e89a54"];
    for (let y = 0; y < 88; y++) {
      const f = (y / 88) * (sky.length - 1), i = Math.floor(f), mix = f - i;
      for (let x = 0; x < W; x++) { const th = ((x & 1) * 2 + (y & 1)) / 4 + 0.125; dot(x, y, sky[mix > th ? Math.min(i + 1, sky.length - 1) : i]); }
    }
    let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * 46); dot(x, y, rnd() < 0.3 ? "#fff6d8" : "#9a92c8"); }
    for (let y = -6; y <= 6; y++) { const hw = Math.floor(Math.sqrt(36 - y * y)); dot(262 - hw, 22 + y, "#f4e6c0", hw * 2, 1); }
    for (let y = -6; y <= 2; y++) { const hw = Math.floor(Math.sqrt(36 - y * y)); dot(262 - hw + 3, 21 + y, "#e0d0a8", Math.max(0, hw - 3), 1); }
    const ridge = (base, amp, fr, ph, col, top) => { for (let x = 0; x < W; x++) { const yy = Math.round(base - Math.abs(Math.sin(x * fr + ph)) * amp - Math.max(0, Math.sin(x * fr * 2.3 + ph * 1.7)) * amp * 0.4); dot(x, yy, col, 1, 100 - yy); dot(x, yy, top); } };
    ridge(76, 18, 0.027, 0.6, "#3a2a4a", "#5a4060");
    ridge(83, 11, 0.046, 2.1, "#2c2238", "#4a3450");
    ridge(90, 6, 0.075, 0.9, "#1e1a2a", "#3a2c40");
    const PXS = window.GameDNA_PixelScene;
    if (PXS) {
      // camp ground from the shared pixel scene kit (pixel-kit/pixel-scene.js): worn earth round the fire, tents, stores; one flat night tint
      const sc = PXS.scene({ seed: 19, map: [
        "....................",
        ".....,..pppp...,....",
        ".......pppppp.......",
        "..,,....pppp....,,..",
        "..........pp........",
        "....,.....pp....,...",
        ".,.........p......,.",
        "..........pp........",
        "...,......pp....,...",
        ".........ppp........"], props: [
        { k: "tent", x: 28, y: 22, o: { color: "red" } }, { k: "tent", x: 296, y: 22, o: { color: "blue" } }, { k: "tent", x: 252, y: 19, o: { color: "blue" } },
        { k: "crate", x: 62, y: 22 }, { k: "barrel", x: 76, y: 24 }, { k: "barrel", x: 218, y: 22 }, { k: "sack", x: 228, y: 25 }, { k: "crate", x: 322, y: 30 },
        { k: "log", x: 134, y: 30 }, { k: "log", x: 186, y: 30 }, { k: "stump", x: 160, y: 46 }, { k: "rock", x: 104, y: 21 }, { k: "bush", x: 4, y: 28 },
        { k: "boulder", x: 150, y: 150 }, { k: "rock", x: 146, y: 80 }] });
      const f = document.createElement("canvas"); f.width = W; f.height = H; const fq = f.getContext("2d");
      fq.drawImage(sc.ground(0), 0, 16, W, H - 88, 0, 88, W, H - 88);
      sc.items.slice().sort((a, b) => a.y - b.y).forEach(it => it.draw(fq, 0, 0, 72));
      s.drawImage(f, 0, 0);
      const m = document.createElement("canvas"); m.width = W; m.height = H; const mq = m.getContext("2d");
      mq.drawImage(f, 0, 0); mq.globalCompositeOperation = "source-in"; mq.fillStyle = "#8a82b6"; mq.fillRect(0, 0, W, H);
      s.globalCompositeOperation = "multiply"; s.drawImage(m, 0, 0); s.globalCompositeOperation = "source-over";
    } else {
    const grass = ["#3a4a2e", "#33432a", "#2c3a26", "#263322", "#212c1e"];
    for (let y = 90; y < H; y++) for (let x = 0; x < W; x++) {
      const d = (y - 90) / (H - 90), n = Math.sin(x * 0.11 + y * 0.45) + Math.sin(x * 0.029 - y * 0.16) * 0.9;
      let i = Math.min(4, Math.floor(d * 3.2 + (n > 1.1 ? -1 : n < -1.1 ? 1 : 0))); i = Math.max(0, i);
      dot(x, y, grass[i]);
    }
    for (let y = 100; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = 160 + Math.sin(y * 0.08) * 4, hw = 40 + (y - 100) * 0.45, dd = Math.abs(x - cx) / hw;
      if (dd < 1 && ((x * 7 + y * 13) % 5) / 5 > dd * 0.9) dot(x, y, dd < 0.6 ? "#4a4030" : "#3e3a2a");
    }
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rnd() * W), y = 94 + Math.floor(rnd() * (H - 96));
      if (rnd() < 0.7) { dot(x, y - 2, "#5a7040"); dot(x + 1, y - 3, "#7a9450"); dot(x + 2, y - 2, "#5a7040"); dot(x, y - 1, "#2a3420", 3, 1); }
      else { dot(x, y - 2, "#5a5660", 4, 2); dot(x, y - 2, "#8a8690", 3, 1); dot(x, y, "#1a1820", 4, 1); }
    }
    const tent = (x0, y0, w, h, cloth, shade, edge) => {
      for (let y = 0; y < h; y++) { const hw = Math.round((y / h) * w / 2); dot(x0 - hw, y0 + y, cloth, hw, 1); dot(x0, y0 + y, shade, hw, 1); dot(x0 - hw, y0 + y, edge); dot(x0 + hw - 1, y0 + y, edge); }
      dot(x0 - 2, y0 + h - 7, "#140e14", 4, 7); dot(x0, y0 - 4, "#6a4a2a", 1, 5); dot(x0 - w / 2 - 2, y0 + h, "#1a1418", w + 4, 1);
    };
    tent(296, 70, 34, 22, "#3a5a8a", "#2a4068", "#1a2440"); tent(254, 78, 22, 14, "#4a6a9a", "#30507a", "#1a2440");
    tent(30, 68, 36, 24, "#8a3a2a", "#6a2a20", "#2a1410"); dot(30, 57, "#5a3a20", 1, 12); dot(31, 57, "#c03a2a", 7, 3); dot(31, 60, "#c03a2a", 4, 1);
    }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; dot(Math.round(158 + Math.cos(a) * 8), Math.round(97 + Math.sin(a) * 3), i % 2 ? "#6a6470" : "#8a8490", 3, 2); }
    dot(153, 96, "#4a2a18", 12, 2); dot(155, 94, "#6a3a20", 8, 2);
    return c;
  })();

  // ---------- drawing ----------
  function drawFire(t) {
    const fl = Math.sin(t / 90) * 0.5 + Math.sin(t / 37) * 0.3;
    g.save(); g.globalCompositeOperation = "lighter";
    for (let k = 0; k < 9; k++) {
      const R = 6 + k * 6 + fl * 1.5; g.fillStyle = `rgba(255,${130 + k * 6},60,${0.026 + (8 - k) * 0.004})`;
      for (let y = -R; y <= R; y++) { const hw = Math.floor(Math.sqrt(Math.max(0, R * R - y * y)) * 1.7); g.fillRect(160 - hw, Math.round(95 + y * 0.5), hw * 2, 1); }
    }
    g.restore();
    const tongues = [[-4, 7, "#c8401a"], [-1, 10, "#f07a2a"], [2, 8, "#c8401a"], [0, 6, "#ffd060"], [-2, 4, "#fff4c0"]];
    for (const [dx, hh, col] of tongues) { const h2 = Math.round(hh + Math.sin(t / 70 + dx) * 2); g.fillStyle = col; g.fillRect(159 + dx, 95 - h2, 3, h2); }
    for (const e of embers) { g.fillStyle = e.life > 0.5 ? "#ffd070" : "#c86030"; g.fillRect(Math.round(e.x), Math.round(e.y), 1, 1); }
  }
  // both figure sets (PXS.fighter and the 16x21 bakes) look LEFT (newer kits say so in fighter().facing); each squad
  // looks across the field (AREA[team].face), and the mirror is computed from that, not typed per team
  const artFacing = F => F.facing || "left", faceOf = u => AREA[u.team].face;
  function drawUnit(u, t) {
    const F = CLASSES[u.cls].field, dead = u.hp <= 0, img = dead ? F.grey : u.flash > 0 && (u.flash >> 1) % 2 ? F.white : F.normal;
    const flip = faceOf(u) !== artFacing(F), bob = dead ? 0 : Math.round(Math.sin(t / 260 + u.px * 0.13) * 0.5 + 0.5);
    const x = Math.round(u.px - FW / 2 + u.push + u.lunge), y = Math.round(u.py - FH + 1 + bob);
    g.fillStyle = "rgba(10,8,14,0.42)"; g.fillRect(u.px - 9, u.py - 1, 18, 2); g.fillRect(u.px - 7, u.py - 2, 14, 1); g.fillRect(u.px - 7, u.py + 1, 14, 1);
    if (dead) { g.save(); g.translate(u.px, u.py - 5); g.rotate(flip ? Math.PI / 2 : -Math.PI / 2); g.drawImage(F.normal, -FW / 2 - 2, -FH / 2 + 2); g.globalAlpha = 0.5; g.drawImage(img, -FW / 2 - 2, -FH / 2 + 2); g.restore(); return; }   // fallen: lying on its back, colours half drained
    if (flip) { g.save(); g.translate(x + FW, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); } else g.drawImage(img, x, y);
    // one marker per unit: its HP bar under the feet (rows read from where the unit stands; the editor shows the badges)
    { const hm = placeOf(u); if (Math.abs(u.px - hm.x) > 6) return; }                     // a charging unit leaves its bar behind: no bars piling up at the target
    const bw = 20, bx = Math.round(u.px - bw / 2), by = u.py + 3, fill = Math.max(1, Math.round(bw * u.hp / u.maxHp));
    g.fillStyle = "#120c18"; g.fillRect(bx - 1, by - 1, bw + 2, 5);
    g.fillStyle = "#3a2a3a"; g.fillRect(bx, by, bw, 3);
    g.fillStyle = u.team === "a" ? (u.hp < u.maxHp * 0.3 ? "#ffb04a" : "#5ad86a") : "#e84a3a"; g.fillRect(bx, by, fill, 3);
    g.fillStyle = u.team === "a" ? (u.hp < u.maxHp * 0.3 ? "#ffe0a0" : "#b4f4a0") : "#ff9a80"; g.fillRect(bx, by, fill, 1);
    if (PARAMS.tags === "on") sf.drawTag(g, u, u.team === "a" ? bx + bw + 2 : bx - 9, by - 2);
  }
  function drawProjectiles() {
    const a = acts[0]; if (!a || !a.started || !a.target || a.reach === "melee") return;
    const T = a.t, s = a.att, tg = a.target, sx = s.px + (s.team === "a" ? -9 : 9), sy = s.py - 20, tx = tg.px, ty = tg.py - 16;
    if (a.reach === "ranged") for (let k = 0; k < 3; k++) {
      const f = (T - 300 - k * 70) / 460; if (f <= 0 || f >= 1) continue;
      const x = sx + (tx - sx) * f + k * 2, y = sy + (ty - sy) * f - Math.sin(f * Math.PI) * 26, dx = (tx - sx) / 460, dy = (ty - sy) / 460 - Math.cos(f * Math.PI) * 26 * Math.PI / 460;
      const n = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < 6; i++) { g.fillStyle = i < 2 ? "#e8e0c8" : "#a8703a"; g.fillRect(Math.round(x - dx / n * i), Math.round(y - dy / n * i), 1, 1); }
    } else {
      const f = (T - 260) / 500; if (f <= 0 || f >= 1.05) return;
      const ff = Math.min(1, f), x = sx + (tx - sx) * ff, y = sy + (ty - sy) * ff + Math.sin(ff * 9) * 3;
      g.save(); g.globalCompositeOperation = "lighter";
      g.fillStyle = "rgba(90,224,138,0.25)"; g.fillRect(Math.round(x) - 5, Math.round(y) - 5, 11, 11);
      g.fillStyle = "rgba(90,224,138,0.5)"; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7);
      g.restore();
      g.fillStyle = "#e8ffe8"; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      for (let i = 1; i < 6; i++) { const fx = sx + (tx - sx) * Math.max(0, ff - i * 0.04), fy = sy + (ty - sy) * Math.max(0, ff - i * 0.04) + Math.sin((ff - i * 0.04) * 9) * 3; g.fillStyle = i < 3 ? "#5ae08a" : "#2a8a5a"; g.fillRect(Math.round(fx), Math.round(fy), 1, 1); }
    }
  }
  function drawPops() {
    for (const p of pops) {
      const f = p.t / 900, rise = Math.round(Math.min(1, p.t / 260) * 8 + f * 4), y = Math.round(p.y - rise);
      if (p.t > 750 && (p.t >> 5) % 2) continue;
      if (p.small) { say(p.text, p.x, y, p.col, 1, "center"); continue; }
      const sc = p.t < 90 ? 3 : 2;
      say(p.text, p.x, y - (sc - 2) * 3, p.col, sc, "center");
      if (p.sub) say(p.sub, p.x + w3(p.text, 2) / 2 + 3, y - 2, "#ffd27a", 1);
    }
  }
  function drawCaption() {
    if (!caption || caption.t > 1700) return;
    const a = caption.t < 160 ? caption.t / 160 : caption.t > 1400 ? 1 - (caption.t - 1400) / 300 : 1;
    const w = w3(caption.text, 1) + 20, x = Math.round((W - w) / 2), y = 10 - Math.round((1 - a) * 6);
    g.globalAlpha = a;
    g.fillStyle = "#120c18"; g.fillRect(x, y, w, 13);
    g.fillStyle = caption.team === "a" ? "#2e5cc0" : "#8a2a20"; g.fillRect(x + 1, y + 1, w - 2, 11);
    g.fillStyle = caption.team === "a" ? "#6a94ea" : "#c8503a"; g.fillRect(x + 1, y + 1, w - 2, 1);
    say(caption.text, W / 2, y + 4, "#ffffff", 1, "center");
    g.globalAlpha = 1;
  }
  function render() {
    const t = clock;
    g.drawImage(scenery, 0, 0);
    drawFire(t);
    const cast = PARTY.concat(FOES).slice().sort((p, q) => p.py - q.py);
    for (const u of cast) drawUnit(u, t);
    const a = acts[0];
    if (a && a.started && a.t < 760) sf.drawGuards(g, a.att, a.squad, a.reach, u => [u.px - FW / 2 + (u.team === "a" ? -17 : 17), u.py - FH + 12, FW, FH - 12]   /* the mark sits beside the head on the enemy side, clear of the next rank's HP bar */);
    drawProjectiles();
    drawPops();
    drawCaption();
    sf.draw(g);
  }

  // ---------- step ----------
  let pending = [];
  function step() {
    const input = pending; pending = [];
    clock += STEP;
    if (script.on) scriptStep();
    for (const k of input) {
      if (k === "edit") { if (!sf.busy() && !acts.length) sf.open(["party"], { title: "FORMATION", cursor: "unit", enemy: "raiders" }); continue; }
      if (/^act:/.test(k)) { fire(k.slice(4)); continue; }
      if (sf.busy()) sf.key(k);
    }
    sf.update(STEP);
    if (!sf.busy()) stepActs();
    for (const u of PARTY.concat(FOES)) {
      if (u.flash > 0) u.flash--;
      if (u.push) u.push -= Math.sign(u.push);
      if (acts[0] && acts[0].att === u && acts[0].started) continue;
      const p = placeOf(u); u.px += Math.round((p.x - u.px) * 0.18) || Math.sign(p.x - u.px); u.py += Math.round((p.y - u.py) * 0.18) || Math.sign(p.y - u.py);
    }
    for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += STEP; if (pops[i].t > 900) pops.splice(i, 1); }
    if (caption) caption.t += STEP;
    // embers: a deterministic stream from the fire
    if (Math.floor(clock / STEP) % 7 === 0) { const k = Math.floor(clock / STEP); embers.push({ x: 157 + (k * 37) % 7, y: 86, vx: Math.sin(k * 1.7) * 0.15, life: 1 }); }
    for (let i = embers.length - 1; i >= 0; i--) { const e = embers[i]; e.y -= 0.35; e.x += e.vx + Math.sin((clock + i * 300) / 400) * 0.08; e.life -= 0.008; if (e.life <= 0) embers.splice(i, 1); }
  }

  // ---------- DOM ----------
  const statusEl = document.getElementById("status"), readEl = document.getElementById("readout"), modeEl = document.getElementById("mode");
  let readoutDirty = true;
  function refreshDom() {
    if (readoutDirty) { readEl.innerHTML = log.length ? log.map(l => `<div>${l}</div>`).join("") : '<div>Waiting for the first attack&hellip;</div>'; readoutDirty = false; }
    modeEl.textContent = sf.busy() ? "editor open: arrows + Z, or drag a unit" : acts.length ? "resolving" : "press 1-4 to attack, E to re-form";
  }
  function rulesTable() {
    const P = sf.params(), mul = v => "×" + (+v).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
    document.getElementById("rules").innerHTML = `<tr><th>attack</th><th>front row</th><th>back row</th></tr>
      <tr><td>melee</td><td class="f">hit ${mul(P.frontMelee)}</td><td class="k">${P.backGuard === "on" ? "shielded while the front stands" : "hit ×1"}</td></tr>
      <tr><td>ranged</td><td class="f">hit ×1</td><td class="k">hit ${mul(P.backWeak)}</td></tr>
      <tr><td>magic</td><td class="f">hit ×1</td><td class="k">hit ${mul(P.backWeak)}</td></tr>
      <tr><td colspan="3" style="color:var(--dim)">melee from the back row: ${P.backMelee > 0 ? mul(P.backMelee) + " power" : "not possible"}</td></tr>`;
  }
  function setParam(k, v) { PARAMS[k] = v; sf.setParams({ [k]: v }); syncControls(); rulesTable(); }
  function syncControls() {
    document.querySelectorAll("input[type=range][data-k]").forEach(el => {
      el.value = PARAMS[el.dataset.k]; el.parentElement.querySelector("output").textContent = (+PARAMS[el.dataset.k]).toString();
      el.style.setProperty("--fill", ((el.value - el.min) / (el.max - el.min) * 100) + "%");
    });
    for (const id of ["backGuard", "autoArrange", "tags"]) document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute("aria-checked", String(b.dataset.v === PARAMS[id])));
  }
  document.querySelectorAll("input[type=range][data-k]").forEach(el => el.addEventListener("input", () => setParam(el.dataset.k, +el.value)));
  for (const id of ["backGuard", "autoArrange", "tags"]) document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener("click", () => setParam(id, b.dataset.v)));
  const VARIANTS = [["Classic rows", { backGuard: "on", backWeak: 1.25, backMelee: 0.5 }], ["Hard wall", { backGuard: "on", backWeak: 1.5, backMelee: 0 }], ["Soft rows", { backGuard: "off", backWeak: 1.15, backMelee: 0.75 }]];
  const vEl = document.getElementById("variants");
  for (const [name, p] of VARIANTS) { const b = document.createElement("button"); b.textContent = name; b.onclick = () => { for (const k in p) PARAMS[k] = p[k]; sf.setParams(p); syncControls(); rulesTable(); }; vEl.appendChild(b); }
  document.querySelectorAll("[data-k].key").forEach(b => b.addEventListener("click", () => { stopScript("buttons"); pending.push(b.dataset.k); }));
  document.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => { stopScript("attack buttons"); pending.push("act:" + b.dataset.a); }));
  document.getElementById("edit").addEventListener("click", () => { stopScript("editor"); pending.push("edit"); });
  document.getElementById("replay").addEventListener("click", () => { script.on = true; script.T = 0; if (sf.busy()) sf.cancel(); statusEl.textContent = "demo script"; log.length = 0; readoutDirty = true; });
  const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", z: "ok", Z: "ok", Enter: "ok", " ": "ok", x: "back", X: "back", Escape: "back", e: "edit", E: "edit", 1: "act:melee", 2: "act:ranged", 3: "act:magic", 4: "act:strike" };
  addEventListener("keydown", e => { const k = KEYS[e.key]; if (!k || e.target.tagName === "INPUT") return; e.preventDefault(); if (e.repeat) return; stopScript("keyboard"); pending.push(k); });
  cv.addEventListener("pointerdown", () => { if (sf.busy()) stopScript("drag and drop"); });

  // integer scale for the pixel canvas (fractional only below 320 px)
  // integer scale on wide screens; on phones fill the width (bigger touch targets beat whole pixels there)
  function fitCanvas() { const w = cv.parentElement.clientWidth, k = Math.floor(w / W); cv.style.width = k >= 2 ? W * k + "px" : "100%"; cv.style.margin = "0 auto"; }
  addEventListener("resize", fitCanvas); fitCanvas();
  syncControls(); rulesTable();
  reset();
  if (FROZEN) {
    const n = Math.floor(FREEZE / STEP);
    for (let i = 0; i < n; i++) step();
    render(); refreshDom();
    statusEl.textContent = "frozen at t=" + FREEZE + " ms";
  } else {
    let last = performance.now(), acc = 0;
    const loop = now => {
      acc += Math.min(250, now - last); last = now;
      while (acc >= STEP) { step(); acc -= STEP; }
      render(); refreshDom();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  /* text state for critics and tools/sprites/statecheck.py: facing = faceOf(u), the value drawUnit() mirrors by;
     target = the unit it is attacking now (other squad), else the mean x of the other squad still standing */
  window.__state = () => ({ t: Math.round(clock), actors: PARTY.concat(FOES).map(u => {
    const a = acts[0], foes = PARTY.concat(FOES).filter(v => v.team !== u.team && v.hp > 0), hm = placeOf(u);
    const tg = a && a.started && a.att === u && a.target && a.target.team !== u.team ? a.target.id + "-" + a.target.cls : null;
    const o = { id: u.id + "-" + u.cls, x: Math.round(u.px + u.push + u.lunge), y: Math.round(u.py), facing: faceOf(u), target: tg || (foes.length ? Math.round(foes.reduce((n, v) => n + v.px, 0) / foes.length) : null) };
    if (u.px !== hm.x) o.vx = u.px - hm.x;
    if (u.hp <= 0) o.noFace = "fallen (lying on its back)";
    return o; }) });
  window.__demo = () => ({ rects: sf.rects(), busy: sf.busy(), state: sf.state(), script: script.on, T: Math.round(script.T), party: sf.getSquad("party").slots.map(u => u && u.name), stats: sf.stats() });
})();
