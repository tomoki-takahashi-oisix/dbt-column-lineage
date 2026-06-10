"""Unit-test fixtures for the lineage engine.

These run without a real dbt project / warehouse: `DbtSqlglot` is pointed at the
tiny synthetic manifest/catalog under `test/unit/fixtures/target/` via the
`DBT_PROJECT_DIR` env var. `SQLGLOT_DIALECT` defaults to `snowflake`.
"""
import logging
import os
import sys
from pathlib import Path

import pytest

# `src` レイアウトなのでパッケージを import 可能にする
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def dbt(monkeypatch):
    """fixtures/target の合成 manifest/catalog を読み込んだ DbtSqlglot を返す。
    DbtSqlglot は singleton なので、テストごとに _instance をリセットして再読込させる。"""
    monkeypatch.setenv("DBT_PROJECT_DIR", str(FIXTURE_DIR))
    from dbt_column_lineage.lineage import DbtSqlglot

    DbtSqlglot._instance = None
    inst = DbtSqlglot(logging.getLogger("test"), request_depth=-1)
    yield inst
    DbtSqlglot._instance = None
