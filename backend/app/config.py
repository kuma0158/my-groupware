from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./app.db"
    secret_key: str = "change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    cookie_name: str = "access_token"
    cookie_secure: bool = False
    frontend_origin: str = "http://localhost:3000"
    # false にすると、最初の 1 人(パワーユーザー)以外の新規登録を受け付けない(社内専用の公開向け)
    allow_registration: bool = True


settings = Settings()
