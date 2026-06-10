"""Unit tests for pure-ish lineage helpers."""


def test_node_id_hash_is_stable(dbt):
    # ノードIDは呼び出し/プロセスを跨いでエッジ照合に使われるため、値が安定していること。
    # アルゴリズムを変えるとエッジ/ノードの突合が静かに壊れるので、既知値で固定する。
    f = dbt._DbtSqlglot__str_to_base_10_int_str
    assert f("base_model") == "3814212667"
    assert f("child_model") == "3348565574"
    assert f("x") == "120"


def test_node_id_hash_deterministic_and_distinct(dbt):
    f = dbt._DbtSqlglot__str_to_base_10_int_str
    assert f("abc") == f("abc")
    assert f("abc") != f("abd")
    assert f("foo").isdigit()


def test_get_columns_filters_case_insensitively(dbt):
    # dbt 側カラムに含まれるものだけを残す(大文字小文字は無視、表記は next_columns 側を保持)
    g = dbt._DbtSqlglot__get_columns
    assert g(["id", "name"], ["ID", "AGE"]) == ["ID"]
    assert g(["ID", "NAME"], ["id"]) == ["id"]
    assert g(["id"], ["AGE"]) == []


def test_get_columns_empty_dbt_columns_returns_input(dbt):
    # dbt 側カラム情報が無いときは絞り込まずそのまま返す(フォールバック)
    g = dbt._DbtSqlglot__get_columns
    assert g([], ["A", "B"]) == ["A", "B"]


def test_get_dbt_node_finds_model(dbt):
    n = dbt._DbtSqlglot__get_dbt_node("base_model")
    assert n.get("unique_id") == "model.test_proj.base_model"
    assert n.get("resource_type") == "model"


def test_get_dbt_node_returns_empty_for_non_model(dbt):
    # __get_dbt_node は model/seed/snapshot のみ探索する。
    # exposure/source/test や未知の名前は {} を返す(= ノード化されない)。
    assert dbt._DbtSqlglot__get_dbt_node("some_exposure") == {}
    assert dbt._DbtSqlglot__get_dbt_node("does_not_exist") == {}
