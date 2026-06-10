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
