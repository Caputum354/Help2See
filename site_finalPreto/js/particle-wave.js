/*!
 * Help2See — background motion (js/particle-wave.js)
 * Lightweight, dependency-free enhancement for the existing decorative
 * background blobs (.bg-lights > .bg-light). It applies a very subtle
 * pointer parallax so the static background feels alive, without adding
 * any new DOM or changing the visual design. Fully disabled when the
 * elements are absent or the user prefers reduced motion.
 */
(function () {
  'use strict';

  function init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var lights = Array.prototype.slice.call(document.querySelectorAll('.bg-lights .bg-light'));
    if (!lights.length) return;

    var targetX = 0, targetY = 0, raf = 0;

    function render() {
      raf = 0;
      lights.forEach(function (el, i) {
        var depth = (i + 1) * 6;            // staggered parallax depth
        el.style.transform = 'translate3d(' + (targetX * depth) + 'px,' +
          (targetY * depth) + 'px,0)';
      });
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(render); }

    window.addEventListener('pointermove', function (e) {
      // -0.5..0.5 of the viewport, kept tiny for a gentle effect.
      targetX = (e.clientX / window.innerWidth - 0.5);
      targetY = (e.clientY / window.innerHeight - 0.5);
      schedule();
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }
})();
