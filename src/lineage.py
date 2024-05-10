import json
from sqlglot import exp, parse_one, MappingSchema
from sqlglot.errors import ParseError, OptimizeError, SqlglotError
from sqlglot.lineage import lineage

from constants import APP_ROOT


class DbtSqlglot:

    def __init__(self, logger, request_depth=-1):
        with open(f'{APP_ROOT}/../data/manifest.json') as f:
            manifest = json.load(f)
        with open(f'{APP_ROOT}/../data/catalog.json') as f:
            catalog = json.load(f)
        self.dbt_metadata = manifest['metadata']
        self.dbt_manifest_nodes = manifest['nodes']
        self.dbt_manifest_sources = manifest['sources']
        self.dbt_catalog_nodes = catalog['nodes']

        self.logger = logger
        self.nodes = []
        self.edges = []
        self.request_depth = request_depth

    def list_schemas(self):
        schemas = []
        for k in self.dbt_manifest_nodes:
            dbt_node = self.dbt_manifest_nodes[k]
            dbt_schema = dbt_node['schema']
            if (dbt_schema not in schemas and
                bool(dbt_node['columns']) and
                dbt_node['resource_type'] == 'model' and
                dbt_node['package_name'] == self.dbt_metadata['project_name']):
                schemas.append(dbt_schema)
        schemas.sort()
        return schemas

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
        res = {}
        for t in tmp:
            fqn = t['fqn']
            if not res.get(fqn):
                res[fqn] = []
            res[fqn].append(t['alias'])
        # self.logger.info(res)
        # ソート
        for r in res:
            res[r].sort()
        return res

    def list_columns(self, req_schema, req_source):
        for k in self.dbt_manifest_nodes:
            dbt_node = self.dbt_manifest_nodes[k]
            dbt_schema = dbt_node['schema']
            dbt_alias = dbt_node['alias']
            dbt_columns = dbt_node['columns']
            if dbt_schema == req_schema and dbt_alias == req_source:
                return list(dbt_columns.keys())

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
            items, found = self.get_sqlglot_lineage(source, compiled_code, columns, depends_on_table_info)

            for item in items.values():
                for label in item['labels']:
                    lineage_tables.append(label.lower())
                for column in item['columns']:
                    lineage_columns.append(column.lower())

            self.logger.debug(items, found)

        for cte in parse_one(compiled_code, dialect='snowflake').find_all(exp.CTE):
            dependencies[cte.alias_or_name] = []

            nodes.append({
                'id': cte.alias_or_name,
                'data': {'label': cte.alias_or_name},
                'position': {'x': 0, 'y': 0},
            })

            query = cte.this.sql()
            for table in parse_one(query).find_all(exp.Table):
                has_db = False
                if table.db and table.catalog:
                    if table.name in lineage_tables and len(lineage_columns) > 0:
                        dn = self.get_dbt_node(table.name)
                        dn_columns = list(dn.get('columns', {}).keys())

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
        dbt_node = self.get_dbt_node(next_source)
        dbt_compiled_code = dbt_node.get('compiled_code')
        dbt_resource_type = dbt_node.get('resource_type')
        dbt_schema = dbt_node.get('schema')
        dbt_depends_on_nodes = dbt_node.get('depends_on', {}).get('nodes', [])
        dbt_columns = list(dbt_node.get('columns', {}).keys())

        # dbt の定義に該当するカラムだけに絞り込む
        filtered_columns = self.get_columns(dbt_columns, next_columns)

        # ノード作成
        self.add_node(next_source, dbt_schema, filtered_columns, depth)
        # エッジ作成
        self.add_edge(base_column, filtered_columns, base_source, next_source)

        # snapshot や seed はパースエラーになってしまうのでリネージしない
        if dbt_resource_type != 'model':
            after_next_sources_columns_dict = {}
            self.logger.info(f'skip lineage: {next_source}, {dbt_resource_type}')
        else:
            if dbt_compiled_code is None:
                self.logger.info('dbt_compiled_code is None')
                return

            # リネージの手がかりとして依存テーブルのカラムやテーブル情報を作成
            additional_dbt_sources = self.get_depends_on_table_info(dbt_depends_on_nodes)

            after_next_sources_columns_dict, found = self.get_sqlglot_lineage(next_source, dbt_compiled_code, filtered_columns, additional_dbt_sources)
            if not found:
                self.logger.info(f'lineage not found:{found}')
                return

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
            # カラムを取得
            columns = element.get('columns', {}).keys()
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
            # cleansing は columns (dbt)の定義がない。。。
            return next_columns

        ret = []
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

    def get_sqlglot_lineage(self, source: str, compiled_code: str, columns: [], depends_on_table_info: []) -> (dict, bool):
        found = False

        sqlglot_db_schema = {}

        # self.logger.info(sources)
        for s in depends_on_table_info:
            source_table = s['table']
            source_columns = s['columns']
            # self.logger.info(source_table, source_columns)

            table_schema = {}
            for source_column in source_columns:
                table_schema[source_column.upper()] = None

            sqlglot_db_schema[source_table] = table_schema

        ret = {}
        for column in columns:
            column = column.upper()
            labels = set()
            replace_columns = set()
            try:
                if len(sqlglot_db_schema) != 0:
                    schema = MappingSchema(schema=sqlglot_db_schema, dialect='snowflake')
                else:
                    schema = {}
                lin = lineage(column, compiled_code, dialect='snowflake', schema=schema)
            except SqlglotError as e:
                self.logger.error(f'parse error. source={source}, column={column}', e)
                found = False
                continue

            found = True

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
                    for c in parse_one(cte).find_all(exp.Column):
                        # self.logger.info(f'alias_or_name={c.alias_or_name}')
                        replace_columns.add(c.alias_or_name)
                    # if self.replace_columns:
                    #     self.logger.info(f'{node.name} =>{self.replace_columns}')
            ret[column] = {'labels': list(labels), 'columns': list(replace_columns)}
        self.logger.info(f'{source}, {ret}')
        return ret, found

    def str_to_base_10_int_str(self, s:str) -> str:
        return str(int(s, 36))

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
