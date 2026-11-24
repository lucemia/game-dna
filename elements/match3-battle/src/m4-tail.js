
  /* ---------- exports ---------- */
  var API = {
    version: VERSION, create: create, rules: R, rng: rng, hash: hash,
    GEMS: GEMS, HEROES: HEROES, SKILLS: SKILLS, ENEMIES: ENEMIES, DEFAULTS: DEFAULTS, SHAPES: Object.keys(SHAPES),
    paintGem: function (g, def, x, y, r, sp, t) { if (sp === 'prism') paintPrism(g, x, y, r, t || 0); else { paintGem(g, def, x, y, r); if (sp) paintSpecial(g, def, sp, x, y, r, t || 0); } },
    text: txt, layout: makeLayout,
    _textLog: function (on) { TEXT_LOG = on ? [] : null; return TEXT_LOG; }, _textLogGet: function () { return TEXT_LOG; }
  };
  root.GameDNA_Match3Battle = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
