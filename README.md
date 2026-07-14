# Help2See 5.0

**Plataforma de acessibilidade digital com IA** — um plugin de acessibilidade embutível em qualquer site, um site institucional e uma API que centraliza voz, autenticação, telemetria e assinaturas.

> A internet foi feita para todos. O Help2See garante que seja.

Alvo de conformidade: **WCAG AAA** e **Lei Brasileira de Inclusão (13.146/2015)**.

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
                      SMTP/Gmail (e-mails) · VLibras (Libras)
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
Cadastro com **confirmação por e-mail**, login com sessão por token (TTL 30 dias), senha com hash **Argon2** (recomendação OWASP), recuperação por **código OTP de 6 dígitos** via SMTP — tudo com rate-limiting anti força-bruta. O usuário é sempre derivado do Bearer token no servidor.

### 💳 Assinatura Profissional — `/api/subscription/*`
Checkout Pro do **Mercado Pago** com preço decidido **no servidor** (R$ 49/mês ou R$ 468/ano). Webhook de notificação **validado por assinatura HMAC** (`x-signature`) antes de qualquer ativação; confirmação idempotente; cancelamento mantém acesso até o fim do período pago. MySQL é a fonte da verdade.

<img width="1899" height="1008" alt="image" src="https://github.com/user-attachments/assets/52ef0513-96fb-418a-965a-50f221bb191c" />


### 📊 Telemetria privacy-first — `/api/collect`
**Opt-in, desligada por padrão.** Eventos anônimos de uso/fricção de acessibilidade: pseudônimo de visitante com **rotação diária via HMAC** (nunca IP bruto), sem valores de formulário, armazenados no MongoDB com **TTL de 90 dias** e agregados por hora (`jobs/aggregate.py`). Detalhes em [site_finalPreto/ANALYTICS.md](site_finalPreto/ANALYTICS.md).

### ✉️ Contato comercial — `/api/contact`
Formulário do site encaminhado por e-mail à equipe (Reply-To = visitante), com rate-limit por IP. Nada é persistido no servidor.

<img width="1911" height="924" alt="image" src="https://github.com/user-attachments/assets/d7679fe7-0de1-4b01-8adb-663e85d5fd17" />

### 🌐 Site institucional
11 páginas com **i18n em 3 idiomas** (PT/EN/ES), skip-links, ARIA, foco visível e `prefers-reduced-motion`. Páginas: home, plugin, preços, sobre, FAQ, contato, login/conta e fluxo completo de recuperação de senha.

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
| Integrações | ElevenLabs · Mercado Pago SDK · smtplib · VLibras |
| Testes | pytest (50 testes, sem dependência de serviços reais) |

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

## Deploy (produção)

| Peça | Onde | Como |
|---|---|---|
| Frontend | **Vercel** | Root Directory = `site_finalPreto` (o [`.vercelignore`](site_finalPreto/.vercelignore) exclui `backend/`) |
| Backend | **Railway** | Root Directory = `site_finalPreto/backend` (start via [`Procfile`](site_finalPreto/backend/Procfile)) |
| MySQL | Railway (plugin) | rede privada com o backend |
| MongoDB | **MongoDB Atlas** (M0 grátis) | string `mongodb+srv://` |

1. Importe o repositório na Vercel e no Railway conforme a tabela.
2. No Railway, cadastre as variáveis de ambiente usando as **chaves** de [`.env.production.example`](site_finalPreto/backend/.env.production.example) (os valores só existem no painel — nunca no git).
3. Cruze as URLs: `CORS_ORIGINS` e `FRONTEND_BASE_URL` (Railway) ← URL da Vercel; substitua o placeholder `https://SEU-BACKEND.up.railway.app` nos arquivos `js/auth-client.js`, `js/auth-nav.js`, `js/help.js` e `contato.html` → URL do Railway; webhook do Mercado Pago → `https://SEU-BACKEND.up.railway.app/api/subscription/webhook`.
4. Em produção, use credenciais **de produção** do Mercado Pago (`APP_USR-`) e gere novos segredos HMAC (`python -c "import secrets; print(secrets.token_hex(32))"`).

## Segurança — princípios do repositório

- **Nenhum segredo no git**: o `.gitignore` bloqueia qualquer `.env`; os templates (`.env.example`, `.env.production.example`) só têm chaves vazias e placeholders.
- **Nenhum segredo no navegador**: TTS é proxy server-side; preços decididos no servidor; `user_id` derivado do token de sessão, nunca do cliente.
- **Webhook assinado**: notificações do Mercado Pago só são aceitas com HMAC válido.
- **Privacidade por padrão**: telemetria opt-in, pseudonimizada, com TTL e sem dados de formulário.

## Estrutura do repositório

```
.
├── README.md                ← este arquivo
├── .gitignore               ← bloqueia .env, venv, caches
└── site_finalPreto/         ← projeto completo
    ├── *.html               ← 11 páginas + 404.html
    ├── css/  js/  img/      ← estáticos (help.js = plugin)
    ├── vercel.json  .vercelignore
    ├── README.md            ← docs detalhadas do plugin e do site
    ├── ANALYTICS.md         ← pipeline de telemetria em detalhe
    └── backend/             ← Help2See API (FastAPI)
        ├── app.py  Procfile  requirements.txt
        ├── routes/          ← health, tts, voices, collect, auth,
        │                      subscription, contact
        ├── services/        ← regras de negócio e integrações
        ├── models/          ← schemas Pydantic
        ├── jobs/            ← agregação horária de analytics
        ├── db/              ← scripts SQL (MySQL)
        ├── tests/           ← 50 testes (pytest)
        └── utils/           ← config (.env), rede, encoding
```

---

Feito com o objetivo de tornar a web acessível para todos os brasileiros — uma página por vez.
