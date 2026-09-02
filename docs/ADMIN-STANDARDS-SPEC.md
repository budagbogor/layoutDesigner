# ADMIN STANDARDS MANAGER

## Principle
All configurable dimensions/rules live here.

## Categories
1. Site
2. Building
3. Structural placeholder parameters
4. Vehicle
5. Service bay
6. Equipment
7. Clearance
8. Circulation
9. Accessibility
10. Safety
11. Zoning
12. CAD
13. Scoring

## Parameter fields
- key
- label
- value
- unit
- min
- max
- constraint level
- source type
- source reference
- description
- active
- version

## Source types
- Regulation
- SNI
- Manufacturer
- Engineering
- Mobeng Internal
- Custom
- Demo

## Version lifecycle
DRAFT -> TEST -> PUBLISHED -> ARCHIVED

Published versions are immutable.

## Admin actions
- create
- edit draft
- clone version
- test
- publish
- archive
- compare versions
- inspect audit log

## Security
Only SUPER_ADMIN/ADMIN can modify standards.
Designer and Viewer are read-only.
