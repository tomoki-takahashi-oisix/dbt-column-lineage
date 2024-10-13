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
        # 毎度初期化する変数
        self.nodes = []
        self.edges = []
        self.request_depth = request_depth

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
        self.dbt_manifest_parent_map = manifest['parent_map']

        self.logger = logger
        self.dialect = 'snowflake'

    def project_name(self):
        self.logger.info(self.dbt_metadata)
        return self.dbt_metadata['project_name']

    def schema_by_source(self, source: str):
        dbt_node = self.__get_dbt_node(source)
        return dbt_node.get('schema')

    def columns_by_source(self, source: str):
        dbt_node = self.__get_dbt_node(source)
        dbt_catalog = self.__get_dbt_catalog(source)
        dbt_columns = list(dbt_catalog.get('columns', dbt_node.get('columns', {})).keys())
        lowercase_dbt_columns = [s.lower() for s in dbt_columns]
        return lowercase_dbt_columns

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

    def list_columns(self, req_source):
        for k in self.dbt_manifest_nodes:
            dbt_node = self.dbt_manifest_nodes[k]
            dbt_alias = dbt_node['alias']
            dbt_columns = dbt_node['columns']
            if dbt_alias == req_source:
                ret = []
                for key, value in dbt_columns.items():
                    ret.append({'value': key, 'label': value['name'], 'description': value['description']})
                return ret


    def table_lineage(self, source: str, revs=False):
        dbt_node = self.__get_dbt_node(source)
        unique_id = dbt_node.get('unique_id')
        depth = 0
        self.__table_dependencies_recursive(unique_id, revs, depth)


    def column_lineage(self, source: str, column: str, revs: bool):
        if not revs:
            depth = 0
            self.__column_lineage_recursive('', source, '', [column.upper()], depth)
        else:
            self.__reverse_column_lineage(source, column)


    def ret_edges_nodes(self) -> dict:
        return {'edges': self.edges, 'nodes': self.nodes}


    def cte_dependency(self, source: str, columns: []):
        dbt_node = self.__get_dbt_node(source)
        dbt_catalog = self.__get_dbt_catalog(source)
        table_name = dbt_node.get('name')
        materialized = dbt_node.get('config', {}).get('materialized')
        compiled_code = dbt_node.get('compiled_code')
        description = dbt_node.get('description')
        dbt_columns = dbt_catalog.get('columns')
        dbt_depends_on_nodes = dbt_node.get('depends_on', {}).get('nodes', [])

        if compiled_code is None:
            self.logger.info('compiled_code is None')
            return None
        entire_meta = self.__cte_dependency_impl(dbt_depends_on_nodes, compiled_code, source, columns)
        return {
            'edges': self.edges,
            'nodes': self.nodes,
            'tableName': table_name,
            'materialized': materialized,
            'query': compiled_code,
            'description': description,
            'columns': dbt_columns,
            'entireMeta': entire_meta,
        }

    def __get_dbt_columns(self, dbt_node):
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


    def __get_depends_on_table_info(self, depends_on_nodes: []) -> []:
        res = []
        for depends_on_node in depends_on_nodes:
            # 依存テーブルから manifest.json を検索
            element = self.dbt_manifest_nodes.get(depends_on_node, self.dbt_manifest_sources.get(depends_on_node))
            if not element:
                continue
            # catalog.json にカラム情報があればそれを使い、なければ manifest.json のカラム情報を使う
            element_columns = element.get('columns', {})
            columns = self.__get_dbt_catalog(element['name']).get('columns', element_columns)
            res.append({
                'columns': columns,
                'table': exp.Table(
                    catalog=exp.Identifier(this=element['database'].upper()),
                    db=exp.Identifier(this=element['schema'].upper()),
                    this=exp.Identifier(this=element['name'].upper()),
                )
            })
        return res

    def __add_node(self, next_source, dbt_schema, filtered_columns, dbt_materialized, depth):
        node_columns = list(filtered_columns)
        node_id = self.__str_to_base_10_int_str(next_source)
        found_node = self.__find(self.nodes, 'id', node_id)

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
                'name': next_source,
                'materialized' : dbt_materialized,
                'schema': dbt_schema, 'columns': node_columns,
                'first': False, 'last': False,
            },
            'position': {'x': 0,'y': 0},
            # 'max_len': max_len, 'depth': depth,
            'type': 'eventNode'
        })

    def __add_edge(self, base_column: str, columns: [], base_source: str, source: str):
        if not base_source or len(columns) == 0:
            self.logger.debug(f'{base_source} is None or {columns} len = 0')
            return
        s = self.__str_to_base_10_int_str(base_source)
        t = self.__str_to_base_10_int_str(source.lower())
        base_edge_id = f'{s}-{t}'
        # if not (self.find(self.edges, 'source', str(s)) and self.find(self.edges, 'target', str(t))):
        for column in columns:
            edge_id = f'{base_edge_id}-{base_column}-{column}'
            if self.__find(self.edges, 'id', edge_id):
                self.logger.debug(f'already exist edge: {edge_id}')
                continue
            else:
                self.logger.debug(f'edge:source={base_source}, target={source.lower()}, base_column={base_column}, column={column}')
                self.edges.append({
                    'id': edge_id,
                    'source': str(s),
                    'target': str(t),
                    'sourceHandle': f'{base_column}__source',
                    'targetHandle': f'{column}__target',
                })

    def __get_parent_node(self, next_source, depth):
        for n in reversed(self.nodes):
            prev_name = n['data']['name']
            if prev_name != next_source and n['depth'] == depth - 1:
                self.logger.info('parent', prev_name, next_source, depth)
                return n
        return None

    def __get_sibling_node(self, next_source, depth):
        for n in reversed(self.nodes):
            prev_name = n['data']['name']
            if prev_name != next_source and n['depth'] == depth:
                self.logger.info('sibling', prev_name, next_source, depth)
                return n
        return None

    def __get_columns(self, dbt_columns: [], next_columns: []) -> []:
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

    def __get_dbt_node(self, dbt_target: str) -> {}:
        for resource_type in ['model', 'seed', 'snapshot']:
            # FIXME data_cuisine_dbt は metadata から取る
            key = f'{resource_type}.data_cuisine_dbt.{dbt_target}'
            element = self.dbt_manifest_nodes.get(key, {})
            # self.logger.info(key, len(element))
            if len(element) > 0:
                break
        return element

    def __get_dbt_catalog(self, dbt_target: str) -> {}:
        for resource_type in ['model', 'seed', 'snapshot']:
            key = f'{resource_type}.data_cuisine_dbt.{dbt_target}'
            element = self.dbt_catalog_nodes.get(key, {})
            if len(element) > 0:
                break
        return element

    def __get_sqlglot_lineage(self, source: str, compiled_code: str, columns: [], depends_on_table_info: [], need_meta=False) -> dict:
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

            meta = []
            for node in lin.walk():
                if isinstance(node.expression, exp.Table):
                    label = f'{node.expression.this}'
                    # 配下のデータがなければ最後とみなす
                    self.logger.debug(f'label: {label}')
                    if len(node.downstream) == 0:
                        labels.add(label)
                if node.name != '*' and not isinstance(node.expression, exp.Table):
                    cte = node.expression.sql(dialect=self.dialect)
                    self.logger.debug(cte)
                    try:
                        parsed_sql = parse_one(cte, dialect=self.dialect)
                        cl = parsed_sql.find_all(exp.Column)
                    except SqlglotError:
                        self.logger.error(f'cte parse error. source={source}, column={column}, cte={cte}')
                        cl = []
                    for c in cl:
                        self.logger.debug(f'alias_or_name={c.alias_or_name}')
                        replace_columns.add(c.alias_or_name)
                # CTEリネージ用の追加情報
                if need_meta and not isinstance(node.expression, exp.Table):
                    if node.reference_node_name == '':
                        # 最初のselect * from finalは無視
                        continue

                    node_downstream_alias_names = []
                    node_downstream_table_sources = []
                    for d in node.downstream:
                        if isinstance(d.expression, exp.Table):
                            node_downstream_table_sources.append({'schema': d.expression.db.lower(),'table': d.expression.name.lower()})
                            parsed_column = parse_one(d.name, dialect=self.dialect)
                            node_downstream_alias_names.append(parsed_column.alias_or_name.lower())
                        else:
                            node_downstream_alias_names.append(d.expression.alias_or_name.lower())

                    # カラム名が一致したら次のカラムをリセット
                    column_name = node.expression.alias_or_name.lower()
                    if column_name == node_downstream_alias_names[0]:
                        node_downstream_alias_names = []
                    mt = {
                        'column': node.expression.alias_or_name.lower(),
                        'nextColumns': node_downstream_alias_names,
                        'nextSources': node_downstream_table_sources,
                        'reference': node.reference_node_name.lower()
                    }
                    meta.append(mt)

            ret[column] = {'labels': list(labels), 'columns': list(replace_columns)}
            if need_meta:
                ret[column]['meta'] = meta
        self.logger.info(f'{source}, {ret}')
        return ret

    def __str_to_base_10_int_str(self, s:str) -> str:
        hash_value = 0
        for char in s:
            hash_value = (hash_value << 5) - hash_value + ord(char)
            hash_value = hash_value & 0xFFFFFFFF  # Convert to 32-bit integer
        return str(abs(hash_value))

    def __find(self, arr: [], key: str, value: str):
        for x in arr:
            if x[key] == value:
                return x

    def __find_all(self, arr: [], key: str, value: str):
        ret = []
        for x in arr:
            if x[key] == value:
                ret.append(x)
        return ret

    def __find_with_subkey(self, arr: [], key: str, subkey: str, value: str):
        for x in arr:
            if x[key][subkey] == value:
                return x

    def __get_table_dependencies(self, reverse, unique_id):
        if reverse:
            refs = self.dbt_manifest_child_map.get(unique_id, [])
        else:
            refs = self.dbt_manifest_parent_map.get(unique_id, [])
        return refs

    def __table_dependencies_recursive(self, unique_id, reverse, depth):
        self.logger.info(f'request_depth={self.request_depth}, depth={depth}')
        ref_dbt_node = self.dbt_manifest_nodes.get(unique_id)
        if ref_dbt_node is None:
            self.logger.error(f'unique_id={unique_id} is not found')
            return
        ref_unique_id = ref_dbt_node.get('unique_id')
        ref_name = ref_dbt_node.get('name')
        ref_schema = ref_dbt_node.get('schema')
        ref_materialized = ref_dbt_node.get('config', {}).get('materialized')
        deps_refs= self.__get_table_dependencies(reverse, ref_unique_id)
        node_id = self.__str_to_base_10_int_str(ref_name)

        if not self.__find(self.nodes, 'id', node_id):
            self.nodes.append({
                'id': node_id,
                'data': {
                    'name': ref_name,
                    'columns': [],
                    'schema': ref_schema,
                    'materialized': ref_materialized,
                    'first': False, 'last': False
                },
                'position': {'x': 0,'y': 0},
                # 'max_len': max_len,'depth': depth,
                'type': 'eventNode'
            })

        depth = depth + 1
        if self.request_depth != -1 and depth > self.request_depth:
            self.logger.info(f'depth={depth} reached')
            return

        for deps_unique_id in deps_refs:
            self.logger.info(deps_unique_id)
            deps_ref_dbt_node = self.dbt_manifest_nodes.get(deps_unique_id)
            if deps_ref_dbt_node is None:
                self.logger.error(f'unique_id={deps_unique_id} is not found')
                return
            target_name = deps_ref_dbt_node.get('name')
            target_node_id = self.__str_to_base_10_int_str(target_name)
            if reverse:
                edge_id = f'{target_node_id}-{node_id}'
                if not self.__find(self.edges, 'id', edge_id):
                    self.edges.append({
                        'id': edge_id,
                        'source': target_node_id,
                        'target': node_id,
                        'sourceHandle': f'{target_node_id}__source',
                        'targetHandle': f'{node_id}__target'
                    })
            else:
                edge_id = f'{node_id}-{target_node_id}'
                if not self.__find(self.edges, 'id', edge_id):
                    self.edges.append({
                        'id': edge_id,
                        'source': node_id,
                        'target': target_node_id,
                        'sourceHandle': f'{node_id}__source',
                        'targetHandle': f'{target_node_id}__target'
                    })
            self.__table_dependencies_recursive(deps_unique_id, reverse, depth)
        self.logger.info(f'end')
        return

    def __column_lineage_recursive(self, base_source: str, next_source: str, base_column: str, next_columns: [], depth: int) -> None:
        dbt_catalog = self.__get_dbt_catalog(next_source)
        dbt_node = self.__get_dbt_node(next_source)
        dbt_compiled_code = dbt_node.get('compiled_code')
        dbt_schema = dbt_node.get('schema')
        dbt_depends_on_nodes = dbt_node.get('depends_on', {}).get('nodes', [])
        dbt_columns = list(dbt_catalog.get('columns', dbt_node.get('columns', {})).keys())
        dbt_materialized = dbt_node.get('config', {}).get('materialized')

        # dbt の定義に該当するカラムだけに絞り込む
        filtered_columns = self.__get_columns(dbt_columns, next_columns)

        # ノード作成
        self.__add_node(next_source, dbt_schema, filtered_columns, dbt_materialized, depth)
        # エッジ作成
        self.__add_edge(base_column, filtered_columns, base_source, next_source)

        if dbt_compiled_code is None:
            self.logger.info('dbt_compiled_code is None')
            after_next_sources_columns_dict = {}
        else:
            # リネージの手がかりとして依存テーブルのカラムやテーブル情報を作成
            additional_dbt_sources = self.__get_depends_on_table_info(dbt_depends_on_nodes)

            after_next_sources_columns_dict = self.__get_sqlglot_lineage(next_source, dbt_compiled_code, filtered_columns, additional_dbt_sources)

        depth = depth + 1
        after_base_source = next_source
        next_found = False
        for after_base_column, after_next_sources_columns in after_next_sources_columns_dict.items():
            if self.request_depth != -1 and depth > self.request_depth:
                continue
            after_next_sources = after_next_sources_columns['labels']
            after_next_columns = after_next_sources_columns['columns']
            for after_next_source in after_next_sources:
                next_found = True
                after_next_source = after_next_source.lower()

                self.logger.debug(f'base_source={after_base_source}, next_source={after_next_source}, base_column={after_base_column}, next_columns={after_next_columns}, depth={depth}')
                self.__column_lineage_recursive(after_base_source, after_next_source, after_base_column, after_next_columns, depth)
        if not next_found:
            # 再起の最後だったらedgeの起点がない
            prev_node = self.__find_with_subkey(self.nodes, 'data', 'name', after_base_source)
            if prev_node and self.request_depth == -1:
                self.logger.debug(f'last node: {after_base_source}')
                prev_node['data']['last'] = True

    def __reverse_column_lineage(self, source: str, column: str):
        dbt_node = self.__get_dbt_node(source)
        unique_id = dbt_node.get('unique_id')
        refs = self.dbt_manifest_child_map.get(unique_id, [])

        data = {}
        for ref in refs:
            ref_dbt_node = self.dbt_manifest_nodes.get(ref)
            ref_node_name = ref_dbt_node.get('name')
            ref_schema = ref_dbt_node.get('schema')
            ref_compiled_code = ref_dbt_node.get('compiled_code')
            ref_dbt_depends_on_nodes = ref_dbt_node.get('depends_on', {}).get('nodes', [])
            ref_materialized = ref_dbt_node.get('config', {}).get('materialized')

            depends_on_table_info = self.__get_depends_on_table_info(ref_dbt_depends_on_nodes)
            found = False
            for info in depends_on_table_info:
                tbl : exp.Table = info['table']
                if tbl.name.lower() == source:
                    print(tbl.name)
                    found = True
            if not found:
                continue

            # catalog.json にカラム情報があればそれを使い、なければ manifest.json のカラム情報を使う
            ref_columns = ref_dbt_node.get('columns', self.__get_dbt_catalog(ref).get('columns', {}))
            for ref_column in ref_columns:
                self.logger.info(f'table={ref}, column={ref_column}')

                ref_column_name = ref_column.upper()
                items = self.__get_sqlglot_lineage(source, ref_compiled_code, [ref_column_name], depends_on_table_info)
                item_labels_columns = items.get(ref_column_name, {})
                if column in item_labels_columns.get('columns', []):
                    item_labels = item_labels_columns['labels']
                    item_columns = item_labels_columns['columns']
                    if source.upper() in item_labels and column in item_columns:
                        self.logger.info(f'source={source}, column={column} found')
                        r = data.get(ref_node_name, {'columns': [], 'schema': ref_schema, 'materialized': ref_materialized})
                        r['columns'].append(ref_column_name)
                        data[ref_node_name] = r

        ret_nodes = []
        ret_edges = []
        target_id = self.__str_to_base_10_int_str(source)
        for node_name, item in data.items():
            target_schema = item['schema']
            target_columns = item['columns']
            target_materialized = item['materialized']
            node_id = self.__str_to_base_10_int_str(node_name)
            base_edge_id = f'{node_id}-{target_id}'
            ret_nodes.append({
                'id': node_id,
                'data': {
                    'name': node_name,
                    'schema': target_schema,
                    'columns': target_columns,
                    'materialized': target_materialized,
                    'first': False,'last': False
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
                    'sourceHandle': f'{target_column}__source',
                    'targetHandle': f'{column}__target'
                })
        self.edges = ret_edges
        self.nodes = ret_nodes

    def __cte_dependency_impl(self, dbt_depends_on_nodes: [], compiled_code: str, source: str, columns: []) -> list:
        dependencies = {}
        lineage_tables = []
        lineage_meta = []

        if len(columns) > 0:
            depends_on_table_info = self.__get_depends_on_table_info(dbt_depends_on_nodes)
            items = self.__get_sqlglot_lineage(source, compiled_code, columns, depends_on_table_info, True)

            # 現状columns は1つのみ
            item = items.get(columns[0].upper(), {'labels': [], 'meta': {}})
            for label in item['labels']:
                lineage_tables.append(label.lower())
            lineage_meta = item['meta']

        try:
            parsed_sql = parse_one(compiled_code, dialect=self.dialect)
            ctes = parsed_sql.find_all(exp.CTE)
        except SqlglotError:
            self.logger.error(f'parse cte error. source={source}')
            ctes = []

        for cte in ctes:
            dependencies[cte.alias_or_name] = []
            # reference が一致するすべての meta 情報を取得
            meta = self.__find_all(lineage_meta, 'reference', cte.alias_or_name)

            # CTE の各要素を抽出
            elements = {
                'groups': [ele.sql() for ele in cte.find_all(exp.Group)],
                'havings': [ele.sql() for ele in cte.find_all(exp.Having)],
                'wheres': [ele.sql() for ele in cte.find_all(exp.Where)],
                'unions': [ele.sql() for ele in cte.find_all(exp.Union)],
                'joins': [ele.sql() for ele in cte.find_all(exp.Join)]
            }

            # ノードデータの作成
            node_data = {
                'id': cte.alias_or_name,
                'type': 'cte',
                'data': {
                    'label': cte.alias_or_name,
                    'nodeType': 'CTE',
                    'meta': meta,
                    **elements
                },
                'position': {'x': 0, 'y': 0},
            }

            self.nodes.append(node_data)

            query = cte.this.sql()
            try:
                parsed_cte_query = parse_one(query, dialect=self.dialect)
                tables = parsed_cte_query.find_all(exp.Table)
            except SqlglotError:
                self.logger.error(f'parse cte sql error. source={source}, query={query}')
                tables = []

            for table in tables:
                dependencies[cte.alias_or_name].append({'name': table.name})

        for node in dependencies:
            for dependency in dependencies[node]:
                dep = dependency['name']
                edge_id = f'{node}-{dep}'
                if not self.__find(self.edges, 'id', edge_id) and node and dep and node != dep:
                    self.edges.append({'id': edge_id, 'source': dep,'target': node, 'markerStart': {'type': 'arrowclosed', 'width': 16, 'height': 16}})

        return lineage_meta

