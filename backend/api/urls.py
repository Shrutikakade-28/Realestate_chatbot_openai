from django.urls import path
from . import views

urlpatterns = [
    path('analyze/', views.analyze, name='analyze'),
    path('health/', views.health, name='health'),
]
