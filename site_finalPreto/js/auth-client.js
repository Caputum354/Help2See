/*!
 * Help2See — cliente de autenticação (js/auth-client.js)
 *
 * Conversa com o backend FastAPI (/api/auth/*) e guarda a sessão no
 * localStorage: h2s_token (token de sessão) + h2s_user (JSON do usuário).
 * Carregue ANTES dos scripts de página que usam window.h2sAuth.
 *
 * A base da API pode ser sobrescrita com window.H2S_API_BASE (padrão:
 * http://127.0.0.1:8000 — o mesmo backend do plugin/TTS).
 */
(function (global) {
  'use strict';

  // Base da API: window.H2S_API_BASE tem prioridade; senão detecta o ambiente —
  // localhost usa o backend local, em produção usa o backend público (Railway).
  // ⚠️ Troque a URL de produção abaixo pelo domínio do seu backend no Railway.
  var API = (global.H2S_API_BASE || (
    /^(localhost|127\.0\.0\.1|)$/.test(location.hostname)
      ? 'http://127.0.0.1:8000'
      : 'https://help2see-production.up.railway.app'
  )).replace(/\/+$/, '');
  var TOKEN_KEY = 'h2s_token';
  var USER_KEY = 'h2s_user';

  function setSession(user, token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { /* localStorage indisponível */ }
  }
  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) { /* sem efeito */ }
  }
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function isLoggedIn() { return !!getToken(); }

  function parse(resp) {
    return resp.text().then(function (txt) {
      var data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* não-JSON */ }
      return { ok: resp.ok, status: resp.status, data: data };
    });
  }
  function request(method, path, body, auth) {
    var headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (auth) { var t = getToken(); if (t) headers['Authorization'] = 'Bearer ' + t; }
    return fetch(API + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      mode: 'cors',
      credentials: 'omit'
    }).then(parse);
  }

  // Extrai uma mensagem amigável do erro do FastAPI (detail string ou lista).
  function errorMessage(res, fallback) {
    var d = res && res.data && res.data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d.length && d[0] && d[0].msg) return d[0].msg;
    if (fallback) return fallback;
    return (window.H2SI18n && window.H2SI18n.t) ? window.H2SI18n.t('auth.errGeneric')
      : 'Algo deu errado. Tente novamente.';
  }

  global.h2sAuth = {
    api: API,

    register: function (name, email, password) {
      return request('POST', '/api/auth/register',
        { name: name, email: email, password: password })
        .then(function (res) {
          if (res.ok && res.data) setSession(res.data.user, res.data.token);
          return res;
        });
    },
    login: function (email, password) {
      return request('POST', '/api/auth/login', { email: email, password: password })
        .then(function (res) {
          if (res.ok && res.data) setSession(res.data.user, res.data.token);
          return res;
        });
    },
    logout: function () {
      var p = request('POST', '/api/auth/logout', {}, true).catch(function () {});
      clearSession();   // limpa localmente mesmo que a rede falhe
      return p;
    },
    me: function () { return request('GET', '/api/auth/me', null, true); },
    // Revalida o usuário no servidor e atualiza o cache local (email_verified etc.).
    refreshUser: function () {
      return request('GET', '/api/auth/me', null, true).then(function (res) {
        if (res.ok && res.data) {
          try { localStorage.setItem(USER_KEY, JSON.stringify(res.data)); } catch (e) { /* sem efeito */ }
        }
        return res;
      });
    },
    confirm: function (token) { return request('POST', '/api/auth/confirm', { token: token }); },
    resendConfirmation: function () {
      return request('POST', '/api/auth/resend-confirmation', {}, true);
    },
    forgot: function (email) { return request('POST', '/api/auth/forgot', { email: email }); },
    verifyCode: function (email, code) {
      return request('POST', '/api/auth/verify-code', { email: email, code: code });
    },
    reset: function (exchangeToken, password) {
      return request('POST', '/api/auth/reset',
        { exchange_token: exchangeToken, password: password });
    },

    // ── Assinatura do plano Profissional (Mercado Pago) ──
    // Estado atual da assinatura do usuário logado.
    getSubscription: function () {
      return request('GET', '/api/subscription', null, true);
    },
    // Cria o checkout (cycle: 'monthly' | 'annual') → res.data.init_point.
    startCheckout: function (cycle) {
      return request('POST', '/api/subscription/checkout', { cycle: cycle }, true);
    },
    // Confirma o pagamento de retorno (?payment_id=...) e ativa a assinatura.
    confirmCheckout: function (paymentId) {
      return request('POST', '/api/subscription/confirm', { payment_id: String(paymentId) }, true);
    },
    cancelSubscription: function () {
      return request('POST', '/api/subscription/cancel', {}, true);
    },

    getUser: getUser,
    getToken: getToken,
    isLoggedIn: isLoggedIn,
    clearSession: clearSession,
    errorMessage: errorMessage
  };
})(typeof window !== 'undefined' ? window : this);
