# Help2See — Pipeline de Analytics de Acessibilidade

Documento único com **tudo que mudou** e **como rodar a aplicação completa**
(site + plugin + backend + bancos + agregação + auditoria WCAG silenciosa).

---

## 1. Visão geral

Foi adicionado um pipeline de telemetria **privacy-first** que mede fricção de
acessibilidade sem rastrear pessoas:

```
help.js (coletor + auditor WCAG)  ──lote JSON──▶  POST /api/collect  ──▶  ingest_events()
                                                                          │
                            resolve_site() ── MySQL (sites/orgs, cache TTL)
                            sanitize()     ── tira query string, /user/123→/user/:id,
                                              descarta tipos desconhecidos, remove detail.value
                            visitor_hash() ── HMAC(secret, site_id+IP+UA+dia); IP nunca gravado
                                                                          ▼
                                            MongoDB: events (time-series, TTL 90 dias)
                                                                          │
                            job (APScheduler/CLI) ────────────────────────▼
                            metrics_daily · a11y_issues · alerts · wcag_status  (upsert idempotente)
```

O backend antigo (proxy de TTS da ElevenLabs) continua funcionando igual; o
analytics é um módulo novo ao lado dele. Se os bancos estiverem fora do ar, o
TTS segue normal — só o `/api/collect` falha por requisição.

---

## 2. Tudo que mudou

### 2.1 Arquivos novos (backend)

| Arquivo | O que faz |
|---|---|
| `backend/models/analytics_schemas.py` | Modelos Pydantic: `IncomingEvent`, `EventBatch`, `CollectResponse`. |
| `backend/services/sanitizer.py` | Sanitização privacy-first: `normalize_path`, `sanitize_detail` (whitelist por tipo), `sanitize_a11y`, `ALLOWED_TYPES`. |
| `backend/services/visitor.py` | `visitor_hash` (HMAC-SHA256 com rotação diária) e `utc_day`. IP só alimenta o hash. |
| `backend/services/mongo.py` | Cliente pymongo + `ensure_collections` (cria `events` time-series com TTL e os índices). Constantes das coleções. |
| `backend/services/mysql.py` | `resolve_site(site_key) → (site_id, org_id)` via SQLAlchemy, com cache TTL (5 min). |
| `backend/services/ingest.py` | `ingest_events` — orquestra resolve + sanitiza + pseudonimiza + grava. `SiteNotFoundError`. |
| `backend/routes/collect.py` | Rota `POST /api/collect` (usa `EncodingTolerantRoute`; extrai IP/UA; 404 se site desconhecido). |
| `backend/jobs/__init__.py` | Pacote de jobs. |
| `backend/jobs/aggregate.py` | Rollup diário idempotente → `metrics_daily`, `a11y_issues`, `alerts`, `wcag_status`. CLI `python -m jobs.aggregate`. |
| `backend/db/mysql_sites.sql` | Schema mínimo `organizations`/`sites` + seed (site_key de teste). |
| `backend/tests/test_collect.py` | Testes (sanitizador, visitor_hash, `/collect`, tipos WCAG). |

### 2.2 Arquivos modificados (backend)

| Arquivo | Mudança |
|---|---|
| `backend/app.py` | Inclui o router `collect` em `/api`; no `lifespan` chama `ensure_collections()` (tolerante a falha) e, se `SCHEDULER_ENABLED`, sobe o `BackgroundScheduler` horário. |
| `backend/utils/config.py` | Novas settings: `MONGODB_URI/DB`, `MYSQL_*`, `VISITOR_HASH_SECRET`, `EVENTS_TTL_SECONDS`, `COLLECT_MAX_BATCH`, `TRUST_PROXY`, `SCHEDULER_ENABLED` + propriedade `mysql_url`. |
| `backend/.env.example` | Documenta todas as variáveis novas. |
| `backend/requirements.txt` | Adiciona `pymongo`, `SQLAlchemy`, `PyMySQL`, `APScheduler`, `cachetools`. **`pydantic` mudou de `==2.10.4` para `>=2.11,<3`** (a 2.10.4 não tem wheel para Python 3.14 e exigiria compilar Rust). |

### 2.3 Plugin e site

| Arquivo | Mudança |
|---|---|
| `js/help.js` | `DEFAULTS.analytics` novo; módulo **`Analytics`** autocontido (mesmo arquivo UMD): coletor em lote (`sendBeacon`/`fetch keepalive`), rastreio de `page_view` (init + rotas SPA), `form_error`/`form_abandon`, `a11y_toggle` (via `setFeatureActive`), `tts_used`, e o **auditor WCAG silencioso**. Hooks em `init()`, `setFeatureActive()`, `readPage()` e `destroy()`. |
| `README.md` | Seções "Analytics de acessibilidade" e "Auditoria WCAG silenciosa". |

Todos os comentários do código novo estão em **PT-BR**.

### 2.4 Coleções MongoDB

| Coleção | Conteúdo |
|---|---|
| `events` | Bruto, **time-series**, expira em **90 dias** (TTL). `meta = {org_id, site_id, type, path}`. |
| `metrics_daily` | Rollup por site+dia+página. `_id` determinístico → upsert idempotente. |
| `a11y_issues` | Catálogo de problemas por site+página+tipo, com amostra técnica. |
| `alerts` | Alertas (ex.: pico de erros de formulário). `status`: open/ack/resolved. |
| `wcag_status` | **Status WCAG por site** (1 doc por site): `level` (AA/A/none), `has_wcag`, `score`, `violations`. |

### 2.5 Tipos de evento aceitos

`page_view`, `form_error`, `form_abandon`, `a11y_toggle`, `tts_used`,
`contrast_issue`, `focus_issue`, `wcag_audit`, `alt_issue`, `label_issue`,
`name_issue`. Qualquer outro tipo é **descartado** na ingestão.

---

## 3. Privacidade (garantias)

- `form_error` guarda só `field` + `code` — **nunca** o valor digitado.
- O **IP** entra apenas no `visitor_hash` (HMAC); **nunca** é gravado.
- O hash inclui o **dia** → rotaciona diariamente (conta únicos/dia, sem seguir
  a pessoa ao longo do tempo).
- Paths perdem query string; IDs viram `:id` (`/user/123` → `/user/:id`).
- O plugin envia só o `site_key`; o `org_id` é decidido no servidor.
- O bruto expira em 90 dias; sobra só o agregado.

---

## 4. Auditoria WCAG silenciosa

Quando o analytics está ligado, o plugin roda **uma vez por sessão** (em
`requestIdleCallback`, após o `load`) um auditor **100% invisível** — sem
painel, notificação, foco ou alteração de DOM. Ele só lê a página e reporta:

- **Por página → `a11y_issues`**: contraste (1.4.3, luminância real), imagem sem
  `alt` (1.1.1), campo sem rótulo (1.3.1/4.1.2), link/botão sem nome (4.1.2),
  `tabindex` positivo (2.4.3).
- **Por site → `wcag_status`**: nível estimado (`AA`/`A`/`none`), `has_wcag`,
  `score`, `violations`.
  - Falhou critério **nível A** → `none`; só **AA** falhou → `A`; tudo OK nas
    checagens automáveis → `AA`.

Desligar só a auditoria: `analytics: { …, wcagAudit: false }`.

> A checagem automática cobre parte do WCAG; um "AA" aqui significa ausência de
> falhas *detectáveis por código*, não uma certificação manual.

---

## 5. Como rodar (completo)

### 5.1 Pré-requisitos

- **Python 3.14** (já instalado). O venv já está em `backend/.venv`.
- **MongoDB 5.0+** rodando (time-series exige 5.0+), em `mongodb://127.0.0.1:27017`.
- **MySQL 8+** rodando, em `127.0.0.1:3306`.
- Um servidor estático para o site (ex.: `python -m http.server`) + navegador.
- (Opcional) `ELEVENLABS_API_KEY` para a voz premium.

### 5.2 Passo 1 — MySQL (mapeamento de site_key)

```bash
mysql -u root -p < backend/db/mysql_sites.sql
```
Cria o banco `help2see`, as tabelas `organizations`/`sites` e um site de teste
com `site_key = 01ARZ3NDEKTSV4RRFFQ69G5FAV`.

### 5.3 Passo 2 — MongoDB

Só precisa estar rodando. As coleções e o TTL são criados sozinhos quando a API
sobe (`ensure_collections`).

### 5.4 Passo 3 — Backend (.env + venv)

```powershell
cd site_finalPreto\backend

# O venv já existe. Se precisar recriar (usando seu Python atual):
#   python -m venv .venv
.venv\Scripts\Activate.ps1

# Dependências (já instaladas neste venv):
#   pip install -r requirements-dev.txt

copy .env.example .env
```

Edite o `.env`:
- `VISITOR_HASH_SECRET=` → gere um:
  `python -c "import secrets; print(secrets.token_hex(32))"`
- `MYSQL_PASSWORD=` (e ajuste `MYSQL_USER`/`MYSQL_HOST` se necessário).
- `MONGODB_URI` se o Mongo não estiver no padrão.
- (Opcional) `ELEVENLABS_API_KEY` para TTS premium.

### 5.5 Passo 4 — Subir a API

```powershell
cd site_finalPreto\backend
.venv\Scripts\Activate.ps1
uvicorn app:app --reload
```
- Docs: http://127.0.0.1:8000/docs
- No log deve aparecer: `Coleção time-series 'events' criada (TTL=7776000s)`.

### 5.6 Passo 5 — Servir o site

Em **outro** terminal:
```powershell
cd site_finalPreto
python -m http.server 5500
```
Abra http://127.0.0.1:5500/index.html. (O CORS já libera `:5500`.)

### 5.7 Passo 6 — Ligar o analytics no plugin

O analytics é **opt-in**. Como as páginas chamam `Help2See.init()` sem
argumentos, basta definir `window.H2SConfig` **antes** do `init`. Adicione, em
cada página que quiser medir, logo após `<script src="js/help.js"></script>`:

```html
<script>
  window.H2SConfig = {
    analytics: {
      enabled: true,
      siteKey: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
      // endpoint omitido → usa http://127.0.0.1:8000/api/collect
      // wcagAudit: true (padrão) — auditoria WCAG silenciosa
    }
  };
</script>
```

Alternativa: trocar `Help2See.init()` por `Help2See.init({ analytics: { … } })`.

### 5.8 Passo 7 — Gerar tráfego e conferir

1. Navegue pelo site; alterne contraste/fonte no widget; em `contato.html`
   submeta um formulário inválido (gera `form_error`). O auditor WCAG roda
   sozinho 1x.
2. DevTools → **Network**: veja o `POST /api/collect` com status **200**
   (envia a cada 15s, ao trocar de página, ou ao sair da aba).
3. No Mongo:
   ```js
   use help2see
   db.events.find().sort({ ts: -1 }).limit(5)   // sem ip, sem value, path normalizado
   ```

### 5.9 Passo 8 — Agregação (rollups + status WCAG)

```powershell
cd site_finalPreto\backend
.venv\Scripts\Activate.ps1
python -m jobs.aggregate            # agrega hoje (UTC)
# python -m jobs.aggregate --day 2026-06-21
```
Confira:
```js
db.metrics_daily.find()
db.a11y_issues.find()
db.wcag_status.find()   // { _id:"1", level:"...", has_wcag:..., score:..., violations:... }
db.alerts.find()
```
Rode **2×** para confirmar idempotência (não duplica). Em produção, agende por
cron **ou** ligue `SCHEDULER_ENABLED=true` no `.env` (roda de hora em hora junto
da API).

### 5.10 Passo 9 — Testes

```powershell
cd site_finalPreto\backend
.venv\Scripts\python.exe -m pytest -q
```
(23 testes: TTS + analytics. Os warnings de `asyncio.iscoroutinefunction` são do
FastAPI/Starlette no Python 3.14 — inofensivos.)

---

## 6. "O site tem algum nível WCAG?"

Depois do Passo 8, a resposta está na coleção **`wcag_status`** (Mongo):
- `has_wcag` (bool) e `level` (`AA` / `A` / `none`) por site;
- mais `score` e `violations` para detalhar.

---

## 7. Solução de problemas

| Sintoma | Causa provável / correção |
|---|---|
| `/api/collect` → **404** | `site_key` não está em `sites` (rode o `.sql`) ou `is_active=0`. O cache de resolução dura ~5 min. |
| `/api/collect` → **500** | MongoDB fora do ar — veja o log da API. |
| Beacon não chega (CORS) | A origem do site precisa estar em `CORS_ORIGINS` (`.env`). O envio usa `text/plain` para evitar preflight. |
| Eventos não aparecem | O flush é a cada 15s / ao sair da aba (`pagehide`). Troque de página para forçar. |
| `wcag_status` vazio | Rode `python -m jobs.aggregate` após gerar ao menos um `wcag_audit` (carregue uma página com o analytics ligado). |
| Erro ao instalar `pydantic-core` | Você está com pin antigo: use `pydantic>=2.11,<3` (já no `requirements.txt`). |

---

## 8. Fora de escopo (próximos passos)

- Stack completa de autenticação MySQL (users/tokens/login) — só `organizations`/`sites` entraram.
- UI/painel de leitura consumindo os agregados (`metrics_daily`, `wcag_status`, `alerts`).
- Contar TTS de atalhos de teclado/voz (hoje só o `readPage()` programático).
