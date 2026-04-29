# Third-Party Notices

AgentSCAD is MIT licensed. The following reviewed third-party components have additional notice or distribution obligations.

## Weak Copyleft Components

| Component | License | Use | Compliance note |
| --- | --- | --- | --- |
| MCAD | LGPL-2.1 | Optional/default managed OpenSCAD library for units and gears | Preserve upstream license files when installing or distributing the managed OpenSCAD library bundle. |
| sharp libvips packages (`@img/sharp-libvips-*`) | LGPL-3.0-or-later | Prebuilt libvips binary dependency used by `sharp` | Preserve license notices when distributing packaged builds, containers, or offline bundles. Do not prevent replacement of the LGPL library. |

## GPL Policy

GPL and AGPL dependencies must not be included in the default dependency tree or default managed OpenSCAD library install.

NopSCADlib is cataloged as an explicit opt-in GPL-3.0 OpenSCAD library. It must remain excluded from default installs and product bundles unless a human approves the distribution model and preserves the upstream license notices.
