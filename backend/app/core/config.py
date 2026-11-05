from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: str = 'sqlite:///./opspilot.db'
    opspilot_api_key: str = ''
    openai_api_key: str = ''
    openai_model: str = 'gpt-4o-mini'
    openai_base_url: str = 'https://api.openai.com/v1'
    cors_origins: str = 'http://localhost:5173,http://localhost:8080'
    demo_auto_seed: bool = True
    static_dir: str = ''
    showcase_mode: bool = False


@lru_cache
def settings():
    return Settings()
