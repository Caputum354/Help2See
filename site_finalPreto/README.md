# Help2See 3.0

Plataforma de acessibilidade web (plugin leve, sem framework) + site
institucional + backend FastAPI. Esta versão **evolui** o projeto 2.0
preservando design, identidade visual, páginas e recursos existentes.

---

## Estrutura

```
site_finalPreto/
├── index.html  plugin.html  precos.html  sobre.html  contato.html  login.html
├── css/        style.css  auth.css  precos.css
├── js/
│   ├── help.js          ← Plugin Help2See 3.0 (único arquivo, sem build)
│   ├── script.js        ← Nav, menu mobile, FAQ (toggleFAQ), reveals
│   ├── auth-nav.js      ← Estado de login na navegação
│   ├── particle-wave.js ← Parallax sutil do fundo (.bg-light)
│   └── team-cards.js    ← Flip por toque/teclado dos cards do time
├── img/        logos + 8 fotos do time
└── backend/    ← API FastAPI (proxy ElevenLabs)
    ├── app.py  requirements.txt  .env.example
    ├── routes/ (health, tts)  services/ (voice_provider, ai_providers)
    ├── models/ (schemas)       utils/ (config)
```

## Rodar o site (estático)

Abra a pasta no VS Code e use **Live Server** (ou qualquer servidor estático):

```
# alternativa via Python:
python3 -m http.server 5500
# depois acesse http://127.0.0.1:5500/index.html
```

O plugin Help2See carrega sozinho (botão flutuante no canto). Atalhos:
`Alt+H` menu · `Alt+L` ler página · `Alt+P` parar · `Alt+C` alto contraste ·
`Alt+G` escala de cinza · `Alt+E` espaçamento · `Alt + +/–` fonte.

## Rodar o backend (opcional — voz premium ElevenLabs)

Requer **Python 3.13** (também funciona em 3.10–3.12).

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1        # Windows PowerShell
# source .venv/bin/activate       # Linux/macOS
pip install -r requirements.txt
copy .env.example .env            # adicione sua ELEVENLABS_API_KEY
uvicorn app:app --reload          # http://127.0.0.1:8000/docs
```

### Testar a API

**1) Saúde do serviço**

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
# -> status=ok ... elevenlabs_configured=True  (quando a chave está no .env)
```

**2) TTS — PowerShell (Invoke-RestMethod)**

> Importante: sempre informe `-ContentType "application/json; charset=utf-8"`.
> Sem isso, o PowerShell envia o corpo como *form-urlencoded* e/ou em
> Windows-1252, o que quebra acentos (á, ç, ã, õ) no servidor.

```powershell
$body = @{ text = "Olá! Teste de acessibilidade."; language = "pt-BR" } |
        ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/tts `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
  -OutFile saida.mp3
# Toque o arquivo: start saida.mp3
```

**3) TTS — curl.exe (Windows/Linux/macOS)**

```bash
curl.exe -X POST http://127.0.0.1:8000/api/tts ^
  -H "Content-Type: application/json" ^
  --data-binary "{\"text\":\"Olá, mundo!\",\"language\":\"pt-BR\"}" ^
  --output saida.mp3
```

**4) Testes automatizados (pytest + FastAPI TestClient)**

```bash
pip install -r requirements-dev.txt
pytest -q
```

### Solução de problemas

- **`There was an error parsing the body` (HTTP 400):** o corpo não chegou em
  UTF-8 — quase sempre o PowerShell enviando acentos em Windows-1252. Use o
  exemplo (2) acima com `UTF8.GetBytes`. O backend já tolera esse caso e
  converte automaticamente, registrando um aviso no log.
- **HTTP 422:** JSON inválido ou `Content-Type` ausente/errado. Confira o log
  do servidor — ele agora imprime o corpo recebido e os erros de validação.
- **HTTP 503:** `ELEVENLABS_API_KEY` não configurada no `.env`.
- **HTTP 402 (Payment Required) mesmo com créditos:** a `voice_id` é uma voz
  *legada/da biblioteca* (ex.: Rachel `21m00Tcm4TlvDq8ikWAM`), que o plano
  Free **não** permite usar via API. Liste as vozes da sua conta e use uma
  delas:

  ```powershell
  Invoke-RestMethod http://127.0.0.1:8000/api/voices
  ```

  Depois deixe `ELEVENLABS_VOICE_ID` em branco (resolução automática) ou
  defina um dos IDs retornados. O backend também tenta automaticamente uma
  voz da conta quando recebe 402 (`ELEVENLABS_AUTO_RESOLVE_VOICE=true`).

### Vozes disponíveis

`GET /api/voices` retorna apenas as vozes que a sua conta pode usar pela API
(`{ "count": N, "voices": [{ "id", "name", "category" }] }`). Use esse
endpoint para escolher uma `voice_id` válida.

A voz ElevenLabs já é o **provedor padrão** — basta `Help2See.init()` e o
plugin usa `http://127.0.0.1:8000` automaticamente. Para apontar para outro
backend (ou outra porta), passe `baseUrl` explicitamente:

```html
<script>
  // Padrão (equivalente a não passar nada):
  Help2See.init();

  // Backend customizado:
  Help2See.init({ voice: { provider: 'elevenlabs', baseUrl: 'https://meu-backend.exemplo' } });

  // Forçar apenas a voz do navegador (sem backend):
  Help2See.init({ voice: { provider: 'browser' } });
</script>
```

A chave **nunca** vai para o frontend — toda chamada à ElevenLabs passa
pelo FastAPI. Se o backend estiver offline ou retornar qualquer erro
(401/402/429/500, rede, etc.), o plugin cai automaticamente na voz gratuita
do navegador, sem travar.

---

## Analytics de acessibilidade (pipeline de telemetria)

Pipeline **privacy-first** que mede fricção de acessibilidade (visitas,
erros/abandono de formulário, uso dos recursos do Help2See) sem rastrear
pessoas. O plugin acumula eventos no navegador e envia em lotes para
`POST /api/collect`; a API resolve o site, **sanitiza**, pseudonimiza e grava
no MongoDB (coleção time-series com TTL de 90 dias); um job horário gera os
rollups (`metrics_daily`, `a11y_issues`, `alerts`).

### Garantias de privacidade

- **Nunca** grava o valor digitado em formulários — só o nome técnico do campo
  (`email`) e um código (`required`, `invalid_format`).
- O **IP** entra apenas no cálculo do pseudônimo do visitante (HMAC), **nunca**
  é gravado. O hash inclui o **dia**, então rotaciona diariamente: conta únicos
  por dia, sem seguir a pessoa ao longo do tempo.
- Paths perdem query string e IDs são normalizados (`/user/123` → `/user/:id`).
- O plugin envia só o `site_key` público; o servidor decide o tenant (`org_id`).
- Tipos de evento desconhecidos são descartados; o bruto expira em 90 dias.

### Bancos e variáveis (.env)

Requer **MongoDB** (eventos + agregados) e **MySQL** (mapeamento `site_key`).
Veja `backend/.env.example`: `MONGODB_URI`, `MONGODB_DB`, `MYSQL_*`,
`VISITOR_HASH_SECRET` (gere um: `python -c "import secrets;print(secrets.token_hex(32))"`),
`EVENTS_TTL_SECONDS`, `COLLECT_MAX_BATCH`, `TRUST_PROXY`, `SCHEDULER_ENABLED`.

Crie o mapeamento mínimo de sites (organizations/sites + um `site_key` de
teste) no MySQL:

```bash
mysql -u root -p < backend/db/mysql_sites.sql
```

> Observação: este SQL é só a fatia que o `resolve_site()` precisa. A stack
> completa de autenticação (users/tokens/login) **não** faz parte deste pacote.

### Habilitar no plugin (opt-in)

Desligado por padrão. Para coletar, passe `analytics` no `init` (o `endpoint`
cai por padrão em `${voice.baseUrl}/api/collect`):

```html
<script>
  Help2See.init({
    analytics: {
      enabled: true,
      siteKey: '01ARZ3NDEKTSV4RRFFQ69G5FAV',   // do MySQL (sites.site_key)
      // endpoint: 'https://meu-backend.exemplo/api/collect',  // opcional
      sampleRate: 1,            // 0..1 (amostragem por sessão)
      flushIntervalMs: 15000,
      maxBatch: 30
    }
  });
</script>
```

O coletor envia em lote via `navigator.sendBeacon` (com fallback `fetch`
`keepalive`) e nunca bloqueia/quebra a página hospedeira.

### Auditoria WCAG silenciosa

Quando o analytics está ligado, o plugin roda **uma vez por sessão** (em
`requestIdleCallback`, após o carregamento) um auditor WCAG **100% invisível**
— sem painel, notificação, foco ou alteração de DOM. Ele só lê a página e
reporta:

- **Problemas por página** → `a11y_issues`: contraste (1.4.3, luminância real),
  imagem sem `alt` (1.1.1), campo sem rótulo (1.3.1/4.1.2), link/botão sem nome
  acessível (4.1.2), `tabindex` positivo (2.4.3).
- **Status do site** → coleção `wcag_status` (um doc por site): o **nível**
  estimado (`AA` / `A` / `none`), `has_wcag` (bool), `score` e `violations`.
  Critérios de nível A reprovados → `none`; só AA reprovado → `A`; tudo OK nas
  checagens automáveis → `AA`.

Para desligar só a auditoria (mantendo o resto do analytics):
`Help2See.init({ analytics: { enabled: true, siteKey: '…', wcagAudit: false } })`.

> Nota: checagem automática cobre uma parte do WCAG; um nível "AA" aqui indica
> ausência de falhas *detectáveis por código*, não uma certificação manual.

### Job de agregação (rollups + alertas)

Idempotente (upsert com `_id` determinístico — rodar 2× não duplica):

```bash
cd backend
python -m jobs.aggregate                 # agrega o dia de hoje (UTC)
python -m jobs.aggregate --day 2026-06-21
```

Em produção, agende de hora em hora via cron **ou** ligue `SCHEDULER_ENABLED=true`
para rodar in-process (APScheduler) junto do servidor.

### Testes

```bash
pip install -r requirements-dev.txt
pytest -q          # inclui test_collect.py (sanitizador, visitor_hash, /collect)
```

---

## Autenticação (cadastro + login + recuperação de senha)

Login/cadastro/recuperação de senha são servidos pelo **mesmo backend FastAPI**
(rotas `/api/auth/*`), com dados em **MySQL**. A recuperação de senha é feita
por **e-mail** (SMTP): o `/forgot` envia um código de 6 dígitos ao e-mail da
conta, o `/verify-code` troca o código por um token de uso único e o `/reset`
aplica a nova senha. O front (`login.html`, `recover-code.html`, `reset.html`)
fala com a API via [js/auth-client.js](js/auth-client.js) e guarda a sessão no
`localStorage` (`h2s_token` + `h2s_user`).

### Segurança

- Senha gravada como **hash Argon2** (OWASP), com re-hash transparente no login.
- Tokens (sessão e reset) guardam só o **SHA-256** no banco; o valor bruto vai
  ao usuário. Se o banco vazar, os tokens são inúteis.
- Login e "esqueci a senha" respondem **igual** exista ou não o e-mail
  (anti-enumeração).
- Trocar a senha **invalida todas as sessões** ativas.

### Endpoints

| Método | Rota | Função |
|---|---|---|
| POST | `/api/auth/register` | cadastro (já devolve token = auto-login) |
| POST | `/api/auth/login` | login |
| POST | `/api/auth/logout` | encerra a sessão (`Authorization: Bearer <token>`) |
| GET  | `/api/auth/me` | dados do usuário logado (Bearer) |
| POST | `/api/auth/forgot` | envia o código de recuperação por e-mail |
| POST | `/api/auth/verify-code` | valida o código e devolve um token de troca |
| POST | `/api/auth/reset` | redefine a senha via token de troca |

### Configuração

1. Crie as tabelas. Rode os dois scripts, nesta ordem (o segundo é **aditivo**:
   adiciona `password_reset_codes` e `login_history`):
   ```bash
   mysql -u root -p help2see < backend/db/mysql_auth.sql
   mysql -u root -p help2see < backend/db/mysql_auth_whatsapp.sql
   ```
2. No `.env`, preencha o **SMTP** (envio do código). Ex.: Gmail com uma
   ["Senha de app"](https://myaccount.google.com/apppasswords):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=voce@gmail.com
   SMTP_PASSWORD=sua-senha-de-app
   SMTP_FROM=voce@gmail.com
   SMTP_FROM_NAME=Help2See
   ```
   > Sem SMTP configurado, o `/api/auth/forgot` ainda funciona em **modo dev**:
   > o código de 6 dígitos volta na resposta (campo `dev_code`) e no log, para
   > teste manual via `verify-code` / `reset.html`.
3. A base da API no front é `http://127.0.0.1:8000` por padrão; para apontar
   para outra URL, defina `window.H2S_API_BASE` antes de `js/auth-client.js`.

O fluxo completo (cadastro → login → /me → esqueci → verifica código → reset →
invalidação de sessão → logout) é coberto por `tests/test_auth.py`.

---

## O que mudou nesta evolução (3.0)

**Bugs corrigidos**
- **Flip dos cards** (Sobre Nós): faltava a regra que girava `.card-inner`.
  Adicionada em `style.css` (hover no desktop, `:focus-within` no teclado,
  `.is-flipped` para toque) — por isso os ícones sociais (ex.: do Ítalo)
  não apareciam: o verso nunca era exibido. Estrutura do card do Ítalo
  normalizada.
- **Carregamento duplicado**: GSAP e plugin eram carregados 2×, com
  `plugin/help.js`/`js/a11y-widget.js` inexistentes (404) e `Help2See.init()`
  rodando antes do plugin. Agora: bibliotecas e plugin carregados **uma vez**,
  init único com guarda (`window.__h2sBooted`), seguro para SPA.
- Scripts referenciados e ausentes (`script.js`, `particle-wave.js`,
  `auth-nav.js`) reconstruídos a partir do markup/CSS reais.
- `toggleFAQ()` (chamado inline) estava indefinido → definido em `script.js`.

**Links do time** — LinkedIn/Instagram/GitHub corretos para os 8 membros,
`target="_blank"` + `rel="noopener noreferrer"`, `aria-label`s com nome real.

**Plugin Help2See 3.0** — botão 80×80, atalhos de teclado, comandos de voz
em pt-BR (com fallback em inglês), abstração de provedores de voz
(Browser/ElevenLabs + hooks para OpenAI/Google/Azure), scanner WCAG com
novas checagens (iframe sem título, links repetidos, focável oculto),
interface 100% em pt-BR.

**Preservado**: design, cores, identidade, páginas, layouts e todos os
perfis/recursos de acessibilidade. Sem React, sem TypeScript.
```
