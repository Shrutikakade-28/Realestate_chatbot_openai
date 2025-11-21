# Backend (Django) - Mini Real Estate Analysis API

## Quick start
1. Create a virtualenv and activate.
2. Install: `pip install -r requirements.txt`
3. Run migrations: `python manage.py migrate`
4. Start server: `python manage.py runserver`

Endpoints:
- GET /api/analyze/?area=Wakad
- GET /api/analyze/?compare=Wakad,Akurdi
- POST /api/analyze/ with file upload (form field 'file')

Sample data included at `sample_data/real_estate_sample.xlsx`.
