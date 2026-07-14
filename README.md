# Help2See 5.0

**Plataforma de acessibilidade digital com IA** — um plugin de acessibilidade embutível em qualquer site, um site institucional e uma API que centraliza voz, autenticação, telemetria e assinaturas.

> A internet foi feita para todos. O Help2See garante que seja.

Alvo de conformidade: **WCAG AAA** e **Lei Brasileira de Inclusão (13.146/2015)**.

## 🌐 Em produção

| | URL |
|---|---|
| **Site** | https://help2-see.vercel.app |
| **API** | https://help2see-production.up.railway.app (docs em `/docs` · saúde em `/api/health`) |
| **Termos de Uso e Privacidade** | https://help2-see.vercel.app/termos |

---

## Visão geral da arquitetura

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  Frontend (estático)    │  HTTPS │  Backend — Help2See API 3.0  │
│  site_finalPreto/       │ ─────► │  FastAPI (Python)            │
│  11 páginas + plugin    │  /api  │  site_finalPreto/backend/    │
└─────────────────────────┘        └──────────┬───────────────────┘
     hospedado na Vercel                      │
                                   ┌──────────┴───────────┐
                                   │                      │
                              ┌────▼─────┐          ┌─────▼─────┐
                              │  MySQL 8 │          │  MongoDB  │
                              │ usuários │          │ analytics │
                              │assinatura│          │  (TTL 90d)│
                              └──────────┘          └───────────┘

Integrações externas: ElevenLabs (TTS) · Mercado Pago (assinatura)
                      Brevo (e-mails via API HTTPS; SMTP como fallback)
                      VLibras (Libras)
```

- O **frontend** é 100% estático (HTML/CSS/JS, sem build) e nunca contém segredos.
- O **backend** é a única camada que fala com bancos e serviços externos; todas as credenciais vivem em variáveis de ambiente (`.env`, fora do git).
- O frontend detecta o ambiente sozinho: em `localhost` chama `http://127.0.0.1:8000`; em produção chama a URL pública do backend.

## Funcionalidades

### 🔌 Plugin de acessibilidade (`js/help.js`)
Widget flutuante embutível, sem framework e sem build. Oferece ajustes visuais (alto contraste, escala de cinza, tamanho de fonte, espaçamento, altura de linha), **leitura da página em voz alta**, tradução para **Libras** (VLibras) e preferências persistidas. Atalhos: `Alt+H` menu · `Alt+L` ler · `Alt+P` parar · `Alt+C` contraste · `Alt+G` cinza · `Alt+E` espaçamento · `Alt +/−` fonte.

### 🗣️ Text-to-Speech — `/api/tts`, `/api/voices`
O backend atua como **proxy do ElevenLabs**: a API key nunca chega ao navegador. Modelo multilíngue (`eleven_multilingual_v2`) com resolução automática de voz. Se o backend estiver fora, o plugin cai graciosamente para a voz gratuita do navegador (Web Speech API).

### 🔐 Autenticação — `/api/auth/*`
Cadastro com **confirmação por e-mail** (com botão de **reenviar** na página Minha Conta enquanto pendente), login com sessão por token (TTL 30 dias), senha com hash **Argon2** (recomendação OWASP), recuperação por **código OTP de 6 dígitos** por e-mail — tudo com rate-limiting anti força-bruta. O usuário é sempre derivado do Bearer token no servidor.

### 💳 Assinatura Profissional — `/api/subscription/*`
Checkout Pro do **Mercado Pago** com preço decidido **no servidor** (R$ 49/mês ou R$ 468/ano). Webhook de notificação **validado por assinatura HMAC** (`x-signature`) antes de qualquer ativação; confirmação idempotente; cancelamento mantém acesso até o fim do período pago. MySQL é a fonte da verdade.

<img width="1899" height="1008" alt="image" src="https://github.com/user-attachments/assets/52ef0513-96fb-418a-965a-50f221bb191c" />


### 📊 Telemetria privacy-first — `/api/collect`
**Ativa por padrão** (exige uma `site_key` cadastrada — sem ela nada é enviado) e **divulgada com transparência nos [Termos de Uso](site_finalPreto/termos.html)**: coleta métricas de interação do plugin (toggles de recursos, leitor de voz, atalhos) e sinais de erro, exclusivamente para aprimorar o produto. Pseudônimo de visitante com **rotação diária via HMAC** (nunca IP bruto), sem valores de formulário, MongoDB com **TTL de 90 dias** e agregação horária (`jobs/aggregate.py`). Opt-out: `Help2See.init({ analytics: { enabled: false } })`. Detalhes em [site_finalPreto/ANALYTICS.md](site_finalPreto/ANALYTICS.md).

### ✉️ E-mails transacionais + contato comercial — `/api/contact`
Confirmação de cadastro, código OTP de senha e o formulário de contato (Reply-To = visitante, rate-limit por IP) saem pela **API HTTPS do Brevo** — necessária porque hosts como o Railway bloqueiam portas SMTP em planos gratuitos. Sem a `BREVO_API_KEY`, o mailer cai para SMTP (dev local com Gmail). Nada do contato é persistido no servidor.

<img width="1911" height="924" alt="image" src="https://github.com/user-attachments/assets/d7679fe7-0de1-4b01-8adb-663e85d5fd17" />

### 🌐 Site institucional
12 páginas com **i18n em 3 idiomas** (PT/EN/ES), skip-links, ARIA, foco visível e `prefers-reduced-motion`. Páginas: home, plugin, preços, sobre, FAQ, contato, login/conta, fluxo completo de recuperação de senha, **Termos de Uso e Privacidade** e 404 customizada. **UI mobile dedicada**: menu lateral em gaveta (drawer com backdrop, fecha por toque fora/Esc), tipografia redimensionada por viewport, CTAs empilhados com área de toque generosa e zero overflow horizontal.

<img width="1894" height="985" alt="image" src="https://github.com/user-attachments/assets/5826573e-4a69-412d-b86c-cb1e8be8805d" />

<img width="1903" height="1079" alt="image" src="https://github.com/user-attachments/assets/c4593fe4-4eb5-4329-af67-c5db13d69d61" />

<img width="1902" height="1000" alt="image" src="https://github.com/user-attachments/assets/7097d0a0-1ac0-41e7-83a4-c62d36cf4bd3" />

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript puro (sem build) |
| Backend | Python · FastAPI · Uvicorn · Pydantic v2 |
| Bancos | MySQL 8 (SQLAlchemy + PyMySQL) · MongoDB (PyMongo) |
| Segurança | Argon2 (argon2-cffi) · HMAC-SHA256 · rate-limit em memória |
| Integrações | ElevenLabs · Mercado Pago SDK · Brevo (API HTTP) / smtplib · VLibras |
| Testes | pytest (54 testes, sem dependência de serviços reais) |
| Hospedagem | Vercel (site) · Railway (API + MySQL) · MongoDB Atlas |

## Rodando localmente

Pré-requisitos: **Python 3.11+**, **MySQL 8** e **MongoDB** rodando localmente.

### 1. Configurar o backend (primeira vez)

```powershell
cd site_finalPreto/backend

# criar o venv e instalar dependências
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# criar o .env a partir do template e preencher suas credenciais
copy .env.example .env

# criar bancos/tabelas MySQL (usuário/senha conforme seu .env)
# scripts em db/: mysql_sites.sql → mysql_auth.sql → mysql_auth_whatsapp.sql
#                 → mysql_auth_email_confirm.sql → mysql_subscriptions.sql
```

### 2. Subir os dois servidores (dois terminais)

```powershell
# Terminal 1 — Backend (API em http://127.0.0.1:8000)
cd site_finalPreto/backend
.\.venv\Scripts\Activate.ps1
uvicorn app:app --host 127.0.0.1 --port 8000

# Terminal 2 — Frontend (site em http://127.0.0.1:5500)
cd site_finalPreto
python -m http.server 5500
```

Acesse **http://127.0.0.1:5500/index.html** · Docs interativas da API: **http://127.0.0.1:8000/docs**

Health check: `GET /api/health` → `status=ok`, `mongo_ok=true`, `mysql_ok=true`.

### 3. Testes

```powershell
cd site_finalPreto/backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests -q
```

### Webhook do Mercado Pago em dev

O Mercado Pago precisa alcançar sua máquina: use `ngrok http 8000`, defina `API_PUBLIC_URL=https://SEU-TUNEL.ngrok-free.dev` no `.env` e configure o webhook no painel como `https://SEU-TUNEL.ngrok-free.dev/api/subscription/webhook`.

## Deploy (produção) — como está montado

| Peça | Onde | Como |
|---|---|---|
| Frontend | **Vercel** — `help2-see.vercel.app` | Root Directory = `site_finalPreto` (o [`.vercelignore`](site_finalPreto/.vercelignore) exclui `backend/`); redeploy automático a cada push |
| Backend | **Railway** — `help2see-production.up.railway.app` | Root Directory = `site_finalPreto/backend` (start via [`Procfile`](site_finalPreto/backend/Procfile)) |
| MySQL | Railway (plugin) | rede privada (`mysql.railway.internal`); schema carregado de [`db/railway_schema.sql`](site_finalPreto/backend/db/railway_schema.sql) |
| MongoDB | **MongoDB Atlas** (M0 grátis) | string `mongodb+srv://` na variável `MONGODB_URI` |
| E-mails | **Brevo** (free, 300/dia) | `BREVO_API_KEY` no Railway; remetente verificado no painel do Brevo |

O frontend detecta o ambiente sozinho (`js/auth-client.js`, `js/auth-nav.js`, `js/help.js`, `contato.html`): em `localhost` chama `127.0.0.1:8000`; em produção, a URL do Railway.

### Para reproduzir do zero

1. Importe o repositório na Vercel e no Railway conforme a tabela.
2. No Railway, cadastre as variáveis com as **chaves** de [`.env.production.example`](site_finalPreto/backend/.env.production.example) (valores só no painel — nunca no git). As `MYSQL_*` vêm do card do plugin MySQL.
3. Carregue [`db/railway_schema.sql`](site_finalPreto/backend/db/railway_schema.sql) no MySQL do Railway — script único, já sem `CREATE DATABASE`/`USE` (inclui a `site_key` da telemetria de [`db/mysql_site_producao.sql`](site_finalPreto/backend/db/mysql_site_producao.sql)).
4. No Brevo: verifique o remetente (Senders), gere uma **API key** (`xkeysib-…`, aba API Keys — a chave SMTP `xsmtpsib-` não serve) e desative a restrição de IPs autorizados (o Railway usa IPs dinâmicos).
5. Confirme em `/api/health`: `mongo_ok: true` e `mysql_ok: true`.

### Armadilhas que já custaram tempo (documentadas para não repetir)

- **Railway bloqueia portas SMTP no plano Trial** (`Errno 101`) — por isso os e-mails saem pela API HTTPS do Brevo.
- **Não defina `PORT` manualmente no Railway** — o proxy roteia para a porta que ele injeta; forçar 8000 derruba o serviço com 502.
- **O editor Data → Query do Railway executa um comando por vez** — use o `railway_schema.sql` via cliente MySQL com a `MYSQL_PUBLIC_URL`.
- Em produção, troque o Mercado Pago para credenciais **`APP_USR-`** e gere novos segredos HMAC (`python -c "import secrets; print(secrets.token_hex(32))"`).

## Segurança — princípios do repositório

- **Nenhum segredo no git**: o `.gitignore` bloqueia qualquer `.env`; os templates (`.env.example`, `.env.production.example`) só têm chaves vazias e placeholders. Segredos de produção vivem só no painel do Railway.
- **Nenhum segredo no navegador**: TTS é proxy server-side; preços decididos no servidor; `user_id` derivado do token de sessão, nunca do cliente. A `site_key` da telemetria é pública por design (só funciona se cadastrada e ativa no MySQL).
- **Webhook assinado**: notificações do Mercado Pago só são aceitas com HMAC válido.
- **Privacidade com transparência**: telemetria pseudonimizada (HMAC com rotação diária), TTL de 90 dias, sem dados de formulário — divulgada nos [Termos de Uso](site_finalPreto/termos.html) com base legal LGPD e opt-out documentado.

## Pendências conhecidas

- `ELEVENLABS_API_KEY` ainda é placeholder — a leitura de voz usa o fallback do navegador (Web Speech) até uma chave real ser colocada na variável do Railway.
- Mercado Pago em credenciais de **teste** (`TEST-`) — trocar por `APP_USR-` e apontar o webhook para `https://help2see-production.up.railway.app/api/subscription/webhook` antes de cobrar de verdade.
- Rotacionar os segredos usados durante o desenvolvimento (senha do Atlas, senha de app do Gmail, `MERCADOPAGO_WEBHOOK_SECRET`) antes do lançamento oficial.

## Estrutura do repositório

```
.
├── README.md                ← este arquivo
├── .gitignore               ← bloqueia .env, venv, caches
└── site_finalPreto/         ← projeto completo
    ├── *.html               ← 12 páginas (inclui termos.html) + 404.html
    ├── css/  js/  img/      ← estáticos (help.js = plugin)
    ├── vercel.json  .vercelignore
    ├── README.md            ← docs detalhadas do plugin e do site
    ├── ANALYTICS.md         ← pipeline de telemetria em detalhe
    └── backend/             ← Help2See API (FastAPI)
        ├── app.py  Procfile  requirements.txt
        ├── routes/          ← health, tts, voices, collect, auth,
        │                      subscription, contact
        ├── services/        ← regras de negócio e integrações
        │                      (mailer = Brevo HTTP + fallback SMTP)
        ├── models/          ← schemas Pydantic
        ├── jobs/            ← agregação horária de analytics
        ├── db/              ← scripts SQL (railway_schema.sql = tudo
        │                      em um, pronto para produção)
        ├── tests/           ← 54 testes (pytest)
        └── utils/           ← config (.env), rede, encoding
```

---

Feito com o objetivo de tornar a web acessível para todos os brasileiros — uma página por vez.
