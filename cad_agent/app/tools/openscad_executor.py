"""OpenSCAD CLI executor tool."""

import asyncio
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import structlog

logger = structlog.get_logger()


@dataclass
class RenderResult:
    """Result from OpenSCAD rendering."""

    success: bool
    stl_path: str | None = None
    png_path: str | None = None
    log_output: str = ""
    error_message: str | None = None


class OpenSCADExecutor:
    """Executes OpenSCAD CLI commands for SCAD source files."""

    def __init__(self, openscad_path: str = "openscad"):
        """Initialize with OpenSCAD CLI path."""
        self.openscad_path = openscad_path

    async def render(
        self,
        scad_source: str,
        output_dir: str | None = None,
        camera: str = "--viewall",
    ) -> RenderResult:
        """Render SCAD source to STL and PNG.

        Args:
            scad_source: The SCAD source code to render
            output_dir: Directory for output files (temp if None)
            camera: Camera options for PNG rendering

        Returns:
            RenderResult with paths to generated files
        """
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="openscad_")

        os.makedirs(output_dir, exist_ok=True)

        scad_file = Path(output_dir) / "design.scad"
        stl_file = Path(output_dir) / "design.stl"
        png_file = Path(output_dir) / "design.png"
        log_file = Path(output_dir) / "render.log"

        try:
            scad_file.write_text(scad_source)
        except OSError as e:
            return RenderResult(
                success=False,
                error_message=f"Failed to write SCAD file: {e}",
            )

        try:
            result = subprocess.run(
                [
                    self.openscad_path,
                    "-o", str(stl_file),
                    str(scad_file),
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )
            stl_success = result.returncode == 0 and stl_file.exists()
            log_output = result.stdout + result.stderr
            log_file.write_text(log_output)

            if not stl_success:
                return RenderResult(
                    success=False,
                    log_output=log_output,
                    error_message=f"STL render failed: {result.stderr}",
                )

            png_result = subprocess.run(
                [
                    self.openscad_path,
                    "-o", str(png_file),
                    "-P", "Custom",
                    camera,
                    str(scad_file),
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )
            png_success = png_result.returncode == 0 and png_file.exists()

            return RenderResult(
                success=True,
                stl_path=str(stl_file),
                png_path=str(png_file) if png_success else None,
                log_output=log_output + "\n" + png_result.stdout + png_result.stderr,
            )

        except subprocess.TimeoutExpired:
            return RenderResult(
                success=False,
                error_message="OpenSCAD render timed out",
            )
        except FileNotFoundError:
            return RenderResult(
                success=False,
                error_message=f"OpenSCAD not found at: {self.openscad_path}",
            )
        except Exception as e:
            return RenderResult(
                success=False,
                error_message=f"OpenSCAD execution error: {e}",
            )

    def validate_syntax(self, scad_source: str) -> tuple[bool, str]:
        """Check SCAD syntax without rendering.

        Args:
            scad_source: The SCAD source code to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".scad", delete=False
            ) as f:
                f.write(scad_source)
                temp_path = f.name

            result = subprocess.run(
                [self.openscad_path, "-o", "/dev/null", temp_path],
                capture_output=True,
                text=True,
                timeout=30,
            )
            os.unlink(temp_path)

            if result.returncode == 0:
                return True, ""
            return False, result.stderr

        except Exception as e:
            return False, str(e)
