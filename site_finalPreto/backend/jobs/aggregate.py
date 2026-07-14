"""
Job de rollup diário: ``events`` bruto → ``metrics_daily`` + ``a11y_issues`` +
``alerts``.

Idempotente por construção: todo documento de agregado usa um ``_id``
*determinístico* (ex.: ``"45|2026-06-21|page|/checkout"``), então re-rodar o job
sobrescreve em vez de duplicar. Rode de hora em hora (re-agregar o dia atual é
seguro).

Uso:
    python -m jobs.aggregate            # agrega o dia de hoje (UTC)
    python -m jobs.aggregate --day 2026-06-21
"""
import argparse
import logging
from datetime import datetime, timedelta, timezone

from pymongo import UpdateOne

from services.mongo import (
    A11Y_ISSUES, ALERTS, EVENTS, METRICS_DAILY, WCAG_STATUS, get_db,
)

logger = logging.getLogger("help2see.aggregate")

# Um site+path com mais erros de formulário que isto em um dia abre um alerta.
FORM_ERROR_ALERT_THRESHOLD = 10

# Tipos de problema (do auditor WCAG) catalogados por página em a11y_issues.
A11Y_ISSUE_TYPES = (
    "contrast_issue", "focus_issue", "alt_issue", "label_issue", "name_issue",
)


def _day_bounds(day: str):
    """Retorna (início, fim) como datetimes UTC-aware para um dia ``YYYY-MM-DD``."""
    start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _rollup_metrics(db, day, start, end) -> int:
    """Métricas diárias por site+path. Retorna o número de docs feitos upsert."""
    pipeline = [
        {"$match": {"ts": {"$gte": start, "$lt": end}}},
        {"$group": {
            "_id": {
                "site_id": "$meta.site_id",
                "org_id": "$meta.org_id",
                "path": "$meta.path",
            },
            "page_views": {"$sum": {"$cond": [
                {"$eq": ["$meta.type", "page_view"]}, 1, 0]}},
            # Visitantes distintos entre page views (null para outros tipos, removido abaixo).
            "page_visitors": {"$addToSet": {"$cond": [
                {"$eq": ["$meta.type", "page_view"]}, "$visitor", None]}},
            "form_errors": {"$sum": {"$cond": [
                {"$eq": ["$meta.type", "form_error"]}, 1, 0]}},
            "form_abandon": {"$sum": {"$cond": [
                {"$eq": ["$meta.type", "form_abandon"]}, 1, 0]}},
            "contrast_issues": {"$sum": {"$cond": [
                {"$eq": ["$meta.type", "contrast_issue"]}, 1, 0]}},
            "focus_issues": {"$sum": {"$cond": [
                {"$eq": ["$meta.type", "focus_issue"]}, 1, 0]}},
            # $avg ignora nulls/ausentes, então só os load_ms reais contam.
            "avg_load_ms": {"$avg": {"$cond": [
                {"$eq": ["$meta.type", "page_view"]}, "$detail.load_ms", None]}},
        }},
    ]

    ops = []
    now = datetime.now(timezone.utc)
    for row in db[EVENTS].aggregate(pipeline):
        site_id = row["_id"]["site_id"]
        org_id = row["_id"]["org_id"]
        path = row["_id"]["path"]
        page_views = row["page_views"]
        unique_visitors = len([v for v in row["page_visitors"] if v])
        form_abandon = row["form_abandon"]
        # Heurística: abandonos relativos às visualizações de página (limitado a 0..1).
        abandon_rate = round(form_abandon / page_views, 4) if page_views else 0.0

        _id = f"{site_id}|{day}|page|{path}"
        ops.append(UpdateOne(
            {"_id": _id},
            {
                "$set": {
                    "site_id": site_id,
                    "org_id": org_id,
                    "day": day,
                    "dimension": "page",
                    "path": path,
                    "metrics": {
                        "page_views": page_views,
                        "unique_visitors": unique_visitors,
                        "form_errors": row["form_errors"],
                        "form_abandon": form_abandon,
                        "contrast_issues": row["contrast_issues"],
                        "focus_issues": row["focus_issues"],
                        "abandon_rate": abandon_rate,
                        "avg_load_ms": (
                            round(row["avg_load_ms"], 1)
                            if row["avg_load_ms"] is not None else None
                        ),
                    },
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        ))

    if ops:
        db[METRICS_DAILY].bulk_write(ops, ordered=False)
    return len(ops)


def _rollup_a11y_issues(db, day, start, end) -> int:
    """Catálogo por site+path+tipo de problema com uma amostra técnica."""
    pipeline = [
        {"$match": {
            "ts": {"$gte": start, "$lt": end},
            "meta.type": {"$in": list(A11Y_ISSUE_TYPES)},
        }},
        {"$group": {
            "_id": {
                "site_id": "$meta.site_id",
                "org_id": "$meta.org_id",
                "path": "$meta.path",
                "issue_type": "$meta.type",
            },
            "count": {"$sum": 1},
            "sample": {"$first": "$detail"},
        }},
    ]

    ops = []
    now = datetime.now(timezone.utc)
    for row in db[EVENTS].aggregate(pipeline):
        g = row["_id"]
        _id = f"{g['site_id']}|{g['path']}|{g['issue_type']}"
        ops.append(UpdateOne(
            {"_id": _id},
            {
                "$set": {
                    "site_id": g["site_id"],
                    "org_id": g["org_id"],
                    "path": g["path"],
                    "issue_type": g["issue_type"],
                    "day": day,
                    "count": row["count"],
                    "sample": row.get("sample") or {},  # só dado técnico
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        ))

    if ops:
        db[A11Y_ISSUES].bulk_write(ops, ordered=False)
    return len(ops)


def _evaluate_alerts(db, day) -> int:
    """Abre alertas quando uma métrica diária cruza um limiar."""
    ops = []
    now = datetime.now(timezone.utc)
    cursor = db[METRICS_DAILY].find(
        {"day": day, "metrics.form_errors": {"$gt": FORM_ERROR_ALERT_THRESHOLD}}
    )
    for doc in cursor:
        _id = f"{doc['site_id']}|{day}|form_error_spike|{doc['path']}"
        ops.append(UpdateOne(
            {"_id": _id},
            {
                "$set": {
                    "site_id": doc["site_id"],
                    "org_id": doc.get("org_id"),
                    "day": day,
                    "rule": "form_error_spike",
                    "path": doc["path"],
                    "value": doc["metrics"]["form_errors"],
                    "threshold": FORM_ERROR_ALERT_THRESHOLD,
                    "updated_at": now,
                },
                # Não ressuscita um alerta reconhecido/resolvido: status + created_at
                # só são definidos na primeira inserção.
                "$setOnInsert": {"status": "open", "created_at": now},
            },
            upsert=True,
        ))

    if ops:
        db[ALERTS].bulk_write(ops, ordered=False)
    return len(ops)


def _rollup_wcag_status(db, day, start, end) -> int:
    """Grava o status WCAG por site, a partir da auditoria mais recente do dia.

    Um doc por site (``_id = site_id``) respondendo "este site tem algum nível
    WCAG?" (``has_wcag``) e qual (``level``: AA/A/none). Idempotente: re-rodar o
    dia sobrescreve com a auditoria mais recente.
    """
    pipeline = [
        {"$match": {"ts": {"$gte": start, "$lt": end}, "meta.type": "wcag_audit"}},
        {"$sort": {"ts": 1}},
        # A última auditoria do dia, por site, é a que vale.
        {"$group": {
            "_id": "$meta.site_id",
            "org_id": {"$last": "$meta.org_id"},
            "detail": {"$last": "$detail"},
            "ts": {"$last": "$ts"},
        }},
    ]

    ops = []
    now = datetime.now(timezone.utc)
    for row in db[EVENTS].aggregate(pipeline):
        site_id = row["_id"]
        detail = row.get("detail") or {}
        level = detail.get("level", "none")
        ops.append(UpdateOne(
            {"_id": str(site_id)},
            {
                "$set": {
                    "site_id": site_id,
                    "org_id": row.get("org_id"),
                    "level": level,                       # "AA" | "A" | "none"
                    "has_wcag": level not in (None, "none"),
                    "score": detail.get("score"),
                    "violations": detail.get("violations"),
                    "audited_at": row.get("ts"),
                    "day": day,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        ))

    if ops:
        db[WCAG_STATUS].bulk_write(ops, ordered=False)
    return len(ops)


def run(day: str | None = None) -> dict:
    """Agrega um dia UTC. Retorna um pequeno dict de resumo."""
    day = day or _today()
    start, end = _day_bounds(day)
    db = get_db()

    metrics = _rollup_metrics(db, day, start, end)
    issues = _rollup_a11y_issues(db, day, start, end)
    alerts = _evaluate_alerts(db, day)
    wcag = _rollup_wcag_status(db, day, start, end)

    summary = {"day": day, "metrics_daily": metrics, "a11y_issues": issues,
               "alerts": alerts, "wcag_status": wcag}
    logger.info("Agregação concluída: %s", summary)
    return summary


def main() -> None:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Rollup diário do Help2See analytics.")
    parser.add_argument("--day", help="Dia UTC no formato YYYY-MM-DD (padrão: hoje).")
    args = parser.parse_args()
    print(run(args.day))


if __name__ == "__main__":
    main()
