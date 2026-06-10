"""Regression guard for the upstream sqlglot UNPIVOT lineage limitation
(https://github.com/tobymao/sqlglot/issues/7727).

sqlglot's lineage() does not expand an UNPIVOT's value/name columns to the
columns listed in `IN (...)`; instead it terminates at the input relation with a
column that does not exist there (a "phantom"). Our `DbtSqlglot` filters those
phantom CTE nodes out. If sqlglot fixes this, the assertion below flips and this
test fails — a signal to revisit / drop the workaround in lineage.py.
"""
from sqlglot import exp
from sqlglot.lineage import lineage


UNPIVOT_SQL = """
WITH src AS (
  SELECT id, jan, feb FROM sales
)
SELECT id, metric_name, score
FROM src UNPIVOT (score FOR metric_name IN (jan, feb))
"""
SCHEMA = {"sales": {"id": "int", "jan": "int", "feb": "int"}}


def _leaf_table_names(col):
    node = lineage(col, UNPIVOT_SQL, schema=SCHEMA, dialect="snowflake")
    return [n.name for n in node.walk()
            if isinstance(n.expression, exp.Table) and not n.downstream]


def test_unpivot_value_column_does_not_fan_out_to_sources():
    # 現状(sqlglot#7727): score は元列 sales.jan / sales.feb に展開されず、
    # 入力CTE `src` の存在しない列 `SRC.SCORE` で終端する。
    leaves = _leaf_table_names("score")
    assert leaves == ["SRC.SCORE"], (
        f"sqlglot UNPIVOT lineage may have been fixed (#7727): got {leaves}. "
        "Revisit the phantom-CTE filter in lineage.py."
    )


def test_plain_cte_traces_normally():
    # 対照: UNPIVOT を含まない素の CTE なら sqlglot は実テーブル sales まで辿れる。
    # (=問題は UNPIVOT 固有。UNPIVOT を含む relation では id すら CTE で止まる。)
    plain_sql = "WITH s AS (SELECT id, jan FROM sales) SELECT id, jan FROM s"
    node = lineage("id", plain_sql, schema={"sales": {"id": "int", "jan": "int"}}, dialect="snowflake")
    leaves = [n.name for n in node.walk()
              if isinstance(n.expression, exp.Table) and not n.downstream]
    assert leaves == ["SALES.ID"], leaves
