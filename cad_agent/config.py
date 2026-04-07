"""Configuration management for CAD Agent System."""
from pathlib import Path
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CAD_AGENT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openSCAD_path: Path = Field(
        default=Path("/usr/local/bin/openscad"),
        description="Path to OpenSCAD executable",
    )

    storage_dir: Path = Field(
        default=Path("./storage"),
        description="Base directory for SQLite storage",
    )

    jobs_dir: Path = Field(
        default=Path("./storage/jobs"),
        description="Directory for job SQLite files",
    )

    cases_dir: Path = Field(
        default=Path("./storage/cases"),
        description="Directory for case memory SQLite files",
    )

    templates_dir: Path = Field(
        default=Path("./app/templates"),
        description="Directory containing SCAD Jinja2 templates",
    )

    output_dir: Path = Field(
        default=Path("./output"),
        description="Directory for generated STL/PNG artifacts",
    )

    max_retries: int = Field(
        default=3,
        ge=0,
        le=10,
        description="Maximum retry attempts for failed operations",
    )

    llm_provider: Literal["openai", "anthropic", "azure"] = Field(
        default="openai",
        description="LLM provider to use",
    )

    llm_model: str = Field(
        default="gpt-4o-mini",
        description="LLM model name",
    )

    anthropic_api_key: str | None = Field(
        default=None,
        description="Anthropic API key",
    )

    openai_api_key: str | None = Field(
        default=None,
        description="OpenAI API key",
    )

    azure_openai_endpoint: str | None = Field(
        default=None,
        description="Azure OpenAI endpoint",
    )

    azure_openai_key: str | None = Field(
        default=None,
        description="Azure OpenAI API key",
    )

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO",
        description="Logging level",
    )

    case_memory_enabled: bool = Field(
        default=True,
        description="Enable case memory for pattern recall",
    )

    max_case_memory_results: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum case memory results to retrieve",
    )

    render_timeout: int = Field(
        default=60,
        ge=5,
        description="Timeout for OpenSCAD rendering in seconds",
    )

    def ensure_directories(self) -> None:
        """Ensure all required directories exist."""
        for dir_path in [self.storage_dir, self.jobs_dir, self.cases_dir, self.output_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)

    def get_template_path(self, template_name: str) -> Path:
        """Get full path to a template file."""
        return self.templates_dir / template_name

    def get_job_db_path(self, job_id: str) -> Path:
        """Get full path to a job's SQLite database."""
        return self.jobs_dir / f"{job_id}.db"

    def get_case_db_path(self) -> Path:
        """Get full path to case memory SQLite database."""
        return self.cases_dir / "cases.db"


_settings: Settings | None = None


def get_settings() -> Settings:
    """Get cached settings instance."""
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.ensure_directories()
    return _settings


def reload_settings() -> Settings:
    """Reload settings from environment."""
    global _settings
    _settings = Settings()
    _settings.ensure_directories()
    return _settings
