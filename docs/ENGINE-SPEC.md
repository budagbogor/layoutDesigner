# WORKSHOP LAYOUT ENGINE V1

## 1. Coordinate system
- Internal unit: meter
- Origin: bottom-left of building
- X: horizontal
- Y: vertical
- Rotation: degrees
- Angles: 0 degrees points along +X

## 2. Geometry primitives
- point
- line
- polyline
- rectangle
- circle
- polygon
- arc

## 3. Object types
- site
- building
- wall
- column
- door
- window
- service_bay
- equipment
- vehicle
- zone
- circulation_path
- safety_area
- dimension
- text

## 4. Object envelopes
Each relevant object can expose:
- physical geometry
- working envelope
- safety envelope
- access envelope
- vehicle envelope

## 5. Validation
HARD:
- outside building/site boundary
- forbidden collision
- required equipment overlap
- blocked entrance/exit
- impossible required access
- critical circulation failure

WARNING:
- reduced preferred clearance
- low efficiency
- customer-flow inefficiency

INFO:
- optimization suggestions

## 6. Generator
Candidate generation should use deterministic heuristics first:
1. fixed objects
2. zoning
3. service bay packing
4. equipment adjacency
5. circulation
6. clearance
7. validation
8. optimization

## 7. Candidate search
Start with 3 candidates:
- CAPACITY
- BALANCED
- PREMIUM FLOW

Future versions can use randomized/heuristic search, genetic algorithms, or constraint solvers.

## 8. Scoring
Default conceptual weights:
- vehicle flow 25
- space efficiency 20
- capacity 15
- equipment access 10
- technician flow 10
- customer flow 5
- safety 10
- future expansion 5

These are NOT fixed. They must be editable by Admin.

## 9. Important rule
A candidate with a HARD violation cannot be the recommended winner regardless of score.

## 10. Output
The engine returns:
- layout JSON
- validation report
- score breakdown
- dimensions
- object list
- standard version reference
