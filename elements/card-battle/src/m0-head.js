/* GameDNA_CardBattle (A-10 card battle with intents), v1.1.0. One global, no dependencies, no import/export.
   A turn-based card battle: a fanned hand you drag (or pick with keys / taps) onto foes with a target arrow, Lumen
   (energy) per turn, draw / discard piles with reshuffle, foes that show what they will do next (intent tags) before
   they act, ward / attack / status resolution, end turn. Seeded and frame-stepped: ?t=&freeze=1 stills are deterministic.
   Content (cards, foes, statuses) is plain data the designer edits; see README.md. Original names and art only. */
(function (root) {
  'use strict';
