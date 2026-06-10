"""Tests for table-level lineage (manifest parent_map/child_map walk)."""


def test_reverse_does_not_abort_on_non_model_child(dbt):
    """Regression: `base_model`'s child_map is
    [exposure(non-model), child_model, plain_model]. A past bug `return`ed the
    whole loop when a child wasn't a model node (exposure/source/...), dropping
    every model child after it. The fix `continue`s, so both real children must
    still appear even though the exposure ref comes first."""
    dbt.table_lineage("base_model", True)
    names = {n["data"]["name"] for n in dbt.ret_edges_nodes()["nodes"]}
    assert "base_model" in names
    assert "child_model" in names
    assert "plain_model" in names  # 非モデル exposure の後ろも処理されている


def test_reverse_builds_edges_to_children(dbt):
    dbt.table_lineage("base_model", True)
    edges = dbt.ret_edges_nodes()["edges"]
    # base_model -> child_model, base_model -> plain_model の2本(exposure は無視)
    assert len(edges) == 2


def test_forward_walks_to_parent(dbt):
    dbt.table_lineage("child_model", False)
    names = {n["data"]["name"] for n in dbt.ret_edges_nodes()["nodes"]}
    assert "child_model" in names
    assert "base_model" in names
