import { describe, it, expect } from 'vitest';
import {
  WorkshopLayoutRequirement,
  validateRequirement,
  AncillarySpacesRequirement,
  MusholaRequirement,
  WudhuRequirement,
  EmployeeMessRequirement,
  WasteStreamRequirement,
  WaitingAreaContentRequirement,
  MobengSpaceType,
  MobengWasteCategory,
} from '@/domain/requirements/requirementTypes';
import { RequirementMapper } from '@/application/requirements/requirementMapper';
import { StandardAccessor } from '@/domain/engine/StandardAccessor';
import { WORKSHOP_ANALYST_SYSTEM_PROMPT } from '@/infrastructure/ai/sumopodRequirementProvider';
import demoStandardJson from '../data/demo-standard.json';

describe('M2A — MOBENG Extended Space Program Foundation', () => {
  const accessor = new StandardAccessor(demoStandardJson as any);

  const baseRequirement: WorkshopLayoutRequirement = {
    projectName: 'Mobeng Depok Sawangan',
    workshopType: 'car_service',
    vehicleCategory: 'mpv',
    priority: 'BALANCED_EFFICIENCY',
    site: { widthMeters: 18, lengthMeters: 28, roadOrientation: 'south' },
    building: { widthMeters: 15, lengthMeters: 22, frontSetbackMeters: 5 },
    access: { entryPosition: 'front_center' },
    services: [
      { serviceType: 'general_service', bayCount: 2, requiredLifts: ['4_post_lift'] },
      { serviceType: 'wheel_alignment', bayCount: 1, requiredLifts: ['4_post_lift'] },
      { serviceType: 'general_repair', bayCount: 1, requiredLifts: ['2_post_lift'] },
    ],
    ancillarySpaces: {
      customerLounge: true,
      cashierOffice: true,
      partsWarehouse: true,
      restroom: true,
    },
  };

  // -------------------------------------------------------------------------
  // A. Customer vs Employee Toilet Distinction
  // -------------------------------------------------------------------------
  describe('A. Dual Sanitary Model (Customer vs Employee Restrooms)', () => {
    it('allows explicit separation of customer and employee restrooms', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          customerRestroom: true,
          employeeRestroom: true,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);
      expect(req.ancillarySpaces.customerRestroom).toBe(true);
      expect(req.ancillarySpaces.employeeRestroom).toBe(true);
    });

    it('warns when both legacy general restroom and granular restrooms are marked', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          restroom: true,
          customerRestroom: true,
          employeeRestroom: true,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes('Both general restroom and specific'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // B & C. Mini Mushola & 2x2m Reference Classification
  // -------------------------------------------------------------------------
  describe('B & C. Mini Mushola Semantic & Design Reference', () => {
    it('supports boolean mushola flag', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          mushola: true,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);
      expect(req.ancillarySpaces.mushola).toBe(true);
    });

    it('supports structured Mushola requirement with design reference dimensions', () => {
      const musholaReq: MusholaRequirement = {
        enabled: true,
        minCapacityAdults: 1,
        targetCapacityMax: 4,
        isCompact: true,
        designReferenceWidthMeters: 2.0,
        designReferenceLengthMeters: 2.0,
      };

      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          mushola: musholaReq,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);

      const mushola = req.ancillarySpaces.mushola as MusholaRequirement;
      expect(mushola.minCapacityAdults).toBe(1);
      expect(mushola.targetCapacityMax).toBe(4);
      expect(mushola.designReferenceWidthMeters).toBe(2.0);
      expect(mushola.designReferenceLengthMeters).toBe(2.0);
    });

    it('verifies standard snapshot classifies mushola 2x2m as SOFT design reference', () => {
      const widthParam = accessor.getParameter('room.design_ref_width.mushola');
      const lengthParam = accessor.getParameter('room.design_ref_length.mushola');

      expect(widthParam).toBeDefined();
      expect(widthParam?.value).toBe(2.0);
      expect(widthParam?.constraint_level).toBe('SOFT');

      expect(lengthParam).toBeDefined();
      expect(lengthParam?.value).toBe(2.0);
      expect(lengthParam?.constraint_level).toBe('SOFT');
    });

    it('rejects invalid non-positive mushola capacities', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          mushola: {
            enabled: true,
            minCapacityAdults: 0,
          },
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('ancillarySpaces.mushola.minCapacityAdults must be > 0');
    });
  });

  // -------------------------------------------------------------------------
  // D. Wudhu (Capacity 1, Faucet 1, Dimensions UNKNOWN)
  // -------------------------------------------------------------------------
  describe('D. Wudhu Ablution Semantic Requirement', () => {
    it('supports structured Wudhu requirement with min capacity 1 and faucet count 1', () => {
      const wudhuReq: WudhuRequirement = {
        enabled: true,
        minCapacity: 1,
        minFaucetCount: 1,
        isCompact: true,
      };

      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          wudhu: wudhuReq,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);

      const wudhu = req.ancillarySpaces.wudhu as WudhuRequirement;
      expect(wudhu.minCapacity).toBe(1);
      expect(wudhu.minFaucetCount).toBe(1);
      // Dimensions are strictly undefined/unknown
      expect((wudhu as any).widthMeters).toBeUndefined();
      expect((wudhu as any).lengthMeters).toBeUndefined();
    });

    it('rejects invalid non-positive wudhu fixtures', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          wudhu: {
            enabled: true,
            minCapacity: 1,
            minFaucetCount: 0,
          },
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('ancillarySpaces.wudhu.minFaucetCount must be > 0');
    });
  });

  // -------------------------------------------------------------------------
  // E. Employee Mess (Sleeping Capacity 4, Dimensions UNKNOWN)
  // -------------------------------------------------------------------------
  describe('E. Employee Mess (Rest/Sleeping Function)', () => {
    it('supports employee mess with sleeping/rest capacity 4 without invented dimensions', () => {
      const messReq: EmployeeMessRequirement = {
        enabled: true,
        minSleepingCapacity: 4,
        functionType: 'sleeping_rest',
      };

      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          employeeMess: messReq,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);

      const mess = req.ancillarySpaces.employeeMess as EmployeeMessRequirement;
      expect(mess.minSleepingCapacity).toBe(4);
      expect(mess.functionType).toBe('sleeping_rest');
      // Dimensions remain strictly undefined/unknown
      expect((mess as any).widthMeters).toBeUndefined();
      expect((mess as any).lengthMeters).toBeUndefined();
    });

    it('rejects invalid non-positive employee mess sleeping capacity', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          employeeMess: {
            enabled: true,
            minSleepingCapacity: -1,
          },
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('ancillarySpaces.employeeMess.minSleepingCapacity must be > 0');
    });
  });

  // -------------------------------------------------------------------------
  // F. Waiting Area Content (10–20 pax, TV, Seating, Credenza, Showcase, Desk)
  // -------------------------------------------------------------------------
  describe('F. Customer Waiting Area Structured Content', () => {
    it('captures 10–20 pax capacity and all required interior items semantically', () => {
      const waitingDetails: WaitingAreaContentRequirement = {
        targetCapacityMin: 10,
        targetCapacityMax: 20,
        seatingRequired: true,
        tvRequired: true,
        credenzaRequired: true,
        showcaseRequired: true,
        combinedReceptionCashier: true,
      };

      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          customerLounge: true,
          waitingAreaDetails: waitingDetails,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);
      expect(req.ancillarySpaces.waitingAreaDetails?.targetCapacityMin).toBe(10);
      expect(req.ancillarySpaces.waitingAreaDetails?.targetCapacityMax).toBe(20);
      expect(req.ancillarySpaces.waitingAreaDetails?.tvRequired).toBe(true);
      expect(req.ancillarySpaces.waitingAreaDetails?.combinedReceptionCashier).toBe(true);
    });

    it('warns when targetCapacityMax is less than targetCapacityMin', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          waitingAreaDetails: {
            targetCapacityMin: 20,
            targetCapacityMax: 10,
          },
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes('targetCapacityMax is less than targetCapacityMin'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // G. Four Waste Streams (Oil, Tire, Parts, Cardboard)
  // -------------------------------------------------------------------------
  describe('G. 4-Stream Waste Management Program', () => {
    it('represents all 4 distinct waste streams semantically', () => {
      const wasteStreams: WasteStreamRequirement = {
        oil: true,
        tire: true,
        parts: true,
        cardboard: true,
      };

      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          wasteStreams,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);
      expect(req.ancillarySpaces.wasteStreams?.oil).toBe(true);
      expect(req.ancillarySpaces.wasteStreams?.tire).toBe(true);
      expect(req.ancillarySpaces.wasteStreams?.parts).toBe(true);
      expect(req.ancillarySpaces.wasteStreams?.cardboard).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // H. Employee Motorcycle Parking
  // -------------------------------------------------------------------------
  describe('H. Employee Motorcycle Parking Semantic Presence', () => {
    it('supports employee motorcycle parking in parking requirement without invented dimensions', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        parking: {
          customerParkingSpaces: 4,
          staffParkingSpaces: 2,
          employeeMotorcycleSpaces: 6,
        },
        ancillarySpaces: {
          ...baseRequirement.ancillarySpaces,
          employeeMotorcycleParking: true,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(true);
      expect(req.parking?.employeeMotorcycleSpaces).toBe(6);
      expect(req.ancillarySpaces.employeeMotorcycleParking).toBe(true);
    });

    it('rejects negative motorcycle parking slot numbers', () => {
      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        parking: {
          employeeMotorcycleSpaces: -2,
        },
      };

      const result = validateRequirement(req);
      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('parking.employeeMotorcycleSpaces cannot be negative');
    });
  });

  // -------------------------------------------------------------------------
  // I. AI System Prompt Verification
  // -------------------------------------------------------------------------
  describe('I. AI System Prompt Extended Space Coverage', () => {
    it('contains all extended space program schema definitions', () => {
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('customerRestroom');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('employeeRestroom');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('mushola');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('wudhu');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('employeeMess');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('wasteStreams');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('waitingAreaDetails');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('employeeMotorcycleSpaces');
    });

    it('contains Indonesian dictionary mappings for MOBENG facilities', () => {
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('mushola');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('wudhu');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('mess karyawan');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('toilet customer dan toilet karyawan terpisah');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('limbah oli, ban, part dan kardus');
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain('ruang tunggu untuk 10 sampai 20 orang');
    });

    it('enforces strict anti-hallucination for dimensions of unmeasured spaces', () => {
      expect(WORKSHOP_ANALYST_SYSTEM_PROMPT).toContain(
        'Do NOT invent physical dimensions for wudhu, mess, waste, motorcycle parking, or furniture.'
      );
    });
  });

  // -------------------------------------------------------------------------
  // J. RequirementMapper Behavior & Provenance
  // -------------------------------------------------------------------------
  describe('J. RequirementMapper Integration', () => {
    it('deterministically maps extended space requirements into LayoutEngineInput', () => {
      const mapper = new RequirementMapper();

      const req: WorkshopLayoutRequirement = {
        ...baseRequirement,
        ancillarySpaces: {
          customerLounge: true,
          cashierOffice: true,
          partsWarehouse: true,
          restroom: false,
          customerRestroom: true,
          employeeRestroom: true,
          mushola: {
            enabled: true,
            minCapacityAdults: 1,
            targetCapacityMax: 4,
            designReferenceWidthMeters: 2.0,
            designReferenceLengthMeters: 2.0,
          },
          wudhu: {
            enabled: true,
            minCapacity: 1,
            minFaucetCount: 1,
          },
          employeeMess: {
            enabled: true,
            minSleepingCapacity: 4,
            functionType: 'sleeping_rest',
          },
          wasteStreams: {
            oil: true,
            tire: true,
            parts: true,
            cardboard: true,
          },
          employeeMotorcycleParking: true,
        },
        parking: {
          customerParkingSpaces: 5,
          employeeMotorcycleSpaces: 8,
        },
      };

      const result = mapper.map(req, accessor);
      expect(result.success).toBe(true);
      expect(result.engineInput).toBeDefined();

      const engineInput = result.engineInput!;
      // Backward compatible legacy flags
      expect(engineInput.program.ancillarySpaces?.restroom).toBe(true); // Aligned from dual restrooms
      expect(engineInput.program.ancillarySpaces?.staffRoom).toBe(true); // Aligned from mess
      expect(engineInput.program.ancillarySpaces?.oilWasteStorage).toBe(true); // Aligned from wasteStreams.oil

      // Extended M2A semantic presence
      expect(engineInput.program.ancillarySpaces?.customerRestroom).toBe(true);
      expect(engineInput.program.ancillarySpaces?.employeeRestroom).toBe(true);
      expect(engineInput.program.ancillarySpaces?.mushola).toBe(true);
      expect(engineInput.program.ancillarySpaces?.wudhu).toBe(true);
      expect(engineInput.program.ancillarySpaces?.employeeMess).toBe(true);
      expect(engineInput.program.ancillarySpaces?.wasteStreams?.cardboard).toBe(true);
      expect(engineInput.site.parking?.employeeMotorcycleSpaces).toBe(8);
    });
  });

  // -------------------------------------------------------------------------
  // K & L. Backward Compatibility & Bay Taxonomy Regression
  // -------------------------------------------------------------------------
  describe('K & L. Backward Compatibility & Bay Taxonomy Regression', () => {
    it('validates minimal legacy requirement without any M2A fields unchanged', () => {
      const legacyReq: WorkshopLayoutRequirement = {
        projectName: 'Legacy Bengkel 1.0',
        workshopType: 'car_service',
        vehicleCategory: 'sedan',
        priority: 'MAXIMIZE_CAPACITY',
        site: { widthMeters: 16, lengthMeters: 24 },
        building: { widthMeters: 14, lengthMeters: 20 },
        access: { entryPosition: 'front_center' },
        services: [{ serviceType: 'general_service', bayCount: 2 }],
        ancillarySpaces: {
          customerLounge: false,
          cashierOffice: false,
          partsWarehouse: false,
          restroom: false,
        },
      };

      const result = validateRequirement(legacyReq);
      expect(result.isValid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('preserves canonical MOBENG bay taxonomy (3 canonical bays)', () => {
      const canonicalBays: MobengSpaceType[] = ['spooring_bay', 'service_bay', 'general_repair_bay'];
      expect(canonicalBays).toHaveLength(3);

      const wasteCategories: MobengWasteCategory[] = [
        'waste_oil',
        'waste_tire',
        'waste_parts',
        'waste_cardboard',
      ];
      expect(wasteCategories).toHaveLength(4);
    });
  });
});
