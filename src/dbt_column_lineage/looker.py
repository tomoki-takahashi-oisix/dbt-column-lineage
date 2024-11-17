import json
from collections import defaultdict
from typing import Dict, Optional

from dbt_column_lineage.utils import get_dbt_project_dir


class Looker:
    def __init__(self, logger):
        self.logger = logger
        self.dashboard_json = None
        self._load_dashboard_data()

    def _load_dashboard_data(self) -> None:
        try:
            dbt_project_dir = get_dbt_project_dir()
            with open(f'{dbt_project_dir}/target/looker_analysis.json') as f:
                self.dashboard_json = json.load(f)
        except FileNotFoundError:
            self.logger.error("Dashboard analysis file not found")
            self.dashboard_json = None
        except json.JSONDecodeError:
            self.logger.error("Error parsing dashboard JSON file")
            self.dashboard_json = None
        except Exception as e:
            self.logger.error(f"Error loading dashboard data: {str(e)}")
            self.dashboard_json = None

    def get_dashboards(self) -> Dict:
        if not self.dashboard_json:
            return {
                'status': 'error',
                'message': 'Dashboard data not available',
                'total_dashboards': 0,
                'data': []
            }

        try:
            dashboards = []
            base_url = self.__get_base_url()

            for dashboard in self.dashboard_json.get('dashboards', []):
                folder_path = self.__get_folder_path(dashboard['folder_id'])

                dashboards.append({
                    'id': dashboard['id'],
                    'title': dashboard['title'],
                    'url': base_url + dashboard['url'],
                    'folder_id': dashboard['folder_id'],
                    'folder_path': folder_path
                })

            # Sort by folder path and title
            sorted_dashboards = sorted(dashboards, key=lambda x: (x['folder_path'], x['title']))

            return {
                'status': 'success',
                'total_dashboards': len(sorted_dashboards),
                'data': sorted_dashboards
            }

        except Exception as e:
            self.logger.error(f"Error processing dashboards: {str(e)}")
            return {
                'status': 'error',
                'message': str(e),
                'total_dashboards': 0,
                'data': []
            }

    def get_dashboard_elements(self, dashboard_id: str) -> []:
        if not self.dashboard_json:
            return {}

        dashboard_elements = self.dashboard_json.get('dashboard_elements', [])
        filtered_elements = []
        for e in dashboard_elements:
            if e['dashboard_id'] == dashboard_id:
                filtered_elements.append(e)
        return filtered_elements

    def get_dashboard_dependencies(self, source: str, target_dashboard_ids: list[str], target_column: str = None) -> Dict:
        if not self.dashboard_json:
            return {}

        dependencies = defaultdict(list)

        for element in self.dashboard_json.get('dashboard_elements', []):
            # テーブルの一致チェック
            columns_by_table = element.get('columns', {})
            if source.upper() not in [t.upper() for t in columns_by_table.keys()]:
                continue

            # ターゲットテーブルのフィルタリング
            if len(target_dashboard_ids) > 0 and element['dashboard_id'] not in target_dashboard_ids:
                continue

            # カラムレベルのチェック
            if target_column:
                source_upper = source.upper()
                table_columns = columns_by_table.get(source_upper, [])

                # 指定されたカラムが使用されているかチェック
                if target_column.upper() not in [col.upper() for col in table_columns]:
                    continue

            dashboard_id = element['dashboard_id']
            dependencies[dashboard_id].append(element)

        return dependencies

    def get_dashboard(self, dashboard_id: str) -> Optional[Dict]:
        if not self.dashboard_json:
            return None

        dashboard = next(
            (d for d in self.dashboard_json.get('dashboards', []) if d['id'] == dashboard_id),
            None
        )

        return dashboard

    def __get_folder_path(self, folder_id: str) -> str:
        if not self.dashboard_json:
            return ''

        for folder in self.dashboard_json.get('folders', []):
            if folder['id'] == folder_id:
                return '/'.join(folder['path'])
        return ''

    def __get_base_url(self) -> str:
        if not self.dashboard_json:
            return ''
        return self.dashboard_json.get('metadata', {}).get('base_url', '')