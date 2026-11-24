// Basket hint for D-05 talking-portraits: how to wire the module into an UNKNOWN game, by role.
// The module animates portraits from the dialogue (typewriter, mouth on letters only, blinks, breathing, emotion tags with a
// blink-through). Faces come from expressive-portraits.js (D-04, copied into the basket as a plain file: load it first,
// use it only through talking-portraits). The game keeps its own box, text drawing, line list and callbacks.
export default {
  stage: 'ui',
  does: 'Talking portraits: the speaker\'s pixel face in the dialogue box; the mouth moves only while letters type and shuts on spaces, punctuation, pauses and at the line end; random blinks, breathing; [emotion] tags change the face through a short blink, never a jump; faces in a HUD react to hits.',
  params: {
    cps: 'create `params.cps`', mouthMs: 'create `params.mouthMs`', transMs: 'create `params.transMs`', blinkMin: 'create `params.blinkMin`',
    blinkMax: 'create `params.blinkMax`', breathMs: 'create `params.breathMs`', size: 'create `params.size`', frame: 'create `params.frame`', nameTag: 'create `params.nameTag`'
  },
  steps: [
    ['Load', '`<script src="expressive-portraits.js">` (the D-04 face generator, given as a plain file: never call its own `create`) then `<script src="talking-portraits.js">`, both before the game script, both unchanged.'],
    ['Once, when the game starts', '`TALK = GameDNA_TalkingPortraits.create({ cast, params: {cps: {{cps}}, mouthMs: {{mouthMs}}, transMs: {{transMs}}, blinkMin: {{blinkMin}}, blinkMax: {{blinkMax}}, breathMs: {{breathMs}}, size: {{size}}, frame: \'{{frame}}\', nameTag: \'{{nameTag}}\'} })`. One cast entry per speaking character: a spec (`age`, `gender`, `skin`, `hair`, `hairColor`, `facial`, `headgear`, `collar`, `cloth`, `bg`, `side`) matching the sprite\'s colours, or the game\'s own portrait `{w, h, draw(ctx, x, y, f)}`.'],
    ['Every place a line is set (dialogue open AND each advance)', '`TALK.say(line, {who, emotion})`, or the raw string when it starts with `Name: `; add `[happy]`-style tags to lines with an obvious mood without changing the words. Where the dialogue closes: `TALK.close()`. A game with no dialogue but battle messages: let the acting character `say` a short line and `close()` when the action ends.'],
    ['Confirm key / tap (only where the game already waits for one, e.g. dialogue)', '`if (TALK.press()) return;` before the existing advance code (the first press finishes a typing line). Barks and battle messages keep the game\'s own pacing: they advance on its existing timer; never add a confirm gate or wait for the typing.'],
    ['The fixed step (also the ?t= replay)', '`TALK.update(stepMs)` every step, including the branch that returns early while a dialogue is open.'],
    ['Dialogue drawing', 'Draw the box as before, then `lay = TALK.drawSpeaker(ctx, box)`, then the game\'s text: `TALK.rows(measure, lay.text.w)` at `lay.text.x, lay.text.y + i * lineH`. A box shorter than the panel + 8 px (56 + 8 at size 48): make the box taller rather than letting the panel rise over characters or the HUD. A box you add (battle barks): width = panel + 6 + the line\'s text width + 12, placed where it covers no unit and no key scenery.'],
    ['Optional', '`TALK.drawFace(ctx, name, x, y)` for party / status faces; `TALK.react(name, \'hurt\', 700)` where that character takes damage. Restart / new game: `TALK.clear()`.']
  ],
  gotchas: [
    'Faces never blink or talk -> `update` is not in the step that runs while the dialogue is open.',
    'The battle stops after every action until Z is pressed -> a confirm gate was added to barks / messages; they must follow the game\'s own timer.',
    'Autoplay stalls or the game advances twice -> confirm calls `press()` but ignores its result; `true` means "finished the typing", do not advance.',
    'Words jump to the next row while typing -> the text was wrapped from `text()`; use `rows(measure, width)`.',
    'Text under the portrait or the name plate -> text drawn at the old box origin instead of `lay.text`.',
    'Every face blank, a warning in the console -> `expressive-portraits.js` not loaded before `talking-portraits.js`.',
    'A line keeps "Elder:" in the text -> the name is not a cast key (keys match case-insensitively).'
  ],
  checks: [
    'A dialogue shows the speaker\'s face in the box; its mouth moves on letters and is shut on every space, comma, full stop and after the last character.',
    'An emotion tag changes the face with a blink (eyes half, shut, half), never a jump; idle faces blink every few seconds.',
    'The first confirm finishes the typing line, the next advances; `?auto=1` reaches the same end as before with no console errors.'
  ],
  selfcheck: [
    'Both module files unchanged and loaded in order; `say(` beside every line assignment; `press()` first in confirm; `update(` in the step incl. the dialogue branch; `close(` / `clear(` in place.',
    'Walk one real line: which characters type, where the mouth is shut, which emotion shows; count the autoplay presses for one whole dialogue.',
    'With no input at all the game still reaches its end (or its next idle screen) exactly as before.'
  ],
  offers: {
    'ui-rects': { title: 'portrait panel and name plate', text: '`TALK.rects()` = the portrait panel and name plate while a line shows; other overlays should keep clear of them.' }
  }
};
