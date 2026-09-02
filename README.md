# Mobeng Workshop CAD Designer — Master Build Pack

## Product
A web-based parametric CAD-like workshop layout designer for automotive workshops.

## Core principle
The application must NOT use an image generator as the source of truth for geometry.
The source of truth is a structured JSON layout model rendered as SVG.

AI may:
- interpret natural-language requests,
- analyze a layout,
- suggest improvements,
- generate candidate changes,
- create visualizations from an approved layout.

AI must not silently change dimensions, object counts, positions, or constraints.

## Recommended build order
1. Local JSON prototype
2. SVG CAD editor
3. Geometry / collision / clearance engine
4. Validation and scoring
5. Admin Standards Manager
6. PDF/DXF export
7. DWG conversion service
8. AI assistant
9. Backend integration (InsForge or Supabase)
10. Authentication, audit, versioning, production hardening

## Important
All dimensions and rules must be data-driven and editable by authorized Admin users.
No operational or technical standard should be hard-coded in the geometry engine.

This package is a product/engineering specification, not stamped architectural construction documentation.
Final regulatory, structural, fire-safety, accessibility, MEP, and permitting decisions require qualified professionals and applicable local requirements.
