import pytest
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from cad_agent.app.tools.openscad_executor import (
    OpenSCADExecutor,
    RenderResult,
)


@pytest.fixture
def temp_output_dir(tmp_path):
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    return str(output_dir)


class TestOpenSCADExecutor:
    def test_init_with_defaults(self):
        executor = OpenSCADExecutor()
        assert executor.openscad_path == "openscad"

    def test_init_with_custom_path(self):
        executor = OpenSCADExecutor(openscad_path="/usr/local/bin/openscad")
        assert executor.openscad_path == "/usr/local/bin/openscad"

    @pytest.mark.asyncio
    @patch("cad_agent.app.tools.openscad_executor.subprocess.run")
    @patch("cad_agent.app.tools.openscad_executor.Path.exists")
    @patch("cad_agent.app.tools.openscad_executor.Path.write_text")
    async def test_render_success(self, mock_write, mock_exists, mock_run, temp_output_dir):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        mock_exists.return_value = True
        
        executor = OpenSCADExecutor()
        result = await executor.render(
            scad_source="$fn=50;\nmodule box() { cube([10, 5, 3]); }\nbox();",
            output_dir=temp_output_dir,
        )
        
        assert result.success is True
        assert result.stl_path is not None
        assert result.stl_path.endswith(".stl")

    @pytest.mark.asyncio
    @patch("cad_agent.app.tools.openscad_executor.subprocess.run")
    @patch("cad_agent.app.tools.openscad_executor.Path.write_text")
    async def test_render_stl_failure(self, mock_write, mock_run, temp_output_dir):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="ERROR: Invalid geometry")
        
        executor = OpenSCADExecutor()
        result = await executor.render(
            scad_source="invalid openscad code",
            output_dir=temp_output_dir,
        )
        
        assert result.success is False
        assert "Invalid geometry" in result.error_message

    @pytest.mark.asyncio
    @patch("cad_agent.app.tools.openscad_executor.subprocess.run")
    @patch("cad_agent.app.tools.openscad_executor.Path.exists")
    @patch("cad_agent.app.tools.openscad_executor.Path.write_text")
    async def test_render_can_skip_png_for_preview(self, mock_write, mock_exists, mock_run, temp_output_dir):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        mock_exists.return_value = True

        executor = OpenSCADExecutor()
        result = await executor.render(
            scad_source="$fn=50;\ncube([10, 5, 3]);",
            output_dir=temp_output_dir,
            render_png=False,
        )

        assert result.success is True
        assert result.stl_path is not None
        assert result.png_path is None
        assert mock_run.call_count == 1

    @pytest.mark.asyncio
    @patch("cad_agent.app.tools.openscad_executor.subprocess.run")
    @patch("cad_agent.app.tools.openscad_executor.Path.write_text")
    async def test_render_timeout(self, mock_write, mock_run, temp_output_dir):
        import subprocess
        mock_run.side_effect = subprocess.TimeoutExpired("openscad", 60)
        
        executor = OpenSCADExecutor()
        result = await executor.render(
            scad_source="$fn=50;\ncube([10, 10, 10]);",
            output_dir=temp_output_dir,
        )
        
        assert result.success is False
        assert "timed out" in result.error_message.lower()

    @pytest.mark.asyncio
    @patch("cad_agent.app.tools.openscad_executor.subprocess.run")
    @patch("cad_agent.app.tools.openscad_executor.Path.write_text")
    async def test_render_file_not_found(self, mock_write, mock_run, temp_output_dir):
        mock_run.side_effect = FileNotFoundError("openscad not found")
        
        executor = OpenSCADExecutor(openscad_path="nonexistent_openscad")
        result = await executor.render(
            scad_source="$fn=50;\ncube([10, 10, 10]);",
            output_dir=temp_output_dir,
        )
        
        assert result.success is False
        assert "not found" in result.error_message.lower()

    @patch("cad_agent.app.tools.openscad_executor.subprocess.run")
    def test_validate_syntax_valid(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        executor = OpenSCADExecutor()
        is_valid, error = executor.validate_syntax("$fn=50;\ncube([10, 10, 10]);")
        assert is_valid is True
        assert error == ""

    @patch("cad_agent.app.tools.openscad_executor.subprocess.run")
    def test_validate_syntax_invalid(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="ERROR: Illegal semicolon")
        executor = OpenSCADExecutor()
        is_valid, error = executor.validate_syntax("invalid openscad ;;;")
        assert is_valid is False
        assert error != ""


class TestExecutorAgent:
    @pytest.mark.asyncio
    async def test_execute_renders_without_separate_syntax_validation(self, tmp_path):
        from cad_agent.app.agents.executor_agent import ExecutorAgent
        from cad_agent.app.models.design_job import DesignJob

        class StubExecutor:
            def __init__(self):
                self.render_calls = 0

            async def render(self, scad_source: str, output_dir=None, camera: str = "--viewall", render_png: bool = True):
                self.render_calls += 1
                return RenderResult(
                    success=True,
                    stl_path=str(tmp_path / "design.stl"),
                    png_path=str(tmp_path / "design.png"),
                    log_output="ok",
                )

        stub = StubExecutor()
        agent = ExecutorAgent(executor=stub, output_dir=str(tmp_path))
        job = DesignJob(input_request="gear", scad_source="cube([1,1,1]);")

        result = await agent.execute(job)

        assert result.success is True
        assert stub.render_calls == 1

    @pytest.mark.asyncio
    async def test_execute_skips_png_during_preview_mode(self, tmp_path):
        from cad_agent.app.agents.executor_agent import ExecutorAgent
        from cad_agent.app.models.design_job import DesignJob

        class StubExecutor:
            def __init__(self):
                self.render_kwargs = None

            async def render(self, scad_source: str, output_dir=None, camera: str = "--viewall", render_png: bool = True):
                self.render_kwargs = {
                    "output_dir": output_dir,
                    "camera": camera,
                    "render_png": render_png,
                }
                return RenderResult(
                    success=True,
                    stl_path=str(tmp_path / "design.stl"),
                    png_path=None,
                    log_output="ok",
                )

        stub = StubExecutor()
        agent = ExecutorAgent(executor=stub, output_dir=str(tmp_path))
        job = DesignJob(
            input_request="gear",
            scad_source="cube([1,1,1]);",
            business_context={"preview_mode": True},
        )

        result = await agent.execute(job)

        assert result.success is True
        assert stub.render_kwargs["render_png"] is False

    def test_render_result_model(self):
        result = RenderResult(
            success=True,
            stl_path="/output/test.stl",
            png_path="/output/test.png",
            log_output="Render complete",
        )
        assert result.success is True
        assert result.stl_path == "/output/test.stl"
        assert result.png_path == "/output/test.png"
        assert result.log_output == "Render complete"
        assert result.error_message is None

    def test_render_result_failure(self):
        result = RenderResult(
            success=False,
            error_message="STL render failed",
        )
        assert result.success is False
        assert result.error_message == "STL render failed"
        assert result.stl_path is None
