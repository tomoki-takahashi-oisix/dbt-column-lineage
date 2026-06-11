"""Generate a synthetic dbt manifest.json + catalog.json for the README demo.

This is NOT a real dbt project — it is a hand-authored fixture whose
`compiled_code` is plain Snowflake SQL (no UNPIVOT/PIVOT) so sqlglot can trace
column-level lineage cleanly. Run:

    python demo/build_demo_manifest.py

to (re)write demo/dbt_project/target/{manifest,catalog}.json.

Domain: a tiny e-commerce warehouse. `stg_orders.amount` fans out downstream
into dim_customers.lifetime_value and rpt_revenue_by_country.total_revenue —
a nice column to trace in the demo.
"""

import json
import os

PROJECT = "demo_shop"
DB = "analytics_db"
SCHEMA = "analytics"


def fqn(model: str) -> str:
    return f"{DB}.{SCHEMA}.{model}"


# name -> (columns {col: type}, depends_on [model names], compiled_code, materialized)
MODELS = {
    "stg_customers": (
        {"customer_id": "NUMBER", "customer_name": "VARCHAR", "email": "VARCHAR",
         "country": "VARCHAR", "signup_date": "DATE"},
        [],
        "select 1 as customer_id, 'Acme' as customer_name, 'a@b.com' as email, "
        "'JP' as country, current_date as signup_date",
        "view",
    ),
    "stg_orders": (
        {"order_id": "NUMBER", "customer_id": "NUMBER", "product_id": "NUMBER",
         "order_date": "DATE", "status": "VARCHAR", "amount": "NUMBER"},
        [],
        "select 1 as order_id, 1 as customer_id, 1 as product_id, current_date as order_date, "
        "'paid' as status, 100 as amount",
        "view",
    ),
    "stg_products": (
        {"product_id": "NUMBER", "product_name": "VARCHAR", "category": "VARCHAR",
         "unit_price": "NUMBER"},
        [],
        "select 1 as product_id, 'Widget' as product_name, 'Tools' as category, 10 as unit_price",
        "view",
    ),
    "int_customer_orders": (
        {"customer_id": "NUMBER", "customer_name": "VARCHAR", "country": "VARCHAR",
         "order_id": "NUMBER", "category": "VARCHAR", "amount": "NUMBER"},
        ["stg_customers", "stg_orders", "stg_products"],
        (
            "select c.customer_id, c.customer_name, c.country, "
            "o.order_id, p.category, o.amount "
            f"from {fqn('stg_orders')} o "
            f"join {fqn('stg_customers')} c on o.customer_id = c.customer_id "
            f"join {fqn('stg_products')} p on o.product_id = p.product_id"
        ),
        "table",
    ),
    "dim_customers": (
        {"customer_id": "NUMBER", "customer_name": "VARCHAR", "country": "VARCHAR",
         "lifetime_value": "NUMBER", "order_count": "NUMBER"},
        ["int_customer_orders"],
        (
            "select customer_id, customer_name, country, "
            "sum(amount) as lifetime_value, count(order_id) as order_count "
            f"from {fqn('int_customer_orders')} "
            "group by customer_id, customer_name, country"
        ),
        "table",
    ),
    "fct_orders": (
        {"order_id": "NUMBER", "customer_id": "NUMBER", "order_date": "DATE",
         "status": "VARCHAR", "amount": "NUMBER"},
        ["stg_orders"],
        (
            "select order_id, customer_id, order_date, status, amount "
            f"from {fqn('stg_orders')}"
        ),
        "table",
    ),
    "rpt_revenue_by_country": (
        {"country": "VARCHAR", "total_revenue": "NUMBER"},
        ["int_customer_orders"],
        (
            "select country, sum(amount) as total_revenue "
            f"from {fqn('int_customer_orders')} group by country"
        ),
        "table",
    ),
}


def uid(name: str) -> str:
    return f"model.{PROJECT}.{name}"


def layer(name: str) -> str:
    if name.startswith("stg_"):
        return "staging"
    if name.startswith("int_"):
        return "intermediate"
    return "marts"


def build():
    nodes = {}
    parent_map = {}
    child_map = {uid(n): [] for n in MODELS}
    for name, (cols, deps, code, mat) in MODELS.items():
        u = uid(name)
        nodes[u] = {
            "resource_type": "model",
            "name": name,
            "alias": name,
            "unique_id": u,
            "package_name": PROJECT,
            "fqn": [PROJECT, "models", layer(name), name],
            "database": DB,
            "schema": SCHEMA,
            "config": {"materialized": mat},
            "depends_on": {"nodes": [uid(d) for d in deps]},
            "columns": {
                c: {"name": c, "type": t, "description": ""} for c, t in cols.items()
            },
            "compiled_code": code,
        }
        parent_map[u] = [uid(d) for d in deps]
        for d in deps:
            child_map[uid(d)].append(u)

    manifest = {
        "metadata": {"project_name": PROJECT},
        "nodes": nodes,
        "sources": {},
        "child_map": child_map,
        "parent_map": parent_map,
    }

    catalog = {
        "nodes": {
            uid(name): {
                "columns": {c.upper(): {"name": c.upper(), "type": t}
                            for c, t in cols.items()}
            }
            for name, (cols, _deps, _code, _mat) in MODELS.items()
        }
    }
    return manifest, catalog


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    target = os.path.join(here, "dbt_project", "target")
    os.makedirs(target, exist_ok=True)
    manifest, catalog = build()
    with open(os.path.join(target, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(target, "catalog.json"), "w") as f:
        json.dump(catalog, f, indent=2)
    print(f"wrote {len(manifest['nodes'])} models to {target}")


if __name__ == "__main__":
    main()
