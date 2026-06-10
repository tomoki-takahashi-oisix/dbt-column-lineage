"""Tests for the phantom-CTE filter that works around sqlglot's UNPIVOT lineage
limitation (sqlglot#7727).

When sqlglot's lineage() hits an UNPIVOT it cannot trace the synthesized
value/name columns to their source columns, so the UNPIVOT input CTE leaks as a
table leaf. `DbtSqlglot` drops such labels — but only when they are CTE names
that are NOT also real dbt objects (dbt frequently wraps a ref in a same-named
CTE, e.g. `with dim_calendar as (select * from {{ ref('dim_calendar') }})`).
"""
from sqlglot import parse_one


def _cte_names(dbt, sql):
    return dbt._DbtSqlglot__cte_names(parse_one(sql, dialect="snowflake"))


def _is_phantom(dbt, label, cte_names):
    return dbt._DbtSqlglot__is_phantom_cte_label(label, cte_names, "src")


# --- pure-ish helper units -------------------------------------------------

def test_cte_names_collects_aliases(dbt):
    sql = "with a as (select 1), b as (select 2) select * from a join b"
    assert _cte_names(dbt, sql) == {"a", "b"}


def test_cte_names_empty_when_no_cte(dbt):
    assert _cte_names(dbt, "select 1 from t") == set()


def test_real_dbt_object_names_includes_models(dbt):
    names = dbt._DbtSqlglot__real_dbt_object_names()
    assert "base_model" in names
    assert "child_model" in names


def test_phantom_when_cte_and_not_real_object(dbt):
    # CTE 名 かつ 実在 dbt オブジェクトでない → phantom
    assert _is_phantom(dbt, "weekly_summary_item_str", {"weekly_summary_item_str"}) is True


def test_not_phantom_when_real_object_even_if_cte(dbt):
    # 実在モデル名と同名の CTE(ref ラップ)は残す
    assert _is_phantom(dbt, "base_model", {"base_model"}) is False


def test_not_phantom_when_not_a_cte(dbt):
    # CTE 名でなければ(実テーブル/未宣言の raw テーブル等)残す
    assert _is_phantom(dbt, "some_raw_table", {"src"}) is False


def test_phantom_label_is_case_insensitive(dbt):
    assert _is_phantom(dbt, "SRC", {"src"}) is True


# --- end-to-end through column_lineage ------------------------------------

def test_forward_unpivot_score_excludes_phantom_cte(dbt):
    # child_model.score は UNPIVOT 由来。sqlglot は入力CTE `src` を末端として漏らすが、
    # フィルタで除外されるのでノードに現れない。
    dbt.column_lineage("child_model", "SCORE", False)
    names = {n["data"]["name"] for n in dbt.ret_edges_nodes()["nodes"]}
    assert "src" not in names
    assert "child_model" in names


def test_forward_plain_model_traces_to_base_model(dbt):
    # UNPIVOT を含まない plain_model は実上流 base_model まで辿れる(フィルタは実テーブルを落とさない)。
    dbt.column_lineage("plain_model", "ID", False)
    names = {n["data"]["name"] for n in dbt.ret_edges_nodes()["nodes"]}
    assert "base_model" in names
    assert "plain_model" in names
