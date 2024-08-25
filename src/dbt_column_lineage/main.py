import base64
import hashlib
import os
from pathlib import Path
from urllib.parse import urlencode

import requests
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from requests.auth import HTTPBasicAuth
from starlette.middleware.sessions import SessionMiddleware

from dbt_column_lineage.constants import USE_OAUTH, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BASE_ROUTE
from dbt_column_lineage.lineage import DbtSqlglot
from dbt_column_lineage.looker import Looker
from dbt_column_lineage.utils import get_logger, get_redirect_url

import typer

cli = typer.Typer()

app = FastAPI()

# CORS設定
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

# セッション管理のミドルウェア追加
app.add_middleware(SessionMiddleware, secret_key=os.urandom(32).hex())

logger = get_logger(app, __name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='token')


# セッションからアクセストークンを取得する依存関数
async def get_current_user(request: Request):
    if USE_OAUTH:
        access_token = request.session.get('access_token')
        if not access_token:
            raise HTTPException(status_code=401, detail='Not authenticated')
        return access_token
    return None


@app.get('/healthcheck')
async def readiness_probe():
    return 'ok!'


@app.exception_handler(404)
async def not_found(request: Request, exc: HTTPException):
    return FileResponse(f'frontend_out/404.html')


@app.get('/')
@app.get('/cl')
@app.get('/cte')
@app.get('/login')
async def static_page(request: Request):
    request_path = request.url.path
    if USE_OAUTH:
        if request_path == '/login':
            request.session['csrf'] = os.urandom(32).hex()
        elif 'access_token' not in request.session:
            return RedirectResponse(url='/login')
        logger.debug(f'access_token: {request.session.get('access_token')}')

    if request_path == '/':
        static_path = 'index'
    else:
        static_path = request_path[1:]

    APP_ROOT = os.path.dirname(os.path.abspath(__file__))
    return FileResponse(f'{APP_ROOT}/frontend_out/{static_path}.html')


@app.get('/oauth')
async def oauth(request: Request):
    if 'csrf' not in request.session:
        return RedirectResponse(url='/login')

    authorization_endpoint = 'https://accounts.google.com/o/oauth2/v2/auth'
    scope = 'openid https://www.googleapis.com/auth/userinfo.email'

    code_verifier = os.urandom(43).hex()
    code_challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode('utf-8')).digest()).decode('utf-8').replace('=','')
    request.session['code_verifier'] = code_verifier

    params = {
        'response_type': 'code',
        'client_id': GOOGLE_CLIENT_ID,
        'state': request.session.get('csrf'),
        'scope': scope,
        'redirect_uri': get_redirect_url(request),
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256'
    }

    return RedirectResponse(url=f'{authorization_endpoint}?{urlencode(params)}')


@app.get('/callback')
async def callback(request: Request, state: str, code: str):
    if ('csrf' not in request.session) or (request.session['csrf'] != state):
        return RedirectResponse(url='/')
    if 'code_verifier' not in request.session:
        return RedirectResponse(url='/')

    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'redirect_uri': get_redirect_url(request),
        'grant_type': 'authorization_code',
        'code': code,
        'code_verifier': request.session['code_verifier']
    }

    headers = {'content-type': 'application/x-www-form-urlencoded'}
    response = requests.post(
        'https://oauth2.googleapis.com/token',
        params=params,
        headers=headers,
        auth=HTTPBasicAuth(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
    )

    data = response.json()
    logger.debug(data)
    access_token = data['access_token']
    request.session['access_token'] = access_token

    return RedirectResponse(url='/')


@app.get(f'{BASE_ROUTE}/schemas')
async def list_schemas(current_user: str = Depends(get_current_user)):
    logger.debug("list_schemas function called")
    dbt_sqlglot = DbtSqlglot(logger)
    schemas = dbt_sqlglot.list_schemas()
    return JSONResponse(content=schemas)


@app.get(f'{BASE_ROUTE}/sources')
async def list_sources(schema: str, current_user: str = Depends(get_current_user)):
    dbt_sqlglot = DbtSqlglot(logger)
    models = dbt_sqlglot.list_sources(schema)
    return JSONResponse(content=models)


@app.get(f'{BASE_ROUTE}/columns')
async def list_columns(schema: str, source: str, current_user: str = Depends(get_current_user)):
    dbt_sqlglot = DbtSqlglot(logger)
    columns = dbt_sqlglot.list_columns(schema, source)
    return JSONResponse(content=columns)


@app.get(f'{BASE_ROUTE}/lineage')
async def find_lineage(source: str, column: str, depth: int = -1, current_user: str = Depends(get_current_user)):
    dbt_sqlglot = DbtSqlglot(logger, depth)
    dbt_sqlglot.recursive('', source, '', [column.upper()], 0)
    res = dbt_sqlglot.nodes_edges()
    return JSONResponse(content=res)


@app.get(f'{BASE_ROUTE}/reverse_lineage')
async def find_reverse_lineage(source: str, column: str, current_user: str = Depends(get_current_user)):
    dbt_sqlglot = DbtSqlglot(logger)
    res = dbt_sqlglot.reverse_lineage(source, column.upper())
    return JSONResponse(content=res)


@app.get(f'{BASE_ROUTE}/cte')
async def find_cte(source: str, column: str = None, current_user: str = Depends(get_current_user)):
    columns = column.split(',') if column and column != 'null' else []
    logger.info(columns)
    dbt_sqlglot = DbtSqlglot(logger)
    res = dbt_sqlglot.cte_dependency(source, columns)
    if res is None:
        raise HTTPException(status_code=404, detail='Not found')
    return JSONResponse(content=res)


@app.get(f'{BASE_ROUTE}/folder_dashboards')
async def list_folder_dashboards(current_user: str = Depends(get_current_user)):
    looker = Looker(logger)
    folder_dashboards = looker.get_folder_dashboards()
    return JSONResponse(content=folder_dashboards)


@app.get(f'{BASE_ROUTE}/dashboard_elements/{{dashboard_id}}')
async def get_dashboard_elements(dashboard_id: str, current_user: str = Depends(get_current_user)):
    looker = Looker(logger)
    dashboard_elements = looker.get_dashboard_elements(dashboard_id)
    return JSONResponse(content=dashboard_elements)


@app.get(f'{BASE_ROUTE}/explore_fields/{{slug}}')
async def get_explore_fields(slug: str, current_user: str = Depends(get_current_user)):
    looker = Looker(logger)
    explore_fields = looker.get_explore_fields(slug)
    return JSONResponse(content=explore_fields)


# 静的ファイルの設定
static_files_path = Path(__file__).parent / 'frontend_out'
app.mount('/', StaticFiles(directory=str(static_files_path), html=True), name='static')


@cli.command()
def run(host: str = '127.0.0.1', port: int = 8000):
    import uvicorn
    uvicorn.run('dbt_column_lineage.main:app', host=host, port=port)


@cli.command()
def version():
    from dbt_column_lineage._version import __version__
    typer.echo(f'dbt-column-lineage version {__version__}')


def main():
    cli()


if __name__ == '__main__':
    main()
