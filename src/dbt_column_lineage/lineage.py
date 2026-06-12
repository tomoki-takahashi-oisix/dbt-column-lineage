import json
import time
import typing as t

from sqlglot import exp, parse_one, MappingSchema, Schema
from sqlglot.expressions import Expression
from sqlglot.errors import SqlglotError
from sqlglot.lineage import lineage
from sqlglot.optimizer import build_scope, Scope, qualify

from dbt_column_lineage.constants import SQLGLOT_DIALECT, USE_LOOKER, DBT_DOCS_BASE_URL, MAX_LINEAGE_SECONDS
from dbt_column_lineage.looker import Looker
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
        self.target_dashboard_ids = []
        self.request_depth = request_depth
        # 時間予算(MAX_LINEAGE_SECONDS)による打ち切りが起きたか。フロントの truncated バナーは
        # この“想定外の保護打ち切り”専用。要求 depth に達して止まるのは設計どおりなので含めない
        # (depth=1 のテーブル表示で毎回バナーが出てしまう問題を避ける)。
        self.budget_truncated = False
        # 時間予算の締切(MAX_LINEAGE_SECONDS>0 のときだけ。それ以外は None=無制限)。
        self._deadline = (time.monotonic() + MAX_LINEAGE_SECONDS) if MAX_LINEAGE_SECONDS and MAX_LINEAGE_SECONDS > 0 else None

        if self._initialized:
            return
        self._initialized = True

        # リバースカラムリネージの source 単位索引キャッシュ。
        # per-request リセット(上の nodes/edges クリア)の外、_initialized ガードの
        # 内側に置くことで、パースした dbt ファイル同様プロセス内で一度だけ保持される。
        self.__reverse_index_cache = {}

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

        self.looker = None
        if USE_LOOKER:
            self.looker = Looker(logger)
        self.logger = logger
        self.dialect = SQLGLOT_DIALECT

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

    def dashboard_lineage(self, dashboard_id: str):
        tables = set()
        self.target_dashboard_ids = [dashboard_id]
        for element in self.looker.get_dashboard_elements(dashboard_id):
            for tbl in element.get('tables', []):
                tables.add(tbl.upper())

        for table in tables:
            self.table_lineage(table.lower(), revs=False)


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
        return {'edges': self.edges, 'nodes': self.nodes, 'truncated': self.budget_truncated}

    def _budget_exceeded(self) -> bool:
        """時間予算(MAX_LINEAGE_SECONDS)を超えていれば打ち切りフラグを立てて True。
        コストが横幅(ハブ列の全下流など)の場合に、形状に依らず処理を止める保護。"""
        if self._deadline is not None and time.monotonic() > self._deadline:
            self.budget_truncated = True
            return True
        return False


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
            project_name = self.dbt_metadata['project_name']
            ds_columns = list(
                self.dbt_manifest_sources.get(f'source.{project_name}.{source_key}', {}).get('columns', {}).keys())
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

    def __dbt_docs_url(self, dbt_node: dict) -> t.Optional[str]:
        """dbt-docs SPA の該当ノードURLを返す。DBT_DOCS_BASE_URL 未設定、または
        dbt ノードが解決できない(exposure/source/未知名 → {})場合は None。
        unique_id は manifest が持つ正規値をそのまま使う(再構築しない)。
        例: {base}/#!/model/model.proj.my_model"""
        if not DBT_DOCS_BASE_URL or not dbt_node:
            return None
        unique_id = dbt_node.get('unique_id')
        resource_type = dbt_node.get('resource_type')
        if not unique_id or not resource_type:
            return None
        base = DBT_DOCS_BASE_URL.rstrip('/')
        return f'{base}/#!/{resource_type}/{unique_id}'

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
                'docsUrl': self.__dbt_docs_url(self.__get_dbt_node(next_source)),
            },
            'position': {'x': 0,'y': 0},
            # 'max_len': max_len, 'depth': depth,
            'type': 'tableNode'
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
        project_name = self.dbt_metadata['project_name']
        for resource_type in ['model', 'seed', 'snapshot']:
            key = f'{resource_type}.{project_name}.{dbt_target}'
            element = self.dbt_manifest_nodes.get(key, {})
            # self.logger.info(key, len(element))
            if len(element) > 0:
                break
        return element

    def __get_dbt_catalog(self, dbt_target: str) -> {}:
        project_name = self.dbt_metadata['project_name']
        for resource_type in ['model', 'seed', 'snapshot']:
            key = f'{resource_type}.{project_name}.{dbt_target}'
            element = self.dbt_catalog_nodes.get(key, {})
            if len(element) > 0:
                break
        return element

    def __cte_names(self, parsed_sql) -> set:
        """クエリ内で定義された CTE 名(小文字)の集合を返す。
        sqlglot は UNPIVOT 等で CTE をテーブル末端(phantom)として返すことがあり
        (sqlglot#7727)、これを実テーブルと区別して除外するために使う。"""
        try:
            return {cte.alias_or_name.lower() for cte in parsed_sql.find_all(exp.CTE)}
        except Exception:
            return set()

    def __real_dbt_object_names(self) -> set:
        """実在する dbt オブジェクト名(model/seed/snapshot/source)の小文字集合(遅延キャッシュ)。
        phantom 判定で「CTE 名と一致するが実在オブジェクトでもある」ケースを除外するために使う。
        dbt では `with dim_calendar as (select * from {{ ref('dim_calendar') }})` のように
        CTE 名を実テーブル名と同じにするパターンが多く、CTE 名一致だけで弾くと実テーブルまで落ちる。"""
        cache = getattr(self, '_real_object_names_cache', None)
        if cache is None:
            cache = set()
            for v in self.dbt_manifest_nodes.values():
                if v.get('resource_type') in ('model', 'seed', 'snapshot') and v.get('name'):
                    cache.add(v['name'].lower())
            for v in self.dbt_manifest_sources.values():
                if v.get('name'):
                    cache.add(v['name'].lower())
            self._real_object_names_cache = cache
        return cache

    def __is_phantom_cte_label(self, label: str, cte_names: set, source: str) -> bool:
        """label が「解析中クエリの CTE 名」かつ「実在 dbt オブジェクトでない」場合のみ phantom とみなす。
        UNPIVOT 等で sqlglot が CTE をテーブル末端として誤って返す(sqlglot#7727)ケースを除外する。
        実在モデル名と同名の CTE(ref ラップ)は実テーブルとして残す。
        #7727 は sqlglot 30.11.0 で修正済み(それ以降 phantom は発生せずこのフィルタは素通り)だが、
        パッケージは sqlglot>=30,<31 を許容するため、下限を 30.11 以上に上げるまでは残す。"""
        if not (cte_names and label.lower() in cte_names):
            return False
        if label.lower() in self.__real_dbt_object_names():
            return False
        self.logger.info(
            f'skip phantom CTE node (sqlglot UNPIVOT limitation, see sqlglot#7727): '
            f'label={label}, source={source}'
        )
        return True

    def __extract_lineage_node(self, lin, source: str, need_meta=False, cte_names: set = None) -> dict:
        """1カラム分の sqlglot lineage Node を走査して {labels, columns(, meta)} を作る。
        per-column 経路(__get_sqlglot_lineage)とバッチ経路(__build_reverse_index の
        lineage(None))の双方から呼ぶ共有ヘルパー。両経路で抽出ロジックを一致させるため、
        ここを単一の実装に集約している。
        cte_names: 解析中クエリの CTE 名集合。Table 末端がこれに含まれる場合は
        phantom(UNPIVOT 等で漏れた CTE)として除外する。"""
        labels = set()
        replace_columns = set()
        meta = []
        for node in lin.walk():
            if isinstance(node.expression, exp.Table):
                label = f'{node.expression.this}'
                # 配下のデータがなければ最後とみなす
                self.logger.debug(f'label: {label}')
                if len(node.downstream) == 0 and not self.__is_phantom_cte_label(label, cte_names, source):
                    labels.add(label)
            if node.name != '*' and not isinstance(node.expression, exp.Table):
                cte = node.expression.sql(dialect=self.dialect)
                self.logger.debug(cte)
                try:
                    cte_parsed = parse_one(cte, dialect=self.dialect)
                    cl = cte_parsed.find_all(exp.Column)
                except SqlglotError:
                    self.logger.error(f'cte parse error. source={source}, cte={cte}')
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
                if len(node_downstream_alias_names) > 0 and column_name == node_downstream_alias_names[0]:
                    node_downstream_alias_names = []
                mt = {
                    'column': node.expression.alias_or_name.lower(),
                    'nextColumns': node_downstream_alias_names,
                    'nextSources': node_downstream_table_sources,
                    'reference': node.reference_node_name.lower()
                }
                meta.append(mt)

        item = {'labels': list(labels), 'columns': list(replace_columns)}
        if need_meta:
            item['meta'] = meta
        return item

    def __get_sqlglot_lineage(self, source: str, parsed_sql: Expression, columns: [], sqlglot_db_schema: t.Dict | Schema, need_meta=False, sql_scope:t.Optional[Scope]=None) -> dict:
        # 注意: 走査ロジックは __extract_lineage_node とほぼ同じだが、ここでは意図的に
        # インライン実装を保持している。下の `parsed_sql = parse_one(cte, ...)` の再代入は
        # ループ内で parsed_sql 引数を上書きし、scope を渡さない forward リネージの
        # 複数カラム処理の挙動に影響する(=load-bearing)。共有ヘルパーに置換すると
        # forward の結果が変わるため、forward/CTE 経路はこの実装のまま維持する。
        # バッチ(reverse)経路は scope を渡すため上書きは無効で、__extract_lineage_node と
        # 結果が一致する(equality battery で担保)。
        # 注意: 下のループ内で parsed_sql が再代入されるため、CTE 名はここ(原本)で先に取得しておく。
        cte_names = self.__cte_names(parsed_sql)
        ret = {}
        for column in columns:
            column = column.upper()
            labels = set()
            replace_columns = set()
            try:
                start_time = time.time()
                lin = lineage(column, parsed_sql, dialect=self.dialect, schema=sqlglot_db_schema, scope=sql_scope)
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
                    if len(node.downstream) == 0 and not self.__is_phantom_cte_label(label, cte_names, source):
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
                    if len(node_downstream_alias_names) > 0 and column_name == node_downstream_alias_names[0]:
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

    def __get_sqlglot_db_schema(self, depends_on_table_info):
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
        return sqlglot_db_schema

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
        if self._budget_exceeded():
            return
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
                    'first': False, 'last': False,
                    'docsUrl': self.__dbt_docs_url(ref_dbt_node),
                },
                'position': {'x': 0,'y': 0},
                'type': 'tableNode'
            })

        # ダッシュボード依存関係の追加処理
        if self.looker and depth == 0:
            self.__add_dashboard_dependencies(ref_name)

        depth = depth + 1
        if self.request_depth != -1 and depth > self.request_depth:
            self.logger.info(f'depth={depth} reached')
            # 要求 depth に達して止まるのは設計どおり。バナー(budget_truncated)は立てない。
            return

        for deps_unique_id in deps_refs:
            self.logger.info(deps_unique_id)
            deps_ref_dbt_node = self.dbt_manifest_nodes.get(deps_unique_id)
            if deps_ref_dbt_node is None:
                # exposure / source / semantic_model などは manifest['nodes'] に
                # 含まれないため、ループ全体を中断せずスキップする
                self.logger.error(f'unique_id={deps_unique_id} is not found')
                continue
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
        if self._budget_exceeded():
            return
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

        # ダッシュボード依存関係の追加処理を挿入
        if self.looker and depth == 0:
            for filtered_column in filtered_columns:
                self.__add_dashboard_dependencies(next_source, filtered_column)

        if dbt_compiled_code is None:
            self.logger.info('dbt_compiled_code is None')
            after_next_sources_columns_dict = {}
        else:
            try:
                parsed_sql = parse_one(dbt_compiled_code, dialect=self.dialect)
            except SqlglotError:
                self.logger.error(f'parse sql. source={next_source}')
                parsed_sql = None

            if parsed_sql:
                # リネージの手がかりとして依存テーブルのカラムやテーブル情報を作成
                additional_dbt_sources = self.__get_depends_on_table_info(dbt_depends_on_nodes)
                sqlglot_db_schema = self.__get_sqlglot_db_schema(additional_dbt_sources)
                after_next_sources_columns_dict = self.__get_sqlglot_lineage(next_source, parsed_sql, filtered_columns, sqlglot_db_schema)
            else:
                after_next_sources_columns_dict = {}

        depth = depth + 1
        after_base_source = next_source
        next_found = False
        for after_base_column, after_next_sources_columns in after_next_sources_columns_dict.items():
            if self.request_depth != -1 and depth > self.request_depth:
                # 要求 depth に達して止まるのは設計どおり。バナー(budget_truncated)は立てない。
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

    def __build_reverse_index(self, source: str) -> list:
        """source を直接の親に持つ全子モデルについて、各出力カラムの sqlglot リネージを
        一度だけ計算し、source 由来のエッジ候補を索引化する(重い処理。per-source でキャッシュ)。

        返り値: [{'child','schema','materialized','ref_column','columns'} ...]
        source.upper() がリネージの labels に含まれるエントリのみ格納する。
        これは __reverse_column_lineage の従来計算の出力をそのまま記録しているだけなので、
        ある column のクエリ結果(従来: source in labels かつ column in columns)は
        この索引を column で絞り込んだものと完全に一致する。"""
        dbt_node = self.__get_dbt_node(source)
        unique_id = dbt_node.get('unique_id')
        refs = self.dbt_manifest_child_map.get(unique_id, [])

        entries = []
        complete = True
        for ref in refs:
            # 子モデルごとに parse_one+lineage() を回す重いループ。時間予算を超えたら
            # ここで打ち切る(コストは反復そのものなので entries 数では縛れない)。
            # 部分的な索引はキャッシュ汚染を招くため complete=False で返し、呼び出し側で
            # キャッシュしない。
            if self._budget_exceeded():
                complete = False
                break
            ref_dbt_node = self.dbt_manifest_nodes.get(ref)
            if ref_dbt_node is None:
                self.logger.info('ref_dbt_node is None')
                continue
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
                    found = True
            if not found:
                continue

            sqlglot_db_schema = self.__get_sqlglot_db_schema(depends_on_table_info)
            try:
                parsed_sql = parse_one(ref_compiled_code, dialect=self.dialect)
                sql_scope = self.__build_scope(parsed_sql, sqlglot_db_schema)
            except SqlglotError:
                self.logger.error(f'parse sql. source={source}')
                continue
            # 子モデルのクエリ内 CTE 名(phantom 除外用)
            ref_cte_names = self.__cte_names(parsed_sql)

            # catalog.json にカラム情報があればそれを使い、なければ manifest.json のカラム情報を使う
            ref_columns = ref_dbt_node.get('columns', self.__get_dbt_catalog(ref).get('columns', {}))

            # バッチ: この子モデルの全出力カラムのリネージを 1 回で取得する。
            # sqlglot 30 の lineage(column=None) は内部の共有キャッシュでカラム横断の
            # 重複walk(共通CTEの再走査)を省くため、出力カラムごとに lineage() を呼ぶ
            # 従来方式より速い。万一バッチが失敗したら従来の per-column に切り替え、
            # 結果の同一性を保つ。
            batch_nodes = None
            try:
                batch_dict = lineage(None, parsed_sql, dialect=self.dialect, schema=sqlglot_db_schema, scope=sql_scope)
                batch_nodes = {k.upper(): v for k, v in batch_dict.items()}
            except SqlglotError:
                self.logger.error(f'batch lineage error. source={source}, ref={ref}')
                batch_nodes = None

            # バッチで全カラムを計算済みなので、従来の __find_column_references プレフィルタ
            # (lineage 呼び出しを間引く役目)は不要。`source in labels` での絞り込みだけで
            # 従来と同一結果になることを検証済み(equality battery)。
            for ref_column in ref_columns:
                self.logger.info(f'table={ref}, column={ref_column}')
                ref_column_name = ref_column.upper()
                if batch_nodes is not None:
                    node = batch_nodes.get(ref_column_name)
                    item_labels_columns = self.__extract_lineage_node(node, source, cte_names=ref_cte_names) if node is not None else {}
                else:
                    items = self.__get_sqlglot_lineage(source, parsed_sql, [ref_column_name], sqlglot_db_schema, sql_scope=sql_scope)
                    item_labels_columns = items.get(ref_column_name, {})
                item_labels = item_labels_columns.get('labels', [])
                item_columns = item_labels_columns.get('columns', [])
                if source.upper() in item_labels:
                    entries.append({
                        'child': ref_node_name,
                        'schema': ref_schema,
                        'materialized': ref_materialized,
                        'ref_column': ref_column_name,
                        'columns': item_columns,
                    })
        return entries, complete

    def __reverse_column_lineage(self, source: str, column: str):
        # source 単位で索引を構築・キャッシュする。キャッシュは per-request リセット
        # (__init__ の nodes/edges クリア)の外で保持されるため、同一プロセス内の
        # 2回目以降のクエリ(同 source の任意 column)は再計算なしの即時参照になる。
        # 注: 索引は列非依存(source の全子カラムを索引化)なので、時間予算で途中打ち切り
        # した不完全な索引をキャッシュすると、別カラムの照会に流用されて黙って不完全に
        # なる。よって complete な索引のみキャッシュする(打ち切り時は今回分だけ使う)。
        entries = self.__reverse_index_cache.get(source)
        if entries is None:
            entries, complete = self.__build_reverse_index(source)
            if complete:
                self.__reverse_index_cache[source] = entries

        dbt_node = self.__get_dbt_node(source)
        source_schema = dbt_node.get('schema')
        source_materialized = dbt_node.get('config', {}).get('materialized')
        target_id = self.__str_to_base_10_int_str(source)

        # 起点ノード(問い合わせ対象)を追加する。
        # エッジの targetHandle が `{column}__target` を参照するため、
        # 起点ノードには問い合わせカラムを必ず持たせる(無いとエッジが宙に浮く)。
        # __add_node は id 重複時にカラムをマージするため、複数カラム/複数回の
        # 呼び出しでも上書きされず累積する(self.nodes/self.edges を直接代入しない)。
        self.__add_node(source, source_schema, [column], source_materialized, 0)

        for entry in entries:
            if column not in entry['columns']:
                continue
            node_name = entry['child']
            ref_column_name = entry['ref_column']
            node_id = self.__str_to_base_10_int_str(node_name)
            # 後段ノードを追加(既存ならカラムをマージ)
            self.__add_node(node_name, entry['schema'], [ref_column_name], entry['materialized'], 0)
            edge_id = f'{node_id}-{target_id}-{ref_column_name}-{column}'
            if self.__find(self.edges, 'id', edge_id):
                continue
            self.edges.append({
                'id': edge_id,
                'source': node_id,
                'target': target_id,
                'sourceHandle': f'{ref_column_name}__source',
                'targetHandle': f'{column}__target'
            })

    def __cte_dependency_impl(self, dbt_depends_on_nodes: [], compiled_code: str, source: str, columns: []) -> list:
        dependencies = {}
        lineage_tables = []
        lineage_meta = []
        parsed_sql = None

        try:
            parsed_sql = parse_one(compiled_code, dialect=self.dialect)
        except SqlglotError:
            self.logger.error(f'parse sql. source={source}')

        if parsed_sql and len(columns) > 0:
            depends_on_table_info = self.__get_depends_on_table_info(dbt_depends_on_nodes)
            sqlglot_db_schema = self.__get_sqlglot_db_schema(depends_on_table_info)
            items = self.__get_sqlglot_lineage(source, parsed_sql, columns, sqlglot_db_schema, need_meta=True)

            # 現状columns は1つのみ
            item = items.get(columns[0].upper(), {'labels': [], 'meta': {}})
            for label in item['labels']:
                lineage_tables.append(label.lower())
            lineage_meta = item['meta']

        parsed_sql = parse_one(compiled_code, dialect=self.dialect)
        ctes = parsed_sql.find_all(exp.CTE)
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

    def __build_scope(self, expression: Expression, schema: Schema) -> Scope:
        expression = qualify.qualify(
            expression,
            dialect=self.dialect,
            schema=schema,
            **{"validate_qualify_columns": False, "identify": False},  # type: ignore
        )

        sql_scope = build_scope(expression)
        return sql_scope

    def __add_dashboard_dependencies(self, next_source, next_column=None):
        dashboard_deps = self.looker.get_dashboard_dependencies(
            next_source,
            self.target_dashboard_ids,
            next_column
        )

        for dash_id, dash_elements_deps in dashboard_deps.items():
            dashboard = self.looker.get_dashboard(dash_id)
            node_id = self.__str_to_base_10_int_str(f"dashboard_{dash_id}")

            if not self.__find(self.nodes, 'id', node_id):
                self.nodes.append({
                    'id': node_id,
                    'data': {
                        'id': dash_id,
                        'name': dashboard['title'],
                        'url': dashboard['url'],
                        'elements': dash_elements_deps,
                    },
                    'position': {'x': 0, 'y': 0},
                    'type': 'dashboardNode',
                })
            else:
                # すでにノードがあれば elements を更新
                node = self.__find(self.nodes, 'id', node_id)
                for dash_element in dash_elements_deps:
                    dash_element_id = dash_element['id']
                    if not self.__find(node['data']['elements'], 'id', dash_element_id):
                        node['data']['elements'].append(dash_element)

            target_id = self.__str_to_base_10_int_str(next_source)

            for dash_element in dash_elements_deps:
                dash_element_id = dash_element['id']
                edge_id = f"{node_id}-{target_id}-{dash_element_id}"
                target_handle = f"{target_id}__target"
                if next_column:
                    edge_id = f"{node_id}-{target_id}-{dash_element_id}-{next_column}"
                    target_handle = f"{next_column}__target"

                if not self.__find(self.edges, 'id', edge_id):
                    self.edges.append({
                        'id': edge_id,
                        'mode': 'dashboard',
                        'source': node_id,
                        'target': target_id,
                        'sourceHandle': f"{dash_element_id}__source",
                        'targetHandle': target_handle,
                        'fixed': True,
                        'style': {
                            'strokeDasharray': '5,5',
                            'strokeWidth': 1.5,
                        }
                    })