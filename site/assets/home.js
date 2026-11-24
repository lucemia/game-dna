/* Home: family tabs filter the card grid. */
(function () {
  var tabs = document.querySelectorAll('[data-tab]'), cards = document.querySelectorAll('#home-grid .card');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var v = t.getAttribute('data-tab');
      tabs.forEach(function (x) { x.setAttribute('aria-pressed', x === t ? 'true' : 'false'); });
      cards.forEach(function (c) { c.hidden = v !== 'all' && c.getAttribute('data-family') !== v; });
    });
  });
})();
