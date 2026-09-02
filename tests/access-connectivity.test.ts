import { describe, it, expect } from 'vitest';
import {
  isAccessConnected,
  validateApproachConnection,
  validateAccessPointConnection,
} from '@/domain/engine/spatial/accessConnectivity';
import {
  calculateAisleEnvelope,
  calculateApproachEnvelope,
} from '@/domain/engine/spatial/aisleCalculator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { LayoutObject } from '@/domain/models/project';
import type { AccessPoint } from '@/domain/engine/types';

describe('Milestone 2.3 — Spatial Foundation & Access Connectivity Validation', () => {
  const completeStandard: WorkshopStandard = {
    id: 'mobeng-std-conn-test',
    name: 'Mobeng Connectivity Test',
    version: '1.0-test',
    status: 'published',
    parameters: [
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
      { key: 'circulation.bay_approach_depth', value: 3.5, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [
      { id: 'FLOW-001', name: 'Path Continuity', severity: 'HARD', active: true },
    ],
  };

  const building = { width: 18.0, length: 25.0 };

  describe('1. Approach Connection to Aisle', () => {
    it('confirms approach corridor connects service bay to drive aisle', () => {
      const accessor = new StandardAccessor(completeStandard);

      // Central vertical drive aisle spans X: [0, 6.0], Y: [0, 25.0]
      const aisle = calculateAisleEnvelope(
        { id: 'aisle-main', origin: { x: 0, y: 0 }, length: 25.0, rotation: 0 },
        accessor
      );

      // Service bay located at (2.0, 8.0)
      const bay: LayoutObject = {
        id: 'bay-01',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: { x: 2.0, y: 8.0, width: 4.0, length: 7.0, rotation: 0 },
      };

      // Front approach corridor (depth 3.5m) spans from Y = 8.0 down to Y = 4.5 at X: [2.0, 6.0]
      // This directly intersects the drive aisle (which covers X: [0, 6.0], Y: [0, 25.0])!
      const approach = calculateApproachEnvelope(
        { id: 'bay-01-app', targetGeometry: bay.geometry, direction: 'front' },
        accessor
      );

      const result = validateApproachConnection(bay, approach, aisle);

      expect(result.isConnected).toBe(true);
      expect(result.gapMeters).toBe(0);
      expect(result.reason).toContain('successfully connects');
      expect(result.sourceId).toBe('bay-01');
      expect(result.targetId).toBe('envelope-aisle-aisle-main');
    });

    it('detects disconnected approach corridor that fails to reach drive aisle', () => {
      const accessor = new StandardAccessor(completeStandard);

      // Drive aisle located at X: [0, 6.0], Y: [0, 25.0]
      const aisle = calculateAisleEnvelope(
        { id: 'aisle-far', origin: { x: 0, y: 0 }, length: 25.0, rotation: 0 },
        accessor
      );

      // Service bay located far to the right at X = 12.0
      const bay: LayoutObject = {
        id: 'bay-far',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: { x: 12.0, y: 8.0, width: 4.0, length: 7.0, rotation: 0 },
      };

      // Front approach corridor spans X: [12.0, 16.0], Y: [4.5, 8.0]
      // Gap between X = 6.0 and X = 12.0 is 6.0 meters!
      const approach = calculateApproachEnvelope(
        { id: 'bay-far-app', targetGeometry: bay.geometry, direction: 'front' },
        accessor
      );

      const result = validateApproachConnection(bay, approach, aisle);

      expect(result.isConnected).toBe(false);
      expect(result.gapMeters).toBe(6.0);
      expect(result.reason).toContain('does not reach');
    });
  });

  describe('2. Access Point Connection to Circulation Corridor', () => {
    it('confirms vertical drive aisle connects to a valid south entrance door', () => {
      const accessor = new StandardAccessor(completeStandard);

      // South door at X: 2.0, width 4.5m along south wall (Y = 0)
      const southDoor: AccessPoint = {
        id: 'door-south-in',
        type: 'entrance',
        wall: 'south',
        offsetMeters: 2.0,
        widthMeters: 4.5,
      };

      // Drive aisle running from South wall (Y = 0) to North wall (Y = 25.0) at X = 2.0
      const aisle = calculateAisleEnvelope(
        { id: 'aisle-vertical', origin: { x: 2.0, y: 0 }, length: 25.0, rotation: 0 },
        accessor
      );

      const result = validateAccessPointConnection(southDoor, building, aisle);

      expect(result.isConnected).toBe(true);
      expect(result.gapMeters).toBe(0);
      expect(result.sourceId).toBe('door-south-in');
      expect(result.reason).toContain('properly connected');
    });

    it('detects access corridor that stops short of reaching access point', () => {
      const accessor = new StandardAccessor(completeStandard);

      // North exit door along north wall (Y = 25.0)
      const northDoor: AccessPoint = {
        id: 'door-north-out',
        type: 'exit',
        wall: 'north',
        offsetMeters: 5.0,
        widthMeters: 4.0,
      };

      // Aisle placed at origin (5.0, 0), length 15.0m (stops 10 meters short of North wall at Y = 25.0!)
      const aisle = calculateAisleEnvelope(
        { id: 'aisle-short', origin: { x: 5.0, y: 0 }, length: 15.0, rotation: 0 },
        accessor
      );

      const result = validateAccessPointConnection(northDoor, building, aisle);

      expect(result.isConnected).toBe(false);
      expect(result.gapMeters).toBeCloseTo(10.0, 2);
      expect(result.reason).toContain('does not reach access point');
    });

    it('returns structured invalid result when access point is missing without inventing geometry', () => {
      const accessor = new StandardAccessor(completeStandard);

      const aisle = calculateAisleEnvelope(
        { id: 'aisle-1', origin: { x: 0, y: 0 }, length: 18.0, rotation: 0 },
        accessor
      );

      // Pass undefined access point
      const result = validateAccessPointConnection(undefined, building, aisle);

      expect(result.isConnected).toBe(false);
      expect(result.reason).toContain('Access point is undefined or missing');
      expect(result.reason).toContain('engine cannot invent access doors');
    });
  });

  describe('3. Rotated Geometry Connectivity', () => {
    it('validates approach connectivity when service bay is rotated', () => {
      const accessor = new StandardAccessor(completeStandard);

      // Aisle at X: [0, 6.0], Y: [0, 25.0]
      const aisle = calculateAisleEnvelope(
        { id: 'aisle-vert', origin: { x: 0, y: 0 }, length: 25.0, rotation: 0 },
        accessor
      );

      // Service bay placed at (10.0, 10.0) with rotation 270 (facing left toward aisle)
      // Rotated 270: local front threshold (-Y) points along -X towards X = 0!
      const rotatedBay: LayoutObject = {
        id: 'bay-rot',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: { x: 8.0, y: 10.0, width: 4.0, length: 7.0, rotation: 270 },
      };

      // Approach corridor (depth 3.5m) projects from X = 8.0 down to X = 4.5
      // This reaches inside the aisle [0, 6.0] at X: [4.5, 6.0]!
      const approach = calculateApproachEnvelope(
        { id: 'bay-rot-app', targetGeometry: rotatedBay.geometry, direction: 'front' },
        accessor
      );

      const result = validateApproachConnection(rotatedBay, approach, aisle);

      expect(result.isConnected).toBe(true);
      expect(result.gapMeters).toBe(0);
    });
  });

  describe('4. Determinism & Immutability', () => {
    it('produces 100% deterministic validation results across multiple runs', () => {
      const accessor = new StandardAccessor(completeStandard);

      const aisle = calculateAisleEnvelope(
        { id: 'aisle-main', origin: { x: 0, y: 0 }, length: 25.0, rotation: 0 },
        accessor
      );
      const bay: LayoutObject = {
        id: 'bay-01',
        type: 'service_bay',
        layer: '08-SERVICE-BAY',
        geometry: { x: 2.0, y: 8.0, width: 4.0, length: 7.0, rotation: 0 },
      };
      const approach = calculateApproachEnvelope(
        { id: 'bay-01-app', targetGeometry: bay.geometry, direction: 'front' },
        accessor
      );

      const run1 = validateApproachConnection(bay, approach, aisle);
      const run2 = validateApproachConnection(bay, approach, aisle);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('does not mutate input objects, envelopes, or access points', () => {
      const accessor = new StandardAccessor(completeStandard);

      const door: AccessPoint = {
        id: 'door-1',
        type: 'entrance',
        wall: 'south',
        offsetMeters: 2.0,
        widthMeters: 4.0,
      };
      const aisle = calculateAisleEnvelope(
        { id: 'a1', origin: { x: 2.0, y: 0 }, length: 20.0, rotation: 0 },
        accessor
      );

      const doorBefore = JSON.stringify(door);
      const aisleBefore = JSON.stringify(aisle);

      validateAccessPointConnection(door, building, aisle);

      expect(JSON.stringify(door)).toBe(doorBefore);
      expect(JSON.stringify(aisle)).toBe(aisleBefore);
    });
  });
});
