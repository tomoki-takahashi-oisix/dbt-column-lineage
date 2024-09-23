import logging
import subprocess
import sys
from datetime import datetime
from pytz import timezone
from fastapi import Request

from dbt_column_lineage.constants import DEBUG_MODE

import os
from pathlib import Path


def find_dbt_project():
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


def get_redirect_url(request: Request):
    host_url = str(request.base_url)
    if request.url.scheme == 'http' and 'localhost' not in host_url:
        host_url = host_url.replace('http://', 'https://')
    return host_url + 'callback'


def extract_model_name(input_path):
    # パスを分解
    parts = input_path.split(os.sep)

    # 'models' ディレクトリ以下のパスかどうかを確認
    if 'models' in parts:
        models_index = parts.index('models')
        if len(parts) > models_index + 1:
            # ファイル名を取得（拡張子を除く）
            files = parts[-1].split('.')
            if files[-1] == 'sql':
                filename = os.path.splitext(parts[-1])[0]
                return filename

    return None


def get_git_changed_files():
    command = [
        'git',
        'diff',
        '--no-renames',
        '--name-only',
        '--diff-filter=ACMRT'
    ]

    try:
        # サブプロセスとしてgitコマンドを実行
        result = subprocess.run(command, capture_output=True, text=True, check=True)

        # 出力を行ごとに分割してリストに格納
        changed_files = result.stdout.strip().split('\n')

        # 空の行を除去（最後の改行による空行への対応）
        changed_files = [file for file in changed_files if file]

        return changed_files
    except subprocess.CalledProcessError as e:
        print(f'An error occurred while running git command: {e}')
        return []


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


def custom_timezone_jst(*args):
    return datetime.now(timezone('Asia/Tokyo')).timetuple()
