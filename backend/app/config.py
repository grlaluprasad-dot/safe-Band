from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    secret_key: str = "insecure-dev-key-change-me"
    access_token_expire_minutes: int = 60
    algorithm: str = "HS256"

    database_url: str = "sqlite:///./safeband_dev.db"

    frontend_base_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "alerts@safeband.app"
    email_enabled: bool = False

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_phone: str = ""
    fast2sms_api_key: str = ""

    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = False

    # HTTP Transactional Email (Resend API)
    resend_api_key: str = ""
    resend_from_email: str = "alerts@safeband.app"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        origins = set()
        for item in self.cors_origins.split(","):
            raw = item.strip()
            if raw:
                origins.add(raw.rstrip("/"))
                origins.add(raw)
        if self.frontend_base_url:
            base = self.frontend_base_url.strip()
            origins.add(base.rstrip("/"))
            origins.add(base)
        return list(origins)


settings = Settings()
