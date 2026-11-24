
  /* ---------- the global ---------- */
  var API = {
    version: VERSION, create: create, rules: rules, CROPS: CROPS, TOOLS: TOOLS, SEASONS: SEASONS, DEFAULTS: DEFAULTS,
    cropDef: cropDef, toolDef: toolDef, rng: rngOf,
    // art, for previews and checks (the same painters the instance uses)
    farmerCanvas: farmerCanvas, FARMER: FARMER, handPoint: handPoint, toolPose: toolPose, drawTool: function (ctx, tool, dir, hx, hy, pose) { drawToolHeld(ctx, toolDef({ t: tool }, 't'), dir, hx, hy, pose); }, FC: FC, cropCanvas: function (id, def, stage, dead) { return cropCanvas(id, cropDef({ x: def }, 'x'), stage, dead); },
    drawFarmer: function (ctx, x, footY, o) { o = o || {}; return drawFarmerFull(ctx, x, footY, o.dir || 'down', o.frame == null ? -1 : o.frame, o.pose || null, o.tool ? toolDef({ t: o.tool }, 't') : null, o.lift || null); },
    liftDraws: function () { return LIFT.n; }, liftAnchor: liftAnchor,
    truncations: function () { return { n: TRUNC.n, last: TRUNC.last }; },
    drawIcon: drawIcon, panel: panel, soilCanvas: soilCanvas
  };
  root.GameDNA_FarmingPlots = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
