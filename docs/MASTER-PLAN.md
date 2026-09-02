# MOBENG WORKSHOP CAD DESIGNER — MASTER PLAN
Version 1.0 — 2026-09-02

## Vision
Build a desktop-first web application for parametric automotive workshop planning. Geometry is the source of truth; AI is an assistant/visualization layer.

## Product modules
1. Project Management
2. Site & Building Setup
3. Workshop Program
4. Equipment Library
5. Vehicle Library
6. Standards Manager
7. Rule Engine
8. Parametric CAD Editor
9. Layout Generator
10. Collision/Clearance Engine
11. Vehicle Circulation Engine
12. Validation
13. Optimization & Scoring
14. Revision Management
15. Export Center
16. AI CAD Assistant
17. Visualization
18. Backend/Auth/Audit

## Roles
SUPER_ADMIN: full access.
ADMIN: standards, equipment, vehicles, rules, scoring, templates, blocks, audit.
DESIGNER: projects, layouts, generation, editing, validation, exports.
VIEWER: read-only access and permitted exports.

## Standards architecture
No workshop standard is hard-coded in the geometry engine. Parameters contain key, value, unit, min/max, constraint level, source, version and status.

Source hierarchy:
1. Regulation/Law
2. SNI/official standard
3. Manufacturer specification
4. Engineering standard
5. Mobeng internal standard
6. Custom project standard

Published standard versions are immutable. Projects reference a specific version.

## Geometry
Internal unit: meter. Origin bottom-left of building. X horizontal, Y vertical, rotation in degrees.

Objects: wall, column, door, window, service bay, equipment, vehicle, zone, circulation path, safety area, dimension, text.

Relevant objects can expose physical, working, safety, access and vehicle envelopes.

## Generation
Boundary → fixed objects → zones → service bays → equipment → envelopes → vehicle circulation → validation → candidate generation → scoring → recommendation.

Initial candidates: Capacity, Balanced, Premium Flow. Hard violations disqualify candidates.

## Validation
HARD = invalid. WARNING = requires attention. INFO = advisory. Every finding identifies affected object, required/available values, difference, rule/source and suggested correction.

## CAD editor
Select, pan, zoom, move, copy, rotate, mirror, delete, line, polyline, rectangle, circle, wall, door, window, column, insert block, dimension, text, measure, area, grid, snap, undo, redo.

## Layers
00-GRID, 01-WALL, 02-COLUMN, 03-DOOR, 04-WINDOW, 05-VEHICLE, 06-LIFT, 07-EQUIPMENT, 08-SERVICE-BAY, 09-DIMENSION, 10-TEXT, 11-CIRCULATION, 12-SAFETY, 13-UTILITY, 14-REFERENCE.

## Export
SVG native vector. PDF with paper/scale/title block/revision. DXF with units/layers/geometry. DWG through a real conversion provider; never fake DWG by renaming DXF.

## AI
AI may interpret natural-language commands, analyze layouts, suggest changes, explain validation and prepare visualization prompts. AI must not silently mutate geometry. Proposed changes must be structured and validated before application.

## Backend
Prototype: JSON/localStorage. Production: InsForge or Supabase. Use repository interfaces so domain logic remains backend-independent.

## Roadmap
Phase 0 Specification → Phase 1 CAD Core → Phase 2 Geometry Engine → Phase 3 Workshop Generator → Phase 4 Admin Standards → Phase 5 PDF/DXF → Phase 6 DWG adapter → Phase 7 AI Assistant → Phase 8 Backend → Phase 9 Production hardening.

## MVP
Create project → enter dimensions → choose requirements → generate → edit → dimension → validate → score → export SVG/PDF/DXF. Admin can manage standards, parameters, equipment, rules, scoring, versions and audit.

## Professional boundary
This is a planning/design tool, not stamped architectural, structural, fire-safety, MEP, accessibility or permitting documentation. Final construction decisions require qualified professional verification.
