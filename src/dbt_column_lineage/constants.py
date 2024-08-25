import os

BASE_ROUTE = '/api/v1'
DEBUG_MODE = os.getenv('DEBUG_MODE', 'false').lower() == 'true'
USE_OAUTH = os.getenv('USE_OAUTH', 'false').lower() == 'true'
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')

