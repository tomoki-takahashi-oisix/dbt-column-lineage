import os

BASE_ROUTE = '/api/v1'
DEBUG_MODE = os.getenv('DEBUG_MODE', 'false').lower() == 'true'
USE_OAUTH = os.getenv('USE_OAUTH', 'false').lower() == 'true'
USE_LOOKER = os.getenv('NEXT_PUBLIC_USE_LOOKER', 'false').lower() == 'true'
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
SQLGLOT_DIALECT=os.getenv('SQLGLOT_DIALECT', 'snowflake')

# dbt docs (dbt-docs SPA) のベースURL。設定すると各テーブルノードのメニューに
# 「Open in dbt docs」が出て {base}/#!/{resource_type}/{unique_id} に遷移する。
# 汎用ツールなので固定せず、環境ごとに実行時に指定する。未設定ならメニューは出ない。
# 例: https://docs.example.com/dbt/latest
DBT_DOCS_BASE_URL = os.getenv('DBT_DOCS_BASE_URL')

# セッション署名鍵。複数プロセス/インスタンス(uvicorn --workers や App Runner の
# スケールアウト)で署名付きクッキーを共有するには、全プロセスで同一の固定値が必要。
# 未設定時はプロセス毎にランダム生成(=単一プロセス前提の従来挙動)。
SESSION_SECRET = os.getenv('SESSION_SECRET')

# リネージ探索の時間予算(秒)。-1 で無制限(従来挙動)。0 超を設定すると、再帰や
# リバース索引構築がこの時間を超えた時点で打ち切り(truncated)、それまでの結果を返す。
# コストが深さでなく横幅(ハブ列の全下流など)の場合に効く本命の保護。本番では
# ゲートウェイのリクエストタイムアウト未満に設定し、504 でなく 200+truncated を返す。
MAX_LINEAGE_SECONDS = float(os.getenv('MAX_LINEAGE_SECONDS', '-1'))
