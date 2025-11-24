from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class StorageSettings(BaseModel):
    base_upload_dir: Path = Field(default=Path("data/uploads"))
    complete_dir: Path = Field(default=Path("output/complete"))
    m2_dir: Path = Field(default=Path("output/m2"))
    emergency_dir: Path = Field(default=Path("output/emergency"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="AutoPO Platform")
    api_prefix: str = Field(default="/api")
    database_url: str = Field(default="sqlite:///backend/app.db")
    storage: StorageSettings = Field(default_factory=StorageSettings)
    google_service_account_file: Optional[str] = Field(default=None)
    google_drive_folder_id: Optional[str] = Field(default=None)
    frontend_base_url: str = Field(default="http://localhost:3000")

    def ensure_directories(self) -> None:
        self.storage.base_upload_dir.mkdir(parents=True, exist_ok=True)
        self.storage.complete_dir.mkdir(parents=True, exist_ok=True)
        self.storage.m2_dir.mkdir(parents=True, exist_ok=True)
        self.storage.emergency_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
