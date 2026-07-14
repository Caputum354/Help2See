/*!
 * Help2See — site interactions (js/script.js)
 * Reconstructed from the existing markup + CSS state classes so every
 * interactive element on the static pages works without 404s.
 * It only toggles classes the stylesheet already defines
 * (.nav-hamburger.open, .mobile-menu.open, .faq-item.open) — no redesign,
 * no new visuals. All handlers are guarded so missing elements are no-ops.
 */
(function () {
  'use strict';

  /* ── FAQ accordion ──────────────────────────────────────────────
     The pricing page calls toggleFAQ(this) inline, so it must be global.
     CSS reveals the answer via .faq-item.open .faq-answer. */
  function toggleFAQ(btn) {
    if (!btn) return;
    var item = btn.closest('.faq-item');
    if (!item) return;
    var open = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  }
  window.toggleFAQ = toggleFAQ; // expose for inline onclick handlers

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  ready(function () {
    /* ── Mobile menu / hamburger ──────────────────────────────── */
    var hamburger = document.querySelector('.nav-hamburger');
    var mobileMenu = document.querySelector('.mobile-menu');

    var t = (window.H2SI18n && window.H2SI18n.t) ? window.H2SI18n.t : function (k) {
      return k === 'nav.closeMenu' ? 'Fechar menu' : 'Abrir menu';
    };
    function setMenu(open) {
      if (!hamburger || !mobileMenu) return;
      hamburger.classList.toggle('open', open);
      mobileMenu.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
      hamburger.setAttribute('aria-label', open ? t('nav.closeMenu') : t('nav.openMenu'));
      document.body.style.overflow = open ? 'hidden' : '';
    }

    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', function () {
        setMenu(!hamburger.classList.contains('open'));
      });
      // Close after choosing a destination.
      mobileMenu.addEventListener('click', function (e) {
        if (e.target.closest('a')) setMenu(false);
      });
      // Close on Escape for keyboard users.
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && hamburger.classList.contains('open')) setMenu(false);
      });
    }

    /* ── Sticky-nav scrolled state + active link ──────────────── */
    var nav = document.querySelector('nav[role="navigation"], nav');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('nav-scrolled', window.scrollY > 20); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    /* ── Smooth scroll for same-page anchors ──────────────────── */
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id.length < 2) return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    /* ── Optional scroll-reveal (only if GSAP + ScrollTrigger present) ─
       Enhancement: gently fades sections in. Skipped entirely when GSAP
       isn't loaded or the user prefers reduced motion. */
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced && window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      document.querySelectorAll('section').forEach(function (sec) {
        window.gsap.from(sec, {
          opacity: 0, y: 28, duration: 0.7, ease: 'power2.out',
          scrollTrigger: { trigger: sec, start: 'top 85%', once: true }
        });
      });
    }
  });
})();
