// Behaviour from legacy dynamic/js/navbar.js (markup is rendered by React now).
(function () {
  var btn = document.getElementById('menu-btn'), nav = document.getElementById('navigation');
  if (!btn || !nav) return;
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    var open = btn.classList.contains('open');
    btn.classList.toggle('open', !open); btn.classList.toggle('close', open);
    $(nav).collapse(open ? 'hide' : 'show');
  });
  $(nav).on('hidden.bs.collapse', function () { btn.classList.remove('open'); btn.classList.add('close'); });
  $(nav).on('shown.bs.collapse', function () { btn.classList.remove('close'); btn.classList.add('open'); });
})();
