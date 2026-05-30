from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration is supplied via the environment (prefixed CMGR_) or a local
    `.env` file — there are no in-code defaults, so a missing value fails fast at startup
    rather than silently falling back to insecure dev values. See `.env.example`."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="CMGR_", extra="ignore")

    # Database (SQLAlchemy URL), e.g. postgresql+psycopg://user:pass@host:5432/dbname
    database_url: str

    # Admin login (single owner).
    admin_username: str
    admin_password: str

    # Session/JWT signing secret + token lifetime (minutes).
    secret_key: str
    access_token_expire_minutes: int

    # Storage
    storage_backend: str
    storage_local_root: str

    # CORS allowed origins (JSON array in env, e.g. ["http://localhost:5173"])
    cors_origins: list[str]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
