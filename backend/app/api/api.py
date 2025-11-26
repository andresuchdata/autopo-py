from fastapi import APIRouter
from app.api.routes import po

api_router = APIRouter()
api_router.include_router(po.router, prefix="/po", tags=["po"])
