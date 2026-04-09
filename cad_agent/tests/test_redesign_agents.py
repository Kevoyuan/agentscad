"""Tests for the redesigned design-layer agents."""

from __future__ import annotations

import pytest

from cad_agent.app.agents.design_agent import DesignAgent
from cad_agent.app.agents.intent_agent import IntentAgent
from cad_agent.app.agents.parameter_schema_agent import ParameterSchemaAgent
from cad_agent.app.agents.research_agent import ResearchAgent
from cad_agent.app.llm.pipeline_models import PartFamily, ParameterSource


@pytest.mark.asyncio
async def test_spur_gear_pipeline_outputs_derived_schema() -> None:
    request = "设计一个17齿的齿轮，外30mm，内10mm，厚3mm"

    research = await ResearchAgent().research(request)
    intent = await IntentAgent().resolve(request, research)
    design = await DesignAgent().design(intent, research)
    schema = await ParameterSchemaAgent().build_schema(request, intent, design, research)

    assert research.part_family == PartFamily.SPUR_GEAR
    assert intent.part_family == PartFamily.SPUR_GEAR
    assert design.parameter_inventions == ["module", "pitch_diameter", "root_diameter", "addendum", "dedendum"]
    assert any(param.key == "teeth" and param.source == ParameterSource.USER for param in schema.parameters)
    assert any(param.key == "module" and param.source == ParameterSource.DESIGN_DERIVED for param in schema.parameters)
    assert any(param.key == "pitch_diameter" for param in schema.parameters)


@pytest.mark.asyncio
async def test_device_stand_pipeline_invents_editable_controls() -> None:
    request = "帮我给 Mac mini M4 设计一个底座"

    research = await ResearchAgent().research(request)
    intent = await IntentAgent().resolve(request, research)
    design = await DesignAgent().design(intent, research)
    schema = await ParameterSchemaAgent().build_schema(request, intent, design, research)

    assert research.part_family == PartFamily.DEVICE_STAND
    assert research.needs_web_search is True
    assert intent.design_mode == "accessory_design"
    assert "arch_radius" in design.parameter_inventions
    assert "base_flare" in design.parameter_inventions
    assert any(param.key == "base_flare" and param.source == ParameterSource.DESIGN_DERIVED for param in schema.parameters)
    assert any(param.key == "arch_peak" and param.editable for param in schema.parameters)
    assert schema.part_family == PartFamily.DEVICE_STAND


@pytest.mark.asyncio
async def test_enclosure_pipeline_exposes_shell_controls() -> None:
    request = "设计一个电子设备外壳，100mm x 70mm x 28mm，壁厚2.4mm"

    research = await ResearchAgent().research(request)
    intent = await IntentAgent().resolve(request, research)
    design = await DesignAgent().design(intent, research)
    schema = await ParameterSchemaAgent().build_schema(request, intent, design, research)

    assert research.part_family == PartFamily.ELECTRONICS_ENCLOSURE
    assert intent.part_family == PartFamily.ELECTRONICS_ENCLOSURE
    assert "lid_overlap" in design.parameter_inventions
    assert "boss_diameter" in design.parameter_inventions
    assert any(param.key == "inner_width" and param.editable is False for param in schema.parameters)
    assert any(param.key == "lid_overlap" and param.source == ParameterSource.DESIGN_DERIVED for param in schema.parameters)
    assert any("clearance" in question.lower() for question in research.open_questions)

