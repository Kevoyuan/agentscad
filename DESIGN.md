# AgentSCAD Design System

AgentSCAD should feel like a precision instrument for turning intent into real geometry. Linear is the reference for restraint, hierarchy, speed, and craft. It is not the visual identity. The identity is high-trust CAD: inspectable, measured, calm, and production-minded.

## North Star

Describe a part. Inspect the generated geometry. Refine with confidence. Export clean CAD.

AI is the acceleration layer, not the visual style. The interface should never feel like a chatbot with a 3D preview attached.

## Product Feel

- Quiet, dense, exact.
- More industrial design studio than AI playground.
- More instrument panel than SaaS dashboard.
- Every visual element should help the user understand the model, the constraints, the generation state, or the export readiness.

## Visual Direction

Use a "precision graphite" foundation:

- Background: deep graphite for the primary workspace.
- Surfaces: layered neutral panels with hairline borders.
- Accent: calibrated indigo (`#5e6ad2`), used sparingly. This is the intentional brand accent — not decorative purple.
- Status colors: semantic only, never decorative.
- Shadows: shallow and rare. Prefer borders and elevation through contrast.

Avoid:

- Decorative purple or violet outside the established indigo accent system.
- Decorative gradients as first-impression styling.
- Dashboard card mosaics.
- Colored icon circles.
- Bouncy AI magic animations.
- Generic "clean modern" SaaS rhythm.

## Color Tokens

Recommended token direction:

```css
:root {
  --cad-bg: #0b0d10;
  --cad-surface: #111418;
  --cad-surface-raised: #171b20;
  --cad-border: rgba(214, 224, 235, 0.12);
  --cad-border-strong: rgba(214, 224, 235, 0.22);
  --cad-text: #eef3f8;
  --cad-text-secondary: #aab5c0;
  --cad-text-muted: #75808b;
  --cad-accent: #5e6ad2;
  --cad-accent-soft: rgba(94, 106, 210, 0.16);
  --cad-grid: rgba(140, 145, 180, 0.14);
  --cad-success: #35c46f;
  --cad-warning: #d99b2b;
  --cad-danger: #f06464;
  --cad-info: #4aa3ff;
}
```

The indigo accent is the global identity. Do not introduce competing purple tones outside this system.

## Typography

Use a precise sans paired with a technical mono.

- UI sans: keep Geist only if the redesign sharpens everything else; otherwise evaluate Suisse Intl, Söhne, Akkurat, or a similar precise grotesk.
- Mono: Berkeley Mono, JetBrains Mono, Commit Mono, or Geist Mono for parameters, dimensions, code, units, and keyboard hints.
- Use tabular numbers for dimensions, states, timings, and metric rows.
- Labels can be compact, but body text must stay readable. Do not use body text below 16px where users need to read prose.

## Layout Model

AgentSCAD is a desktop-first CAD workspace.

```text
+--------------------------------------------------------------------------------+
| Header: product, active part, pipeline, global actions                          |
+----------------------+--------------------------------------+------------------+
| Job / Part list      | 3D viewport                           | Inspector        |
| saved runs           | model, grid, axis, dimensions         | spec             |
| variants             | viewport toolbar + overlays           | parameters       |
| queue                |                                      | validation       |
|                      |                                      | code/history     |
+----------------------+--------------------------------------+------------------+
| Timeline: generation stages, revisions, warnings, export readiness              |
+--------------------------------------------------------------------------------+
```

The center viewport is the product. Side panels support it. They should not compete with it.

## Core Components

Create or evolve a product-specific CAD layer over the current shadcn primitives:

- `CadPanel`: neutral panel with hairline border and compact heading.
- `CadToolbarButton`: icon-first viewport controls with tooltip.
- `CadMetric`: label, value, unit, confidence state.
- `CadStatusDot`: small semantic indicator, never a large colored badge by default.
- `CadViewportOverlay`: grid, axis, dimensions, section plane, model units.
- `CadSectionHeader`: compact uppercase header for dense tool panels.
- `CadConstraintChip`: dimension, material, tolerance, manufacturing method, or lock state.
- `CadExportChecklist`: final quality gate before export.

Cards are allowed only when the card is the interaction, such as a part variant, template, or export format. Page sections should not be card stacks.

## Workspace Principles

1. The model is first. Chrome gets out of the way.
2. Prompts become specifications. Extract dimensions, units, material, process, and tolerances into editable structure.
3. Every generated part has an inspectable record: prompt, parameters, SCAD, validation, versions, exports.
4. Errors are diagnostic. "Something went wrong" is not acceptable.
5. Motion explains computation. Wireframe build-in, stage transitions, and warning focus are useful. Sparkles are not.

## 3D Viewport

Default viewport:

- Orthographic-first for precision, with perspective toggle.
- Studio lighting, not game lighting.
- Visible grid, axis indicator, units, and camera preset.
- Model centered with auto-fit camera.
- Subtle bounding box when selected.

Required viewport tools:

- Orbit
- Pan
- Zoom
- Fit
- Shaded
- Wireframe
- Transparent
- Measure
- Section
- Export

Required overlays:

- Bounding box dimensions.
- Origin and axis markers.
- Constraint callouts.
- Wall thickness warnings.
- Non-manifold or validation warnings.
- Export readiness state.

## Prompt And Specification

The new job composer should become a spec builder.

Primary input:

- Natural-language part description.

Structured chips:

- Units
- Overall dimensions
- Material
- Manufacturing method
- Tolerance
- Fasteners
- Symmetry
- Required features

Example:

```text
Create a hinged electronics enclosure
[120 x 80 x 32 mm] [PLA] [FDM] [M3 screws] [snap-fit lid] [2.5mm wall]
```

Tone:

- "Add missing dimensions"
- "Resolve conflicting constraints"
- "Regenerate with stricter tolerances"
- "Export-ready"

Avoid:

- "Unlock your creativity"
- "Let AI work its magic"
- "Something went wrong"

## Interaction States

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Job list | Skeleton rows with state dots | Starter parts and templates | Retry load, keep cached rows if available | Compact model rows | Filtered results show count and clear action |
| Composer | AI enhance spinner on button only | Concrete CAD examples | Explain invalid or underspecified request | Job created and selected | Underconstrained chips highlighted |
| Generation | Stage-by-stage pipeline | Ready to generate | Diagnostic cause and repair action | Model appears with camera fit | Show current stage and available logs |
| Viewport | Wireframe/mesh loading state | Centered starter prompt and template actions | Canvas fallback plus text summary | Model, grid, overlays | Partial preview with validation caveats |
| Parameters | Disabled controls while saving | Prompt user to process job | Failed save toast plus rollback option | Values update with subtle diff | Changed values highlighted until applied |
| Validation | Running checks list | Validation pending | Specific failed rule and fix | Export-ready checklist | Warnings separated from blockers |
| Export | Preparing artifact | No export until generated | Format-specific failure and retry | Format download ready | Some formats ready, others blocked |

## Responsive Strategy

Desktop is the primary product surface.

- 1440px and up: full three-pane workspace with timeline.
- 1024-1439px: narrower left panel, inspector still visible, viewport remains dominant.
- 768-1023px: left panel collapses, inspector becomes drawer, prompt moves to bottom command bar.
- Below 768px: review mode, not full CAD editing. Users can inspect, prompt a simple revision, view history, share, and export. Advanced measurement and parameter editing are secondary.

Minimum touch target: 44px on touch layouts.

## Accessibility

- All major actions must be keyboard reachable.
- Viewport actions need text equivalents in the inspector or toolbar.
- Canvas warnings must appear as accessible text outside the canvas.
- Do not rely on color alone for validation states.
- Respect reduced motion.
- Body text contrast must be at least 4.5:1.
- Focus rings should be visible on graphite and light themes.

## Motion

Use motion to explain state:

- Viewport model fades from wireframe to solid after generation.
- Active generation stage advances with subtle progress.
- Geometry warnings pulse once, then settle.
- Inspector tab transitions stay under 200ms.
- Reduced motion replaces all build animations with static stage changes.

Avoid looping attention effects unless the system is actively processing.

## Existing Assets To Reuse

- Current app tokens and Linear utilities in `src/app/globals.css`.
- Three-pane workspace in `src/components/cad/workspace/MainWorkspace.tsx`.
- 3D viewer and controls in `src/components/cad/three-d-viewer.tsx` and `src/components/cad/viewer-controls.tsx`.
- Parameter controls in `src/components/cad/parameter-panel.tsx`.
- SCAD editor in `src/components/cad/scad-editor.tsx`.
- Command palette, keyboard shortcuts, notifications, activity feed, compare, and stats dialogs.

## Implementation Guardrails

- Replace broad purple styling with the CAD accent system.
- Make the viewport visually dominant before adding new panels.
- Reduce equally weighted inspector tabs. Prefer fewer primary modes with nested sections.
- Convert colorful badges into small status dots plus text.
- Keep copy exact and mechanical.
- Add design QA after implementation with desktop and mobile screenshots.

