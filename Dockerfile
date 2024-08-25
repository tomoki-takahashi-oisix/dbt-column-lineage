FROM node:21 as node-builder
WORKDIR /frontend

ENV NODE_ENV production
COPY frontend/package-lock.json frontend/package.json ./
RUN npm ci
COPY frontend .
RUN npm run build

FROM python:3.12 as python-builder
WORKDIR /app

COPY ./requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

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
CMD ["uvicorn", "--app-dir", "src", "dbt_column_lineage.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "600"]