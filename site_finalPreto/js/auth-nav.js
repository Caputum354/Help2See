/*!
 * Help2See — estado de login na navegação (js/auth-nav.js)
 *
 * Reflete a sessão (backend FastAPI) no topo do site: quando há usuário logado,
 * o CTA "Entrar" vira "Sair (Nome)". Lê a sessão do localStorage
 * (h2s_token + h2s_user) gravada pelo js/auth-client.js. É autocontido — não
 * depende do auth-client estar carregado nesta página.
 */
(function () {
  'use strict';
  // ⚠️ Troque a URL de produção pelo domínio do seu backend no Railway.
  var API = (window.H2S_API_BASE || (
    /^(localhost|127\.0\.0\.1|)$/.test(location.hostname)
      ? 'http://127.0.0.1:8000'
      : 'https://SEU-BACKEND.up.railway.app'
  )).replace(/\/+$/, '');
  var TOKEN_KEY = 'h2s_token';
  var USER_KEY = 'h2s_user';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else { fn(); }
  }

  function currentUser() {
    try {
      if (!localStorage.getItem(TOKEN_KEY)) return null;   // sem sessão
      var u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      if (!u || !u.email) return null;
      return { email: u.email, name: u.name || u.email };
    } catch (e) { return null; }
  }

  function logout() {
    var token = null;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* sem efeito */ }
    // Best-effort: encerra a sessão no servidor (não bloqueia o redirect).
    if (token) {
      try {
        fetch(API + '/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          mode: 'cors', credentials: 'omit', keepalive: true
        }).catch(function () { /* offline: limpamos localmente mesmo assim */ });
      } catch (e) { /* sem efeito */ }
    }
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) { /* sem efeito */ }
    window.location.href = 'index.html';
  }

  // Insere um link "Minha conta" (→ conta.html) imediatamente antes do CTA, no
  // formato certo: <li><a> na nav desktop, <a> solto no menu mobile.
  // Localization helper — falls back to sensible pt defaults if i18n.js is
  // (unexpectedly) absent, so this file stays self-contained.
  function t(key, vars) {
    if (window.H2SI18n && window.H2SI18n.t) return window.H2SI18n.t(key, vars);
    var pt = {
      'nav.myAccount': 'Minha conta',
      'nav.logout': 'Sair ({name})',
      'nav.logoutAria': 'Sair da conta de {name}'
    };
    var s = pt[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  function addAccountLink(cta) {
    var parent = cta.parentNode;
    if (!parent) return;
    var isLi = parent.tagName === 'LI';
    var host = isLi ? parent.parentNode : parent;   // <ul> (desktop) ou .mobile-menu
    var before = isLi ? parent : cta;               // nó de referência p/ inserir antes
    if (!host || host.querySelector('a[href="conta.html"]')) return; // não duplica
    var link = document.createElement('a');
    link.href = 'conta.html';
    link.setAttribute('data-i18n', 'nav.myAccount');   // re-localized on language change
    link.textContent = t('nav.myAccount');
    if (isLi) {
      var li = document.createElement('li');
      li.appendChild(link);
      host.insertBefore(li, before);
    } else {
      host.insertBefore(link, before);
    }
  }

  // Apply the logged-in labels (also re-run on live language change).
  function applyAuthLabels(user) {
    var first = (user.name || '').split(' ')[0] || user.name;
    document.querySelectorAll('.nav-cta, .mobile-cta').forEach(function (cta) {
      cta.textContent = t('nav.logout', { name: first });
      cta.setAttribute('aria-label', t('nav.logoutAria', { name: user.name }));
    });
  }

  ready(function () {
    var user = currentUser();
    if (!user) return; // deslogado → mantém os links "Entrar" padrão

    document.querySelectorAll('.nav-cta, .mobile-cta').forEach(function (cta) {
      addAccountLink(cta);
      cta.setAttribute('href', '#');
      cta.addEventListener('click', function (e) { e.preventDefault(); logout(); });
    });
    applyAuthLabels(user);

    // Keep the logged-in CTA text/aria in sync with live language switches.
    document.addEventListener('help2see:languagechange', function () { applyAuthLabels(user); });
  });
})();
