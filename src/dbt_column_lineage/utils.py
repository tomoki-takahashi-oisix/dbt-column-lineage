import logging
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from fastapi import Request
from pytz import timezone
from sqlglot import parse_one, diff
from sqlglot.diff import Keep, Insert, Update
from sqlglot.expressions import CTE, Table, Literal

from dbt_column_lineage.constants import DEBUG_MODE


def get_logger(app, logger_name):
    logger = logging.getLogger(logger_name)
    handler = logging.StreamHandler(sys.stdout)

    if app.debug or DEBUG_MODE:
        logger.setLevel(logging.DEBUG)
        handler.setLevel(logging.DEBUG)
    else:
        logger.setLevel(logging.INFO)
        handler.setLevel(logging.INFO)

    # apprunner では不要説
    formatter = logging.Formatter('%(name)s [%(asctime)s] [%(levelname)s] %(filename)s:%(lineno)d %(message)s')
    formatter.converter = custom_timezone_jst
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    return logger


def get_redirect_url(request: Request):
    host_url = str(request.base_url)
    if request.url.scheme == 'http' and 'localhost' not in host_url:
        host_url = host_url.replace('http://', 'https://')
    return host_url + 'callback'


def find_dbt_project() -> object:
    # 1. カレントディレクトリをチェック
    current_dir = Path.cwd()
    if (current_dir / 'dbt_project.yml').exists():
        return str(current_dir)

    # 2. ユーザーのホームディレクトリをチェック
    home_dir = Path.home()
    common_locations = [
        'dbt_projects',
        'projects/dbt',
        '.dbt'
    ]
    for location in common_locations:
        path = home_dir / location
        if (path / 'dbt_project.yml').exists():
            return str(path)

    # 3. システム全体の一般的な場所をチェック
    system_locations = [
        '/etc/dbt',
        '/var/lib/dbt',
        '/opt/dbt'
    ]
    for location in system_locations:
        path = Path(location)
        if (path / 'dbt_project.yml').exists():
            return str(path)

    # 4. 見つからない場合は None を返す
    return None


def get_dbt_project_dir():
    # 環境変数をチェック
    dbt_project_dir = os.getenv('DBT_PROJECT_DIR')
    if dbt_project_dir:
        return dbt_project_dir

    # 自動検出を試みる
    detected_dir = find_dbt_project()
    if detected_dir:
        return detected_dir

    # 見つからない場合はエラーを発生させる
    raise ValueError("DBT project directory not found. Please set the DBT_PROJECT_DIR environment variable or run the command from a dbt project directory.")


def custom_timezone_jst(*args):
    return datetime.now(timezone('Asia/Tokyo')).timetuple()


def get_diff_to_params(dbt_sql_glot):
    # プロジェクト名を取得
    project_name = dbt_sql_glot.project_name()

    # 変更されたファイルのリストを取得
    changed_files = _get_git_changed_files()

    # gitワークツリーからの相対パスを取得
    relative_path = _get_relative_path()

    sources = []
    selected_columns = {}

    for change_file in changed_files:
        print(change_file)
        file = os.path.relpath(change_file, relative_path)

        if not os.path.isfile(file):
            print(f'{file} does not exist')
            sys.exit(1)

        source = _extract_model_name(file)
        if source:
            sources.append(source)
            # 既存のカラム情報を取得
            exists_columns = dbt_sql_glot.columns_by_source(source)
            # クエリの差分からカラム情報を取得
            columns = _source_to_columns(file, project_name, dbt_sql_glot.dialect, exists_columns)
            if len(columns) > 0:
                selected_columns[source] = columns

    return sources, selected_columns


def _extract_model_name(input_path):
    # パスを分解
    parts = input_path.split(os.sep)

    # 'models' または 'snapshots' ディレクトリ以下のパスかどうかを確認
    target_dirs = ['models', 'snapshots']
    for target_dir in target_dirs:
        if target_dir in parts:
            dir_index = parts.index(target_dir)
            if len(parts) > dir_index + 1:
                # ファイル名を取得（拡張子を除く）
                filename = parts[-1]
                if filename.endswith('.sql'):
                    filename = os.path.splitext(filename)[0]
                    return filename

    return None

def _get_git_changed_files():
    command = [
        'git',
        'diff',
        '--no-renames',
        '--name-only',
        '--diff-filter=ACMRT'
    ]

    try:
        # git diffコマンドを実行
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        changed_files = result.stdout.strip().split('\n')
        # 空の行を除去（最後の改行による空行への対応）
        changed_files = [file for file in changed_files if file]

        return changed_files
    except subprocess.CalledProcessError as e:
        print(f'An error occurred while running git command: {e}')
        return []


def _get_relative_path():
    git_root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'],
                                       universal_newlines=True).strip()
    if git_root is None:
        print('Not in a Git repository')
        sys.exit(1)

    # カレントディレクトリの相対パスを取得
    current_path = os.getcwd()
    return os.path.relpath(current_path, git_root)


def _replace_file_path(original_path, project_name, target_dir='target'):
    # ファイルパスのパターンを定義
    old_pattern = r'^(.*)(models|snapshots)/(.+)$'
    new_pattern = f'\\1{target_dir}/compiled/{project_name}/\\2/\\3'

    # パスを置換
    return re.sub(old_pattern, new_pattern, original_path)


def _source_to_columns(file, project_name, dialect, exists_columns):
    columns = []
    target_path = _replace_file_path(file, project_name, 'target')
    target_base_path = _replace_file_path(file, project_name, 'target-base')

    if not os.path.isfile(target_path):
        print(f'{target_path} does not exist')
        return columns

    if not os.path.isfile(target_base_path):
        print(f'{target_base_path} does not exist')
        return columns

    target_sql = open(target_path, 'r').read()
    target_base_sql = open(target_base_path, 'r').read()

    parsed_sql = parse_one(target_sql, dialect=dialect)
    changes = diff(parse_one(target_base_sql, dialect=dialect), parsed_sql)

    for change in changes:
        if isinstance(change, Keep):
            continue

        # print(change)
        if (isinstance(change, Update)
            and not isinstance(change.target, Table) and not isinstance(change.target, Literal)):
            print('Update:')
            print(change.target)

            if change.target.alias_or_name in exists_columns:
                columns.append(change.target.alias_or_name)
        elif isinstance(change, Insert):
            print('Insert:')
            print(change)

            for cte in parsed_sql.find_all(CTE):
                if cte.sql() == change.expression.parent.parent.sql():
                    if change.expression.alias_or_name in exists_columns:
                        print(change.expression.alias_or_name)
                        columns.append(change.expression.alias_or_name)
                        break
    return columns
