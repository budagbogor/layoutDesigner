# CODING AGENT INSTRUCTIONS

You are implementing Mobeng Workshop CAD Designer.

## Non-negotiable rules
1. TypeScript strict mode.
2. Geometry engine must be pure and deterministic.
3. Do not hard-code workshop standards in geometry logic.
4. Standards must be loaded from data/repository interfaces.
5. Keep backend-specific code outside domain logic.
6. Every geometry mutation must be undoable.
7. Every mutation must trigger validation.
8. Do not let AI directly mutate geometry without validation.
9. Preserve units in meter internally.
10. Never fake DWG by changing a file extension.

## Development sequence
Implement one phase at a time.
Write unit tests for geometry before building advanced UI.

## First milestone
Create a working page that:
- loads demo-project.json,
- draws 18x25 m building,
- shows grid,
- lets user add/move/resize rectangles,
- snaps to grid,
- shows X/Y/W/L,
- supports undo/redo,
- runs boundary collision validation,
- exports SVG.

Do not implement backend yet.
Do not implement AI image generation yet.
