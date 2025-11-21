from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = 'dev-key'
DEBUG = True
ALLOWED_HOSTS = ['*']
INSTALLED_APPS = [
    'django.contrib.staticfiles',
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'api',
    'corsheaders',
]
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
]
ROOT_URLCONF = 'backend.urls'
TEMPLATES = []
WSGI_APPLICATION = 'backend.wsgi.application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3','NAME': BASE_DIR / 'db.sqlite3'}}
STATIC_URL = '/static/'
# Allow CORS for development
CORS_ALLOW_ALL_ORIGINS = True

from dotenv import load_dotenv
import os
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
