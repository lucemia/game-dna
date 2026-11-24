
  root.GameDNA_CardBattle = {
    version: VERSION, create: create,
    CARDS: CARDS, ENEMIES: ENEMIES, STATUSES: STATUSES, LOOKS: LOOKS, PALETTES: PAL,
    drawCard: function (g, card, x, y, w, o) { return drawCardFrame(g, card, x, y, w, o); },
    drawCardBack: function (g, x, y, w, t) { drawCardBack(g, x, y, w, t || 0); },
    cardText: function (card) { return cardText(null, card, null); },
    drawIntent: function (g, view, x, y, t) { return drawIntentTag(g, view, x, y, t || 0); },
    drawStatus: function (g, id, n, x, y, size) { drawStatusChip(g, id, n, x, y, STATUSES[id], size); },
    text: function (g, s, x, y, o) { return text(g, s, x, y, o); },
    // Pure rules for tests and tools: a fight driven without drawing.
    rules: { newState: newState, playSteps: playSteps, endTurnSteps: endTurnSteps, startTurnSteps: startTurnSteps, rollIntents: rollIntents, intentView: intentView,
      runAll: runAll, cloneState: cloneState, calcDamage: calcDamage, botPlan: botPlan, canPlay: canPlay, mkRng: mkRng, rnext: rnext, shuffle: shuffle }
  };
})(typeof window !== 'undefined' ? window : globalThis);
