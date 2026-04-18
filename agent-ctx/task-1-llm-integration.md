# Task 1: LLM Integration for SCAD Generation

## Summary
Integrated `z-ai-web-dev-sdk` LLM into the job processing API route at `/src/app/api/jobs/[id]/process/route.ts`.

## Changes Made

### 1. Part Family Detection (`detectPartFamily`)
- Added helper function that returns: `spur_gear`, `device_stand`, `electronics_enclosure`, `phone_case`, or `unknown`
- Keyword-based detection from the `inputRequest` string

### 2. Parameter Schema Generation (`getParameterSchema`)
- Each part family has a tailored set of parameters with full metadata (key, label, kind, unit, value, min, max, step, source, editable, description, group)
- `spur_gear`: teeth, outer_diameter, bore_diameter, thickness, pressure_angle
- `device_stand`: device_width, device_depth, stand_height, lip_height, wall_thickness, base_flare, arch_radius, arch_peak
- `electronics_enclosure`: width, depth, height, wall_thickness, corner_radius, clearance
- `phone_case`: body_length, body_width, body_depth, wall_thickness, camera_clearance
- `unknown`: generic width, depth, height, wall_thickness

### 3. Real SCAD Generation (`generateRealScadCode`)
- Uses `z-ai-web-dev-sdk` via `ZAI.create()` and `zai.chat.completions.create()`
- Sends a detailed system prompt instructing the LLM to return JSON with `summary`, `parameters`, and `scad_source`
- Parses response, strips markdown fences, validates shape
- Returns `LLMGenerationResult` object

### 4. Mock SCAD Generation (Enhanced Fallback)
- Extended `generateMockScadCode` to accept `inputRequest` and use part-family-aware templates
- Each part family generates valid, distinct OpenSCAD code with parameterized top-level assignments
- Falls back gracefully when LLM is unavailable

### 5. Process Endpoint Integration
- Try/catch around `generateRealScadCode()` → falls back to `generateMockScadCode()`
- SSE streaming sends `generating_llm` step when attempting LLM, `generating_mock` on fallback
- Stores `parameterSchema`, part family info, and generation method in the DB
- Builder name and generation path reflect whether LLM or template was used
- All existing SSE streaming, state transitions, and error handling preserved

## Verification
- `bun run lint` passed with zero errors
- Dev server running normally with no compilation errors
- Prisma schema already includes `parameterSchema` field used by the new code
