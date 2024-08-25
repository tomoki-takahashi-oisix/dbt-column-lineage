# dbt-column-lineage
This is a tool to visualize the colulmn level lineage of dbt models. It uses the `manifest.json` and `catalog.json` files generated by dbt to create a graph of the lineage of the models. It is a web application that uses a Flask backend and a Next.js frontend.

# quickstart

To run the application, first clone the repository:
```
git clone git@github.com:Oisix/dbt-column-lineage.git
cd dbt-column-lineage
```

Then copy the `manifest.json` and `catalog.json` files to the `data` directory:
```
export DBT_PROJECT_PATH=(your dbt project path)
cp dbt_project.yml .
cp $DBT_PROJECT_PATH/target/manifest.json target/manifest.json
cp $DBT_PROJECT_PATH/target/catalog.json target/catalog.json
```

Then build and run the docker container:
```
docker build -t dbt_column_lineage .
docker run -p 8000:8000 dbt_column_lineage
```
after the container is running,
Let's access http://localhost:8000

# development

To develop the application, you will need to run the backend and frontend separately.

## for backend

activate venv and run the following commands:
```
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

python -m src.dbt_column_lineage.main run
```

## for frontend

run the following commands:
```
npm install
npm run dev
```
after the frontend is running,
Let's access http://localhost:3000

## for Google OAuth login test (optional)

If you want to test the OAuth login, you can use the following commands:
```
export GOOGLE_CLIENT_ID=(your client id)
export GOOGLE_CLIENT_SECRET=(your client secret)
docker build -t test .
docker run -p 8000:8000 -e USE_OAUTH=true -e GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID -e GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET -e DEBUG_MODE=true test
```
