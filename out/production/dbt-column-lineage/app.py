import base64
import datetime
import hashlib
import os
from urllib.parse import urlencode

import flask
import requests
from flask import Flask, jsonify, request, redirect, session
from flask_cors import CORS
from requests.auth import HTTPBasicAuth

from constants import *
from lineage import DbtSqlglot
from utils import get_logger, get_redirect_url


app = Flask(__name__, static_url_path='/', static_folder=f'{APP_ROOT}/../frontend/out')
CORS(app)
app.secret_key = os.urandom(32).hex()
logger = get_logger(app, __name__)


@app.get('/healthcheck')
def readiness_probe():
    return 'ok!'


@app.errorhandler(404)
def not_found(err):
    return app.send_static_file('404.html')


@app.route('/')
@app.route('/cl')
@app.route('/cte')
@app.route('/login')
def static_page():
    request_path = request.path
    # oauthログイン有効の場合
    if USE_OAUTH:
        if request_path == '/login':
            # CSRF対策用にトークンセット
            session['csrf'] = os.urandom(32).hex()
        elif session.get('access_token') is None:
            # ログインしていない場合はログインページにリダイレクト
            return redirect('/login')
        logger.debug('access_token:{}'.format(session.get('access_token')))

    if request_path == '/':
        static_path = 'index'
    else:
        # パスの先頭のスラッシュを削除
        static_path = request_path[1:]

    return app.send_static_file(f'{static_path}.html')


@app.route('/oauth')
def oauth():
    if session.get('csrf') is None:
        return redirect('/login')
    # Googleの認可サーバーのURL
    authorization_endpoint = 'https://accounts.google.com/o/oauth2/v2/auth'
    # 利用したいリソースの権限をスペース区切りで設定する
    scope = 'openid https://www.googleapis.com/auth/userinfo.email'
    # code_vefierとcode_challengeを設定。S256の仕様に従う
    code_verifier = os.urandom(43).hex()
    code_challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode('utf-8')).digest()).decode('utf-8').replace('=','')
    session['code_verifier'] = code_verifier
    params: dict = {
        'response_type': 'code',
        'client_id': GOOGLE_CLIENT_ID,
        'state': session.get('csrf'),
        'scope': scope,
        'redirect_uri': get_redirect_url(),
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256'
    }
    res = requests.get(authorization_endpoint, params=params)
    logger.debug(res.status_code)
    return redirect(authorization_endpoint + '?' + urlencode(params))


@app.route('/callback')
def callback():
    # 'state'と'code'がクエリパラメータとしてリダイレクトされてくる
    state = flask.request.args.get('state')
    code = flask.request.args.get('code')
    
    if (session.get('csrf') is None) or (session['csrf'] != state):
        return redirect('/')
    if session.get('code_verifier') is None:
        return redirect('/')
    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'redirect_uri': get_redirect_url(),
        'grant_type': 'authorization_code',
        'code': code,
        'code_verifier': session['code_verifier']
    }
    headers = {'content-type': 'application/x-www-form-urlencoded'}
    response = requests.post(
        'https://oauth2.googleapis.com/token',
        params=params,
        headers=headers,
        auth=HTTPBasicAuth(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET))
    data = response.json()
    logger.debug(data)
    access_token = data['access_token']
    session['access_token'] = access_token
    return redirect('/')


@app.route(f'{BASE_ROUTE}/schemas', methods=['GET'])
def list_schemas():
    if USE_OAUTH and session.get('access_token') is None:
        return jsonify({'error': 'not authorized'}), 401

    dbt_sqlglot = DbtSqlglot(logger)
    schemas = dbt_sqlglot.list_schemas()
    return jsonify(schemas), 200


@app.route(f'{BASE_ROUTE}/sources', methods=['GET'])
def list_sources():
    if USE_OAUTH and session.get('access_token') is None:
        return jsonify({'error': 'not authorized'}), 401

    req_schema = request.args['schema']
    dbt_sqlglot = DbtSqlglot(logger)
    models = dbt_sqlglot.list_sources(req_schema)
    return jsonify(models), 200


@app.route(f'{BASE_ROUTE}/columns', methods=['GET'])
def list_columns():
    if USE_OAUTH and session.get('access_token') is None:
        return jsonify({'error': 'not authorized'}), 401

    req_schema = request.args['schema']
    req_source = request.args['source']
    dbt_sqlglot = DbtSqlglot(logger)
    columns = dbt_sqlglot.list_columns(req_schema, req_source)
    return jsonify(columns), 200


@app.route(f'{BASE_ROUTE}/lineage', methods=['GET'])
def find_lineage():
    if USE_OAUTH and session.get('access_token') is None:
        return jsonify({'error': 'not authorized'}), 401

    source = request.args['source']
    column = request.args['column'].upper()
    request_depth = request.args.get('depth', default=-1, type=int)

    dbt_sqlglot = DbtSqlglot(logger, request_depth)
    dbt_sqlglot.recursive('', source, '', [column], 0)
    res = dbt_sqlglot.nodes_edges()
    return jsonify(res), 200


@app.route(f'{BASE_ROUTE}/cte', methods=['GET'])
def find_cte():
    if USE_OAUTH and session.get('access_token') is None:
        return jsonify({'error': 'not authorized'}), 401

    source = request.args['source']
    if 'column' in request.args and request.args.get('column') != 'null':
        columns = request.args['column'].split(',')
    else:
        columns = []
    logger.info(columns)
    dbt_sqlglot = DbtSqlglot(logger)
    res = dbt_sqlglot.cte_dependency(source, columns)
    if res is None:
        return jsonify({'error': 'not found'}), 404
    return jsonify(res), 200


if __name__ == '__main__':
    app.run(debug=True, host='localhost', port=5000)
