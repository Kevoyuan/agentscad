# CAD Agent Frontend Design System

Inspired by the operational clarity of Sentry, adapted for a CAD job orchestration product.

## 1. Visual Theme & Atmosphere

This product should feel like an engineering control room, not a generic SaaS dashboard and not a glossy marketing site. The interface needs to communicate three things at once:

- serious technical capability
- high observability across the job pipeline
- confidence in delivery artifacts

The overall mood is dark, precise, and slightly luminous. Backgrounds should sit in deep purple-black rather than pure black so logs, cards, and status chips feel layered and alive. The UI should feel like a place where people submit CAD requests, inspect generation progress, diagnose failures, and download deliverables.

The visual metaphor is "debugging and shipping physical geometry." That means:

- dense but readable data panels
- strong pipeline state visualization
- obvious differentiation between healthy, blocked, and delivered states
- code and artifact views treated as first-class surfaces

## 2. Color Palette & Roles

### Core Surfaces

- `bg.app = #1f1633` — main app background
- `bg.deep = #150f23` — sidebar, header, modal backdrops
- `bg.panel = #241a3d` — cards and module surfaces
- `border.default = #362d59` — default borders and dividers
- `border.strong = #584674` — active panels, selected states

### Text

- `text.primary = #ffffff` — primary text on dark surfaces
- `text.secondary = #d7d3e3` — supporting text
- `text.muted = #a89fbd` — metadata, timestamps, captions
- `text.code = #dcdcaa` — code-highlight accent

### Functional Accents

- `accent.primary = #6a5fc1` — primary actions, active tabs, links
- `accent.primary-strong = #422082` — selected controls, active filter pills
- `accent.success = #c2ef4e` — delivered, accepted, all-green validation
- `accent.warning = #ffb287` — warnings, retrying, degraded quality
- `accent.error = #fa7faa` — failed validation, blocked jobs, destructive UI
- `accent.info = #8cc9ff` — neutral progress and helper highlights

### Usage Rules

- use lime green only for true success or high-confidence completion
- use pink/coral only for failures, warnings, or attention moments
- avoid rainbow status systems; every color must map to system meaning

## 3. Typography Rules

### Font Stack

- Display: `Space Grotesk`, `Rubik`, `system-ui`, sans-serif
- UI: `Rubik`, `Inter`, `system-ui`, sans-serif
- Monospace: `Monaco`, `Menlo`, `JetBrains Mono`, monospace

### Hierarchy

- Hero / page title: 48-64px, weight 700, tight line-height
- Section title: 24-30px, weight 600
- Card title: 18-20px, weight 600
- Body: 15-16px, weight 400
- Small metadata: 12-13px, weight 500
- Code / logs: 13-14px monospace

### Label Treatment

Buttons, pipeline labels, table headers, and status chips should use uppercase text with light tracking. This gives the interface a strong operational feel without becoming noisy.

## 4. Component Stylings

### App Shell

- left rail for navigation and quick filters
- top bar for global actions, job search, and environment state
- content area built from stacked operational modules

### Cards

- background: `bg.panel`
- border: `1px solid border.default`
- radius: `10px`
- shadow: subtle dark elevation, purple-tinted rather than gray

Cards should feel like instrument panels, not soft lifestyle tiles.

### Buttons

Primary:

- background: `accent.primary`
- text: white
- border: `1px solid border.strong`
- radius: `12px`
- subtle inset shadow to feel tactile

Secondary:

- dark panel background
- white text
- purple border

Ghost:

- transparent background
- muted text
- stronger border on hover

### Inputs

- dark surfaces by default, not white inputs
- strong focus ring using `accent.primary`
- monospace for code-oriented fields where useful

### Status Chips

- `NEW`, `PROCESSING`, `DEBUGGING`, `REPAIRING`, `VALIDATING`, `ACCEPTED`, `DELIVERED`, `HUMAN_REVIEW`, `CANCELLED`
- each state gets a tinted background plus compact uppercase label
- chips should be readable at table scale and card scale

### Logs and Code

- monospace
- line wrapping optional, default to horizontal scroll
- failed lines or events get left-edge accent markers
- validation failures should be visibly scannable, not hidden in prose

## 5. Product-Specific Layout Principles

The first useful screen should be a job operations dashboard, not a marketing homepage.

### Recommended IA

1. Request composer
2. Active jobs table or board
3. Job detail workspace
4. Artifact preview and downloads
5. Validation and retry history
6. Delivery report view

### Job Detail Workspace

Use a split or tabbed layout:

- left: request, spec, selected template, pipeline history
- center: generated OpenSCAD, render preview, STL/PNG artifacts
- right: validation summary, failures, repair suggestions, report metadata

### Density

- medium-high density is preferred
- avoid oversized hero sections on authenticated screens
- optimize for scanning many jobs and drilling into one

## 6. Data Visualization & States

### Pipeline Visualization

Represent the orchestration flow as a horizontal or vertical state rail:

`INTAKE -> TEMPLATE -> GENERATION -> EXECUTION -> VALIDATION -> DEBUG -> REPORT -> DELIVERED`

Each node should show:

- current state
- completion / failure
- timestamp
- retry count where relevant

### Validation Summary

Show pass/fail counts prominently. Critical failures should always surface above non-critical warnings.

### Artifact Confidence

When a job reaches delivery, the UI should visually shift toward success:

- green accents become available
- download actions become primary
- report panel gains emphasis

## 7. Motion & Feedback

- keep motion tight and fast
- use subtle opacity and elevation transitions
- animate pipeline progress and artifact availability
- avoid decorative floating effects

Good motion here should feel like a terminal or CI system updating in real time.

## 8. Responsive Behavior

### Desktop First

Primary target is desktop and laptop because this is an operational tool.

### Mobile Strategy

- stack panels vertically
- collapse job detail into tabs
- preserve status clarity and artifact actions
- avoid multi-column analytics layouts on small screens

## 9. Do's and Don'ts

### Do

- design like a serious engineering product
- make job state obvious within one glance
- emphasize logs, artifacts, validation, and delivery
- use purple-black depth instead of flat charcoal
- let success green mean something important

### Don't

- don't make it look like a generic AI landing page
- don't overuse gradients in core app surfaces
- don't hide operational data behind excessive whitespace
- don't use pure black or pure neon everywhere
- don't make artifact delivery feel secondary to prompt input

## 10. Frontend Prompt Guide

When generating UI for this project, prefer prompts like:

- build an authenticated CAD operations dashboard using this DESIGN.md
- create a dark engineering control panel for CAD job orchestration
- design a job detail screen with request, code, validation, and artifact delivery panes
- make the interface feel like a blend of Sentry-style observability and CAD production workflow
