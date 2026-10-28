# Tracker wireframes

45 screen/state wireframes and eight user journeys, derived from `docs/SPECIFICATION.md` and `docs/DESIGN.md`.

## Penpot pages

1. User flows — access, planning, execution, GitHub, agents, files/recovery, archive/deletion, search/navigation.
2. Access and planning — A01–A08.
3. Work and execution — E01–E08.
4. Search notes and files — C01–C06.
5. Settings and integrations — S01–S09.
6. Recovery and safeguards — R01–R08.
7. Mobile — M01–M06, 390 × 844 viewports.

The SVG sheets import as editable vectors with nested screen groups. Screen IDs connect the flow map to the wireframes. These are structural wireframes and a documented flow map; clickable prototype interactions are not configured. Sample references, repository names and credential placeholders are illustrative.

Regenerate sources with `python3 design/penpot/flows.py`; this also regenerates screen sheets and validates SVG XML and screen coverage. The inventory contains every screen ID, name and behavior annotation.

## Delivery status

Verified in the Penpot editor: the eight-journey flow map and pages 02–05 (31 screen/state wireframes). Recovery (8) and mobile (6) SVGs are complete locally, but their import was not verified: the native file picker repeatedly kept Open disabled, and the editor subsequently displayed a blank loading surface after reload. A recovery page title and an extra empty page may exist from the interrupted import attempts. Clickable prototype interactions are not configured.
