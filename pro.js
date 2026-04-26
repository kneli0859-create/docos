/* DocOS PRO — chameleon mode toggle on 🎨 button.
   Tap = toggle auto color cycle. Long-press (450ms) = open theme grid (original behavior). */
(function () {
  var KEY = 'docos_chameleon_on';
  var html = document.documentElement;

  function apply(on) {
    if (on) html.setAttribute('data-chameleon', 'on');
    else html.removeAttribute('data-chameleon');
  }

  try { apply(localStorage.getItem(KEY) === '1'); } catch (_) {}

  function bind() {
    var btn = document.getElementById('themeToggleBtn');
    if (!btn || btn.__proWired) return !!btn;
    btn.__proWired = true;

    var timer = null;
    var longPress = false;

    function startPress() {
      longPress = false;
      clearTimeout(timer);
      timer = setTimeout(function () { longPress = true; }, 450);
    }
    function cancelPress() { clearTimeout(timer); }

    btn.addEventListener('pointerdown', startPress, true);
    btn.addEventListener('pointerup', cancelPress, true);
    btn.addEventListener('pointerleave', cancelPress, true);
    btn.addEventListener('pointercancel', cancelPress, true);

    btn.addEventListener('click', function (e) {
      if (longPress) return; // fall through to original handler (opens theme grid)
      e.stopImmediatePropagation();
      e.preventDefault();
      var on = html.getAttribute('data-chameleon') !== 'on';
      apply(on);
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {}

      // micro feedback pulse
      btn.style.transform = 'scale(0.88)';
      setTimeout(function () { btn.style.transform = ''; }, 140);
    }, true);

    return true;
  }

  if (!bind()) {
    document.addEventListener('DOMContentLoaded', bind);
    [200, 600, 1500, 3000].forEach(function (t) { setTimeout(bind, t); });
  }
})();
