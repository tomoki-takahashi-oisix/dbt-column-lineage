FROM node:24 AS node-builder
WORKDIR /frontend

ARG NEXT_PUBLIC_USE_LOOKER
ENV NEXT_PUBLIC_USE_LOOKER=$NEXT_PUBLIC_USE_LOOKER
COPY frontend/package-lock.json frontend/package.json ./
RUN npm ci
COPY frontend .
ENV NODE_ENV=production
RUN npm run build

FROM python:3.12 AS python-builder
WORKDIR /app

# 依存は pyproject.toml の [project.dependencies] が単一の情報源。
# パッケージ本体は site-packages でなく /app/src から動かすため、依存だけを抽出して入れる
# (この層は pyproject.toml が変わらない限りキャッシュされる)。
# looker-sdk は tools/looker_analyzer.py(イメージ外で実行)専用なので入れない。
COPY ./pyproject.toml .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir $(python -c "import tomllib; print(' '.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))")

FROM python:3.12-slim-bookworm

WORKDIR /app
COPY --from=python-builder /usr/local/lib/python3.12/site-packages/ /usr/local/lib/python3.12/site-packages/
COPY --from=python-builder /usr/local/bin/uvicorn /usr/local/bin/
COPY target/*.json target/
COPY dbt_project.yml .

WORKDIR /app/src
COPY src .
COPY --from=node-builder /frontend/out dbt_column_lineage/frontend_out

WORKDIR /app
CMD ["uvicorn", "--app-dir", "src", "dbt_column_lineage.main:app", "--host", "0.0.0.0", "--port", "5000", "--timeout-keep-alive", "600", "--workers", "2"]