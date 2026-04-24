# AgentSCAD Frontend Redesign Plan

Goal: make AgentSCAD a Linear-style, high-end, minimalist 3D CAD generator. The design should feel precise and inspectable, not like a generic AI SaaS app.

## Review Result

Initial design completeness: 4/10.

Final plan completeness after this review: 9/10.

The remaining 1 point depends on visual mockups and screenshot QA. The gstack designer binary was not available in this environment, so this plan is text-first. Run visual design exploration before implementation if the team wants multiple directions.

## What Already Exists

- `src/app/globals.css` already contains app tokens, light/dark themes, Linear utility classes, animations, custom scrollbars, selected states, and compact surface styles.
- `src/components/cad/workspace/MainWorkspace.tsx` already provides a CAD-workstation shape: header, resizable left job list, central viewer, right inspector, dialogs, command palette, notifications, activity feed, stats, and compare.
- `src/components/cad/three-d-viewer.tsx` already has STL loading, procedural fallback geometry, grid, axes, orbit controls, auto-fit camera, wireframe, screenshot, and viewer controls.
- `src/components/cad/parameter-panel.tsx` already has grouped parameter controls, source badges, changed-state highlights, reset actions, sliders, and debounced persistence.
- `src/components/cad/scad-editor.tsx` already supports code inspection and editing, which is a major trust advantage.

## Not In Scope

- Full marketing homepage redesign: the current app opens directly to the workspace.
- Direct geometry manipulation in the viewport: keep for a later phase.
- STEP/OBJ/glTF export implementation: plan the UI, but backend support is separate.
- Multiplayer comments or team assignment flows: Linear-inspired, but not needed for the premium single-user CAD workflow.
- Simulation or FEA: useful later, too large for this design pass.

## Pass 1: Information Architecture

Rating before: 5/10.

Rating after: 9/10.

The current three-pane app structure is correct, but the hierarchy needs to shift from "job dashboard" to "part workspace."

Target hierarchy:

```text
First:  3D part in the viewport
Second: active constraints, dimensions, validation, export readiness
Third: job history, metadata, logs, secondary activity
```

Workspace structure:

```text
+--------------------------------------------------------------------------------+
| Header: AgentSCAD, active part, compact pipeline, global actions                |
+----------------------+--------------------------------------+------------------+
| Part list / runs     | 3D viewport                           | Inspector        |
| variants             | grid, axis, dimensions, warnings      | Spec             |
| queue                | viewport toolbar                      | Parameters       |
| saved templates      |                                      | Model            |
|                      |                                      | Code             |
|                      |                                      | Validation       |
|                      |                                      | History          |
+----------------------+--------------------------------------+------------------+
| Timeline: generation stages, revisions, diffs, warnings, export readiness       |
+--------------------------------------------------------------------------------+
```

Plan changes:

- Rename mental model from "job" to "part/run" in the UI where it improves clarity.
- Make the viewport the largest and quietest surface.
- Reduce the job-detail header height in `ViewerPanel`.
- Move secondary metadata into inspector or collapsible detail rows.
- Consolidate inspector tabs from 9 equal tabs into 6 modes: `Spec`, `Parameters`, `Model`, `Code`, `Validation`, `History`.
- Make `AI` a contextual assistant inside `Spec` or `Code`, not a full peer to CAD panels.

## Pass 2: Interaction State Coverage

Rating before: 6/10.

Rating after: 9/10.

Add this state table to guide implementation:

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Job list | Skeleton rows with status dots | Starter parts and templates | Retry load, preserve cached rows | Compact model rows | Filtered count plus clear filters |
| Composer | Button-local spinner | Concrete CAD examples | Missing constraints explained | New run selected | Underconstrained chips highlighted |
| Generation | Stage list with active row | Ready to generate | Diagnostic cause and repair action | Model appears with camera fit | Preview plus warning badges |
| Viewport | Wireframe/mesh loading | Starter part prompt and templates | Canvas fallback plus text summary | Model, grid, axis, overlays | Partial mesh with validation caveats |
| Parameters | Controls disabled while saving | Process job to generate controls | Failed save toast plus rollback | Values update with diff | Changed values highlighted |
| Validation | Running check rows | Validation pending | Specific failed rule and fix | Export-ready checklist | Warnings separated from blockers |
| Export | Preparing artifact | No export until generated | Format-specific retry | Download ready | Some formats ready, others blocked |

Critical copy examples:

- Empty: "Start with a constrained mechanical part."
- Underconstrained: "Add wall thickness, screw size, or clearance."
- Failure: "The generated shell intersects the screw posts. Increase enclosure height or reduce post diameter."
- Success: "Export-ready. Units and minimum wall thickness confirmed."

## Pass 3: User Journey And Emotional Arc

Rating before: 5/10.

Rating after: 9/10.

Storyboard:

| Step | User Does | User Feels | Plan Specifies |
|---|---|---|---|
| 1 | Opens workspace | "This is serious CAD software" | Viewport-first layout, graphite system, compact chrome |
| 2 | Describes a part | "I can be precise without writing code" | Prompt plus constraint chips |
| 3 | Watches generation | "The system is doing real mechanical work" | Stage-by-stage pipeline, wireframe build-in |
| 4 | Inspects result | "I can trust or challenge this model" | Grid, axes, dimensions, validation, SCAD access |
| 5 | Refines | "Iteration is cheap and controlled" | Parameter editing plus natural-language refinement |
| 6 | Exports | "This is safe to use downstream" | Export readiness checklist |

Five-second impression: precision and spatial confidence.

Five-minute behavior: prompt, inspect, adjust, validate, export.

Five-year relationship: trust comes from transparent SCAD, revision history, and validation.

## Pass 4: AI Slop Risk

Rating before: 4/10.

Rating after: 9/10.

Current risks:

- Purple is too dominant for a premium CAD tool.
- Many badges and colors compete with the model.
- The composer still reads as a generic AI prompt modal.
- Some bouncy/pulsing motion feels closer to an ops dashboard than a precision instrument.

Design decisions:

- Replace purple identity with precision graphite plus steel-blue/cyan accent.
- Treat status colors as semantic, not decorative.
- Replace decorative gradients with CAD-native visuals: grid lines, axis markers, dimension ticks, section plane accents, origin crosshair.
- Make the composer a spec builder, not a chat box.
- Use technical copy. No "AI magic" language.
- Use icon-first viewport tools with tooltips.
- Do not add a marketing-style hero to the app shell.

Hard rules:

- No 3-column feature grid.
- No centered marketing copy in the workspace.
- No card mosaics for core panels.
- No colored icon circles as decoration.
- No purple gradient hero or purple-on-white default.

## Pass 5: Design System Alignment

Rating before: 3/10 because no `DESIGN.md` existed.

Rating after: 9/10 because `DESIGN.md` now defines the source of truth.

Implementation direction:

- Keep the existing Linear utility layer, but rename or extend toward CAD-specific primitives over time.
- Add a product-specific component layer:
  - `CadPanel`
  - `CadToolbarButton`
  - `CadMetric`
  - `CadStatusDot`
  - `CadViewportOverlay`
  - `CadConstraintChip`
  - `CadExportChecklist`
- Keep shadcn as the primitive base.
- Do not let shadcn defaults define the final product texture.

## Pass 6: Responsive And Accessibility

Rating before: 5/10.

Rating after: 9/10.

Responsive plan:

- `>=1440px`: full three-pane workspace plus timeline.
- `1024-1439px`: compact left panel, full viewport, right inspector visible.
- `768-1023px`: left panel collapses, inspector becomes drawer, prompt moves to bottom command bar.
- `<768px`: review mode, not full CAD editing. Support inspect, simple revision, history, share, and export.

Accessibility plan:

- All toolbar actions keyboard reachable.
- Viewport warnings mirrored as text outside the canvas.
- Focus states visible in dark and light themes.
- Warnings use icon and label, not just color.
- Reduced motion replaces mesh build animations with static stage indicators.
- Minimum touch target: 44px on touch layouts.
- Body text contrast: at least 4.5:1.

## Pass 7: Unresolved Design Decisions

Rating before: 4/10.

Rating after: 8/10.

Resolved for implementation:

- Launch with a graphite technical studio theme.
- Make prompt plus parameter editing the primary editing model.
- Keep direct viewport manipulation for later.
- Treat validation as a practical manufacturability pass, not deep simulation.
- Keep collaboration out of the first redesign.
- Show concise generation stages with expandable logs.

Still open:

| Decision Needed | Recommendation | If Deferred |
|---|---|---|
| Primary audience | Makers/prototypers first, engineers second | Copy and examples may feel too generic |
| Primary export promise | OpenSCAD + STL first | Export UI may overpromise unsupported formats |
| Typography license | Start with current Geist, evaluate premium font later | Visual identity may feel less distinctive |
| Light theme polish | Dark graphite first, light later | Light mode may lag behind |

## Implementation Sequence

1. Design tokens.
   - Replace purple-first accent usage with CAD tokens.
   - Add graphite, steel-blue, grid, warning, and export-ready tokens.

2. CAD component layer.
   - Add `CadPanel`, `CadToolbarButton`, `CadMetric`, `CadStatusDot`, `CadConstraintChip`.
   - Refactor repeated ad hoc classes into these components.

3. Viewport-first layout.
   - Reduce `ViewerPanel` header chrome.
   - Add viewport overlay for units, camera mode, grid, axis, dimensions, and warnings.
   - Make viewer controls feel like CAD tools, not generic buttons.

4. Spec builder composer.
   - Keep natural-language prompt.
   - Add structured constraint chips for units, dimensions, material, process, tolerance, fasteners.
   - Update empty examples to concrete mechanical parts.

5. Inspector consolidation.
   - Collapse 9 tabs into `Spec`, `Parameters`, `Model`, `Code`, `Validation`, `History`.
   - Move AI assistant into contextual panels.

6. Parameter polish.
   - Add unit columns, changed-vs-baseline comparison, lock states, tick marks, and live update indicators.

7. Validation and export readiness.
   - Add diagnostic warning rows.
   - Add export checklist.
   - Separate warnings from blockers.

8. Responsive pass.
   - Implement tablet drawers and mobile review mode.
   - Verify touch targets and viewport controls.

9. Visual QA.
   - Run app locally.
   - Capture desktop, laptop, tablet, and mobile screenshots.
   - Fix overlap, text fit, color dominance, and viewport framing.

## TODO Candidates

These should become implementation tasks when the redesign starts:

- Create CAD design token set and remove purple as global identity.
- Add product-specific CAD component primitives over shadcn.
- Redesign viewport header and toolbar so the 3D model dominates.
- Convert new job composer into a CAD spec builder.
- Consolidate inspector tabs into fewer task-oriented modes.
- Add export readiness checklist and accessible validation summaries.
- Add responsive review mode for mobile.
- Run visual QA screenshots after implementation.

## Approved Mockups

No mockups were generated. The gstack designer binary was unavailable in this environment.

## Completion Summary

```text
+====================================================================+
|         DESIGN PLAN REVIEW - COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | No DESIGN.md existed; UI scope is full app   |
| Step 0               | 4/10 initial rating, full review selected    |
| Pass 1  (Info Arch)  | 5/10 -> 9/10 after fixes                    |
| Pass 2  (States)     | 6/10 -> 9/10 after fixes                    |
| Pass 3  (Journey)    | 5/10 -> 9/10 after fixes                    |
| Pass 4  (AI Slop)    | 4/10 -> 9/10 after fixes                    |
| Pass 5  (Design Sys) | 3/10 -> 9/10 after fixes                    |
| Pass 6  (Responsive) | 5/10 -> 9/10 after fixes                    |
| Pass 7  (Decisions)  | 6 resolved, 4 deferred                     |
+--------------------------------------------------------------------+
| NOT in scope         | written (5 items)                           |
| What already exists  | written                                     |
| TODOS.md updates     | 8 candidates proposed                       |
| Approved Mockups     | 0 generated, 0 approved                     |
| Decisions made       | 6 added to plan                             |
| Decisions deferred   | 4 listed                                    |
| Overall design score | 4/10 -> 9/10                                |
+====================================================================+
```

Plan is design-complete enough to implement. Run visual design exploration or screenshot QA before calling it final.

