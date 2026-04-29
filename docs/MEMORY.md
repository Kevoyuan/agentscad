# AgentSCAD Memory

AgentSCAD uses explicit product memory instead of opaque chat history. The goal is to make every model response, user edit, artifact, and validation result inspectable.

## Memory Types

| Memory type | Stored data | Purpose |
|---|---|---|
| Working memory | Current `Job` fields: state, request, part family, parameters, SCAD source, render paths, validation results, execution logs | Lets the pipeline resume, retry, repair, and render the current CAD job deterministically. |
| Episodic memory | `JobVersion` rows for parameter, SCAD source, and note edits | Gives the workspace an audit trail of what changed, who changed it, and when. |
| Artifact memory | `public/artifacts/{jobId}/model.scad`, `model.stl`, `preview.png`, and report paths | Keeps generated CAD outputs inspectable outside the model response. |
| Skill memory | Markdown skills, per-family schemas, library policy manifest, and in-process skill/schema caches | Makes CAD behavior editable as files while keeping prompt contracts stable at runtime. |
| Learned memory | `skills/scad-generation/learned-patterns.json` generated from user edit analysis | Feeds recurring user corrections back into future generation prompts as optional guidance. |

## Learning Loop

The learning loop is deliberately conservative:

1. User edits are tracked by `trackVersion()`.
2. `POST /api/cron` can run `analyze-edits`.
3. `src/lib/improvement-analyzer.ts` extracts parameter drift, common SCAD patches, and repeated validation failures.
4. `src/lib/skill-resolver.ts` injects learned patterns into future generation prompts for the same part family.

Learned patterns improve defaults and guidance, but they do not override deterministic validation or runtime contracts.

Learned memory is prompt-time guidance, not automatic retraining and not an override for rendering, mesh checks, visual validation, or human review.

## Design Principles

- Memory should be inspectable in database rows, generated artifacts, or versioned files.
- Artifact files should remain useful outside the model response.
- User edits are signal, but not automatic truth; learned patterns are guidance until validated.
- Deterministic render and validation results remain the authority for delivery.

## Important Files

- `prisma/schema.prisma`: job and version data model.
- `src/lib/version-tracker.ts`: field-level version tracking.
- `src/lib/improvement-analyzer.ts`: edit and validation pattern analysis.
- `src/lib/skill-resolver.ts`: skill loading and learned-pattern injection.
- `skills/scad-generation/learned-patterns.json`: generated learned memory.
- `public/artifacts/{jobId}/`: generated SCAD, STL, preview, and reports.
