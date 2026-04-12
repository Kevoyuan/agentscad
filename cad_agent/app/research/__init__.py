"""Live web research adapters for real-world product dimensions."""

from cad_agent.app.research.minimax_adapter import MiniMaxWebSearchAdapter, WebResearchResult
from cad_agent.app.research.minimax_vision_adapter import (
    ImageAnalysisResult,
    MiniMaxVisionAdapter,
)

__all__ = [
    "MiniMaxWebSearchAdapter",
    "WebResearchResult",
    "ImageAnalysisResult",
    "MiniMaxVisionAdapter",
]
