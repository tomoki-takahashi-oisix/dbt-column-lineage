"""Tests for the dbt-docs deep link attached to table nodes.

`DbtSqlglot` attaches `data.docsUrl` to each table node so the frontend menu can
offer "Open in dbt docs". The URL is `{DBT_DOCS_BASE_URL}/#!/{resource_type}/{unique_id}`
built from the manifest node's own fields (not reconstructed). When the env var
is unset the value is None and the frontend hides the menu item.

`DBT_DOCS_BASE_URL` is read into lineage.py at import time, so we monkeypatch the
module-level name rather than os.environ.
"""
import dbt_column_lineage.lineage as lineage_mod


def _docs_url(dbt, name):
    node = dbt._DbtSqlglot__get_dbt_node(name)
    return dbt._DbtSqlglot__dbt_docs_url(node)


def test_docs_url_none_when_base_unset(dbt, monkeypatch):
    monkeypatch.setattr(lineage_mod, "DBT_DOCS_BASE_URL", None)
    assert _docs_url(dbt, "base_model") is None


def test_docs_url_uses_manifest_unique_id_and_resource_type(dbt, monkeypatch):
    monkeypatch.setattr(lineage_mod, "DBT_DOCS_BASE_URL", "https://docs.example.com/dbt/latest")
    assert _docs_url(dbt, "base_model") == (
        "https://docs.example.com/dbt/latest/#!/model/model.test_proj.base_model"
    )


def test_docs_url_strips_trailing_slash(dbt, monkeypatch):
    # ベースURL末尾の / を1つ剥がして // にならないようにする
    monkeypatch.setattr(lineage_mod, "DBT_DOCS_BASE_URL", "https://docs.example.com/dbt/latest/")
    assert _docs_url(dbt, "child_model") == (
        "https://docs.example.com/dbt/latest/#!/model/model.test_proj.child_model"
    )


def test_docs_url_none_for_non_dbt_object(dbt, monkeypatch):
    # exposure/source/未知名 は __get_dbt_node が {} を返す → docsUrl なし
    monkeypatch.setattr(lineage_mod, "DBT_DOCS_BASE_URL", "https://docs.example.com/dbt/latest")
    assert _docs_url(dbt, "some_exposure") is None
    assert _docs_url(dbt, "does_not_exist") is None


def test_column_lineage_nodes_carry_docs_url(dbt, monkeypatch):
    monkeypatch.setattr(lineage_mod, "DBT_DOCS_BASE_URL", "https://docs.example.com/dbt/latest")
    dbt.column_lineage("plain_model", "ID", False)
    urls = {n["data"]["name"]: n["data"].get("docsUrl") for n in dbt.ret_edges_nodes()["nodes"]}
    assert urls["plain_model"] == "https://docs.example.com/dbt/latest/#!/model/model.test_proj.plain_model"
    assert urls["base_model"] == "https://docs.example.com/dbt/latest/#!/model/model.test_proj.base_model"


def test_table_lineage_nodes_carry_docs_url(dbt, monkeypatch):
    monkeypatch.setattr(lineage_mod, "DBT_DOCS_BASE_URL", "https://docs.example.com/dbt/latest")
    dbt.table_lineage("base_model", True)
    urls = {n["data"]["name"]: n["data"].get("docsUrl") for n in dbt.ret_edges_nodes()["nodes"]}
    assert urls["base_model"].endswith("/#!/model/model.test_proj.base_model")
    assert urls["child_model"].endswith("/#!/model/model.test_proj.child_model")
