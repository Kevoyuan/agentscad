"""Configuration management for CAD Agent System."""
from pathlib import Path
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from cad_agent.app.llm.provider import LLMProviderConfig


def _detect_openscad_path() -> Path:
    """Find a usable OpenSCAD binary for the local machine."""
    candidates = (
        Path("/Volumes/SSD/Projects/Code/agentscad/.local/OpenSCAD-2021.01.app/Contents/MacOS/OpenSCAD"),
        Path("/opt/homebrew/bin/openscad"),
        Path("/usr/local/bin/openscad"),
        Path("/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD"),
        Path("/Applications/OpenSCAD-2021.01.app/Contents/MacOS/OpenSCAD"),
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CAD_AGENT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openSCAD_path: Path = Field(
        default_factory=_detect_openscad_path,
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

    llm_provider: Literal["openai", "anthropic", "azure", "minimax"] = Field(
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

    anthropic_base_url: str = Field(
        default="https://api.anthropic.com",
        description="Anthropic-compatible base URL",
    )

    openai_api_key: str | None = Field(
        default=None,
        description="OpenAI API key",
    )

    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        description="OpenAI API base URL",
    )

    azure_openai_endpoint: str | None = Field(
        default=None,
        description="Azure OpenAI endpoint",
    )

    azure_openai_key: str | None = Field(
        default=None,
        description="Azure OpenAI API key",
    )

    minimax_api_key: str | None = Field(
        default=None,
        description="MiniMax Token Plan API key",
    )

    minimax_base_url: str = Field(
        default="https://api.minimaxi.com/anthropic",
        description="MiniMax Anthropic-compatible base URL",
    )

    minimax_model: str = Field(
        default="MiniMax-M2.7",
        description="Default MiniMax model name",
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

    def resolve_llm_provider_config(self, validate_api_key: bool = True) -> LLMProviderConfig:
        """Resolve the active LLM provider configuration.

        MiniMax is exposed through Anthropic-compatible transport, so it reuses
        the same API shape while keeping a dedicated base URL and model default.
        """
        provider = self.llm_provider

        if provider == "minimax":
            api_key = self.minimax_api_key or self.anthropic_api_key
            if validate_api_key and not api_key:
                raise ValueError(
                    "MiniMax provider requires CAD_AGENT_MINIMAX_API_KEY or CAD_AGENT_ANTHROPIC_API_KEY"
                )
            return LLMProviderConfig(
                provider=provider,
                model=self.minimax_model,
                api_key=api_key,
                base_url=self.minimax_base_url,
            )

        if provider == "anthropic":
            if validate_api_key and not self.anthropic_api_key:
                raise ValueError("Anthropic provider requires CAD_AGENT_ANTHROPIC_API_KEY")
            return LLMProviderConfig(
                provider=provider,
                model=self.llm_model,
                api_key=self.anthropic_api_key,
                base_url=self.anthropic_base_url,
            )

        if provider == "openai":
            if validate_api_key and not self.openai_api_key:
                raise ValueError("OpenAI provider requires CAD_AGENT_OPENAI_API_KEY")
            return LLMProviderConfig(
                provider=provider,
                model=self.llm_model,
                api_key=self.openai_api_key,
                base_url=self.openai_base_url,
            )

        if provider == "azure":
            if validate_api_key and (not self.azure_openai_key or not self.azure_openai_endpoint):
                raise ValueError(
                    "Azure provider requires CAD_AGENT_AZURE_OPENAI_KEY and CAD_AGENT_AZURE_OPENAI_ENDPOINT"
                )
            return LLMProviderConfig(
                provider=provider,
                model=self.llm_model,
                api_key=self.azure_openai_key,
                base_url=self.azure_openai_endpoint.rstrip("/"),
            )

        raise ValueError(f"Unsupported LLM provider: {provider}")


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
