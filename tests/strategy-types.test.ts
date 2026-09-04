import { describe, it, expect } from 'vitest';
import {
  ALL_LAYOUT_STRATEGY_IDS,
  LayoutStrategyId,
  createStrategyContext,
  generateDeterministicCandidateId,
  StrategyCandidate,
  CandidateRejection,
  CandidateGenerationResult,
  StrategyGenerator,
} from '@/domain/engine/strategies/strategyTypes';
import { buildLayoutTopology } from '@/domain/engine/topology/topologyBuilder';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import type { LayoutEngineInput } from '@/domain/engine/types';
import type { WorkshopStandard } from '@/domain/models/standard';

describe('Milestone 2.5 — Strategy Generator Contracts', () => {
  const mockStandard: WorkshopStandard = {
    id: 'mobeng-std-strat',
    name: 'Strategy Standard Test',
    version: '1.0-strat',
    status: 'published',
    parameters: [
      { key: 'circulation.drive_aisle.min_width', value: 6.0, unit: 'meter', constraint_level: 'HARD' },
    ],
    rules: [],
  };

  const sampleInput: LayoutEngineInput = {
    site: { width: 30, length: 40 },
    building: { width: 18, length: 25 },
    program: {
      bays: [{ serviceType: 'general_service', quantity: 2 }],
      equipment: [],
      vehicleClassKey: 'vehicle.mpv',
      circulationRequirement: 'drive_through',
      customerZoneRequired: false,
      futureExpansionBays: 0,
    },
  };

  describe('1. Strategy IDs & Contract Constants', () => {
    it('contains all 3 mandatory strategy IDs: CAPACITY, BALANCED, PREMIUM_FLOW', () => {
      expect(ALL_LAYOUT_STRATEGY_IDS).toHaveLength(3);
      expect(ALL_LAYOUT_STRATEGY_IDS).toContain('CAPACITY');
      expect(ALL_LAYOUT_STRATEGY_IDS).toContain('BALANCED');
      expect(ALL_LAYOUT_STRATEGY_IDS).toContain('PREMIUM_FLOW');
      expect(Object.isFrozen(ALL_LAYOUT_STRATEGY_IDS)).toBe(true);
    });
  });

  describe('2. Deterministic Candidate ID Generation', () => {
    it('generates predictable, deterministic candidate IDs matching strategy name and sequence', () => {
      expect(generateDeterministicCandidateId('CAPACITY', 1)).toBe('candidate-capacity-01');
      expect(generateDeterministicCandidateId('BALANCED', 1)).toBe('candidate-balanced-01');
      expect(generateDeterministicCandidateId('PREMIUM_FLOW', 1)).toBe('candidate-premium-flow-01');
      expect(generateDeterministicCandidateId('CAPACITY', 10)).toBe('candidate-capacity-10');
    });

    it('produces identical IDs on repeated calls', () => {
      const id1 = generateDeterministicCandidateId('PREMIUM_FLOW', 2);
      const id2 = generateDeterministicCandidateId('PREMIUM_FLOW', 2);
      expect(id1).toBe(id2);
    });
  });

  describe('3. Strategy Context Immutability & Utilities Access', () => {
    it('provides an immutable StrategyContext with input, topology, accessor, and spatial utilities', () => {
      const accessor = new StandardAccessor(mockStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);

      const context = createStrategyContext(sampleInput, topology, accessor);

      expect(context.input).toBeDefined();
      expect(context.topology).toBeDefined();
      expect(context.accessor).toBeDefined();
      expect(context.utilities).toBeDefined();

      // Verify spatial utilities are accessible
      expect(typeof context.utilities.overlapsEnvelope).toBe('function');
      expect(typeof context.utilities.calculateAisleEnvelope).toBe('function');
      expect(typeof context.utilities.isAccessConnected).toBe('function');

      // Verify context is frozen
      expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(context.input)).toBe(true);
      expect(Object.isFrozen(context.topology)).toBe(true);
      expect(Object.isFrozen(context.utilities)).toBe(true);

      // Attempting to mutate throws error in strict mode
      expect(() => {
        (context as any).input = null;
      }).toThrow();
    });
  });

  describe('4. Candidate Structure, Rejection & Disqualifying Flag', () => {
    it('validates contract structure for StrategyCandidate, Rejection, and Generation Result', () => {
      const mockRejection: CandidateRejection = {
        ruleId: 'BOUNDARY-001',
        severity: 'HARD',
        isDisqualifying: true,
        relatedObjectIds: ['bay-01'],
        relatedNodeIds: ['node-service-zone'],
        reason: 'Service Bay extends 0.2m outside building boundary.',
        provenance: { source: 'standard', referenceKey: 'BOUNDARY-001' },
      };

      expect(mockRejection.isDisqualifying).toBe(true);
      expect(mockRejection.severity).toBe('HARD');
      expect(mockRejection.provenance?.source).toBe('standard');

      const mockCandidate: StrategyCandidate = {
        id: generateDeterministicCandidateId('CAPACITY', 1),
        strategyId: 'CAPACITY',
        name: 'Maximum Capacity Candidate 01',
        description: 'Double-row parallel bays maximizing bay count',
        topologyId: 'topology-drive_through',
        layout: { objects: [] },
        envelopes: [],
        status: 'DISQUALIFIED',
        rejections: [mockRejection],
        provenance: {
          standardVersionId: 'v1.0',
          generatorName: 'CapacityStrategyGenerator',
          generatedAt: '2026-09-02T00:00:00.000Z',
        },
        explanation: {
          strategyRationale: 'Packs maximum bays along south and north walls',
          layoutSummary: 'Achieves 6 bays with 6.0m central drive aisle',
          tradeOffs: 'Tight technician clearance between bays',
        },
        spatialContext: {
          arrangement: 'SINGLE_COMB_NORTH',
          circulationRequirement: 'back_out_turnaround',
          provenance: {
            source: 'generator',
            generatorName: 'CapacityStrategyGenerator',
            inputProgramField: 'circulationRequirement',
          },
        },
      };

      expect(mockCandidate.id).toBe('candidate-capacity-01');
      expect(mockCandidate.strategyId).toBe('CAPACITY');
      expect(mockCandidate.status).toBe('DISQUALIFIED');
      expect(mockCandidate.rejections).toHaveLength(1);
      expect(mockCandidate.explanation.strategyRationale).toBeDefined();

      const result: CandidateGenerationResult = {
        strategyId: 'CAPACITY',
        candidate: mockCandidate,
        success: true,
        errors: [],
      };

      expect(result.success).toBe(true);
      expect(result.candidate?.id).toBe('candidate-capacity-01');
    });

    it('supports StrategyGenerator interface contract implementation', () => {
      // Mock class implementing StrategyGenerator to ensure the contract is clean and implementable
      class MockCapacityGenerator implements StrategyGenerator {
        public readonly strategyId: LayoutStrategyId = 'CAPACITY';
        public readonly name = 'Mock Capacity Generator';
        public readonly description = 'Generates capacity candidate';

        public generate(context: ReturnType<typeof createStrategyContext>): CandidateGenerationResult {
          const candidateId = generateDeterministicCandidateId(this.strategyId, 1);
          return {
            strategyId: this.strategyId,
            candidate: {
              id: candidateId,
              strategyId: this.strategyId,
              name: this.name,
              description: this.description,
              topologyId: context.topology.id,
              layout: { objects: [] },
              envelopes: [],
              status: 'VALID',
              rejections: [],
              provenance: {
                standardVersionId: context.accessor.getStandardVersion(),
                generatorName: this.name,
                generatedAt: '2026-09-02T00:00:00.000Z',
              },
              explanation: {
                strategyRationale: 'Test rationale',
                layoutSummary: 'Test summary',
                tradeOffs: 'Test trade-offs',
              },
              spatialContext: {
                arrangement: 'SINGLE_COMB_NORTH',
                circulationRequirement: 'back_out_turnaround',
                provenance: {
                  source: 'generator',
                  generatorName: this.name,
                  inputProgramField: 'circulationRequirement',
                },
              },
            },
            success: true,
            errors: [],
          };
        }
      }

      const generator = new MockCapacityGenerator();
      expect(generator.strategyId).toBe('CAPACITY');

      const accessor = new StandardAccessor(mockStandard);
      const topology = buildLayoutTopology(sampleInput, accessor);
      const context = createStrategyContext(sampleInput, topology, accessor);

      const genResult = generator.generate(context);
      expect(genResult.success).toBe(true);
      expect(genResult.candidate?.id).toBe('candidate-capacity-01');
      expect(genResult.candidate?.status).toBe('VALID');
    });
  });
});
