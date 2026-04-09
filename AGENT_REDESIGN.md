# CAD Agent Redesign

## Goal

Rebuild the CAD agent around design reasoning, parameter invention, and parametric geometry, instead of template lookup plus string filling.

The new system should behave more like:

`Prompt -> Research -> Design Intent -> Parameter Schema -> Parametric Builder -> Geometry -> Review`

Not like:

`Prompt -> Choose Template -> Fill Variables -> Render`

## Core Principle

The system must distinguish between three different things:

1. User-provided facts
The dimensions and constraints explicitly stated in the prompt.

2. Inferred spec
Structured facts extracted or normalized from the prompt and optional external research.

3. Design-derived parameters
Additional geometric controls invented by the system to make the shape editable and manufacturable.

Example:

Prompt:
`帮我给 mac mini m4 设计一个底座`

User-provided facts might be sparse.

Inferred spec might include:
- target device: `Mac mini M4`
- device footprint
- corner radius
- likely bottom contact area

Design-derived parameters might include:
- lip height
- wall thickness
- arch radius
- base flare
- stand height
- arch peak

Those derived parameters are the real product advantage. They are not simple extraction. They are design decisions exposed as editable controls.

## New Mental Model

The system is no longer a "template engine with LLM help".

It becomes a layered CAD reasoning pipeline:

1. `ResearchAgent`
Collect external reference facts when the request depends on a known object, standard part, or engineering convention.

2. `IntentAgent`
Classify what kind of object is being requested and what design family it belongs to.

3. `DesignAgent`
Propose a shape concept and identify which parameters should control that concept.

4. `ParameterSchemaAgent`
Turn the design concept into an editable parameter schema with types, defaults, ranges, units, derivation source, and descriptions.

5. `ParametricPartEngine`
Generate geometry from a part-family-specific builder, not from a passive text template.

6. `ReviewAgent`
Check semantic fit, manufacturability, and parameter sanity before delivery.

## New Agents

### 1. ResearchAgent

Purpose:
Collect authoritative reference information before design starts.

Use cases:
- device accessories
- standard hardware
- known commercial products
- standard mechanical parts

Examples:
- Mac mini dimensions
- Raspberry Pi port layout
- spur gear conventions
- enclosure clearances for electronics

Outputs:
- `research_summary`
- `reference_facts`
- `confidence`
- `sources`

Important rule:
Research should enrich design, not directly generate geometry.

### 2. IntentAgent

Purpose:
Map the request to a part family and design scenario.

Examples of part families:
- `spur_gear`
- `device_stand`
- `electronics_enclosure`

Examples of design scenarios:
- standard part
- accessory around known device
- protective shell
- printable mount

Outputs:
- `part_family`
- `design_mode`
- `primary_constraints`
- `known_inputs`
- `missing_inputs`

### 3. DesignAgent

Purpose:
Invent a design concept before geometry is built.

This is the missing layer in the current system.

Examples:

For `device_stand`:
- wrap-around ring stand
- cradle stand
- open-frame stand
- arch-supported stand

For `electronics_enclosure`:
- two-piece shell
- snap-fit shell
- open-bottom sleeve
- vented box with screw bosses

For `spur_gear`:
- flat gear with center bore
- hubbed gear
- lightweight gear with cutouts

Outputs:
- `design_intent_summary`
- `design_strategy`
- `subfeatures`
- `editable_controls`
- `derived_constraints`

This layer is allowed to invent shape controls like `arch_peak`, `base_flare`, or `lip_height`.

### 4. ParameterSchemaAgent

Purpose:
Convert design intent into a structured editable schema.

This schema should explicitly track whether a parameter came from:
- the user
- research
- derivation
- design invention

Suggested shape:

```json
{
  "part_family": "device_stand",
  "schema_version": "v1",
  "parameters": [
    {
      "key": "device_width",
      "label": "Device Width",
      "type": "number",
      "unit": "mm",
      "value": 130,
      "min": 100,
      "max": 180,
      "step": 0.5,
      "source": "research",
      "editable": true,
      "description": "Reference width of the supported device"
    },
    {
      "key": "arch_peak",
      "label": "Arch Peak",
      "type": "number",
      "unit": "mm",
      "value": 22,
      "min": 6,
      "max": 50,
      "step": 0.5,
      "source": "design_derived",
      "editable": true,
      "description": "Vertical peak of the underside support arch"
    }
  ]
}
```

This schema becomes the contract between the design layer and the frontend.

### 5. ParametricPartEngine

Purpose:
Build geometry from rules and formulas, not template substitution.

This engine is part-family-specific and should contain real geometric logic.

Important:
This is not a generic template router.

Bad version:
- `if gear -> use gear_template.scad.j2`

Good version:
- `if spur_gear -> run SpurGearBuilder`
- builder computes all dependent dimensions
- builder enforces constraints
- builder outputs a geometry program

The engine should start with three families:

#### A. SpurGearBuilder

Inputs:
- teeth
- outer_diameter or module
- bore_diameter
- thickness
- pressure_angle
- optional hub

Derived values:
- module
- pitch_diameter
- root_diameter
- addendum
- dedendum
- tooth_thickness

Rules:
- validate gear relationships
- reject impossible combinations
- prefer stable defaults when under-specified

#### B. DeviceStandBuilder

Inputs:
- device footprint
- corner radius
- stand height
- lip height
- wall thickness
- base flare
- arch radius
- arch peak

Derived values:
- internal clearance
- support curve depth
- base contact area
- side opening geometry

Rules:
- preserve airflow
- avoid impossible overhangs
- maintain minimum printable walls
- fit around known device envelope

#### C. EnclosureBuilder

Inputs:
- outer dimensions
- wall thickness
- corner radius
- clearance
- split line
- vent pattern
- mounting boss options
- port cutouts

Derived values:
- inner cavity
- shell overlap
- lid engagement depth
- boss offsets
- vent spacing

Rules:
- preserve internal usable space
- ensure printable shell thickness
- maintain cutout margins
- validate snap-fit or screw-boss geometry

## New Data Model

The current `DesignJob` object is missing explicit design and parameter layers.

Add these fields:

```python
research_payload: Optional[dict]
intent_payload: Optional[dict]
design_payload: Optional[dict]
parameter_schema: Optional[dict]
parameter_values: dict[str, Any]
part_family: Optional[str]
geometry_program_version: Optional[str]
```

Keep existing:
- `spec`
- `template_choice` only as backward compatibility during migration
- `scad_source`
- `artifacts`

The eventual goal is to replace `template_choice` with:
- `part_family`
- `builder_name`
- `parameter_schema`

## New State Machine

Replace the old template-centered flow with:

1. `NEW`
2. `RESEARCHED`
3. `INTENT_RESOLVED`
4. `DESIGN_RESOLVED`
5. `PARAMETERS_GENERATED`
6. `GEOMETRY_BUILT`
7. `RENDERED`
8. `REVIEWED`
9. `DELIVERED`

Failure / repair:
- `RESEARCH_FAILED`
- `DESIGN_FAILED`
- `PARAMETER_FAILED`
- `GEOMETRY_FAILED`
- `REVIEW_FAILED`
- `REPAIRING`
- `HUMAN_REVIEW`

## Review Layer

The current validator mostly checks render and engineering rules.

The new review layer should include:

### A. Semantic review
Does this still look like the requested object class?

### B. Part-family review
Family-specific checks:
- gear relations
- enclosure cavity margins
- stand support geometry

### C. Manufacturing review
Printability, walls, clearances, overhangs, assembly logic.

### D. Parameter review
Are the exposed controls meaningful, stable, and non-redundant?

This last part is important.
Bad systems expose random raw variables.
Good systems expose the smallest editable set that cleanly controls the design.

## Frontend Contract

The frontend should stop pretending parameters are just dimensions.

It should consume:

```json
{
  "part_family": "device_stand",
  "design_intent_summary": "Wrap-around stand with underside arch relief",
  "parameter_schema": [...],
  "parameter_values": {...},
  "preview_artifacts": {...}
}
```

The UI should show:
- conversation thread
- object type / part family
- generated design summary
- editable controls
- live preview
- review diagnostics

Important:
The parameter panel should visually distinguish:
- user provided
- inferred
- design derived

That is a major trust feature.

## Migration Plan

### Phase 1
Introduce the new data model and agents without deleting the old path.

Steps:
- add `ResearchAgent`
- add `IntentAgent`
- add `DesignAgent`
- add `ParameterSchemaAgent`
- store their outputs on `DesignJob`

### Phase 2
Implement `ParametricPartEngine` with three builders:
- `SpurGearBuilder`
- `DeviceStandBuilder`
- `EnclosureBuilder`

### Phase 3
Route supported part families to builders first.
Fallback to `llm_native_v1` only for unsupported families.

### Phase 4
Add parameter update endpoint:

`PATCH /jobs/{id}/parameters`

Body:

```json
{
  "parameter_values": {
    "wall_thickness": 3.0,
    "arch_peak": 18
  }
}
```

Server behavior:
- validate new parameter values
- rebuild geometry via part builder
- rerender artifacts
- rerun review

### Phase 5
Deprecate legacy template-first path for supported families.

## What Not To Do

1. Do not create more SCAD templates and call that parametric.

2. Do not expose only prompt-extracted values.
The system must be allowed to invent useful controls.

3. Do not let the LLM generate raw SCAD as the primary supported path for core families.
For gear, stand, and enclosure, builder logic should be deterministic.

4. Do not mix research, design, and geometry generation into one opaque prompt.
Each layer should have a clear artifact.

## Definition of Success

The redesign is successful when:

1. A prompt like `帮我给 mac mini m4 设计一个底座` produces:
- researched device facts
- a stand concept
- invented editable design parameters
- a stable generated stand

2. A prompt like `设计一个17齿齿轮` produces:
- a real gear family object
- valid derived gear parameters
- builder-generated geometry
- semantic review that blocks non-gear outputs

3. The right-side parameter panel is not just displaying dimensions.
It is displaying design controls.

4. Editing a parameter causes deterministic regeneration, not another free-form prompt roundtrip.

## Immediate Implementation Target

Build in this order:

1. `IntentAgent`
2. `DesignAgent`
3. `ParameterSchemaAgent`
4. `SpurGearBuilder`
5. `DeviceStandBuilder`
6. `EnclosureBuilder`
7. `PATCH /jobs/{id}/parameters`
8. frontend parameter regeneration loop

That sequence gives the fastest path to matching the product behavior you want.
