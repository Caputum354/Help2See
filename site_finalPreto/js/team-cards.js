/*!
 * Help2See 3.0 — Team card interactions
 * Adds tap-to-flip (mobile) and Enter/Space-to-flip (keyboard) on top of
 * the CSS hover flip, while keeping screen readers consistent.
 *
 * Design notes:
 *   • One delegated listener per event type on .team-grid (no per-card
 *     listeners → no leaks, works for cards added later).
 *   • Cards become keyboard-operable (role=button, tabindex=0) and expose
 *     their flipped state via aria-pressed + aria-hidden on the faces.
 *   • Tapping a real link on the back still navigates (we ignore <a>).
 */
(function () {
  'use strict';

  function init() {
    var grids = document.querySelectorAll('.team-grid');
    if (!grids.length) return;

    grids.forEach(function (grid) {
      if (grid.dataset.h2sCardsReady === '1') return; // idempotent
      grid.dataset.h2sCardsReady = '1';

      // Make every card keyboard-operable and announce the flip affordance.
      grid.querySelectorAll('.member-card').forEach(function (card) {
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-pressed', 'false');
        if (!card.getAttribute('aria-label')) {
          var name = card.querySelector('.member-name');
          var hint = (window.H2SI18n && window.H2SI18n.t)
            ? window.H2SI18n.t('sobre.member.cardKbd')
            : 'pressione Enter ou toque para virar o card';
          card.setAttribute('aria-label', (name ? name.textContent.trim() + ' — ' : '') + hint);
        }
      });

      // Tap / click to toggle (ignore clicks on the real social links).
      grid.addEventListener('click', function (e) {
        if (e.target.closest('a, .member-link')) return;
        var card = e.target.closest('.member-card');
        if (card) toggle(card);
      });

      // Enter / Space to toggle when the card itself has focus.
      grid.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        var card = e.target.closest('.member-card');
        if (card && e.target === card) {
          e.preventDefault();
          toggle(card);
        }
      });
    });
  }

  function toggle(card) {
    var flipped = card.classList.toggle('is-flipped');
    card.setAttribute('aria-pressed', String(flipped));
    var front = card.querySelector('.card-front');
    var back = card.querySelector('.card-back');
    if (front) front.setAttribute('aria-hidden', String(flipped));
    if (back) back.setAttribute('aria-hidden', String(!flipped));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
