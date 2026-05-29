from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CMGR_", extra="ignore")

    # Dev default targets the docker-compose.dev.yml Postgres (host port 55432 to avoid
    # clashing with a system Postgres on 5432). Prod overrides via CMGR_DATABASE_URL.
    database_url: str = "postgresql+psycopg://cmgr:cmgr@localhost:55432/commission_manager"

    # Admin login (single owner). Override in production.
    admin_username: str = "admin"
    admin_password: str = "changeme"

    # Session/JWT signing secret. Override in production.
    secret_key: str = "dev-insecure-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7

    # Storage
    storage_backend: str = "local"
    storage_local_root: str = "./data/storage"

    # CORS (frontend dev server)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
