# SYSTEM ARCHITECTURE

## Principle
Geometry is the source of truth.

UI -> Layout State -> Geometry Engine -> Validation -> Renderer/Export

AI is an assistant layer, not the geometry authority.

## Layers

### Presentation
- Next.js
- React
- SVG canvas
- Toolbar
- Layers panel
- Properties panel
- Validation panel

### Application
- project service
- layout service
- standards service
- export service
- AI command service

### Domain
- geometry
- collision
- clearance
- circulation
- zoning
- rules
- scoring
- optimization

### Data
Prototype:
- JSON files
- localStorage

Production:
- InsForge or Supabase
- object storage for exported files

## Data flow

User input
 -> project JSON
 -> active standard snapshot
 -> layout generator
 -> candidates
 -> validator
 -> scoring
 -> approved layout
 -> SVG
 -> PDF/DXF
 -> DWG conversion
 -> AI visualization

## Backend portability
All domain logic must remain independent from backend SDKs.
Do not import Supabase/InsForge clients into the geometry engine.
Use repository interfaces such as:
- ProjectRepository
- StandardRepository
- EquipmentRepository
- LayoutRepository
- AuditRepository

This allows backend replacement without rewriting the engine.
