import { describe, it, expect } from 'vitest';
import { analyzeVehicleFlow, VehicleFlowAnalysisResult, FlowCandidateInput } from '@/domain/engine/flow/vehicleFlowFoundation';
import { CandidateGenerator, GeneratedCandidateLayout } from '@/domain/engine/generator/candidateGenerator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import demoStandardFixture from '../data/demo-standard.json';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { LayoutEngineInput, ObjectEnvelope } from '@/domain/engine/types';

describe('M2B.5 — Vehicle-to-Bay Flow Foundation', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);
  const generator = new CandidateGenerator();

  const standardConnectedInput: LayoutEngineInput = {
    site: { width: 50, length: 40, roadSide: 'south' },
    building: { width: 45, length: 30, frontSetbackMeters: 5 },
    accessPoints: [
      { id: 'ap-entry-01', type: 'entrance', wall: 'south', offsetMeters: 20, widthMeters: 4.0 },
      { id: 'ap-exit-01', type: 'exit', wall: 'north', offsetMeters: 20, widthMeters: 4.0 },
    ],
    program: {
      bays: [
        { serviceType: 'general_service', quantity: 2 },
        { serviceType: 'wheel_alignment', quantity: 1 },
      ],
      equipment: [],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: true,
      futureExpansionBays: 0,
    },
  };

  // ---------------------------------------------------------------------------
  // 1. Connected 3-Bay Layout
  // ---------------------------------------------------------------------------
  describe('1. Connected 3-Bay Layout', () => {
    it('1. verifies structural connectivity is FLOW_VALID and overall state is FLOW_WARNING', () => {
      const candidate = generator.generate(standardConnectedInput, accessor);
      expect(candidate.status).toBe('VALID');

      const flow = analyzeVehicleFlow(standardConnectedInput, candidate, accessor);
      expect(flow.isConnected).toBe(true);
      expect(flow.structuralState).toBe('FLOW_VALID');
      expect(flow.overallState).toBe('FLOW_WARNING'); // Warning due to unknown maneuverability
      expect(flow.bayConnectivity).toHaveLength(3);
      expect(flow.bayConnectivity.every((b) => b.isFullyConnected)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Disconnected Bay
  // ---------------------------------------------------------------------------
  describe('2. Disconnected Bay Handling', () => {
    it('2. detects and classifies structurally disconnected bay as FLOW_DISCONNECTED', () => {
      const candidate = generator.generate(standardConnectedInput, accessor);
      // Artificially remove ACCESS envelope for bay-01 to simulate disconnection
      const disconnectedCandidate: GeneratedCandidateLayout = {
        ...candidate,
        envelopes: candidate.envelopes.filter(
          (e) => !(e.type === 'ACCESS' && e.sourceObjectId === 'bay-01')
        ),
      };

      const flow = analyzeVehicleFlow(standardConnectedInput, disconnectedCandidate, accessor);
      expect(flow.isConnected).toBe(false);
      expect(flow.structuralState).toBe('FLOW_DISCONNECTED');
      expect(flow.overallState).toBe('FLOW_DISCONNECTED');

      const bay01Flow = flow.bayConnectivity.find((b) => b.bayId === 'bay-01');
      expect(bay01Flow?.isFullyConnected).toBe(false);
      expect(flow.diagnostics.some((d) => d.ruleId === 'FLOW-BAY-001' && d.isDisqualifying)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Entry Connected to Workshop Circulation
  // ---------------------------------------------------------------------------
  describe('3. Entry Point Connectivity', () => {
    it('3. verifies entry door properly reaches drive aisle and flags disconnected door', () => {
      const candidate = generator.generate(standardConnectedInput, accessor);
      const flow = analyzeVehicleFlow(standardConnectedInput, candidate, accessor);
      expect(flow.entryConnectivity.isConnected).toBe(true);
      expect(flow.entryConnectivity.connectedAccessPointIds).toContain('ap-entry-01');

      // Test with disconnected entry point far away from drive aisle
      const disconnectedEntryInput: LayoutEngineInput = {
        ...standardConnectedInput,
        accessPoints: [
          { id: 'ap-entry-far', type: 'entrance', wall: 'south', offsetMeters: 2, widthMeters: 3.5 },
        ],
      };

      const disconnectedFlow = analyzeVehicleFlow(disconnectedEntryInput, candidate, accessor);
      expect(disconnectedFlow.entryConnectivity.disconnectedAccessPointIds).toContain('ap-entry-far');
      expect(disconnectedFlow.diagnostics.some((d) => d.ruleId === 'FLOW-ENTRY-001')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Missing Exit Representation (Back-Out / Shared Egress)
  // ---------------------------------------------------------------------------
  describe('4. Missing Dedicated Exit Representation', () => {
    it('4. handles layouts without dedicated exit doors cleanly without inventing fake rear exits', () => {
      const backOutInput: LayoutEngineInput = {
        ...standardConnectedInput,
        accessPoints: [
          { id: 'ap-bidirectional', type: 'bidirectional', wall: 'south', offsetMeters: 20, widthMeters: 4.5 },
        ],
        program: {
          ...standardConnectedInput.program,
          circulationRequirement: 'back_out_turnaround',
        },
      };

      const candidate = generator.generate(backOutInput, accessor);
      const flow = analyzeVehicleFlow(backOutInput, candidate, accessor);

      expect(flow.exitConnectivity.hasExplicitExit).toBe(false);
      expect(flow.exitConnectivity.isConnected).toBe(true); // Bidirectional entry provides valid egress
      expect(flow.isConnected).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Valid Shared Circulation across Canonical Bay Types
  // ---------------------------------------------------------------------------
  describe('5. Valid Shared Circulation Across Canonical Bay Types', () => {
    it('5. confirms Spooring Bay, Service Bay, and General Repair Bay all connect to shared central drive aisle', () => {
      const mixedBayInput: LayoutEngineInput = {
        ...standardConnectedInput,
        program: {
          ...standardConnectedInput.program,
          bays: [
            { serviceType: 'wheel_alignment', quantity: 1 }, // SPOORING_BAY
            { serviceType: 'general_service', quantity: 1 },  // SERVICE_BAY
            { serviceType: 'general_repair', quantity: 1 },   // GENERAL_REPAIR_BAY
          ],
        },
      };

      const candidate = generator.generate(mixedBayInput, accessor);
      expect(candidate.status).toBe('VALID');

      const flow = analyzeVehicleFlow(mixedBayInput, candidate, accessor);
      expect(flow.bayConnectivity).toHaveLength(3);
      for (const bay of flow.bayConnectivity) {
        expect(bay.hasApproachConnection).toBe(true);
        expect(bay.hasCirculationConnection).toBe(true);
        expect(bay.isFullyConnected).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. North vs South Road Orientation Flow
  // ---------------------------------------------------------------------------
  describe('6. North / South Orientation Flow', () => {
    it('6. establishes deterministic flow connectivity regardless of whether road is North or South', () => {
      const northInput: LayoutEngineInput = {
        ...standardConnectedInput,
        site: { ...standardConnectedInput.site, roadSide: 'north' },
        accessPoints: [
          { id: 'ap-north-entry', type: 'entrance', wall: 'north', offsetMeters: 20, widthMeters: 4.0 },
          { id: 'ap-south-exit', type: 'exit', wall: 'south', offsetMeters: 20, widthMeters: 4.0 },
        ],
      };

      const candidate = generator.generate(northInput, accessor);
      expect(candidate.status).toBe('VALID');

      const flow = analyzeVehicleFlow(northInput, candidate, accessor);
      expect(flow.isConnected).toBe(true);
      expect(flow.entryConnectivity.connectedAccessPointIds).toContain('ap-north-entry');
      expect(flow.exitConnectivity.exitAccessPointIds).toContain('ap-south-exit');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. East / West Access Behavior
  // ---------------------------------------------------------------------------
  describe('7. East / West Access Behavior', () => {
    it('7. reports honest flow disconnection when east/west access point does not connect without inventing corridors', () => {
      const eastInput: LayoutEngineInput = {
        ...standardConnectedInput,
        accessPoints: [
          { id: 'ap-east-entry', type: 'entrance', wall: 'east', offsetMeters: 5, widthMeters: 4.0 },
        ],
      };

      const candidate = generator.generate(standardConnectedInput, accessor);
      const flow = analyzeVehicleFlow(eastInput, candidate, accessor);

      // East door is on the perimeter side wall away from central drive aisle
      expect(flow.entryConnectivity.disconnectedAccessPointIds).toContain('ap-east-entry');
      expect(flow.diagnostics.some((d) => d.ruleId === 'FLOW-ENTRY-001' && d.affectedObjectIds?.includes('ap-east-entry'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Topology vs Geometry Disagreement
  // ---------------------------------------------------------------------------
  describe('8. Topology / Geometry Disagreement', () => {
    it('8. reports structured diagnostic when topology asserts connected but geometry is disconnected', () => {
      const candidate = generator.generate(standardConnectedInput, accessor);
      // Clear drive aisle envelopes to induce geometry disconnection while keeping topology intact
      const tamperedCandidate: GeneratedCandidateLayout = {
        ...candidate,
        envelopes: candidate.envelopes.filter((e) => !e.sourceObjectId.startsWith('aisle-')),
      };

      const flow = analyzeVehicleFlow(standardConnectedInput, tamperedCandidate, accessor);
      expect(flow.topologyGeometryAgreement.isConsistent).toBe(false);
      expect(flow.topologyGeometryAgreement.discrepancies.length).toBeGreaterThan(0);
      expect(flow.diagnostics.some((d) => d.ruleId === 'FLOW-DISCONNECTED-001')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. FLOW_WARNING for Unknown Maneuverability
  // ---------------------------------------------------------------------------
  describe('9. Maneuverability Warning Semantics', () => {
    it('9. assigns FLOW_WARNING without disqualifying validly connected candidate', () => {
      const candidate = generator.generate(standardConnectedInput, accessor);
      const flow = analyzeVehicleFlow(standardConnectedInput, candidate, accessor);

      expect(flow.overallState).toBe('FLOW_WARNING');
      expect(flow.isManeuverabilityVerified).toBe(false);

      const warningDiag = flow.diagnostics.find((d) => d.ruleId === 'FLOW-MANEUVER-WARNING-001');
      expect(warningDiag).toBeDefined();
      expect(warningDiag?.severity).toBe('SOFT');
      expect(warningDiag?.isDisqualifying).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Golden Path Regression
  // ---------------------------------------------------------------------------
  describe('10. Golden Path Regression', () => {
    it('10. verifies Golden Path layout passes complete flow analysis with all bays connected', () => {
      const goldenPathInput: LayoutEngineInput = {
        site: {
          width: 50,
          length: 40,
          roadSide: 'south',
          parking: { customerParkingSpaces: 3 },
        },
        building: { width: 45, length: 30, frontSetbackMeters: 5 },
        accessPoints: [
          { id: 'main-entry', type: 'entrance', wall: 'south', offsetMeters: 20, widthMeters: 4.0 },
          { id: 'rear-exit', type: 'exit', wall: 'north', offsetMeters: 20, widthMeters: 4.0 },
        ],
        program: {
          bays: [
            { serviceType: 'general_service', quantity: 2 },
            { serviceType: 'wheel_alignment', quantity: 1 },
          ],
          equipment: [
            { equipmentType: 'Mesin spooring', quantity: 1 },
          ],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: true,
          futureExpansionBays: 0,
        },
      };

      const candidate = generator.generate(goldenPathInput, accessor);
      expect(candidate.status).toBe('VALID');

      const flow = analyzeVehicleFlow(goldenPathInput, candidate, accessor);
      expect(flow.isConnected).toBe(true);
      expect(flow.structuralState).toBe('FLOW_VALID');
      expect(flow.bayConnectivity).toHaveLength(3);
    });
  });
});
