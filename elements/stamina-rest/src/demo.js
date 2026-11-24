"use strict";
// G-10 stamina-rest demo: a dusk frontier with two blue and two red squads (turn clock), or one hero and training
// dummies (real-time clock). Everything about stamina (pips, rest, exhaustion, sites, captures) comes from the module;
// this page only plays a tiny tactics game around it. Deterministic: fixed 60 Hz steps from t = 0, no Math.random.
const qs = new URLSearchParams(location.search);
const FREEZE = qs.has("t") && qs.get("freeze") === "1", T0 = qs.has("t") ? Math.max(0, +qs.get("t") || 0) : 0;
const LOG = qs.get("log") === "1";
const VW = 640, VH = 360, TILE = 60, COLS = 11, ROWS = 6, MOVE = 3, STEP = 1000 / 60;
const FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
const cv = document.getElementById("game"), ctx = cv.getContext("2d");

// ------------------------------------------------------------------ params (URL overrides, live controls)
const D = GameDNA_StaminaRest.defaults;
let CLOCK = qs.get("clock") === "realtime" ? "realtime" : "turn";
const PKEYS = [
  { key: "pace", label: "Pace (sets the costs below for this clock)", options: ["standard", "camp", "forgiving", "harsh"] },
  { key: "max", label: "Max pips", min: 3, max: 10, step: 1 },
  { key: "engage", label: "Attack cost", min: 0.25, max: 4, step: 0.25 },
  { key: "march", label: "March cost (turn: per move · real-time: per tile)", min: 0, max: 2, step: 0.01 },
  { key: "regen", label: "Regen (per phase · per second)", min: 0, max: 3, step: 0.1 },
  { key: "rest", label: "Rest bonus in an owned site", min: 0, max: 6, step: 0.5 },
  { key: "recoverAt", label: "Exhausted until back at", min: 0.5, max: 6, step: 0.5 },
  { key: "rule", label: "At zero", options: ["noAttack", "slow", "both"] },
  { key: "show", label: "Show pips", options: ["always", "used", "low"] },
  { key: "render", label: "Render", options: ["auto", "crisp", "smooth"] },
  { key: "tags", label: "Tags", options: ["on", "off"] },
];
const userP = {};
for (const p of PKEYS) if (qs.has(p.key)) userP[p.key] = p.options ? qs.get(p.key) : +qs.get(p.key);
// The real-time demo starts on the "camp" pace (slow regen outside sites) so the rest loop is easy to see.
function paramsFor(clock) { const o = { pace: userP.pace || (clock === "realtime" ? "camp" : "standard") }; for (const p of PKEYS) if (p.key in userP && p.key !== "pace") o[p.key] = userP[p.key]; return o; }

// ------------------------------------------------------------------ deterministic helpers
const hash = (a, b) => { let h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ease = u => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
function log(...a) { if (LOG) console.log("[t=" + Math.round(world.t) + "]", ...a); }

// ------------------------------------------------------------------ map
const MAP = [   // 60 px tiles: the squads are drawn large enough to read (the last column is half off screen)
  "TT..T~####T",
  "T..S.~#oo#T",
  "=====b=====",
  ".....~....T",
  ".....b...TT",
  "TT...~.TTTT",
];
const at = (c, r) => (r < 0 || c < 0 || r >= ROWS || c >= COLS) ? "T" : MAP[r][c];
const solid = (c, r) => "T~#S".includes(at(c, r));
const SITES = [
  { id: "camp", kind: "camp", x: 1 * TILE, y: 3 * TILE, w: 2 * TILE, h: 2 * TILE, owner: "blue" },
  { id: "shrine", kind: "shrine", x: 3.5 * TILE, y: 1 * TILE + 36, r: 64, owner: null },   // the pillar stands on its own (solid) tile
  { id: "outpost", kind: "outpost", x: 7 * TILE, y: 1 * TILE, w: 2 * TILE, h: 1 * TILE, owner: "red" },
];

// ------------------------------------------------------------------ world
const KINDS = {
  lancers: { name: "Lancers", side: "blue", look: "lancer", body: "#3f78d8", trim: "#e8c45a", atk: 6 },
  rangers: { name: "Rangers", side: "blue", look: "ranger", body: "#2f9a8a", trim: "#d8e8a0", atk: 5 },
  raiders: { name: "Raiders", side: "red", look: "raider", body: "#c0442e", trim: "#3a2a20", atk: 5 },
  brutes: { name: "Brutes", side: "red", look: "brute", body: "#8a3a7a", trim: "#d0a060", atk: 6 },
};
let world, stamina, px;
function newWorld() {
  world = { t: 0, clock: CLOCK, turn: 1, side: "blue", phase: "banner", phaseT: 0, queue: [], act: null, wait: 0, fx: [], over: null, selected: null, manual: world ? world.manual : false, reach: null };
  if (CLOCK === "turn") {
    world.squads = [
      { id: "lancers", c: 2, r: 3 }, { id: "rangers", c: 1, r: 4 }, { id: "raiders", c: 8, r: 3 }, { id: "brutes", c: 8, r: 1 },
    ].map(s => Object.assign({ hp: 40, maxHp: 40, x: s.c * TILE, y: s.r * TILE, lunge: [0, 0], flash: 0, face: KINDS[s.id].side === "blue" ? 1 : -1 }, KINDS[s.id], s));
  } else {
    world.hero = { x: 2 * TILE + 10, y: 4 * TILE + 20, face: 0, cd: 0, swing: null, walk: 0, moving: false, goal: "dummy", goalT: 0, idle: 99999 };
    world.dummies = [{ x: 4 * TILE + 20, y: 3 * TILE + 46, wob: 0 }, { x: 4 * TILE - 10, y: 5 * TILE + 10, wob: 0 }];
    world.lap = 0;
  }
  makeStamina();
  if (CLOCK === "turn") beginPhase("blue");
}
function makeStamina() {
  stamina = GameDNA_StaminaRest.create({
    clock: CLOCK, bounds: { x: 0, y: 0, w: VW, h: VH }, tile: TILE,
    units: () => CLOCK === "turn"
      ? world.squads.filter(s => s.hp > 0).map(s => ({ id: s.id, side: s.side, x: s.x + 5 + s.lunge[0], y: s.y + 2 + s.lunge[1], w: 50, h: 56, foot: { x: s.x + 30, y: s.y + 50 } }))
      : [{ id: "hero", side: "blue", x: world.hero.x - 14, y: world.hero.y - 50, w: 28, h: 52, foot: { x: world.hero.x, y: world.hero.y } }],
    sites: () => SITES,
    uiRects: () => uiRects(),
    params: paramsFor(CLOCK),
    onExhausted: id => log("exhausted", id), onRecovered: id => log("recovered", id),
    onRest: (id, g, site) => log("rest", id, g, site), onCapture: (site, side) => log("capture", site, side), onRefused: id => log("refused", id),
  });
}
function uiRects() {
  const r = [{ x: 8, y: 8, w: 168, h: 40 }];
  if (world && world.phase === "banner" && CLOCK === "turn") r.push({ x: 0, y: 290, w: VW, h: 44 });
  if (world && world.over) r.push({ x: 0, y: 140, w: VW, h: 80 });
  return r;
}
const live = side => world.squads.filter(s => s.hp > 0 && (!side || s.side === side));
const squadAt = (c, r) => world.squads.find(s => s.hp > 0 && Math.round(s.x / TILE) === c && Math.round(s.y / TILE) === r);
const tileOf = s => [Math.round(s.x / TILE), Math.round(s.y / TILE)];
const adj = (a, b) => { const [ac, ar] = tileOf(a), [bc, br] = tileOf(b); return Math.abs(ac - bc) + Math.abs(ar - br) === 1; };

// BFS over free tiles (friends passable, foes not), up to `mv` steps
function reach(s, mv) {
  const [c0, r0] = tileOf(s), seen = new Map([[c0 + "," + r0, null]]), q = [[c0, r0, 0]], out = [];
  while (q.length) {
    const [c, r, d] = q.shift(); out.push({ c, r, d });
    if (d >= mv) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = nc + "," + nr;
      if (seen.has(k) || solid(nc, nr)) continue;
      const o = squadAt(nc, nr); if (o && o.side !== s.side) continue;
      seen.set(k, [c, r]); q.push([nc, nr, d + 1]);
    }
  }
  return { tiles: out.filter(t => !squadAt(t.c, t.r) || squadAt(t.c, t.r) === s), prev: seen };
}
function pathTo(R, c, r) { const out = []; let k = c + "," + r; while (k) { const [x, y] = k.split(",").map(Number); out.unshift([x, y]); const p = R.prev.get(k); k = p ? p[0] + "," + p[1] : null; } return out; }
function distField(goals) {   // steps from every tile to the nearest goal tile, ignoring units
  const d = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity)), q = [];
  for (const [c, r] of goals) if (!solid(c, r)) { d[r][c] = 0; q.push([c, r]); }
  while (q.length) { const [c, r] = q.shift(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (!solid(nc, nr) && d[nr][nc] === Infinity) { d[nr][nc] = d[r][c] + 1; q.push([nc, nr]); } } }
  return d;
}
function siteTiles(site) {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * TILE + TILE / 2, y = r * TILE + TILE * 0.6;
    if (site.r ? Math.hypot(x - site.x, y - site.y) <= site.r : x >= site.x && x < site.x + site.w && y >= site.y && y < site.y + site.h) out.push([c, r]);
  }
  return out;
}

// ------------------------------------------------------------------ turn clock: AI (blue autoplay uses it too)
function plan(s) {
  const foes = live(s.side === "blue" ? "red" : "blue"), st = stamina.stamina(s.id), R = reach(s, MOVE);
  const hereSite = st.site && (stamina.owner(st.site) === s.side);
  const nextTo = foes.filter(f => adj(s, f));
  if (!stamina.canAttack(s.id)) {   // exhausted: fall back to the nearest site this side may rest at
    const site = stamina.nearestSite(s.id), def = SITES.find(x => site && x.id === site.id);
    if (!def || hereSite) return { move: null, target: null };
    const tryFirst = nextTo.length && !s.triedTired ? nextTo[0] : null;
    const d = distField(siteTiles(def).filter(([c, r]) => !squadAt(c, r) || squadAt(c, r) === s));
    let best = R.tiles[0]; for (const t of R.tiles) if (d[t.r][t.c] < d[best.r][best.c]) best = t;
    return { move: best, target: null, why: "rest", tryFirst };
  }
  s.triedTired = false;
  if (hereSite && st.value < st.max - 1 && !nextTo.length) return { move: null, target: null, why: "resting" };
  if (nextTo.length) return { move: null, target: nextTo.sort((a, b) => a.hp - b.hp)[0] };
  // the rangers go to light the shrine first
  const shrine = SITES[1];
  const goal = s.id === "rangers" ? (stamina.owner("shrine") !== s.side ? shrine : stamina.owner("outpost") !== s.side && !live("red").some(f => f.id === "brutes") ? SITES[2] : null) : null;
  if (goal) {
    const d = distField(siteTiles(goal)); let best = R.tiles[0]; for (const t of R.tiles) if (d[t.r][t.c] < d[best.r][best.c]) best = t;
    return { move: best, target: null, why: "objective" };
  }
  const goals = []; for (const f of foes) { const [c, r] = tileOf(f); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) goals.push([c + dc, r + dr]); }
  const d = distField(goals); let best = R.tiles[0];
  for (const t of R.tiles) if (d[t.r][t.c] < d[best.r][best.c] || (d[t.r][t.c] === d[best.r][best.c] && t.d < best.d)) best = t;
  const after = foes.filter(f => { const [c, r] = tileOf(f); return Math.abs(c - best.c) + Math.abs(r - best.r) === 1; });
  return { move: best, target: after.sort((a, b) => a.hp - b.hp)[0] || null, R };
}
function beginPhase(side) {
  world.side = side; world.phase = "banner"; world.phaseT = 0;
  if (side === "blue" && world.turnStarted) world.turn++;
  world.turnStarted = true;
  world.queue = live(side).slice(); world.selected = null; world.reach = null;
  world.squads.forEach(s => { s.done = false; s.moved = false; }); world.endReq = false;
}
function doMove(s, tile, then) {
  const [c0, r0] = tileOf(s);
  if (!tile || (tile.c === c0 && tile.r === r0)) { then(false); return; }
  const R = reach(s, MOVE), path = pathTo(R, tile.c, tile.r);
  world.act = { kind: "walk", s, path, t: 0, then: () => { stamina.march(s.id); then(true); } };
}
function doAttack(att, def, then) {
  if (!stamina.engage(att.id)) { world.wait = 32; then(false); return; }   // too tired: the action becomes a wait
  world.act = { kind: "fight", att, def, t: 0, then: () => then(true) };
}
function hitFor(att, def, k) { return Math.max(1, Math.round(att.atk * k) + Math.floor(hash(world.t | 0, att.atk) * 3)); }
function stepAct(dt) {
  const a = world.act; a.t += dt;
  if (a.kind === "walk") {
    const per = 210, seg = Math.floor(a.t / per), f = (a.t % per) / per;
    if (seg >= a.path.length - 1) { const [c, r] = a.path[a.path.length - 1]; a.s.x = c * TILE; a.s.y = r * TILE; world.act = null; a.then(); return; }
    const [c0, r0] = a.path[seg], [c1, r1] = a.path[seg + 1];
    a.s.x = (c0 + (c1 - c0) * f) * TILE; a.s.y = (r0 + (r1 - r0) * f) * TILE; if (c1 !== c0) a.s.face = Math.sign(c1 - c0);
    return;
  }
  const { att, def } = a, dx = Math.sign(def.x - att.x), dy = Math.sign(def.y - att.y), push = k => Math.sin(clamp(k / 260, 0, 1) * Math.PI) * 11;
  if (dx) att.face = dx;
  att.lunge = a.t < 260 ? [dx * push(a.t), dy * push(a.t)] : [0, 0];
  if (!a.hit && a.t >= 130) { a.hit = true; const n = hitFor(att, def, 1); def.hp = Math.max(0, def.hp - n); def.flash = 160; addFx(def, n); a.counter = def.hp > 0 && stamina.engage(def.id, "counter"); }
  if (a.counter && a.t >= 420 && a.t < 680) def.lunge = [-dx * push(a.t - 420), -dy * push(a.t - 420)];
  if (a.counter && !a.chit && a.t >= 550) { a.chit = true; const n = hitFor(def, att, 0.6); att.hp = Math.max(0, att.hp - n); att.flash = 160; addFx(att, n); }
  if (a.t >= (a.counter ? 820 : 520)) { att.lunge = def.lunge = [0, 0]; world.act = null; a.then(); }
}
function addFx(s, n) { world.fx.push({ x: s.x + 30, y: s.y + 12, n, t: 0 }); }   // over the bodies, below the strip
function finishSquad(s) { s.done = true; world.wait = 300; if (checkOver()) return; }
function checkOver() {
  if (!live("red").length || !live("blue").length) { world.over = { win: !!live("blue").length, t: 0 }; log("over", world.over.win); return true; }
  return false;
}
function runSide(dt) {
  if (world.act) { stepAct(dt); return; }
  if (world.wait > 0) { world.wait -= dt; return; }
  if (world.side === "blue" && world.manual && !world.endReq && live("blue").some(s => !s.done)) return;   // the player acts by clicking; End turn (or every squad done) moves on
  const s = world.queue.shift();
  if (!s) { beginPhase(world.side === "blue" ? "red" : "blue"); return; }
  if (s.hp <= 0) return;
  const p = plan(s);
  log("act", s.id, p.why || "", p.move ? p.move.c + "," + p.move.r : "-", p.target ? p.target.id : "-", p.tryFirst ? "try" : "", JSON.stringify(stamina.stamina(s.id).value));
  if (p.tryFirst) { s.triedTired = true; doAttack(s, p.tryFirst, () => { world.wait = 0; world.queue.unshift(s); }); world.wait = 650; return; }
  doMove(s, p.move, () => {
    const tgt = p.target && p.target.hp > 0 && adj(s, p.target) ? p.target : live(s.side === "blue" ? "red" : "blue").find(f => adj(s, f) && stamina.canAttack(s.id));
    if (tgt && p.why !== "rest" && p.why !== "resting" && p.why !== "objective") doAttack(s, tgt, () => finishSquad(s));
    else finishSquad(s);
  });
}

// ------------------------------------------------------------------ real-time clock: hero and dummies
const keys = new Set(); let keyTap = false;
addEventListener("keydown", e => {
  const k = { ArrowUp: "u", w: "u", ArrowDown: "d", s: "d", ArrowLeft: "l", a: "l", ArrowRight: "r", d: "r", z: "z", Z: "z", " ": "z" }[e.key];
  if (!k || CLOCK !== "realtime") return; e.preventDefault(); if (k === "z") keyTap = true; else keys.add(k); if (world.hero) world.hero.idle = 0;
});
addEventListener("keyup", e => { const k = { ArrowUp: "u", w: "u", ArrowDown: "d", s: "d", ArrowLeft: "l", a: "l", ArrowRight: "r", d: "r" }[e.key]; if (k) keys.delete(k); });
function heroBlocked(x, y) { const c = Math.floor(x / TILE), r = Math.floor(y / TILE); return solid(c, r) || x < 14 || y < 30 || x > VW - 14 || y > VH - 6; }
function stepHero(dt) {
  const H = world.hero; H.idle += dt; H.goalT += dt;
  let mx = 0, my = 0, swing = false;
  if (H.idle < 4000) { mx = (keys.has("r") ? 1 : 0) - (keys.has("l") ? 1 : 0); my = (keys.has("d") ? 1 : 0) - (keys.has("u") ? 1 : 0); swing = keyTap; }
  else {   // autoplay: swing at the dummies until winded, rest at the camp, light the shrine, take the outpost
    const st = stamina.stamina("hero"), D0 = world.dummies[world.lap % 2];
    let tx = D0.x - 36, ty = D0.y + 3;
    if (H.goal === "dummy" && st.exhausted && H.goalT > 1400) { H.goal = world.lap % 3 === 1 ? "shrine" : world.lap % 3 === 2 ? "outpost" : "camp"; H.goalT = 0; log("hero goal", H.goal); }
    if (H.goal === "camp") { tx = 1.5 * TILE; ty = 4.45 * TILE; }
    if (H.goal === "shrine") { tx = 2.5 * TILE + 8; ty = 1 * TILE + 42; }
    if (H.goal === "outpost") { tx = 8 * TILE; ty = 1 * TILE + 44; if (H.y < 2 * TILE + 18 && !(H.x > 7 * TILE + 9 && H.x < 9 * TILE - 9)) ty = 2 * TILE + 33; }   // in through the gate
    const dx = tx - H.x, dy = ty - H.y, d = Math.hypot(dx, dy);
    if (H.goal !== "dummy" && d <= 12 && !st.exhausted && st.value >= st.max - 0.05 && stamina.owner(H.goal) === "blue") { H.goal = "dummy"; H.goalT = 0; world.lap++; log("hero goal dummy"); }
    if (d > 6) { mx = Math.abs(dx) > 4 ? Math.sign(dx) : 0; my = Math.abs(dy) > 4 ? Math.sign(dy) : 0; }
    // route around the river: use the road bridge
    const BY = 2 * TILE + 33, side = x => x < 5 * TILE ? 0 : x >= 6 * TILE ? 2 : 1;
    if (side(H.x) !== side(tx) && Math.abs(H.y - BY) > 5) { mx = side(H.x) === 1 ? Math.sign(tx - H.x) : 0; my = Math.sign(BY - H.y); if (side(H.x) !== 1 && Math.abs(H.x - (side(H.x) ? 6 * TILE + 12 : 5 * TILE - 12)) > 45) mx = Math.sign(tx - H.x); }
    if (H.goal === "dummy" && d <= 9) { H.face = 0; swing = H.cd <= 0; mx = my = 0; }
    const site = SITES.find(q => q.id === H.goal); if (site && d <= 6 && Math.abs(site.x - H.x) > 4) H.face = site.x > H.x ? 0 : Math.PI;   // resting at a site: look at its fire / pillar, not the way he walked in
  }
  keyTap = false;
  if (H.cd > 0) H.cd -= dt;
  if (mx || my) {
    const sp = 3.45 * stamina.speedScale("hero") / Math.hypot(mx, my) * dt / STEP;
    const nx = H.x + mx * sp, ny = H.y + my * sp;
    let moved = false;
    if (!heroBlocked(nx, H.y)) { H.x = nx; moved = true; } if (!heroBlocked(H.x, ny)) { H.y = ny; moved = true; }
    H.moving = moved; if (moved) H.walk += dt; if (mx) H.face = mx > 0 ? 0 : Math.PI;   // a straight up / down step keeps the last side (the figure only has side views; +-PI/2 used to snap it to the right)
  } else H.moving = false;
  if (swing && H.cd <= 0) {
    if (stamina.engage("hero")) {
      H.swing = { t: 0 }; H.cd = 360 / stamina.speedScale("hero");
      for (const dm of world.dummies) if (Math.hypot(dm.x - H.x, dm.y - H.y) < 69) { dm.wob = 1; world.fx.push({ x: dm.x + 12 + (world.fx.length % 3) * 9, y: dm.y - 30 - (world.fx.length % 2) * 10, n: 3 + Math.floor(hash(world.t | 0, 7) * 3), t: 0 }); }
    } else H.cd = 200;
  }
  if (H.swing) { H.swing.t += dt; if (H.swing.t > 240) H.swing = null; }
  for (const dm of world.dummies) dm.wob = Math.max(0, dm.wob - dt / 600);
}

// ------------------------------------------------------------------ step
var __hx = null, __hvx = 0;
function step(dt) { stepWorld(dt); if (world.hero) { __hvx = __hx === null ? 0 : world.hero.x - __hx; __hx = world.hero.x; } }   // __hvx: hero x speed, read only by __state()
function stepWorld(dt) {
  world.t += dt;
  pxStep(dt);
  stamina.update(dt);
  for (const f of world.fx) f.t += dt; world.fx = world.fx.filter(f => f.t < 900);
  if (CLOCK === "turn") {
    for (const s of world.squads) if (s.flash > 0) s.flash -= dt;
    if (world.over) { world.over.t += dt; if (world.over.t > 2600) newWorld(); return; }
    world.phaseT += dt;
    if (world.phase === "banner") { if (world.phaseT > 1100) { world.phase = "act"; world.phaseT = 0; stamina.turnStart(world.side); world.wait = world.turn === 1 && world.side === "blue" ? 400 : 700; } return; }   // control returns: rest, regen and captures play now, then the side acts
    runSide(dt);
  } else stepHero(dt);
}

// ------------------------------------------------------------------ drawing: ground cache at device resolution
let groundCache = null, groundScale = 0;
function buildGround(scale) {
  const c = document.createElement("canvas"); c.width = Math.round(VW * scale); c.height = Math.round(VH * scale);
  const g = c.getContext("2d"); g.setTransform(scale, 0, 0, scale, 0, 0);
  const T = TILE, RY = 2 * T + T / 2;   // road centre line
  const sky = g.createLinearGradient(0, 0, 0, VH); sky.addColorStop(0, "#557a3e"); sky.addColorStop(1, "#3f6232"); g.fillStyle = sky; g.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 200; i++) {   // soft patches
    const x = hash(i, 1) * VW, y = hash(i, 2) * VH, r = 14 + hash(i, 3) * 46;
    g.fillStyle = hash(i, 4) < 0.5 ? "rgba(120,160,80,0.10)" : "rgba(30,60,30,0.12)"; g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill();
  }
  // trampled earth under the camp
  g.fillStyle = "rgba(150,120,80,0.30)"; g.beginPath(); g.ellipse(2 * T, 4 * T, 1.05 * T, 0.8 * T, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(170,140,95,0.28)"; g.beginPath(); g.ellipse(2 * T, 4 * T + 4, 0.7 * T, 0.5 * T, 0, 0, Math.PI * 2); g.fill();
  // road
  g.lineCap = "round"; g.lineJoin = "round";
  const road = (w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    g.moveTo(-20, RY); g.bezierCurveTo(90, RY + 8, 190, RY - 9, 5 * T - 6, RY); g.lineTo(6 * T + 6, RY);
    g.bezierCurveTo(420, RY + 9, 500, RY - 7, 580, RY + 2); g.lineTo(VW + 20, RY + 5);
    g.moveTo(8 * T, RY); g.lineTo(8 * T, 1 * T + 8);                                  // up through the gate
    g.moveTo(2 * T, RY + 2); g.quadraticCurveTo(2 * T - 12, 3 * T + 4, 2 * T, 3 * T + 30);   // down to the camp
    g.stroke();
  };
  road(44, "#6a5236"); road(36, "#a88a5c"); road(22, "#b89a6a");
  for (let i = 0; i < 150; i++) { const x = hash(i, 9) * VW, y = RY - 14 + hash(i, 10) * 28; g.fillStyle = hash(i, 12) < 0.5 ? "rgba(90,70,40,0.35)" : "rgba(220,200,160,0.25)"; g.beginPath(); g.arc(x, y, 1 + hash(i, 11) * 2, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 16; i++) { const x = hash(i, 13) * VW; g.strokeStyle = "rgba(90,70,40,0.28)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, RY - 7); g.quadraticCurveTo(x + 14, RY - 9, x + 30, RY - 6); g.moveTo(x + 6, RY + 8); g.quadraticCurveTo(x + 22, RY + 6, x + 38, RY + 9); g.stroke(); }
  // river with banks
  const L = r => 5 * T + 5 + Math.sin(r * 1.3) * 7, R = r => 6 * T - 5 + Math.sin(r * 1.3 + 1) * 7;
  const riverPath = () => { g.beginPath(); g.moveTo(L(-0.5), -12); for (let r = 0; r <= ROWS + 0.5; r += 0.25) g.lineTo(L(r), r * T); for (let r = ROWS + 0.5; r >= -0.5; r -= 0.25) g.lineTo(R(r), r * T); g.closePath(); };
  g.save(); g.shadowColor = "rgba(0,0,0,0.35)"; g.shadowBlur = 8; riverPath(); g.fillStyle = "#5a4a32"; g.fill(); g.restore();
  g.save(); riverPath(); g.clip();
  const wg = g.createLinearGradient(5 * T, 0, 6 * T, 0); wg.addColorStop(0, "#2c5f80"); wg.addColorStop(0.5, "#3f86b0"); wg.addColorStop(1, "#2c5f80");
  g.fillStyle = wg; g.fillRect(5 * T - 20, 0, T + 40, VH);
  for (let i = 0; i < 26; i++) { const x = 5 * T + 8 + hash(i, 51) * (T - 16), y = hash(i, 52) * VH; g.fillStyle = "rgba(20,50,80,0.30)"; g.beginPath(); g.ellipse(x, y, 3 + hash(i, 53) * 6, 9 + hash(i, 54) * 16, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = "rgba(20,40,30,0.45)"; g.lineWidth = 6; riverPath(); g.stroke();
  g.strokeStyle = "rgba(200,235,255,0.22)"; g.lineWidth = 1.5; g.beginPath(); for (let r = -0.5; r <= ROWS + 0.5; r += 0.25) g.lineTo(L(r) + 6, r * T); g.stroke();
  g.restore();
  for (let i = 0; i < 22; i++) {   // reeds and stones on the banks
    const r = hash(i, 61) * ROWS, left = i % 2 === 0, x = left ? L(r) - 3 - hash(i, 62) * 5 : R(r) + 3 + hash(i, 62) * 5, y = r * T;
    if ((y > 2 * T - 8 && y < 3 * T + 8) || (y > 4 * T - 8 && y < 5 * T + 8)) continue;
    if (i % 3 === 0) { g.fillStyle = "#8f8a80"; g.beginPath(); g.ellipse(x, y, 4.5, 3, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.ellipse(x - 1, y - 1, 2.4, 1.2, 0, 0, Math.PI * 2); g.fill(); }
    else { g.strokeStyle = "#7fae5a"; g.lineWidth = 1.6; g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(x + k * 2.5, y + 3); g.quadraticCurveTo(x + k * 3.5, y - 5, x + k * 5, y - 10); } g.stroke(); }
  }
  // bridges
  for (const r of [2, 4]) {
    const y = r * T, x0 = 5 * T - 10, w = T + 20, n = 10, pw = w / n;
    g.fillStyle = "rgba(0,0,0,0.32)"; g.fillRect(x0, y + 10, w, T - 8);
    for (let k = 0; k < n; k++) {
      g.fillStyle = k % 2 ? "#8a5f36" : "#9a6c40"; g.fillRect(x0 + k * pw, y + 5, pw, T - 10);
      g.fillStyle = "rgba(255,230,180,0.16)"; g.fillRect(x0 + k * pw, y + 5, 1.2, T - 10);
      g.fillStyle = "rgba(40,24,12,0.5)"; g.fillRect(x0 + k * pw + pw / 2 - 0.8, y + 12, 1.6, 1.6); g.fillRect(x0 + k * pw + pw / 2 - 0.8, y + T - 14, 1.6, 1.6);
    }
    for (const yy of [y + 2, y + T - 8]) {   // rails
      g.fillStyle = "#4a2e18"; g.fillRect(x0 - 2, yy, w + 4, 6); g.fillStyle = "#b08050"; g.fillRect(x0 - 2, yy, w + 4, 2);
      for (const xx of [x0 - 3, x0 + w / 2 - 3, x0 + w - 3]) { g.fillStyle = "#3a2412"; g.fillRect(xx, yy - 3, 6, 10); g.fillStyle = "#c09058"; g.fillRect(xx, yy - 3, 6, 2); }
    }
  }
  // outpost courtyard flagstones
  for (let c2 = 7; c2 <= 8; c2++) for (let k = 0; k < 6; k++) {
    const x = c2 * T + (k % 3) * 20, y = T + Math.floor(k / 3) * 30 - 2;
    g.fillStyle = (c2 + k) % 3 ? "#8c8270" : "#9a907c"; g.beginPath(); g.roundRect(x + 1, y + 1, 18, 28, 2); g.fill(); g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(x + 2, y + 1, 16, 2);
  }
  // grass blades and flowers
  const off = (x, y) => { const c2 = Math.floor(x / T), r = Math.floor(y / T); return "=~#ob".includes(at(c2, r)) || Math.abs(y - RY) < 24 || (x > 5 * T - 12 && x < 6 * T + 12); };
  g.strokeStyle = "rgba(150,190,100,0.55)"; g.lineWidth = 1.5;
  for (let i = 0; i < 380; i++) {
    const x = hash(i, 21) * VW, y = hash(i, 22) * VH; if (off(x, y)) continue;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y - 7); g.moveTo(x + 3, y); g.lineTo(x + 4.5, y - 9); g.moveTo(x + 6, y); g.lineTo(x + 8, y - 6); g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const x = hash(i, 31) * VW, y = hash(i, 32) * VH; if (off(x, y)) continue;
    g.fillStyle = ["#f2e6a0", "#e8a0b0", "#b8c8f0"][i % 3]; for (const [dx, dy] of [[0, -2.2], [2.2, 0], [0, 2.2], [-2.2, 0]]) { g.beginPath(); g.arc(x + dx, y + dy, 1.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#f6d060"; g.beginPath(); g.arc(x, y, 1.2, 0, Math.PI * 2); g.fill();
  }
  return c;
}

// ------------------------------------------------------------------ drawing: props, squads, hero
function tree(x, y, s) {
  ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(x + 3, y + 2, 17 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4a3020"; ctx.fillRect(x - 3 * s, y - 12 * s, 6 * s, 13 * s);
  const blobs = [[0, -24, 15], [-9, -18, 11], [9, -17, 11], [0, -32, 10]];
  ctx.fillStyle = "#1f4a2a"; for (const [bx, by, br] of blobs) { ctx.beginPath(); ctx.arc(x + bx * s, y + by * s + 1.5, br * s + 1.5, 0, Math.PI * 2); ctx.fill(); }
  for (const [bx, by, br] of blobs) { const g = ctx.createRadialGradient(x + bx * s - 4, y + by * s - 5, 1, x + bx * s, y + by * s, br * s); g.addColorStop(0, "#5f9a4a"); g.addColorStop(1, "#2e6436"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + bx * s, y + by * s, br * s, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "rgba(170,215,120,0.35)"; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + (hash(i, x | 0) - 0.6) * 18 * s, y - (20 + hash(i, y | 0) * 16) * s, 2.2 * s, 0, Math.PI * 2); ctx.fill(); }
}
function wallBlock(x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#a49a8a"); g.addColorStop(1, "#6e665a");
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x + 4, y + 8, w, h);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(40,34,28,0.55)"; ctx.lineWidth = 1.2;
  for (let yy = y + 11, k = 0; yy < y + h + 1; yy += 11, k++) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); for (let xx = x + (k % 2 ? 9 : 18); xx < x + w; xx += 18) { ctx.beginPath(); ctx.moveTo(xx, yy - 11); ctx.lineTo(xx, Math.min(yy, y + h)); ctx.stroke(); } }
  ctx.fillStyle = "#c2b8a4"; ctx.fillRect(x, y, w, 4);
  for (let xx = x; xx < x + w - 6; xx += 14) { ctx.fillStyle = "#b0a692"; ctx.fillRect(xx, y - 7, 9, 7); ctx.fillStyle = "#cfc6b2"; ctx.fillRect(xx, y - 7, 9, 2); }
}
function tent(x, y, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.5, 1.5);
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(2, 2, 17, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(0, -22); ctx.lineTo(16, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(16, 0); ctx.lineTo(3, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(60,40,24,0.35)"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(0, -22); ctx.moveTo(9.5, 0); ctx.lineTo(0, -22); ctx.stroke();
  ctx.fillStyle = "#2a1c12"; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(0, -11); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#e8dcc0"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -26); ctx.stroke();
  ctx.restore();
}
const shade = (hex, k) => "#" + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("");
// One drawn soldier, about 44 px tall at k = 1, feet centre at (x, y). o: body, trim, look, face, bob, tired, flash, k, ph (walk phase), swing
function figure(x, y, o) {
  const k = o.k || 1, F = c => o.flash ? "#ffffff" : c, ink = o.flash ? "#ffffff" : "#1d1826", look = o.look;
  const circ = (cx, cy, r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); };
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.30)"; ctx.beginPath(); ctx.ellipse(0, 1, 11 * k, 3.6 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(o.face * k, k); ctx.lineJoin = "round"; ctx.lineCap = "round";
  const sw = o.ph != null ? Math.sin(o.ph) : 0;
  for (const sgn of [-1, 1]) {   // legs and boots
    const lx = sgn * 3.6 + sgn * sw * 2.4, lift = Math.max(0, sgn * sw) * 2.6;
    ctx.fillStyle = F("#3b3446"); ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.roundRect(lx - 2.8, -11, 5.6, 9.5 - lift, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F("#241c22"); ctx.beginPath(); ctx.roundRect(lx - 3, -4.6 - lift, 7.4, 4.6, 2); ctx.fill();
  }
  ctx.translate(0, -10 + o.bob); if (o.tired) ctx.rotate(0.2);
  const dark = shade(o.body, 0.55), lite = shade(o.body, 1.0);
  // on the back
  if (look === "ranger") {
    ctx.save(); ctx.translate(-7.5, -9); ctx.rotate(-0.35); ctx.fillStyle = F("#7a5230"); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-2.6, -8, 5.2, 13, 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = F("#e8e2c8"); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-1.2, -8); ctx.lineTo(-1.6, -12); ctx.moveTo(1.2, -8); ctx.lineTo(1.6, -12.5); ctx.stroke(); ctx.restore();
  }
  if (look === "lancer" || look === "hero") {   // short cape
    ctx.fillStyle = F(look === "hero" ? "#b23a3a" : dark); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -15); ctx.quadraticCurveTo(-13, -8, -11.5 - sw, 0.5); ctx.lineTo(-3, -1); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // torso
  const tg = ctx.createLinearGradient(0, -16, 0, 1); tg.addColorStop(0, F(lite)); tg.addColorStop(1, F(dark));
  ctx.fillStyle = tg; ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(-8, -16, 16, 16.5, 5.5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = F(o.trim); ctx.fillRect(-7.3, -5.4, 14.6, 2.5);
  if (!o.flash) { ctx.fillStyle = "rgba(255,255,255,0.20)"; ctx.beginPath(); ctx.roundRect(-5.8, -14.4, 4.6, 6.5, 2.3); ctx.fill(); }
  if (look === "brute" && !o.flash) { ctx.strokeStyle = "#d0a060"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-6.5, -14); ctx.lineTo(6.5, -6.5); ctx.stroke(); }
  if (look === "raider" && !o.flash) { ctx.fillStyle = "#e6d2a8"; ctx.beginPath(); ctx.moveTo(-3, -16); ctx.lineTo(3, -16); ctx.lineTo(0, -11); ctx.closePath(); ctx.fill(); }
  // head
  const hx = o.tired ? 2.6 : 0.8, hy = -23 + (o.tired ? 2 : 0);
  ctx.fillStyle = F("#f1c9a3"); ctx.strokeStyle = ink; ctx.lineWidth = 1.2; circ(hx, hy, 8.3); ctx.fill(); ctx.stroke();
  if (!o.flash) {
    ctx.fillStyle = "rgba(230,120,110,0.45)"; circ(hx + 5.2, hy + 3.2, 1.6); ctx.fill();
    if (o.tired) { ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + 2.4, hy + 1.4); ctx.lineTo(hx + 5.4, hy + 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(hx + 4.6, hy + 5.6, 1.3, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(hx + 3.8, hy + 0.8, 1.3, 2.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#fff"; circ(hx + 4.2, hy + 0.1, 0.5); ctx.fill(); }
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
  if (look === "lancer") {   // steel helm with a plume
    ctx.fillStyle = F(o.body); ctx.beginPath(); ctx.moveTo(hx, hy - 8.5); ctx.quadraticCurveTo(hx - 8, hy - 16, hx - 12, hy - 7); ctx.quadraticCurveTo(hx - 7, hy - 9.5, hx - 2, hy - 7.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    const hg = ctx.createLinearGradient(0, hy - 9, 0, hy); hg.addColorStop(0, F("#dfe8f0")); hg.addColorStop(1, F("#8a9ab0"));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy - 0.6, 8.9, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(hx + 9.6, hy - 0.4); ctx.lineTo(hx - 9, hy + 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F(o.trim); ctx.fillRect(hx - 8.4, hy - 2.2, 17.2, 1.7);
  } else if (look === "ranger") {   // hood with a tail
    ctx.fillStyle = F(o.body); ctx.beginPath(); ctx.moveTo(hx + 8.6, hy - 2.2); ctx.quadraticCurveTo(hx + 6, hy - 11.5, hx - 1, hy - 10.6); ctx.quadraticCurveTo(hx - 11, hy - 9, hx - 12.5, hy + 3.5); ctx.quadraticCurveTo(hx - 8, hy + 2, hx - 6.6, hy + 6.4); ctx.quadraticCurveTo(hx - 5, hy - 3, hx + 8.6, hy - 2.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = F(o.trim); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(hx + 7.6, hy - 2.9); ctx.quadraticCurveTo(hx - 3, hy - 3.6, hx - 5.6, hy + 4.4); ctx.stroke();
  } else if (look === "raider") {   // dark hair and a red headband with tails
    ctx.fillStyle = F("#2e2220"); ctx.beginPath(); ctx.arc(hx, hy - 0.4, 8.8, Math.PI * 0.92, Math.PI * 2.02); ctx.lineTo(hx + 4, hy - 4); ctx.lineTo(hx - 1, hy - 2.6); ctx.lineTo(hx - 5, hy - 4.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F(o.body); ctx.beginPath(); ctx.roundRect(hx - 9, hy - 5.8, 18, 3, 1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx - 8.6, hy - 5.4); ctx.lineTo(hx - 14.5, hy - 2.2 + sw); ctx.lineTo(hx - 13.4, hy + 1.6 + sw); ctx.lineTo(hx - 8.6, hy - 3.2); ctx.closePath(); ctx.fill();
  } else if (look === "brute") {   // iron cap with horns
    ctx.fillStyle = F("#efe4c8"); for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + sg * 6.2, hy - 5.6); ctx.quadraticCurveTo(hx + sg * 12.4, hy - 7, hx + sg * 11.4, hy - 13.6); ctx.quadraticCurveTo(hx + sg * 8.6, hy - 9.6, hx + sg * 4.6, hy - 8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    const hg = ctx.createLinearGradient(0, hy - 9, 0, hy); hg.addColorStop(0, F("#8a8494")); hg.addColorStop(1, F("#4c4658"));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy - 0.8, 8.9, Math.PI * 1.04, Math.PI * 1.96); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F(o.trim); ctx.fillRect(hx - 8.2, hy - 3.6, 16.6, 1.6); ctx.fillRect(hx + 2.6, hy - 3, 1.8, 4.2);
  } else {   // hero: brown hair, gold circlet
    ctx.fillStyle = F("#6a4428"); ctx.beginPath(); ctx.arc(hx, hy - 0.4, 8.8, Math.PI * 0.86, Math.PI * 2.02); ctx.lineTo(hx + 5, hy - 5); ctx.lineTo(hx + 1, hy - 3); ctx.lineTo(hx - 4, hy - 5); ctx.lineTo(hx - 7.4, hy + 3.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F(o.trim); ctx.fillRect(hx - 8.4, hy - 6.2, 17, 1.6);
  }
  // weapon and the near arm
  ctx.strokeStyle = ink;
  const hand = (ax, ay) => { ctx.strokeStyle = F(dark); ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(5, -12.5); ctx.lineTo(ax, ay); ctx.stroke(); ctx.fillStyle = F("#f1c9a3"); ctx.strokeStyle = ink; ctx.lineWidth = 1; circ(ax, ay, 2.5); ctx.fill(); ctx.stroke(); };
  if (look === "lancer" || look === "raider") {
    ctx.strokeStyle = ink; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(9.4, 6); ctx.lineTo(12, -31); ctx.stroke();
    ctx.strokeStyle = F("#8a6238"); ctx.lineWidth = 1.9; ctx.beginPath(); ctx.moveTo(9.4, 6); ctx.lineTo(12, -31); ctx.stroke();
    ctx.fillStyle = F("#e6edf4"); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(12.6, -40); ctx.lineTo(15.4, -30.6); ctx.lineTo(9, -31); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (look === "lancer") { ctx.fillStyle = F(o.body); ctx.beginPath(); ctx.moveTo(11.8, -29.5); ctx.lineTo(4.6, -27.4 + sw * 0.6); ctx.lineTo(11.5, -25); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    hand(10.2, -7);
    if (look === "lancer") {   // round shield
      ctx.fillStyle = F(shade(o.body, 0.8)); ctx.strokeStyle = ink; ctx.lineWidth = 1.2; circ(3.6, -6.6, 6.6); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = F(o.trim); ctx.lineWidth = 1.3; circ(3.6, -6.6, 4.6); ctx.stroke(); ctx.fillStyle = F(o.trim); circ(3.6, -6.6, 1.7); ctx.fill();
    }
  } else if (look === "ranger") {
    ctx.strokeStyle = ink; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(4.5, -9, 12.5, -1.05, 1.05); ctx.stroke();
    ctx.strokeStyle = F("#9a6a34"); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(4.5, -9, 12.5, -1.05, 1.05); ctx.stroke();
    ctx.strokeStyle = F("#efe8d8"); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(4.5 + Math.cos(1.05) * 12.5, -9 - Math.sin(1.05) * 12.5); ctx.lineTo(4.5 + Math.cos(1.05) * 12.5, -9 + Math.sin(1.05) * 12.5); ctx.stroke();
    hand(15.6, -9);
  } else if (look === "brute") {
    ctx.strokeStyle = ink; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(9.6, 4); ctx.lineTo(11.6, -26); ctx.stroke();
    ctx.strokeStyle = F("#6a4526"); ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(9.6, 4); ctx.lineTo(11.6, -26); ctx.stroke();
    const ag = ctx.createLinearGradient(8, 0, 21, 0); ag.addColorStop(0, F("#8a8e98")); ag.addColorStop(1, F("#e2e6ee"));
    ctx.fillStyle = ag; ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(10.6, -27.5); ctx.quadraticCurveTo(17, -31, 20.6, -26.5); ctx.quadraticCurveTo(22.4, -21.5, 19.6, -15.5); ctx.quadraticCurveTo(15.6, -18.5, 10.9, -17.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    hand(10.6, -8);
  } else {   // hero sword: o.swing is the blade angle
    const a = o.swing == null ? -1.15 : o.swing, hx2 = 10, hy2 = -8, ex = hx2 + Math.cos(a) * 19, ey = hy2 + Math.sin(a) * 19;
    if (o.swoosh) { ctx.fillStyle = "rgba(255,255,255,0.30)"; ctx.beginPath(); ctx.moveTo(hx2, hy2); ctx.arc(hx2, hy2, 23, -1.3, a); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = ink; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(hx2, hy2); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = F("#eef3f8"); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(hx2 + Math.cos(a) * 3, hy2 + Math.sin(a) * 3); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = F(o.trim); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(hx2 + Math.cos(a) * 3.4 - Math.sin(a) * 3.4, hy2 + Math.sin(a) * 3.4 + Math.cos(a) * 3.4); ctx.lineTo(hx2 + Math.cos(a) * 3.4 + Math.sin(a) * 3.4, hy2 + Math.sin(a) * 3.4 - Math.cos(a) * 3.4); ctx.stroke();
    hand(hx2, hy2);
  }
  ctx.restore();
}
const SLOTS = { 3: [[-11, 42], [11, 44], [0, 55]], 2: [[-8, 44], [8, 54]], 1: [[0, 52]] };
function drawSquad(s) {
  if (s.hp <= 0) return;
  const st = stamina.stamina(s.id), tired = st.exhausted, t = world.t;
  const x = s.x + s.lunge[0], y = s.y + s.lunge[1], fl = s.flash > 0 && Math.floor(s.flash / 40) % 2 === 0;
  const moving = world.act && world.act.kind === "walk" && world.act.s === s;
  const n = Math.max(1, Math.ceil(3 * s.hp / s.maxHp)), cx = x + TILE / 2;   // the squad thins out as it loses HP (no bar needed)
  // banner pole behind the squad
  const px0 = cx - 21 * s.face, tc = s.side === "blue" ? "#5aa8ff" : "#ff5a4a";
  ctx.strokeStyle = "#1d1826"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(px0, y + 46); ctx.lineTo(px0, y + 2); ctx.stroke();
  ctx.strokeStyle = "#7a5a34"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(px0, y + 46); ctx.lineTo(px0, y + 2); ctx.stroke();
  ctx.fillStyle = tc; ctx.strokeStyle = "#1d1826"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px0, y + 3); ctx.lineTo(px0 - 13 * s.face, y + 7 + Math.sin(t / 220) * 1.2); ctx.lineTo(px0, y + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (world.selected === s) { ctx.strokeStyle = "rgba(255,240,180," + (0.6 + 0.3 * Math.sin(t / 150)) + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, y + 50, 28, 10, 0, 0, Math.PI * 2); ctx.stroke(); }
  SLOTS[n].forEach(([dx, dy], i) => {
    const bob = moving ? Math.abs(Math.sin(t / 90 + i)) * -2.4 : tired ? Math.sin(t / 420 + i) * 0.5 : Math.sin(t / 380 + i * 1.7) * 0.8;
    figure(cx + dx * s.face, y + dy, { body: s.body, trim: s.trim, look: s.look, face: s.face, bob, tired, flash: fl, k: s.look === "brute" ? 0.98 : 0.92, ph: moving ? t / 75 + i * 2.1 : null });
  });
}
function drawHero() {
  const H = world.hero, st = stamina.stamina("hero"), t = world.t, tired = st.exhausted;
  const fx = Math.cos(H.face) >= 0 ? 1 : -1, bob = H.moving ? Math.abs(Math.sin(H.walk / 90)) * -2.4 : Math.sin(t / 380) * 0.8;
  figure(H.x, H.y, { body: "#3f78d8", trim: "#e8c45a", look: "hero", face: fx, bob, tired, flash: false, k: 1.12, ph: H.moving ? H.walk / 75 : null,
    swing: H.swing ? -1.3 + 2.4 * ease(H.swing.t / 160) : tired ? 1.25 : -1.15, swoosh: !!(H.swing && H.swing.t < 180) });
}
function dummy(dm) {
  const x = dm.x, y = dm.y, w = Math.sin(world.t / 40) * dm.wob * 0.35;
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y + 1, 13, 4.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.scale(1.45, 1.45); ctx.rotate(w); ctx.lineJoin = "round";
  ctx.strokeStyle = "#1d1826"; ctx.lineWidth = 0.9;
  ctx.fillStyle = "#5a3a20"; ctx.beginPath(); ctx.rect(-1.7, -30, 3.4, 30); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.rect(-12, -24.5, 24, 3.2); ctx.fill(); ctx.stroke();
  const g = ctx.createLinearGradient(-7, 0, 7, 0); g.addColorStop(0, "#e0bc70"); g.addColorStop(1, "#a07a3a");
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-7, -27, 14, 18, 5); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -32.5, 5.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#7a5a2a"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-7, -21.5); ctx.lineTo(7, -21.5); ctx.moveTo(-7, -14.5); ctx.lineTo(7, -14.5); ctx.moveTo(-3, -34); ctx.lineTo(-1, -32); ctx.moveTo(-1, -34); ctx.lineTo(-3, -32); ctx.moveTo(1.4, -34); ctx.lineTo(3.4, -32); ctx.moveTo(3.4, -34); ctx.lineTo(1.4, -32); ctx.stroke();
  ctx.fillStyle = "#f4ead8"; ctx.beginPath(); ctx.arc(0, -18, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#c0442e"; ctx.beginPath(); ctx.arc(0, -18, 2.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#f4ead8"; ctx.beginPath(); ctx.arc(0, -18, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawWorld() {
  const list = [], T = TILE;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (at(c, r) === "T") list.push({ y: r * T + 54, d: () => tree(c * T + 30 + (hash(c, r) - 0.5) * 12, r * T + 54, 1.4 + hash(r, c) * 0.3) });
  // outpost walls: back, then the two gate towers
  list.push({ y: 1 * T - 6, d: () => { wallBlock(6 * T + 14, 12, 4 * T - 28, 44); } });
  list.push({ y: 2 * T - 4, d: () => { wallBlock(6 * T + 14, 1 * T - 6, 40, T); wallBlock(9 * T + 6, 1 * T - 6, 40, T); } });
  list.push({ y: 3 * T + 8, d: () => { tent(1 * T + 6, 3 * T + 10, "#c9b48a"); tent(3 * T - 2, 3 * T + 4, "#a8c0d8"); } });
  if (CLOCK === "turn") for (const s of world.squads) list.push({ y: s.y + 56, d: () => drawSquad(s) });
  else { list.push({ y: world.hero.y, d: drawHero }); for (const dm of world.dummies) list.push({ y: dm.y, d: () => dummy(dm) }); }
  list.sort((a, b) => a.y - b.y).forEach(o => o.d());
}
function drawWater() {
  const t = world.t / 1000;
  ctx.save(); ctx.globalAlpha = 0.6;
  for (let i = 0; i < 26; i++) {
    const y = ((hash(i, 41) * VH + t * (18 + hash(i, 42) * 14)) % (VH + 20)) - 10, x = 5 * TILE + 12 + hash(i, 43) * (TILE - 34);
    if (Math.floor(y / TILE) === 2 || Math.floor(y / TILE) === 4) continue;
    ctx.strokeStyle = "rgba(190,225,255,0.55)"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 5, y - 2, x + 10, y); ctx.stroke();
  }
  ctx.restore();
}
function lights() {   // dusk grade, then warm light back on around lit sites
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, "rgba(46,30,90,0.30)"); g.addColorStop(1, "rgba(20,14,40,0.22)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const s of SITES) {
    if (stamina.owner(s.id) == null) continue;
    const cx = s.r ? s.x : s.x + s.w / 2, cy = s.r ? s.y : s.y + s.h / 2, R = 128 + Math.sin(world.t / 130 + cx) * 4;
    const lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); lg.addColorStop(0, s.kind === "shrine" ? "rgba(120,170,255,0.22)" : "rgba(255,170,80,0.26)"); lg.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.95); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, VW, VH);
}
function text(s, x, y, size, col, align = "left", weight = 700) { ctx.font = weight + " " + size + "px " + FAMILY; ctx.textAlign = align; ctx.textBaseline = "top"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(8,6,10,0.8)"; ctx.lineJoin = "round"; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
function hud() {
  ctx.save();
  ctx.fillStyle = "rgba(16,12,10,0.72)"; ctx.beginPath(); ctx.roundRect(8, 8, 168, 40, 8); ctx.fill(); ctx.strokeStyle = "rgba(255,220,160,0.18)"; ctx.lineWidth = 1; ctx.stroke();
  if (CLOCK === "turn") {
    text("TURN " + world.turn, 18, 14, 13, "#f4ead2", "left", 800);
    text(world.side === "blue" ? "Blue phase" : "Red phase", 18, 30, 11, world.side === "blue" ? "#8ac4ff" : "#ff9a86", "left", 700);
    text(world.manual ? "MANUAL" : "AUTOPLAY", 166, 15, 9, "#c8b896", "right", 800);
  } else {
    const st = stamina.stamina("hero");
    text("REAL-TIME", 18, 14, 13, "#f4ead2", "left", 800);
    text(st.exhausted ? "Winded: rest at a fire" : st.resting ? "Resting" : "Swing, then rest", 18, 30, 11, st.exhausted ? "#ff9a86" : "#ffd88a", "left", 700);
  }
  // floating hit numbers
  for (const f of world.fx) { const u = f.t / 900; ctx.globalAlpha = clamp(Math.min(f.t / 80, (900 - f.t) / 250), 0, 1); text(String(f.n), f.x, f.y - 14 * ease(u), 13, "#fff4e0", "center", 900); }
  ctx.globalAlpha = 1;
  if (CLOCK === "turn" && world.phase === "banner") {
    const u = world.phaseT / 1100, a = clamp(Math.min(u * 6, (1 - u) * 5), 0, 1), slide = (1 - ease(Math.min(1, u * 4))) * 60;
    ctx.globalAlpha = a; const g = ctx.createLinearGradient(0, 0, VW, 0); const c = world.side === "blue" ? "40,90,180" : "160,40,30";
    g.addColorStop(0, "rgba(" + c + ",0)"); g.addColorStop(0.5, "rgba(" + c + ",0.7)"); g.addColorStop(1, "rgba(" + c + ",0)");
    ctx.fillStyle = g; ctx.fillRect(0, 290, VW, 44);
    text((world.side === "blue" ? "BLUE" : "RED") + " PHASE", VW / 2 + slide, 298, 24, "#fff6e0", "center", 900);
    text("Squads in a site they hold rest; empty sites are claimed", VW / 2 - slide, 323, 9, "#f0e2c8", "center", 600);
    ctx.globalAlpha = 1;
  }
  if (world.over) {
    const a = clamp(world.over.t / 300, 0, 1); ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(10,8,14,0.6)"; ctx.fillRect(0, 150, VW, 60);
    text(world.over.win ? "FIELD HELD" : "DRIVEN BACK", VW / 2, 162, 26, world.over.win ? "#ffd86a" : "#ff8a7a", "center", 900);
    ctx.globalAlpha = 1;
  }
  if (world.reach && world.selected) {
    for (const t of world.reach.tiles) { ctx.fillStyle = "rgba(255,230,150,0.16)"; ctx.fillRect(t.c * TILE + 2, t.r * TILE + 2, TILE - 4, TILE - 4); }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ render
function fit() {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(VW, Math.round((r.width || VW) * dpr)), h = Math.round(w * VH / VW);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return w / VW;
}
function render() {
  const sc = fit();
  if (!groundCache || groundScale !== sc) { groundCache = buildGround(sc); groundScale = sc; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(groundCache, 0, 0);
  ctx.setTransform(sc, 0, 0, sc, 0, 0);
  drawWater();
  stamina.drawSites(ctx);
  drawWorld();
  lights();
  stamina.draw(ctx);
  hud();
  pxRender();
}

// ------------------------------------------------------------------ the pixel preview (256 x 144, crisp)
const pcv = document.getElementById("px"), pctx = pcv.getContext("2d");
const PX = { t: 0, units: [], step: -1 };
const PXSITES = [{ id: "pcamp", kind: "camp", x: 16, y: 80, w: 48, h: 48, owner: "blue" }, { id: "pfort", kind: "outpost", x: 176, y: 32, w: 32, h: 32, owner: "red" },
  { id: "pstone", kind: "shrine", x: 184, y: 114, r: 12, owner: null }];
// scenery from the shared pixel scene kit (pixel-kit/pixel-scene.js, inlined by build.sh)
const PXMAP = [
  "TT.T..t.w..T..TT",
  "T.......w.####.T",
  "..t.....w.#cc#..",
  "........w.#cc#.t",
  "ppppppppbppppppp",
  ".,,,....w.......",
  ".,,,....w......T",
  ".,,,.t..w......T",
  "....T...w.....TT"];
let pxScene = null;
function pxReset() {
  PX.units = [{ id: "a", side: "blue", x: 44, y: 108 }, { id: "b", side: "blue", x: 88, y: 84 }, { id: "c", side: "blue", x: 186, y: 44 }, { id: "d", side: "red", x: 160, y: 104 }];
  px = GameDNA_StaminaRest.create({ clock: "turn", bounds: { x: 0, y: 0, w: 256, h: 144 }, units: () => PX.units.map(u => ({ id: u.id, side: u.side, x: u.x, y: u.y, w: 16, h: 16 })), sites: () => PXSITES, params: { max: 4 } });
  px.set("a", 0); px.set("c", 2); px.set("d", 3);
}
// drain, march, a refused attack, then the blue phase: camp rest (a), the outpost taken (c); the red raider holds the stone
const PXSCRIPT = [[300, () => px.march("b")], [900, () => px.engage("b")], [1500, () => px.engage("c")], [2200, () => px.engage("c")], [2900, () => px.engage("d")], [3500, () => px.turnStart("blue")], [5600, () => px.turnStart("red")], [6800, () => px.engage("d")], [8400, null]];
const PX_LOOP = 8400;
function pxStep(dt) {
  if (!px) pxReset();
  PX.t += dt;
  for (let i = PX.step + 1; i < PXSCRIPT.length && PXSCRIPT[i][0] <= PX.t; i++) { PX.step = i; if (PXSCRIPT[i][1]) PXSCRIPT[i][1](); else { PX.t = 0; PX.step = -1; pxReset(); } }
  px.update(dt);
}
function pxRender() {
  if (!px) pxReset();
  if (!pxScene) pxScene = GameDNA_PixelScene.scene({ map: PXMAP, seed: 7, props: [{ k: "tent", x: 30, y: 98 }, { k: "barrel", x: 214, y: 76 }, { k: "hay", x: 104, y: 124 }, { k: "bush", x: 150, y: 134 }] });
  pxScene.drawGround(pctx, PX.t, 0, 0);
  px.drawSites(pctx);
  const list = pxScene.items.map(it => ({ y: it.y, d: () => it.draw(pctx, PX.t, 0, 0) }));
  for (const u of PX.units) list.push({ y: u.y + 16, d: () => GameDNA_PixelScene.actor(pctx, u.x + 8, u.y + 16, { pal: u.side === "blue" ? (u.id === "b" ? "green" : "hero") : "guard", dir: u.side === "blue" ? "right" : "left", frame: 0, hop: px.stamina(u.id).exhausted ? -1 : 0 }) });
  list.sort((a, b) => a.y - b.y).forEach(o => o.d());
  px.draw(pctx);
  // fade through black between loops
  const f = Math.max(0, 1 - PX.t / 350, (PX.t - (PX_LOOP - 450)) / 450);
  if (f > 0) { pctx.fillStyle = "rgba(0,0,0," + Math.min(1, f) + ")"; pctx.fillRect(0, 0, 256, 144); }
}

// ------------------------------------------------------------------ input (turn clock: click to command blue squads)
cv.addEventListener("pointerdown", e => {
  if (CLOCK !== "turn" || world.over) return;
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * VW, y = (e.clientY - r.top) / r.height * VH;
  const c = Math.floor(x / TILE), row = Math.floor(y / TILE);
  setManual(true);
  if (world.side !== "blue" || world.phase !== "act" || world.act || world.wait > 0) return;
  const there = squadAt(c, row), sel = world.selected;
  if (there && there.side === "blue" && !there.done) { world.selected = there; world.reach = reach(there, MOVE); return; }
  if (!sel) return;
  if (there && there.side === "red" && adj(sel, there)) { world.reach = null; doAttack(sel, there, () => { finishSquad(sel); world.selected = null; }); return; }
  const tile = world.reach && world.reach.tiles.find(t => t.c === c && t.r === row);
  if (tile && !sel.moved) { world.reach = null; doMove(sel, tile, () => { sel.moved = true; if (!live("red").some(f => adj(sel, f))) { finishSquad(sel); world.selected = null; } }); }
});
function setManual(on) {
  if (world.manual === on) return; world.manual = on;
  const b = document.getElementById("auto"); b.textContent = "Autoplay: " + (on ? "off" : "on"); b.setAttribute("aria-pressed", String(!on));
}
function endTurn() {
  if (CLOCK !== "turn" || world.side !== "blue" || world.phase !== "act" || world.act) return;
  world.selected = null; world.reach = null; world.queue = []; world.wait = 0; world.endReq = true;
}

// ------------------------------------------------------------------ controls
let speed = 1;
const clockSeg = document.getElementById("clock");
for (const c of ["turn", "realtime"]) {
  const b = document.createElement("button"); b.type = "button"; b.textContent = c === "turn" ? "Turn (phases)" : "Real-time"; b.setAttribute("role", "radio");
  b.setAttribute("aria-checked", String(c === CLOCK)); b.onclick = () => { CLOCK = c; for (const k of ["engage", "march", "regen", "rest"]) delete userP[k]; [...clockSeg.children].forEach(x => x.setAttribute("aria-checked", String(x === b))); newWorld(); buildParams(); updateUi(); };
  clockSeg.appendChild(b);
}
const pbox = document.getElementById("params");
function buildParams() {
  pbox.innerHTML = ""; const cur = stamina.params();
  for (const p of PKEYS) {
    const row = document.createElement("div"); row.className = "row";
    if (p.options) {
      row.innerHTML = "<label><span>" + p.label + "</span></label>"; const seg = document.createElement("div"); seg.className = "seg";
      for (const o of p.options) { const b = document.createElement("button"); b.type = "button"; b.textContent = o; b.setAttribute("aria-checked", String(cur[p.key] === o)); b.onclick = () => {
        userP[p.key] = o; [...seg.children].forEach(x => x.setAttribute("aria-checked", String(x === b)));
        if (p.key === "pace") { for (const k of ["engage", "march", "regen", "rest", "rule"]) delete userP[k]; stamina.setParams({ pace: o }); buildParams(); }
        else stamina.setParams({ [p.key]: o });
      }; seg.appendChild(b); }
      row.appendChild(seg);
    } else {
      row.innerHTML = "<label><span>" + p.label + "</span><output>" + cur[p.key] + "</output></label>";
      const inp = document.createElement("input"); inp.type = "range"; inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.value = cur[p.key];
      const fill = () => inp.style.setProperty("--fill", (inp.value - p.min) / (p.max - p.min) * 100 + "%"); fill();
      inp.oninput = () => { userP[p.key] = +inp.value; row.querySelector("output").textContent = inp.value; fill(); stamina.setParams({ [p.key]: +inp.value }); };
      row.appendChild(inp);
    }
    pbox.appendChild(row);
  }
}
document.getElementById("auto").onclick = () => setManual(!world.manual);
document.getElementById("endturn").onclick = endTurn;
document.getElementById("restart").onclick = () => newWorld();
document.getElementById("speed").onclick = e => { speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1; e.target.textContent = "Speed: " + speed + "×"; e.target.setAttribute("aria-pressed", String(speed !== 1)); };
const CAPTIONS = {
  turn: "<b>Watch:</b> pips drain on marches and attacks; a spent squad shows TIRED, its next attack is refused (TOO TIRED) and it falls back to a site, where READY +4 refills it with embers when its phase begins. The shrine changes hands when a squad holds it alone at the start of its phase.",
  realtime: "<b>Watch:</b> the hero swings at the dummies until winded (red strip, slower swings), walks to a fire and stands still: embers, refilling capsules and REST +N. Standing alone in the shrine or the raiders' outpost for 0.9 s fills a ring and lights it (SHRINE LIT, OUTPOST TAKEN).",
};
function updateUi() {
  document.getElementById("cap").innerHTML = CAPTIONS[CLOCK];
  document.getElementById("endturn").disabled = CLOCK !== "turn";
  document.getElementById("hint").textContent = CLOCK === "turn" ? "Click a blue squad, then a tile; click a red squad next to it to attack" : "Arrows / WASD move · Z swings · rest at the camp fire";
  const box = document.getElementById("status"); box.innerHTML = "";
  const ids = CLOCK === "turn" ? world.squads.map(s => [s.id, s.name, s.side, s.hp > 0]) : [["hero", "Hero", "blue", true]];
  for (const [id, name, side, alive] of ids) {
    const st = stamina.stamina(id), chip = document.createElement("div"); chip.className = "chip";
    let pips = ""; for (let i = 0; i < st.max; i++) pips += "<s class='" + (st.shown - i >= 0.5 ? (st.shown <= st.max / 3 ? "lo" : "on") : "") + "'></s>";
    chip.innerHTML = "<i style='--c:" + (side === "blue" ? "var(--blue)" : "var(--red)") + "'></i><b>" + name + "</b><span class='pips" + (st.exhausted ? " ex" : "") + "'>" + pips + "</span><span>" + (!alive ? "fallen" : st.exhausted ? "exhausted" : st.resting ? "resting" : st.value.toFixed(1)) + "</span>";
    box.appendChild(chip);
  }
}

// ------------------------------------------------------------------ boot
newWorld(); buildParams();
if (FREEZE) { for (let n = Math.floor(T0 / STEP); n > 0; n--) step(STEP); render(); updateUi(); window.__frozen = true; }
else {
  for (let n = Math.floor(T0 / STEP); n > 0; n--) step(STEP);
  let acc = 0, prev = null, ui = 0;
  const frame = now => {
    if (prev === null) prev = now; acc += Math.min(250, now - prev) * speed; prev = now;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    render(); if (++ui % 8 === 0) updateUi();
    requestAnimationFrame(frame);
  };
  updateUi(); requestAnimationFrame(frame);
}
addEventListener("resize", () => { if (FREEZE) render(); });
window.__stamina = () => ({ t: world.t, clock: CLOCK, turn: world.turn, side: world.side, stats: stamina.stats(), squads: CLOCK === "turn" ? world.squads.map(s => ({ id: s.id, hp: s.hp, st: stamina.stamina(s.id) })) : [{ id: "hero", st: stamina.stamina("hero") }], owners: SITES.map(s => [s.id, stamina.owner(s.id)]) });
/* text state for critics and tools/sprites/statecheck.py. Main canvas (640x360): the squads (turn clock; every figure of a squad shares s.face) or
   the hero (real-time clock; the two training dummies are props). The pixel strip is a second canvas: its four units are listed with canvas:'px'. */
window.__state = () => {
  const actors = [], f = v => v > 0 ? "right" : "left", a = world.act;
  if (CLOCK === "turn") for (const s of world.squads) {
    const fight = a && a.kind === "fight" ? (a.att === s ? a.def : a.def === s && a.counter ? a.att : null) : null, walk = a && a.kind === "walk" && a.s === s;
    let vx = 0; if (walk) { const seg = Math.floor(a.t / 210); if (seg < a.path.length - 1) vx = a.path[seg + 1][0] - a.path[seg][0]; }
    actors.push({ id: s.id, x: Math.round(s.x + s.lunge[0] + TILE / 2), y: Math.round(s.y + s.lunge[1] + 50), facing: f(s.face), target: fight ? fight.id : null, vx, noFace: s.hp <= 0 ? "defeated, not drawn" : undefined });
  } else {
    const H = world.hero, at = H.goal === "dummy" && (H.swing || !H.moving) ? world.dummies.slice().sort((p, q) => Math.hypot(p.x - H.x, p.y - H.y) - Math.hypot(q.x - H.x, q.y - H.y))[0] : null;
    actors.push({ id: "hero", x: Math.round(H.x), y: Math.round(H.y), facing: f(Math.cos(H.face) >= 0 ? 1 : -1), target: at && Math.hypot(at.x - H.x, at.y - H.y) < 69 ? Math.round(at.x) : null, vx: H.moving ? Math.round(__hvx * 100) / 100 : 0 });
  }
  for (const u of PX.units) actors.push({ id: "px-" + u.id, canvas: "px", x: u.x + 8, y: u.y + 16, facing: u.side === "blue" ? "right" : "left", target: null });
  return { t: Math.round(world.t), clock: CLOCK, actors };
};
