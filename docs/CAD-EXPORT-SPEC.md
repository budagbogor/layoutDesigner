# CAD EXPORT SPECIFICATION

## SVG
Source vector representation.

## PDF
Professional technical drawing:
- A3/A4/A2 configurable
- portrait/landscape
- scale 1:50, 1:75, 1:100, etc.
- title block
- layers translated to drawing conventions
- dimensions
- revision
- project metadata

## DXF
Preferred first CAD interchange format.
Must preserve:
- units
- layers
- lines/polylines
- blocks where supported
- text
- dimensions where supported

## DWG
DWG is a proprietary CAD format.
Do not create DWG by renaming DXF.

Implement a dedicated conversion service/provider abstraction:
CadConverter.convert(inputFile, targetFormat="DWG")

The provider can be selected later based on licensing, deployment environment, and required compatibility.

The application should store:
- source DXF
- conversion status
- provider
- provider version
- resulting DWG
- conversion log

## Export validation
Before export:
- layout must be valid or user must explicitly export with warnings
- dimensions must be resolved
- units must be known
- all layers must have valid names
