from fastapi import APIRouter
from app.api.routes import po, dashboard

api_router = APIRouter()
api_router.include_router(po.router, prefix="/po", tags=["po"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
