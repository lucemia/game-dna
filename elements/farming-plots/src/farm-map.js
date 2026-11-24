  // The farm: 34 x 24 tiles of 16 px. Map chars (pixel-kit): . grass  , lush  p path  T tree  t small tree  u bush
  // r rock  F flowers  w water  S stump; 'f' = a field cell (drawn as dirt, tillable). 'H' house, 'B' shipping bin, 'K' the
  // seed stall, 'X' other blocked props (fence, lantern, barrel, well) are drawn from FARM.props and block walking.
  var FARM = {
    cols: 34, rows: 24, tile: 16,
    map: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTtu...HHH..X.,,,.....u..XKKKK.tTT',
      'TT.....HHH...,,,,.........KKKK..TT',
      'TT..X..HHHXB...........F..KKKK.XTT',
      'TT.......p..........,,.....p.....TT',
      'TTu......pppppppppppppppppppp...uTT',
      'TT.......p.........p.........,,.TT',
      'TT..XXXXXpXXXXXXXXXpXXXXXXXXX...TT',
      'TT..X....p.........p........X...TT',
      'TT..X.ffffff.ffffff.ffffff..X.r.TT',
      'TT..X.ffffff.ffffff.ffffff..X...TT',
      'TT..X.......................X...TT',
      'TT..X.ffffff.ffffff.ffffff..X.u.TT',
      'TT..X.ffffff.ffffff.ffffff..X...TT',
      'TT..X.......................X...TT',
      'TT..XXXXXXXXXXXXXXXXXXXXXXXXX..,TT',
      'TTww.........,,,.......F......tTTT',
      'TTwww....u..............S.....TTTT',
      'TTwww.......,,...........u...TTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT'
    ],
    start: [8, 7, 'down'],                   // in front of the door
    spots: { bed: [8, 6], bin: [11, 6], shop: [27, 6] },
    lights: [[104, 98, 34], [408, 66, 30], [200, 66, 28]]
  };
  FARM.walkable = function (cx, cy) {
    var r = FARM.map[cy]; if (!r) return false; var ch = r.charAt(cx);
    return ch === '.' || ch === ',' || ch === 'p' || ch === 'f' || ch === 'F';
  };
  FARM.field = (function () { var out = []; FARM.map.forEach(function (r, y) { for (var x = 0; x < r.length; x++) if (r.charAt(x) === 'f') out.push([x, y]); }); return out; })();
