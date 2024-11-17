import json
import os
import re
import typing
from collections import defaultdict
from typing import Optional, Dict

import looker_sdk
import sqlglot
from looker_sdk.sdk.api40.models import WriteQuery, Folder
from sqlglot.expressions import Select, Column, Table, Alias, Expression, Identifier, Binary


class LookerDashboardAnalyzer:
    def __init__(self, dialect: str = 'snowflake'):
        self.sdk = looker_sdk.init40()
        self.dialect = dialect
        self.ignore_folder_names = self._parse_env_list('LOOKER_IGNORE_FOLDERS', ['LookML Dashboard'])
        self.ignore_dashboard_element_titles = self._parse_env_list('LOOKER_IGNORE_ELEMENTS', [])
        self.base_url = re.sub(':[0-9]+', '', os.getenv('LOOKERSDK_BASE_URL'))

    def _parse_env_list(self, env_var: str, default: list) -> list:
        """環境変数の文字列をリストに変換する."""
        value = os.getenv(env_var)
        if not value:
            return default
        return [item.strip() for item in value.split(',')]

    def get_folder_dashboards(self) -> list:
        def get_folder(folder: Folder, folder_name: str) -> str:
            if folder and folder.parent_id:
                parent_folder = folders[folder.parent_id]
                folder_name = f'{parent_folder.name}/{folder_name}'
                return get_folder(parent_folder, folder_name)
            return folder_name

        folders = {}
        res = self.sdk.all_folders(fields='id, parent_id, name, is_personal, is_personal_descendant, child_count')
        for r in res:
            if r.is_personal or r.is_personal_descendant:
                continue
            folders[r.id] = r

        ret = []
        for v in folders.values():
            if v.child_count:
                continue
            name = get_folder(v, v.name)
            if not name.startswith('Shared'):
                continue

            ignore = False
            for ifn in self.ignore_folder_names:
                if ifn in name:
                    ignore = True
                    break
            if ignore:
                continue

            res = self.sdk.folder_dashboards(folder_id=v.id, fields='id,title')
            dashboards = []
            for d in res:
                dashboards.append({'id': d.id, 'name': d.title})
            ret.append({'id': v.id, 'name': name, 'dashboards': dashboards})
        return ret

    def get_raw_sql_and_explore_url_from_dashboard_element(self, element) -> dict|None:
        if not (hasattr(element, 'result_maker') and
                element.result_maker and
                hasattr(element.result_maker, 'query')):
            return None

        query = element.result_maker.query
        if not query.share_url:
            write_query = WriteQuery(
                model=query.model,
                view=query.view,
                fields=query.fields if hasattr(query, 'fields') else [],
                filters=query.filters if hasattr(query, 'filters') else {},
                limit=query.limit if hasattr(query, 'limit') else 500
            )
            query = self.sdk.create_query(body=write_query)
            explore_url = f'{self.base_url}/x/{query.slug}'
        else:
            explore_url = query.share_url

        # 最終的なURL

        query_task = self.sdk.run_query(
            query_id=query.id,
            result_format='sql'
        )

        return {
            'sql': query_task,
            'explore_url': explore_url
        }


    def analyze_sql(self, sql: str) -> Optional[Dict] | None:
        if not sql:
            return None

        try:
            # Snowflake dialectでパース
            ast = sqlglot.parse_one(sql, read=self.dialect)
            tables = set()
            columns = defaultdict(set)
            alias_to_table = {}

            def resolve_table_name(table_name: str) -> str:
                """エイリアスから実テーブル名を解決"""
                if not table_name:
                    return 'UNKNOWN'
                table_str = str(table_name).upper()
                parts = table_str.split('.')
                # スキーマ修飾された名前から最後の部分を取得
                base_name = parts[-1]
                return alias_to_table.get(base_name, table_str)

            def clean_identifier(identifier) -> str:
                """識別子の正規化
                - クォートを除去
                - スキーマ修飾がある場合は最後の部分を取得
                """
                if isinstance(identifier, Identifier):
                    identifier = identifier.name
                if not identifier:
                    return ''

                # 文字列に変換してクォートを除去
                clean_name = str(identifier).strip('"\'`[]').upper()
                # ドット区切りの場合は最後の部分を取得
                parts = clean_name.split('.')
                return parts[-1]

            def extract_table_name(node: Expression | str) -> str:
                """テーブル名を抽出（スキーマ修飾対応）"""
                if isinstance(node, Identifier):
                    parts = str(node).strip('"\'`[]').split('.')
                    return parts[-1].upper()
                return str(node).strip('"\'`[]').upper()

            def visit(node: Expression, context: Optional[str] = None) -> None:
                if isinstance(node, Select):
                    if node.args.get('from'):
                        visit(node.args['from'], context)
                    for join in node.args.get('joins', []):
                        visit(join, context)
                    for expr in node.args.get('expressions', []):
                        visit(expr, context)

                elif isinstance(node, Table):
                    table_name = node.args.get('this', '')
                    if table_name:
                        clean_table_name = extract_table_name(table_name)
                        tables.add(clean_table_name)
                        context = clean_table_name

                elif isinstance(node, Column):
                    column_name = node.args.get('this', '')
                    table_ref = node.args.get('table', context or 'UNKNOWN')

                    if column_name:
                        clean_column = clean_identifier(column_name)
                        if clean_column != '*':
                            if isinstance(table_ref, (str, Identifier)):
                                table_name = extract_table_name(table_ref)
                                actual_table = resolve_table_name(table_name)
                                columns[actual_table].add(clean_column)

                elif isinstance(node, Alias):
                    alias_name = node.args.get('alias', '')
                    if alias_name:
                        clean_alias = clean_identifier(alias_name)
                        if isinstance(node.args.get('expression'), Table):
                            original_table = node.args['expression'].args.get('this', '')
                            clean_original = extract_table_name(original_table)
                            alias_to_table[clean_alias] = clean_original

                    if 'expression' in node.args:
                        visit(node.args['expression'], clean_identifier(alias_name))

                elif isinstance(node, Binary):
                    visit(node.args.get('this'), context)
                    visit(node.args.get('expression'), context)

                # 再帰的に処理
                for arg in node.args.values():
                    if isinstance(arg, Expression):
                        visit(arg, context)
                    elif isinstance(arg, list):
                        for item in arg:
                            if isinstance(item, Expression):
                                visit(item, context)

            visit(ast)

            # 結果から空のテーブルとカラムを除去
            cleaned_columns = {
                k: sorted(list(v))
                for k, v in columns.items()
                if v and k != 'UNKNOWN'
            }

            return {
                'tables': sorted(list(tables - {'UNKNOWN'})),
                'columns': cleaned_columns,
                'parsed_sql': str(ast)
            }

        except Exception as e:
            print(f'SQL parsing error for: {sql[:200]}...')
            print(f'Error: {str(e)}')
            import traceback
            traceback.print_exc()
            return None

    def analyze_dashboard(self, dashboard_id: str) -> dict | None:
        try:
            dashboard = self.sdk.dashboard(dashboard_id=dashboard_id)
            results = {
                'dashboard_id': dashboard_id,
                'dashboard_title': dashboard.title,
                'dashboard_url': f'{self.base_url}{dashboard.url}',
                'elements': []
            }

            for element in dashboard.dashboard_elements:
                if element.title in self.ignore_dashboard_element_titles:
                    continue

                try:
                    res = self.get_raw_sql_and_explore_url_from_dashboard_element(element)
                    if res and res['sql']:
                        analysis = self.analyze_sql(res['sql'])
                        if analysis:
                            results['elements'].append({
                                'element_id': element.id,
                                'element_title': element.title,
                                'explore_url': res['explore_url'],
                                'sql_analysis': analysis
                            })
                except Exception as e:
                    print(f'Error analyzing element {element.title} in dashboard {dashboard_id}: {str(e)}')

            return results
        except Exception as e:
            print(f'Error analyzing dashboard {dashboard_id}: {str(e)}')
            return None

    def analyze_all_dashboards(self, output_file: str = 'target/looker_analysis.json'):
        folder_dashboards = self.get_folder_dashboards()

        api_structure = {
            'folders': [],
            'dashboards': [],
            'dashboard_elements': [],
            'tables': set(),
            'columns': defaultdict(set)
        }

        folder_relationships = []
        dashboard_element_relationships = []

        i = 0
        for folder in folder_dashboards:
            folder_id = folder['id']

            api_structure['folders'].append({
                'id': folder_id,
                'name': folder['name'],
                'path': folder['name'].split('/')
            })

            for dashboard in folder['dashboards']:
                dashboard_id = dashboard['id']

                folder_relationships.append({
                    'folder_id': folder_id,
                    'dashboard_id': dashboard_id
                })

                print(f'Analyzing dashboard: {folder['name']}/{dashboard['name']}')
                analysis = self.analyze_dashboard(dashboard_id)

                if analysis:
                    api_structure['dashboards'].append({
                        'id': dashboard_id,
                        'title': analysis['dashboard_title'],
                        'url': analysis['dashboard_url'],
                        'folder_id': folder_id
                    })

                    for element in analysis['elements']:
                        element_id = element['element_id']

                        dashboard_element_relationships.append({
                            'dashboard_id': dashboard_id,
                            'element_id': element_id
                        })

                        element_info = {
                            'id': element_id,
                            'title': element['element_title'],
                            'explore_url': element['explore_url'],
                            'dashboard_id': dashboard_id,
                            'tables': element['sql_analysis']['tables'],
                            'columns': element['sql_analysis']['columns']
                        }
                        api_structure['dashboard_elements'].append(element_info)

                        for table in element['sql_analysis']['tables']:
                            api_structure['tables'].add(table.upper())
                        for table, cols in element['sql_analysis']['columns'].items():
                            api_structure['columns'][str(table).upper()].update(cols)

        final_structure = {
            'metadata': {
                'total_folders': len(api_structure['folders']),
                'total_dashboards': len(api_structure['dashboards']),
                'total_elements': len(api_structure['dashboard_elements']),
                'total_tables': len(api_structure['tables']),
                'total_columns': sum(len(cols) for cols in api_structure['columns'].values()),
            },
            'folders': api_structure['folders'],
            'dashboards': api_structure['dashboards'],
            'dashboard_elements': api_structure['dashboard_elements'],
            # 'relationships': {
            #     'folder_dashboards': folder_relationships,
            #     'dashboard_elements': dashboard_element_relationships
            # },
            'schema': {
                'tables': sorted(list(api_structure['tables'])),
                'columns': {
                    str(table): sorted(list(columns))
                    for table, columns in api_structure['columns'].items()
                }
            }
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            if typing.TYPE_CHECKING:
                from _typeshed import SupportsWrite
                f: SupportsWrite[str]
            json.dump(obj=final_structure, fp=f, ensure_ascii=False, indent=2)

        print(f'\nAnalysis complete. Results saved to {output_file}')


def main():
    analyzer = LookerDashboardAnalyzer(dialect='snowflake')
    analyzer.analyze_all_dashboards('target/looker_analysis.json')


if __name__ == '__main__':
    main()