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

# リネージ探索の深さ上限。-1 で無制限(従来挙動)。0 以上を設定すると、
# request の depth が無制限(-1)または上限超のとき、この値にクランプして
# 過大なクエリ1本がワーカーを占有/OOM するのを防ぐ。
MAX_LINEAGE_DEPTH = int(os.getenv('MAX_LINEAGE_DEPTH', '-1'))
