import { describe, it, expect } from 'vitest';
import {
  WorkshopLayoutRequirement,
  validateRequirement,
  ServiceProgramItem,
  AncillarySpacesRequirement,
} from '@/domain/requirements/requirementTypes';

describe('FASE 3.2 — Workshop Layout Requirement Contract', () => {
  // ---------------------------------------------------------------------------
  // Fixtures
  // ---------------------------------------------------------------------------

  const minimalRequirement: WorkshopLayoutRequirement = {
    projectName: 'Bengkel Mobeng Cibinong',
    workshopType: 'car_service',
    vehicleCategory: 'mpv',
    priority: 'BALANCED_EFFICIENCY',
    site: { widthMeters: 15, lengthMeters: 25 },
    building: { widthMeters: 12, lengthMeters: 20 },
    access: { entryPosition: 'front_center' },
    services: [{ serviceType: 'general_service', bayCount: 3 }],
    ancillarySpaces: {
      customerLounge: false,
      cashierOffice: false,
      partsWarehouse: false,
      restroom: false,
    },
  };

  const fullRequirement: WorkshopLayoutRequirement = {
    projectName: 'Mobeng Premium Serpong',
    workshopType: 'car_service',
    vehicleCategory: 'suv',
    priority: 'PREMIUM_EXPERIENCE',
    site: {
      widthMeters: 20,
      lengthMeters: 35,
      roadOrientation: 'south',
    },
    building: {
      widthMeters: 16,
      lengthMeters: 28,
      frontSetbackMeters: 5,
    },
    access: {
      entryPosition: 'front_left',
      exitPosition: 'rear_center',
      pedestrianEntryPosition: 'front_right',
      preferDriveThrough: true,
    },
    services: [
      { serviceType: 'general_service', bayCount: 4, requiredLifts: ['2_post_lift'] },
      { serviceType: 'quick_lube', bayCount: 2 },
      { serviceType: 'tire_service', bayCount: 1, requiredLifts: ['scissor_lift'] },
    ],
    equipmentPreferences: ['tire_changer', 'wheel_balancer', 'ac_recovery_machine'],
    ancillarySpaces: {
      customerLounge: true,
      cashierOffice: true,
      partsWarehouse: true,
      restroom: true,
      compressorRoom: true,
      oilWasteStorage: true,
      staffRoom: true,
      loungeWithBayView: true,
    },
    parking: {
      customerParkingSpaces: 6,
      staffParkingSpaces: 3,
      vehicleStagingSpaces: 4,
    },
    futureExpansionBays: 2,
    rawUserPrompt: 'Saya ingin bengkel premium di Serpong dengan 4 bay servis umum, 2 quick lube, 1 ban, lounge kaca tembus pandang, dan drive through.',
    specialInstructions: [
      'Toilet tidak boleh menghadap pintu masuk pelanggan',
      'Ruang tunggu harus ber-AC dengan kaca tembus pandang ke area servis',
    ],
  };

  // ---------------------------------------------------------------------------
  // 1. Minimal Requirement Validation
  // ---------------------------------------------------------------------------

  describe('1. Minimal Requirement', () => {
    it('validates a requirement with only mandatory fields', () => {
      const result = validateRequirement(minimalRequirement);

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('contains correct identity fields', () => {
      expect(minimalRequirement.projectName).toBe('Bengkel Mobeng Cibinong');
      expect(minimalRequirement.workshopType).toBe('car_service');
      expect(minimalRequirement.vehicleCategory).toBe('mpv');
      expect(minimalRequirement.priority).toBe('BALANCED_EFFICIENCY');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Full Requirement Validation
  // ---------------------------------------------------------------------------

  describe('2. Full Requirement (All Fields Populated)', () => {
    it('validates a fully populated requirement with zero missing fields', () => {
      const result = validateRequirement(fullRequirement);

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('preserves raw user prompt and special instructions', () => {
      expect(fullRequirement.rawUserPrompt).toContain('bengkel premium');
      expect(fullRequirement.specialInstructions).toHaveLength(2);
      expect(fullRequirement.specialInstructions![0]).toContain('Toilet');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Optional Fields Behavior
  // ---------------------------------------------------------------------------

  describe('3. Optional Fields', () => {
    it('allows undefined for all optional fields without failing validation', () => {
      const result = validateRequirement(minimalRequirement);

      expect(result.isValid).toBe(true);
      expect(minimalRequirement.site.roadOrientation).toBeUndefined();
      expect(minimalRequirement.building.frontSetbackMeters).toBeUndefined();
      expect(minimalRequirement.access.exitPosition).toBeUndefined();
      expect(minimalRequirement.access.pedestrianEntryPosition).toBeUndefined();
      expect(minimalRequirement.equipmentPreferences).toBeUndefined();
      expect(minimalRequirement.parking).toBeUndefined();
      expect(minimalRequirement.futureExpansionBays).toBeUndefined();
      expect(minimalRequirement.rawUserPrompt).toBeUndefined();
      expect(minimalRequirement.specialInstructions).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Multiple Service Types
  // ---------------------------------------------------------------------------

  describe('4. Multiple Service Types', () => {
    it('supports multiple distinct service program items', () => {
      const result = validateRequirement(fullRequirement);

      expect(result.isValid).toBe(true);
      expect(fullRequirement.services).toHaveLength(3);

      const totalBays = fullRequirement.services.reduce((sum, s) => sum + s.bayCount, 0);
      expect(totalBays).toBe(7); // 4 + 2 + 1

      const generalSvc = fullRequirement.services.find((s) => s.serviceType === 'general_service');
      expect(generalSvc?.requiredLifts).toContain('2_post_lift');
    });

    it('rejects service items with bayCount <= 0', () => {
      const badReq: WorkshopLayoutRequirement = {
        ...minimalRequirement,
        services: [{ serviceType: 'quick_lube', bayCount: 0 }],
      };

      const result = validateRequirement(badReq);
      expect(result.isValid).toBe(false);
      expect(result.missingFields.some((f) => f.includes('bayCount'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Access Semantics
  // ---------------------------------------------------------------------------

  describe('5. Access Semantics', () => {
    it('accepts single-entry configuration', () => {
      const result = validateRequirement(minimalRequirement);
      expect(result.isValid).toBe(true);
      expect(minimalRequirement.access.entryPosition).toBe('front_center');
      expect(minimalRequirement.access.exitPosition).toBeUndefined();
    });

    it('accepts dual-entry/exit drive-through configuration', () => {
      expect(fullRequirement.access.entryPosition).toBe('front_left');
      expect(fullRequirement.access.exitPosition).toBe('rear_center');
      expect(fullRequirement.access.preferDriveThrough).toBe(true);
    });

    it('warns when preferDriveThrough is true but no exitPosition is given', () => {
      const ambiguousReq: WorkshopLayoutRequirement = {
        ...minimalRequirement,
        access: {
          entryPosition: 'front_center',
          preferDriveThrough: true,
          // exitPosition deliberately omitted
        },
      };

      const result = validateRequirement(ambiguousReq);
      expect(result.isValid).toBe(true); // Not invalid, but warned
      expect(result.warnings.some((w) => w.includes('preferDriveThrough'))).toBe(true);
    });

    it('rejects requirement with missing entryPosition', () => {
      const noEntry: WorkshopLayoutRequirement = {
        ...minimalRequirement,
        access: {} as any,
      };

      const result = validateRequirement(noEntry);
      expect(result.isValid).toBe(false);
      expect(result.missingFields.some((f) => f.includes('entryPosition'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Ancillary Spaces
  // ---------------------------------------------------------------------------

  describe('6. Ancillary Spaces', () => {
    it('supports all ancillary space options', () => {
      expect(fullRequirement.ancillarySpaces.customerLounge).toBe(true);
      expect(fullRequirement.ancillarySpaces.cashierOffice).toBe(true);
      expect(fullRequirement.ancillarySpaces.partsWarehouse).toBe(true);
      expect(fullRequirement.ancillarySpaces.restroom).toBe(true);
      expect(fullRequirement.ancillarySpaces.compressorRoom).toBe(true);
      expect(fullRequirement.ancillarySpaces.oilWasteStorage).toBe(true);
      expect(fullRequirement.ancillarySpaces.staffRoom).toBe(true);
      expect(fullRequirement.ancillarySpaces.loungeWithBayView).toBe(true);
    });

    it('warns when loungeWithBayView is true but customerLounge is false', () => {
      const contradictory: WorkshopLayoutRequirement = {
        ...minimalRequirement,
        ancillarySpaces: {
          customerLounge: false,
          cashierOffice: false,
          partsWarehouse: false,
          restroom: false,
          loungeWithBayView: true,
        },
      };

      const result = validateRequirement(contradictory);
      expect(result.isValid).toBe(true); // Not invalid, but warned
      expect(result.warnings.some((w) => w.includes('loungeWithBayView'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Serialization / Determinism
  // ---------------------------------------------------------------------------

  describe('7. Serialization & Determinism', () => {
    it('serializes to identical JSON across repeated calls', () => {
      const json1 = JSON.stringify(fullRequirement);
      const json2 = JSON.stringify(fullRequirement);

      expect(json1).toBe(json2);
    });

    it('round-trips through JSON parse/stringify without data loss', () => {
      const json = JSON.stringify(fullRequirement);
      const parsed = JSON.parse(json) as WorkshopLayoutRequirement;

      expect(parsed.projectName).toBe(fullRequirement.projectName);
      expect(parsed.workshopType).toBe(fullRequirement.workshopType);
      expect(parsed.services).toHaveLength(fullRequirement.services.length);
      expect(parsed.access.entryPosition).toBe(fullRequirement.access.entryPosition);
      expect(parsed.access.exitPosition).toBe(fullRequirement.access.exitPosition);
      expect(parsed.ancillarySpaces.customerLounge).toBe(fullRequirement.ancillarySpaces.customerLounge);
      expect(parsed.parking?.customerParkingSpaces).toBe(fullRequirement.parking?.customerParkingSpaces);
      expect(parsed.specialInstructions).toEqual(fullRequirement.specialInstructions);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Validation Result Immutability
  // ---------------------------------------------------------------------------

  describe('8. Validation Result Immutability', () => {
    it('returns deeply frozen validation result', () => {
      const result = validateRequirement(fullRequirement);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.missingFields)).toBe(true);
      expect(Object.isFrozen(result.warnings)).toBe(true);

      expect(() => {
        (result.missingFields as any).push('hacked');
      }).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Building vs Site Dimension Warnings
  // ---------------------------------------------------------------------------

  describe('9. Dimension Sanity Warnings', () => {
    it('warns when building exceeds site dimensions', () => {
      const oversized: WorkshopLayoutRequirement = {
        ...minimalRequirement,
        site: { widthMeters: 10, lengthMeters: 15 },
        building: { widthMeters: 12, lengthMeters: 20 },
      };

      const result = validateRequirement(oversized);
      expect(result.isValid).toBe(true); // Valid but warned
      expect(result.warnings.some((w) => w.includes('widthMeters exceeds'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('lengthMeters exceeds'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Missing Mandatory Fields Detection
  // ---------------------------------------------------------------------------

  describe('10. Missing Mandatory Fields', () => {
    it('reports all missing mandatory fields in a single validation pass', () => {
      const empty: WorkshopLayoutRequirement = {
        projectName: '',
        workshopType: '' as any,
        vehicleCategory: '' as any,
        priority: '' as any,
        site: { widthMeters: 0, lengthMeters: 0 },
        building: { widthMeters: 0, lengthMeters: 0 },
        access: { entryPosition: '' as any },
        services: [],
        ancillarySpaces: undefined as any,
      };

      const result = validateRequirement(empty);
      expect(result.isValid).toBe(false);
      expect(result.missingFields.length).toBeGreaterThanOrEqual(5);
      expect(result.missingFields.some((f) => f.includes('projectName'))).toBe(true);
      expect(result.missingFields.some((f) => f.includes('site.widthMeters'))).toBe(true);
      expect(result.missingFields.some((f) => f.includes('services'))).toBe(true);
    });
  });
});
