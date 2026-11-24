
  /* ---------- the global ---------- */
  var API = {
    version: VERSION, create: create, generate: function (o) { o = o || {}; var p = {}, k; for (k in DEFAULTS) p[k] = DEFAULTS[k]; for (k in (o.params || {})) p[k] = o.params[k]; return generate({ seed: o.seed, floor: o.floor, floors: o.floors, params: p, rooms: lib(ROOMS, o.rooms), monsters: lib(MONSTERS, o.monsters), items: lib(ITEMS, o.items) }); },
    ROOMS: ROOMS, MONSTERS: MONSTERS, ITEMS: ITEMS, DEFAULTS: DEFAULTS, TILE: T, TILES: { ROCK: ROCK, FLOOR: FLOOR, WALL: WALL, DOOR: DOOR, STAIRS: STAIRS },
    text: text, measure: measure, wallPiece: wallPiece, bfs: bfs, fov: fov,
    drawMonster: function (g, def, x, footY, o) { o = o || {}; var sp = monsterSprite(def, o.facing || 'right', o.frame || 0, false), L2 = lookOf(def); if (sp) g.drawImage(sp, Math.round(x - L2.w / 2), Math.round(footY - L2.h)); },
    drawHero: function (g, x, footY, o) { o = o || {}; var dir = o.dir || 'down', h = { dir: dir, face: dir === 'left' ? 'left' : 'right', lunge: o.strike ? { dx: dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dy: dir === 'up' ? -1 : dir === 'down' ? 1 : 0, t: o.strike === 'wind' ? 10 : 150, dur: 230, attack: true } : null }, sw = swordPose(h), sp = heroSprite(dir, o.frame || 0, false); x = Math.round(x); footY = Math.round(footY); if (o.sword !== false && sw.behind) drawSword(g, x, footY, sw); if (sp) g.drawImage(sp, x - 8, footY - 17); if (o.sword !== false && !sw.behind) drawSword(g, x, footY, sw); },
    drawItem: function (g, def, x, y) { var sp = itemSprite(def); if (sp) g.drawImage(sp, Math.round(x) - 6, Math.round(y) - 5); }
  };
  root.GameDNA_DungeonFloors = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
