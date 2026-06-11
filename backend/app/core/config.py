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

    # S3-compatible object storage (Cloudflare R2, AWS S3, MinIO, ...). Only consulted
    # when storage_backend == "s3" — the factory fails fast at first use if the backend
    # is selected but bucket/credentials are missing, so the None defaults here never
    # silently degrade a configured deployment.
    storage_s3_bucket: str | None = None
    storage_s3_endpoint: str | None = None  # R2: https://<account-id>.r2.cloudflarestorage.com
    storage_s3_region: str = "auto"  # R2 uses the literal region "auto"
    storage_s3_access_key: str | None = None
    storage_s3_secret_key: str | None = None
    # Public base URL mapped to the bucket (CDN / R2 custom domain). When set, public
    # files redirect here; when unset, every redirect falls back to a signed URL.
    storage_cdn_base_url: str | None = None
    # Lifetime (seconds) of signed URLs minted for private objects.
    storage_signed_url_ttl: int = 600

    # CORS allowed origins (JSON array in env, e.g. ["http://localhost:5173"])
    cors_origins: list[str]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
