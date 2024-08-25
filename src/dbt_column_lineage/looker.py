import looker_sdk
from looker_sdk.sdk.api40.models import Folder


class Looker:
    def __init__(self, logger):
        self.logger = logger
        self.sdk = looker_sdk.init40()
        self.ignore_folder_names = ['tmp', 'old', 'バックアップ', '作業', 'テスト']
        self.ignore_dashboard_element_titles = ['表示期間', '無題', 'データ取込日時']

    def get_folder_dashboards(self) -> []:
        self.folders = {}
        res = self.sdk.all_folders(fields='id, parent_id, name, is_personal, is_personal_descendant, child_count')
        for r in res:
            # 個人用フォルダ関連は無視
            if r.is_personal or r.is_personal_descendant:
                continue
            self.folders[r.id] = r

        ret = []
        for v in self.folders.values():
            # 子フォルダがある場合は無視
            if v.child_count:
                continue
            # 再帰的にフォルダ名を取得
            name = self._get_folder(v, v.name)
            # 共有フォルダ以外無視
            if not name.startswith('Shared'):
                continue
            ignore = False
            # ignore_folder_names に含まれる文字列を含むフォルダは無視（「tmp」など）
            for ifn in self.ignore_folder_names:
                if ifn in name:
                    ignore = True
                    break
            if ignore:
                continue

            # フォルダIDからダッシュボード一覧を取得
            res = self.sdk.folder_dashboards(folder_id=v.id, fields='id,title')
            dashboards = []
            for d in res:
                dashboards.append({'id': d.id, 'name': d.title})
            ret.append({'id': v.id, 'name': name, 'dashboards': dashboards})
        return ret

    def get_dashboard_elements(self, dashboard_id: str) -> []:
        dashboard = self.sdk.dashboard(dashboard_id=dashboard_id, fields='dashboard_elements,dashboard_layouts')
        dashboard_layout_components = []
        for item in dashboard.dashboard_layouts:
            for layout_component in item.dashboard_layout_components:
                dashboard_layout_components.append(layout_component)

        # dashboard_layout の row, column でソート
        sorted_dashboard_layout_components = sorted(dashboard_layout_components, key=lambda x: (x.row, x.column))
        dashboard_elements = {}
        for item in dashboard.dashboard_elements:
            dashboard_elements[item.id] = item

        ret = []
        # ソートされた layout_components から dashboard_element を取得
        for layout_component in sorted_dashboard_layout_components:
            item = dashboard_elements[layout_component.dashboard_element_id]
            # ignore_dashboard_element_titles に含まれる文字列を含む要素は無視 (「無題」など)
            ignore = False
            for idt in self.ignore_dashboard_element_titles:
                if idt in item.title:
                    ignore = True
                    break
            if ignore:
                continue

            # result_maker が存在しない場合は無視
            if item.result_maker is None:
                continue

            ret.append({
                'element_id': item.id,
                'title': item.title,
                'share_url': item.result_maker.query.share_url,
                'slug': item.result_maker.query.slug,
            })

        return ret

    def get_explore_fields(self, slug: str) -> []:
        query = self.sdk.query_for_slug(slug)
        res = self.sdk.lookml_model_explore(lookml_model_name=query.model, explore_name=query.view,
                                            fields='fields, sql_table_name')

        # table_name が AS で別名がついている場合は元のテーブル名を取得
        if 'AS' in res.sql_table_name:
            table_name = res.sql_table_name.split('AS')[0].strip()
        else:
            table_name = res.sql_table_name

        # schema.table の場合は table のみ取得
        if '.' in table_name:
            table_name = table_name.split('.')[1]

        query_sql = self.sdk.run_query(query.id, result_format='sql')
        ret = {
            'id': res.id,
            'name': res.name,
            'title': res.title,
            'sql': query_sql,
            'table_name': table_name,
            'dimensions': [],
            'measures': [],
            'filters': []
        }

        for dimension in res.fields.dimensions:
            if query.fields and dimension.name in query.fields:
                dim_def = {
                    'field_type': 'dimension',
                    'name': dimension.name,
                    'view_label': dimension.view_label,
                    'label_short': dimension.label_short,
                    'type': dimension.type,
                    'sql': dimension.sql,
                }
                ret['dimensions'].append(dim_def)
            elif query.filters and dimension.name in query.filters:
                filter_def = {
                    'field_type': 'filter',
                    'name': dimension.name,
                    'view_label': dimension.view_label,
                    'label_short': dimension.label_short,
                    'type': dimension.type,
                    'sql': dimension.sql
                }
                ret['filters'].append(filter_def)

        for measure in res.fields.measures:
            if query.fields and measure.name in query.fields:
                mes_def = {
                    'field_type': 'measure',
                    'name': measure.name,
                    'view_label': measure.view_label,
                    'label_short': measure.label_short,
                    'type': measure.type,
                    'sql': measure.sql
                }
                ret['measures'].append(mes_def)

        return ret


    def _get_folder(self, folder: Folder, folder_name: str) -> str:
        if folder and folder.parent_id:
            parent_folder = self.folders[folder.parent_id]
            folder_name = f'{parent_folder.name}/{folder_name}'
            return self._get_folder(parent_folder, folder_name)
        return folder_name

