import json
import time

from sqlglot import exp, parse_one, MappingSchema
from sqlglot.errors import SqlglotError
from sqlglot.lineage import lineage

from dbt_column_lineage.utils import get_dbt_project_dir


class DbtSqlglot:
    _instance = None

    def __new__(cls, logger, request_depth=-1):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, logger, request_depth=-1):
        if self._initialized:
            return
        self._initialized = True

        dbt_project_dir = get_dbt_project_dir()
        with open(f'{dbt_project_dir}/target/manifest.json') as f:
            manifest = json.load(f)
        with open(f'{dbt_project_dir}/target/catalog.json') as f:
            catalog = json.load(f)

        self.dbt_metadata = manifest['metadata']
        self.dbt_manifest_nodes = manifest['nodes']
        self.dbt_manifest_sources = manifest['sources']
        self.dbt_catalog_nodes = catalog['nodes']
        self.dbt_manifest_child_map = manifest['child_map']

        self.logger = logger
        self.nodes = []
        self.edges = []
        self.request_depth = request_depth
        self.dialect = 'snowflake'

    def list_schemas(self):
        schemas = []
        ret = []
        for k in self.dbt_manifest_nodes:
            dbt_node = self.dbt_manifest_nodes[k]
            dbt_schema = dbt_node['schema']
            if (dbt_schema not in schemas and
                bool(dbt_node['columns']) and
                dbt_node['resource_type'] == 'model' and
                dbt_node['package_name'] == self.dbt_metadata['project_name']):
                schemas.append(dbt_schema)
        schemas.sort()
        for schema in schemas:
            ret.append({'value': schema, 'label': schema})
        return ret

    def list_sources(self, req_schema):
        tmp = []
        for k in self.dbt_manifest_nodes:
            dbt_node = self.dbt_manifest_nodes[k]
            dbt_resource_type = dbt_node['resource_type']
            dbt_schema = dbt_node['schema']
            dbt_alias = dbt_node['alias']
            # (例) fqn = ['data_cuisine_dbt', 'raw_coredb_hourly', 'xxx', 'yyy', 'model_name']
            # ↑の 'xxx/yyy' の部分がほしい
            dbt_fqn = '/'.join(dbt_node['fqn'][2:-1])
            if dbt_resource_type == 'model' and dbt_schema == req_schema:
                tmp.append({'fqn': dbt_fqn, 'alias': dbt_alias})
        label_fqn_alias = {}
        for t in tmp:
            fqn = t['fqn']
            if not label_fqn_alias.get(fqn):
                label_fqn_alias[fqn] = []
            label_fqn_alias[fqn].append({'value': t['alias'], 'label': t['alias']})
        ret = []
        for label in label_fqn_alias:
            # ソート
            label_fqn_alias[label].sort(key=lambda v: v['label'])
            ret.append({'label': label, 'options': label_fqn_alias[label]})
        ret = sorted(ret, key=lambda x:x['label'])
        return ret

    def list_columns(self, req_schema, req_source):
        for k in self.dbt_manifest_nodes:
            dbt_node = self.dbt_manifest_nodes[k]
            dbt_schema = dbt_node['schema']
            dbt_alias = dbt_node['alias']
            dbt_columns = dbt_node['columns']
            if dbt_schema == req_schema and dbt_alias == req_source:
                ret = []
                for key, value in dbt_columns.items():
                    ret.append({'value': key, 'label': value['name'], 'description': value['description']})
                return ret

    def reverse_lineage(self, source: str, column: str) -> dict:
        dbt_node = self.get_dbt_node(source)
        unique_id = dbt_node.get('unique_id')
        refs = self.dbt_manifest_child_map.get(unique_id, [])

        data = {}
        for ref in refs:
            ref_dbt_node = self.dbt_manifest_nodes.get(ref)
            ref_node_name = ref_dbt_node.get('name')
            ref_schema = ref_dbt_node.get('schema')
            ref_compiled_code = ref_dbt_node.get('compiled_code')
            ref_dbt_depends_on_nodes = ref_dbt_node.get('depends_on', {}).get('nodes', [])

            depends_on_table_info = self.get_depends_on_table_info(ref_dbt_depends_on_nodes)

            # catalog.json にカラム情報があればそれを使い、なければ manifest.json のカラム情報を使う
            ref_columns = ref_dbt_node.get('columns', self.get_dbt_catalog(ref).get('columns', {}))
            for ref_column in ref_columns:
                self.logger.info(f'table={ref}, column={ref_column}')

                ref_column_name = ref_column.upper()
                items = self.get_sqlglot_lineage(source, ref_compiled_code, [ref_column_name], depends_on_table_info)
                item_labels_columns = items.get(ref_column_name, {})
                if column in item_labels_columns.get('columns', []):
                    item_labels = item_labels_columns['labels']
                    item_columns = item_labels_columns['columns']
                    if source.upper() in item_labels and column in item_columns:
                        self.logger.info(f'source={source}, column={column} found')
                        r = data.get(ref_node_name, {'columns': [], 'schema': ref_schema})
                        r['columns'].append(ref_column_name)
                        data[ref_node_name] = r

        ret_nodes = []
        ret_edges = []
        ret = {'edges': ret_edges, 'nodes': ret_nodes}

        target_id = self.str_to_base_10_int_str(source)
        for node_name, item in data.items():
            target_schema = item['schema']
            target_columns = item['columns']
            node_id = self.str_to_base_10_int_str(node_name)
            base_edge_id = f'{node_id}-{target_id}'
            ret_nodes.append({
                'id': node_id,
                'data': {
                    'name': node_name,
                    'color': 'black',
                    'label': node_name,
                    'schema': target_schema,
                    'columns': target_columns,
                    'first': True,
                    'last': False
                },
                'position': {'x': 0,'y': 0},
                'type': 'eventNode'
            })
            for target_column in target_columns:
                edge_id = f'{base_edge_id}-{target_column}-{column}'
                ret_edges.append({
                    'id': edge_id,
                    'source': node_id,
                    'target': target_id,
                    'source_label': node_name,
                    'target_label': source,
                    'sourceHandle': f'{target_column}__source',
                    'targetHandle': f'{column}__target'
                })
        return ret

    def cte_dependency(self, source: str, columns: []):
        dbt_node = self.get_dbt_node(source)
        dbt_catalog = self.get_dbt_catalog(source)
        table_name = dbt_node.get('name')
        materialized = dbt_node.get('config', {}).get('materialized')
        compiled_code = dbt_node.get('compiled_code')
        description = dbt_node.get('description')
        dbt_columns = dbt_catalog.get('columns')
        dbt_depends_on_nodes = dbt_node.get('depends_on', {}).get('nodes', [])
        dependencies = {}
        nodes = []
        edges = []
        lineage_tables = []
        lineage_columns = []
        lineage_table_columns = {}

        if compiled_code is None:
            self.logger.info('compiled_code is None')
            return None

        if len(columns) > 0:
            depends_on_table_info = self.get_depends_on_table_info(dbt_depends_on_nodes)
            items = self.get_sqlglot_lineage(source, compiled_code, columns, depends_on_table_info)
            self.logger.debug(items)

            for item in items.values():
                for label in item['labels']:
                    lineage_tables.append(label.lower())
                for column in item['columns']:
                    lineage_columns.append(column.lower())

        try:
            parsed_sql = parse_one(compiled_code, dialect=self.dialect)
            ctes = parsed_sql.find_all(exp.CTE)
        except SqlglotError:
            self.logger.error(f'parse cte error. source={source}')
            ctes = []

        for cte in ctes:
            dependencies[cte.alias_or_name] = []

            nodes.append({
                'id': cte.alias_or_name,
                'data': {'label': cte.alias_or_name},
                'position': {'x': 0, 'y': 0},
            })

            query = cte.this.sql()
            try:
                parsed_cte_query = parse_one(query, dialect=self.dialect)
                tables = parsed_cte_query.find_all(exp.Table)
            except SqlglotError:
                self.logger.error(f'parse cte sql error. source={source}, query={query}')
                tables = []

            for table in tables:
                has_db = False
                if table.db and table.catalog:
                    if table.name in lineage_tables and len(lineage_columns) > 0:
                        dc = self.get_dbt_catalog(table.name)
                        dn = self.get_dbt_node(table.name)
                        # catalog.json にカラム情報があればそれを使い、なければ manifest.json のカラム情報を使う
                        dn_columns = list(dc.get('columns', dn.get('columns', {})).keys())

                        # dbt の定義に該当するカラムだけに絞り込む
                        filtered_columns = self.get_columns(dn_columns, lineage_columns)

                        lineage_table_columns[table.name] = {'alias': table.alias, 'db': table.db, 'columns': filtered_columns, 'table.is_star': table.is_star}
                        for filtered_column in filtered_columns:
                            label = f'{table.name} ({filtered_column})'
                            nodes.append({
                                'id': label,
                                'data': {'label': label, 'db': table.db, 'table': table.name, 'column': filtered_column},
                                'position': {'x': 0, 'y': 0},
                                'style': {'background': '#ffccaa'},
                                'type': 'input'
                            })
                            dependencies[cte.alias_or_name].append({'name': label, 'has_db': has_db})
                    else:
                        nodes.append({
                            'id': table.name,
                            'data': {'label': table.name, 'db': table.db, 'table': table.name},
                            'position': {'x': 0, 'y': 0},
                            'style': {'background': '#aaccff'},
                            'type': 'input'
                        })
                    has_db = True

                dependencies[cte.alias_or_name].append({'name': table.name, 'has_db': has_db})

        for node in dependencies:
            for dependency in dependencies[node]:
                dep = dependency['name']
                has_db = dependency['has_db']
                edge_id = f'{node}-{dep}'
                if not self.find(edges, 'id', edge_id) and node and dep and node != dep:
                    edges.append({
                        'id': edge_id,
                        'source': dep,
                        'target': node,
                        'has_db': has_db,
                        # 'type': 'smoothstep',
                    })

        return {
            'edges': edges,
            'nodes': nodes,
            'table_name': table_name,
            'materialized': materialized,
            'query': compiled_code,
            'description': description,
            'columns': dbt_columns,
            'lineage_table_columns': lineage_table_columns
        }

    def get_dbt_columns(self, dbt_node):
        # dbt_manifest_node の columns がない場合は sources の値を元に dbt_manifest_sources から columns を取得する
        dn_columns = list(dbt_node.get('columns', {}).keys())
        if len(dn_columns) == 0:
            sources = dbt_node.get('sources', [[]])[0]
            source_key = '.'.join(sources)
            # FIXME data_cuisine_dbt は metadata から取る
            ds_columns = list(
                self.dbt_manifest_sources.get(f'source.data_cuisine_dbt.{source_key}', {}).get('columns', {}).keys())
            dn_columns = ds_columns
        return dn_columns

    def recursive(self, base_source: str, next_source: str, base_column: str, next_columns: [], depth: int) -> None:
        dbt_catalog = self.get_dbt_catalog(next_source)
        dbt_node = self.get_dbt_node(next_source)
        dbt_compiled_code = dbt_node.get('compiled_code')
        dbt_schema = dbt_node.get('schema')
        dbt_depends_on_nodes = dbt_node.get('depends_on', {}).get('nodes', [])
        dbt_columns = list(dbt_catalog.get('columns', dbt_node.get('columns', {})).keys())

        # dbt の定義に該当するカラムだけに絞り込む
        filtered_columns = self.get_columns(dbt_columns, next_columns)

        # ノード作成
        self.add_node(next_source, dbt_schema, filtered_columns, depth)
        # エッジ作成
        self.add_edge(base_column, filtered_columns, base_source, next_source)

        if dbt_compiled_code is None:
            self.logger.info('dbt_compiled_code is None')
            after_next_sources_columns_dict = {}
        else:
            # リネージの手がかりとして依存テーブルのカラムやテーブル情報を作成
            additional_dbt_sources = self.get_depends_on_table_info(dbt_depends_on_nodes)

            after_next_sources_columns_dict = self.get_sqlglot_lineage(next_source, dbt_compiled_code, filtered_columns, additional_dbt_sources)

        depth = depth + 1
        after_base_source = next_source
        next_found = False
        for after_base_column, after_next_sources_columns in after_next_sources_columns_dict.items():
            after_next_sources = after_next_sources_columns['labels']
            after_next_columns = after_next_sources_columns['columns']
            for after_next_source in after_next_sources:
                next_found = True
                after_next_source = after_next_source.lower()

                if self.request_depth != -1 and depth > self.request_depth:
                    continue
                self.logger.debug(f'base_source={after_base_source}, next_source={after_next_source}, base_column={after_base_column}, next_columns={after_next_columns}, depth={depth}')
                self.recursive(after_base_source, after_next_source, after_base_column, after_next_columns, depth)
        if not next_found:
            # 再起の最後だったらedgeの起点がない
            prev_node = self.find_with_subkey(self.nodes, 'data', 'name', after_base_source)
            if prev_node:
                self.logger.debug(f'last node: {after_base_source}')
                prev_node['data']['last'] = True

    def get_depends_on_table_info(self, depends_on_nodes: []) -> []:
        res = []
        for depends_on_node in depends_on_nodes:
            # 依存テーブルから manifest.json を検索
            element = self.dbt_manifest_nodes.get(depends_on_node, self.dbt_manifest_sources.get(depends_on_node))
            if not element:
                continue
            # catalog.json にカラム情報があればそれを使い、なければ manifest.json のカラム情報を使う
            element_columns = element.get('columns', {})
            columns = self.get_dbt_catalog(element['name']).get('columns', element_columns)
            res.append({
                'columns': columns,
                'table': exp.Table(
                    catalog=exp.Identifier(this=element['database'].upper()),
                    db=exp.Identifier(this=element['schema'].upper()),
                    this=exp.Identifier(this=element['name'].upper()),
                )
            })
        return res

    def add_node(self, next_source, dbt_schema, filtered_columns, depth):
        node_type = 'eventNode'

        node_columns = list(filtered_columns)
        node_id = self.str_to_base_10_int_str(next_source)
        found_node = self.find(self.nodes, 'id', node_id)

        if found_node:
            # すでにノードがあれば columns を増やす
            exist_columns = found_node['data']['columns']
            for node_column in node_columns:
                # 存在しないカラムだけ追加
                if node_column not in exist_columns:
                    exist_columns.append(node_column)
            # self.logger.info(f'**********already exists node source: {next_source}, columns: {exist_columns}')
            return

        if len(node_columns) != 0:
            max_len = max(max(node_columns, key=len), next_source, key=len)
        else:
            max_len = 0

        # 初回時
        self.nodes.append({
            'id': node_id,
            'data': {
                'name': next_source, 'color': 'black', 'label': next_source,
                'schema': dbt_schema, 'columns': node_columns,
                'first': len(self.nodes) == 0, 'last': False
            },
            'position': {'x': 0,'y': 0},
            'max_len': max_len, 'depth': depth, 'type': node_type
        })

    def add_edge(self, base_column: str, columns: [], base_source: str, source: str):
        if not base_source or len(columns) == 0:
            self.logger.debug(f'{base_source} is None or {columns} len = 0')
            return
        s = self.str_to_base_10_int_str(base_source)
        t = self.str_to_base_10_int_str(source.lower())
        base_edge_id = f'{s}-{t}'
        # if not (self.find(self.edges, 'source', str(s)) and self.find(self.edges, 'target', str(t))):
        for column in columns:
            edge_id = f'{base_edge_id}-{base_column}-{column}'
            if self.find(self.edges, 'id', edge_id):
                self.logger.debug(f'already exist edge: {edge_id}')
                continue
            else:
                self.logger.debug(f'edge:source={base_source}, target={source.lower()}, base_column={base_column}, column={column}')
                self.edges.append({
                    'id': edge_id,
                    'source': str(s),
                    'source_label': base_source,
                    'target_label': source.lower(),
                    'sourceHandle': f'{base_column}__source',
                    'targetHandle': f'{column}__target',
                    'target': str(t),
                })

    def get_parent_node(self, next_source, depth):
        for n in reversed(self.nodes):
            prev_name = n['data']['name']
            if prev_name != next_source and n['depth'] == depth - 1:
                self.logger.info('parent', prev_name, next_source, depth)
                return n
        return None

    def get_sibling_node(self, next_source, depth):
        for n in reversed(self.nodes):
            prev_name = n['data']['name']
            if prev_name != next_source and n['depth'] == depth:
                self.logger.info('sibling', prev_name, next_source, depth)
                return n
        return None

    def get_columns(self, dbt_columns: [], next_columns: []) -> []:
        if len(dbt_columns) == 0:
            self.logger.error('dbt_columns is empty')
            return next_columns

        ret = []
        # 小文字に変換
        dbt_columns = [x.lower() for x in dbt_columns]
        # next_column が dbt のカラムに含まれているものだけ返す
        for next_column in next_columns:
            if next_column.lower() in dbt_columns:
                ret.append(next_column)

        return ret

    def get_dbt_node(self, dbt_target: str) -> {}:
        for resource_type in ['model', 'seed', 'snapshot']:
            # FIXME data_cuisine_dbt は metadata から取る
            key = f'{resource_type}.data_cuisine_dbt.{dbt_target}'
            element = self.dbt_manifest_nodes.get(key, {})
            # self.logger.info(key, len(element))
            if len(element) > 0:
                break
        return element

    def get_dbt_catalog(self, dbt_target: str) -> {}:
        for resource_type in ['model', 'seed', 'snapshot']:
            key = f'{resource_type}.data_cuisine_dbt.{dbt_target}'
            element = self.dbt_catalog_nodes.get(key, {})
            if len(element) > 0:
                break
        return element

    def get_sqlglot_lineage(self, source: str, compiled_code: str, columns: [], depends_on_table_info: []) -> dict:
        # MappingSchema にテーブル情報を追加
        sqlglot_db_schema = MappingSchema(dialect=self.dialect, normalize=False)
        for s in depends_on_table_info:
            source_table = s['table']
            source_columns = s['columns']

            table_schema = {}
            for key, item in source_columns.items():
                table_schema[key] = item.get('type', 'STRING')

            sqlglot_db_schema.add_table(
                source_table,
                column_mapping=table_schema,
            )
        try:
            parsed_sql = parse_one(compiled_code, dialect=self.dialect)
        except SqlglotError:
            self.logger.error(f'parse sql. source={source}')
            return {}

        ret = {}
        for column in columns:
            column = column.upper()
            labels = set()
            replace_columns = set()
            try:
                start_time = time.time()
                lin = lineage(column, parsed_sql, dialect=self.dialect, schema=sqlglot_db_schema)
                end_time = time.time()
                if end_time - start_time > 3:
                    self.logger.info(f'lineage time: source={source}, column={column}, time={end_time - start_time}秒')
            except SqlglotError:
                self.logger.error(f'lineage error. source={source}, column={column}')
                continue

            for node in lin.walk():
                if isinstance(node.expression, exp.Table):
                    label = f'{node.expression.this}'
                    # 配下のデータがなければ最後とみなす
                    # self.logger.info(label)
                    if len(node.downstream) == 0:
                        labels.add(label)
                if node.name != '*' and not isinstance(node.expression, exp.Table):
                    cte = node.expression.sql()
                    # self.logger.info(cte)
                    try:
                        parsed_sql = parse_one(cte, dialect=self.dialect)
                        cl = parsed_sql.find_all(exp.Column)
                    except SqlglotError:
                        self.logger.error(f'cte parse error. source={source}, column={column}, cte={cte}')
                        cl = []
                    for c in cl:
                        # self.logger.info(f'alias_or_name={c.alias_or_name}')
                        replace_columns.add(c.alias_or_name)
                    # if self.replace_columns:
                    #     self.logger.info(f'{node.name} =>{self.replace_columns}')
            ret[column] = {'labels': list(labels), 'columns': list(replace_columns)}
        self.logger.info(f'{source}, {ret}')
        return ret

    def str_to_base_10_int_str(self, s:str) -> str:
        hash_value = 0
        for char in s:
            hash_value = (hash_value << 5) - hash_value + ord(char)
            hash_value = hash_value & 0xFFFFFFFF  # Convert to 32-bit integer
        return str(abs(hash_value))

    def find(self, arr: [], key: str, value: str):
        for x in arr:
            if x[key] == value:
                return x

    def find_with_subkey(self, arr: [], key: str, subkey: str, value: str):
        for x in arr:
            if x[key][subkey] == value:
                return x

    def nodes_edges(self):
        return {'edges': self.edges, 'nodes': self.nodes}
