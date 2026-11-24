  /* ---------- the global ---------- */
  var API = {
    VERSION: VERSION, create: create, ENEMIES: ENEMIES, ITEMS: ITEMS, THEMES: THEMES, LOOKS: LOOKS, PALETTES: PALETTES,
    text: text, measure: measure, drawSprite: drawSprite,
    // pure pieces for tools and checks (no canvas needed)
    generateFloor: generateFloor, parseMap: parseMap, castColumns: castColumns, renderView: renderView, project: project, buildArt: buildArt,
    spriteFor: spriteFor, itemSprite: itemSprite, swordRaster: swordRaster, buildLightMap: buildLightMap, bfs: bfs,
    CELL: { FLOOR: FLOOR, WALL: WALL, TORCH: TORCH, DOOR: DOOR, STAIRS: STAIRS, BANNER: BANNER }
  };
  root.GameDNA_RaycastDungeon = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
