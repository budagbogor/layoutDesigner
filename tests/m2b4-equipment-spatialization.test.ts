import { describe, it, expect } from 'vitest';
import {
  MOBENG_OFFICIAL_EQUIPMENT_SPECS,
  getOfficialEquipmentSpec,
  getAllOfficialEquipmentSpecs,
  getEquipmentForBayType,
  getEquipmentForFunction,
  isOfficialEquipment,
  validateEquipmentSpatialization,
} from '@/domain/equipment/equipmentSpatialization';
import { MOBENG_OPERATIONAL_EQUIPMENT_LIST } from '@/domain/requirements/requirementTypes';
import { CandidateGenerator } from '@/domain/engine/generator/candidateGenerator';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import demoStandardFixture from '../data/demo-standard.json';
import type { WorkshopStandard } from '@/domain/models/standard';
import type { LayoutEngineInput } from '@/domain/engine/types';

describe('M2B.4 — Equipment Spatialization Foundation', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);
  const generator = new CandidateGenerator();

  // ---------------------------------------------------------------------------
  // 1. All 8 Official Equipment Types Exist
  // ---------------------------------------------------------------------------
  describe('1. Official Equipment Catalog Integrity', () => {
    it('1. verifies all 8 official equipment types exist in registry', () => {
      expect(MOBENG_OPERATIONAL_EQUIPMENT_LIST).toHaveLength(8);
      const allSpecs = getAllOfficialEquipmentSpecs();
      expect(allSpecs).toHaveLength(8);

      for (const officialName of MOBENG_OPERATIONAL_EQUIPMENT_LIST) {
        const spec = getOfficialEquipmentSpec(officialName);
        expect(spec).toBeDefined();
        expect(isOfficialEquipment(officialName)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2 - 9. Deterministic Bay & Workshop Function Associations
  // ---------------------------------------------------------------------------
  describe('2 - 9. Equipment-to-Bay / Function Associations', () => {
    it('2. verifies Mesin Spooring maps deterministically to SPOORING_BAY', () => {
      const spec = getOfficialEquipmentSpec('Mesin spooring');
      expect(spec).toBeDefined();
      expect(spec?.canonicalType).toBe('mesin_spooring');
      expect(spec?.associatedBayType).toBe('SPOORING_BAY');
      expect(spec?.associatedFunction).toBe('spooring');

      const spooringEquip = getEquipmentForBayType('SPOORING_BAY');
      expect(spooringEquip.map((e) => e.canonicalType)).toContain('mesin_spooring');
    });

    it('3. verifies Mesin Balancing maps to tire-service / workshop equipment function', () => {
      const spec = getOfficialEquipmentSpec('Mesin balancing');
      expect(spec).toBeDefined();
      expect(spec?.canonicalType).toBe('mesin_balancing');
      expect(spec?.associatedBayType).toBe('SERVICE_BAY');
      expect(spec?.associatedFunction).toBe('tire_service');

      const tireEquip = getEquipmentForFunction('tire_service');
      expect(tireEquip.map((e) => e.canonicalType)).toContain('mesin_balancing');
    });

    it('4. verifies Tire Changer maps to tire-service / workshop equipment function', () => {
      const spec = getOfficialEquipmentSpec('Tire changer');
      expect(spec).toBeDefined();
      expect(spec?.canonicalType).toBe('tire_changer');
      expect(spec?.associatedBayType).toBe('SERVICE_BAY');
      expect(spec?.associatedFunction).toBe('tire_service');

      const tireEquip = getEquipmentForFunction('tire_service');
      expect(tireEquip.map((e) => e.canonicalType)).toContain('tire_changer');
    });

    it('5. verifies ATF Flushing Machine maps to Service Bay / general service function', () => {
      const spec = getOfficialEquipmentSpec('ATF flushing machine');
      expect(spec).toBeDefined();
      expect(spec?.canonicalType).toBe('atf_flushing_machine');
      expect(spec?.associatedBayType).toBe('SERVICE_BAY');
      expect(spec?.associatedFunction).toBe('general_service');

      const serviceBayEquip = getEquipmentForBayType('SERVICE_BAY');
      expect(serviceBayEquip.map((e) => e.canonicalType)).toContain('atf_flushing_machine');
    });

    it('6. verifies Nitrogen Tire Inflator maps to tire-service / Service Bay function', () => {
      const spec = getOfficialEquipmentSpec('Nitrogen tire inflator');
      expect(spec).toBeDefined();
      expect(spec?.canonicalType).toBe('nitrogen_tire_inflator');
      expect(spec?.associatedBayType).toBe('SERVICE_BAY');
      expect(spec?.associatedFunction).toBe('tire_service');
    });

    it('7. verifies Oil Drain & Suction maps to Service Bay (quick lube function)', () => {
      const spec = getOfficialEquipmentSpec('Oil drain & suction');
      expect(spec).toBeDefined();
      expect(spec?.canonicalType).toBe('oil_drain_suction');
      expect(spec?.associatedBayType).toBe('SERVICE_BAY');
      expect(spec?.associatedFunction).toBe('quick_lube');
    });

    it('8. verifies Air Compressor maps to workshop utility area', () => {
      const spec = getOfficialEquipmentSpec('Air compressor');
      expect(spec).toBeDefined();
      expect(spec?.canonicalType).toBe('air_compressor');
      expect(spec?.associatedBayType).toBeUndefined(); // Independent utility
      expect(spec?.associatedFunction).toBe('workshop_utility');

      const utilityEquip = getEquipmentForFunction('workshop_utility');
      expect(utilityEquip.map((e) => e.canonicalType)).toContain('air_compressor');
    });

    it('9. verifies Genset maps to utility / service area (unplaced/unknown physical footprint)', () => {
      const spec = getOfficialEquipmentSpec('Genset 10 kVA');
      expect(spec).toBeDefined();
      expect(spec?.canonicalType).toBe('genset_10kva');
      expect(spec?.associatedBayType).toBeUndefined();
      expect(spec?.associatedFunction).toBe('utility');
      expect(spec?.footprintStatus).toBe('UNKNOWN');
      expect(spec?.hasPhysicalFootprint).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 10 - 12. Capacity, Phase & Footprint Validation
  // ---------------------------------------------------------------------------
  describe('10 - 12. Specifications & Unknown Footprint Integrity', () => {
    it('10. verifies Genset capacity = 10 kVA', () => {
      const spec = getOfficialEquipmentSpec('Genset 10 kVA');
      expect(spec?.capacity).toBe(10.0);
      expect(spec?.capacityUnit).toBe('kVA');
      expect(spec?.provenance).toBe('PO_APPROVED');
    });

    it('11. verifies known electrical phases are preserved (1 phase for Spooring, 3 phase for Balancing/Tire Changer, UNKNOWN for Nitrogen)', () => {
      const spooring = getOfficialEquipmentSpec('Mesin spooring');
      expect(spooring?.electricalPhase).toBe(1);
      expect(spooring?.electricalProvenance).toBe('PO_APPROVED');

      const balancing = getOfficialEquipmentSpec('Mesin balancing');
      expect(balancing?.electricalPhase).toBe(3);
      expect(balancing?.electricalProvenance).toBe('PO_APPROVED');

      const tireChanger = getOfficialEquipmentSpec('Tire changer');
      expect(tireChanger?.electricalPhase).toBe(3);
      expect(tireChanger?.electricalProvenance).toBe('PO_APPROVED');

      const nitrogen = getOfficialEquipmentSpec('Nitrogen tire inflator');
      expect(nitrogen?.electricalPhase).toBeUndefined();
      expect(nitrogen?.electricalProvenance).toBe('UNKNOWN');
    });

    it('12. verifies all 8 equipment footprints remain explicitly UNKNOWN', () => {
      const allSpecs = getAllOfficialEquipmentSpecs();
      for (const spec of allSpecs) {
        expect(spec.footprintStatus).toBe('UNKNOWN');
        expect(spec.hasPhysicalFootprint).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Layout Engine Generates NO Fake Geometry for Official Equipment
  // ---------------------------------------------------------------------------
  describe('13. No Fake CAD Rectangles Generated for Official Equipment', () => {
    it('13. verifies that adding all 8 official equipment items to program generates 0 fake CAD rectangles', () => {
      const input: LayoutEngineInput = {
        site: { width: 35, length: 25, roadSide: 'south' },
        building: { width: 25, length: 18, frontSetbackMeters: 4 },
        program: {
          bays: [
            { serviceType: 'wheel_alignment', quantity: 1 },
            { serviceType: 'general_service', quantity: 2 },
          ],
          equipment: [
            { equipmentType: 'Mesin spooring', quantity: 1 },
            { equipmentType: 'Mesin balancing', quantity: 1 },
            { equipmentType: 'Tire changer', quantity: 1 },
            { equipmentType: 'ATF flushing machine', quantity: 1 },
            { equipmentType: 'Nitrogen tire inflator', quantity: 1 },
            { equipmentType: 'Oil drain & suction', quantity: 1 },
            { equipmentType: 'Air compressor', quantity: 1 },
            { equipmentType: 'Genset 10 kVA', quantity: 1 },
          ],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: true,
          futureExpansionBays: 0,
        },
      };

      const candidate = generator.generate(input, accessor);
      expect(candidate.status).toBe('VALID');

      // Check objects in candidate: NO objects of type 'equipment' with fake geometry
      const equipmentObjects = candidate.objects.filter((o) => o.type === 'equipment');
      expect(equipmentObjects).toHaveLength(0);

      // Validate spatialization metadata directly
      const validation = validateEquipmentSpatialization(input.program.equipment);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.validatedItems).toHaveLength(8);
    });
  });

  // ---------------------------------------------------------------------------
  // 14 & 15. Regression & Backward Compatibility
  // ---------------------------------------------------------------------------
  describe('14 & 15. Regression & Golden Path', () => {
    it('14. verifies projects without equipment program continue to generate valid layouts', () => {
      const input: LayoutEngineInput = {
        site: { width: 35, length: 25, roadSide: 'south' },
        building: { width: 25, length: 18, frontSetbackMeters: 4 },
        program: {
          bays: [
            { serviceType: 'wheel_alignment', quantity: 1 },
            { serviceType: 'general_service', quantity: 2 },
          ],
          equipment: [],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: true,
          futureExpansionBays: 0,
        },
      };

      const candidate = generator.generate(input, accessor);
      expect(candidate.status).toBe('VALID');
      expect(candidate.objects.filter((o) => o.type === 'service_bay')).toHaveLength(3);
    });

    it('15. verifies Golden Path layout generation passes with complete fidelity and equipment metadata', () => {
      const input: LayoutEngineInput = {
        site: {
          width: 50,
          length: 40,
          roadSide: 'south',
          parking: {
            customerParkingSpaces: 3,
            staffParkingSpaces: 2,
          },
        },
        building: { width: 45, length: 30, frontSetbackMeters: 5 },
        program: {
          bays: [
            { serviceType: 'general_service', quantity: 2 },
            { serviceType: 'wheel_alignment', quantity: 1 },
          ],
          equipment: [
            { equipmentType: 'Mesin spooring', quantity: 1 },
            { equipmentType: 'Genset 10 kVA', quantity: 1 },
          ],
          vehicleClassKey: 'vehicle.mpv',
          circulationRequirement: 'drive_through',
          customerZoneRequired: true,
          ancillarySpaces: {
            customerLounge: true,
            cashierOffice: true,
            customerRestroom: true,
            mushola: true,
            wudhu: true,
            employeeMess: true,
            employeeRestroom: true,
            wasteStreams: {
              oil: true,
              tire: true,
              parts: true,
              cardboard: true,
            },
          },
          futureExpansionBays: 0,
        },
      };

      const candidate = generator.generate(input, accessor);
      expect(candidate.status).toBe('VALID');
      expect(candidate.validation.isValid).toBe(true);
      expect(candidate.objects.filter((o) => o.type === 'service_bay')).toHaveLength(3);
    });
  });
});
