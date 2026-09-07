import { describe, it, expect } from 'vitest';
import {
  MobengBayType,
  MOBENG_BAY_SERVICES,
  MOBENG_BAY_DEFAULT_LIFTS,
  MOBENG_OPERATIONAL_EQUIPMENT_LIST,
  MOBENG_EQUIPMENT_ELECTRICAL_PHASES,
  MOBENG_EQUIPMENT_VENDOR_REFERENCES,
  MOBENG_SPACE_STANDARD_V1,
  MobengWasteCategory,
} from '../src/domain/requirements/requirementTypes';
import { StandardAccessor } from '../src/domain/engine/StandardAccessor';
import { WorkshopStandard } from '../src/domain/models/standard';
import demoStandardFixture from '../data/demo-standard.json';

describe('M2C — MOBENG SPACE STANDARD V1 PO-APPROVED DATA INTEGRATION', () => {
  const standard = demoStandardFixture as unknown as WorkshopStandard;
  const accessor = new StandardAccessor(standard);

  // -------------------------------------------------------------------------
  // 1 & 2. Canonical Bay Taxonomy & 4x9m Bay Dimensions
  // -------------------------------------------------------------------------
  describe('1 & 2. Canonical Bay Taxonomy & 4x9m Dimensions', () => {
    it('1. verifies canonical 3 bay types remain unchanged', () => {
      const canonicalBayTypes: MobengBayType[] = ['SPOORING_BAY', 'SERVICE_BAY', 'GENERAL_REPAIR_BAY'];
      expect(canonicalBayTypes).toHaveLength(3);

      // Verify mappings for functions
      expect(MOBENG_BAY_SERVICES.SPOORING_BAY).toEqual(['wheel_alignment']);
      expect(MOBENG_BAY_SERVICES.SERVICE_BAY).toEqual(['general_service', 'quick_lube', 'service_rasa_mesin_baru']);
      expect(MOBENG_BAY_SERVICES.GENERAL_REPAIR_BAY).toEqual(['general_repair', 'brake_suspension']);

      // Lifts
      expect(MOBENG_BAY_DEFAULT_LIFTS.SPOORING_BAY).toBe('4_post_lift');
      expect(MOBENG_BAY_DEFAULT_LIFTS.SERVICE_BAY).toBe('4_post_lift');
      expect(MOBENG_BAY_DEFAULT_LIFTS.GENERAL_REPAIR_BAY).toBe('2_post_lift');
    });

    it('2. verifies bay dimensions are 4m x 9m with PO_APPROVED provenance', () => {
      const widthParam = accessor.getRequiredParameter('bay.min_width');
      const lengthParam = accessor.getRequiredParameter('bay.min_length');

      expect(widthParam.value).toBe(4.0);
      expect(widthParam.source_type).toBe('PO_APPROVED');
      expect(lengthParam.value).toBe(9.0);
      expect(lengthParam.source_type).toBe('PO_APPROVED');
    });
  });

  // -------------------------------------------------------------------------
  // 3, 4, 5. Bay Capacity Constraints
  // -------------------------------------------------------------------------
  describe('3, 4, 5. Bay Capacity Constraints', () => {
    it('3. verifies spooring lift maximum = 1', () => {
      const maxSpooring = accessor.getRequiredParameter('bay.max_count.spooring_lift');
      expect(maxSpooring.value).toBe(1);
      expect(maxSpooring.source_type).toBe('PO_APPROVED');
      expect(MOBENG_SPACE_STANDARD_V1.BAY_SPOORING.maxLifts).toBe(1);
    });

    it('4. verifies service lift count > 1 is permitted', () => {
      expect(MOBENG_SPACE_STANDARD_V1.BAY_SERVICE.allowMultipleLifts).toBe(true);
      expect(MOBENG_SPACE_STANDARD_V1.BAY_SERVICE.provenance).toBe('PO_APPROVED');
    });

    it('5. verifies general-repair 2-post lift maximum = 1', () => {
      const maxGR = accessor.getRequiredParameter('bay.max_count.general_repair_lift');
      expect(maxGR.value).toBe(1);
      expect(maxGR.source_type).toBe('PO_APPROVED');
      expect(MOBENG_SPACE_STANDARD_V1.BAY_GENERAL_REPAIR.maxLifts).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Customer Parking
  // -------------------------------------------------------------------------
  describe('6. Customer Parking', () => {
    it('6. verifies customer parking stall is 2.5m x 5.0m with PO_APPROVED provenance', () => {
      const width = accessor.getRequiredParameter('parking.stall.width');
      const length = accessor.getRequiredParameter('parking.stall.length');

      expect(width.value).toBe(2.5);
      expect(width.source_type).toBe('PO_APPROVED');
      expect(length.value).toBe(5.0);
      expect(length.source_type).toBe('PO_APPROVED');
    });
  });

  // -------------------------------------------------------------------------
  // 7, 8, 9, 10, 11. Waiting + Reception + Cashier Space Program
  // -------------------------------------------------------------------------
  describe('7, 8, 9, 10, 11. Integrated Waiting + Reception + Cashier Program', () => {
    it('7. verifies integrated waiting/reception/cashier minimum footprint is 5m x 6m', () => {
      const minW = accessor.getRequiredParameter('customer_zone.min_width');
      const minL = accessor.getRequiredParameter('customer_zone.min_length');

      expect(minW.value).toBe(5.0);
      expect(minW.constraint_level).toBe('HARD');
      expect(minW.source_type).toBe('PO_APPROVED');

      expect(minL.value).toBe(6.0);
      expect(minL.constraint_level).toBe('HARD');
      expect(minL.source_type).toBe('PO_APPROVED');
    });

    it('8. verifies waiting ideal target is 5m x 10m (SOFT constraint)', () => {
      const idealW = accessor.getRequiredParameter('customer_zone.ideal_width');
      const idealL = accessor.getRequiredParameter('customer_zone.ideal_length');

      expect(idealW.value).toBe(5.0);
      expect(idealW.constraint_level).toBe('SOFT');
      expect(idealW.source_type).toBe('PO_APPROVED');

      expect(idealL.value).toBe(10.0);
      expect(idealL.constraint_level).toBe('SOFT');
      expect(idealL.source_type).toBe('PO_APPROVED');
    });

    it('9. verifies waiting space is expandable', () => {
      expect(MOBENG_SPACE_STANDARD_V1.WAITING_RECEPTION_CASHIER.isExpandable).toBe(true);
    });

    it('10. verifies customer capacity target range is 10–20 persons', () => {
      const capMin = accessor.getRequiredParameter('customer_zone.capacity_min');
      const capMax = accessor.getRequiredParameter('customer_zone.capacity_max');

      expect(capMin.value).toBe(10);
      expect(capMin.source_type).toBe('PO_APPROVED');
      expect(capMax.value).toBe(20);
      expect(capMax.source_type).toBe('PO_APPROVED');
    });

    it('11. verifies cashier/reception sub-area minimum is 2.5m x 2.5m', () => {
      const cashW = accessor.getRequiredParameter('room.min_width.cashier_office');
      const cashL = accessor.getRequiredParameter('room.min_length.cashier_office');

      expect(cashW.value).toBe(2.5);
      expect(cashW.source_type).toBe('PO_APPROVED');
      expect(cashL.value).toBe(2.5);
      expect(cashL.source_type).toBe('PO_APPROVED');
    });
  });

  // -------------------------------------------------------------------------
  // 12. Sparepart Warehouse
  // -------------------------------------------------------------------------
  describe('12. Sparepart Warehouse', () => {
    it('12. verifies warehouse minimum is 4m x 6m and supersedes 4.5m x 4m', () => {
      const whWidth = accessor.getRequiredParameter('room.min_width.parts_warehouse');
      const whLength = accessor.getRequiredParameter('room.min_length.parts_warehouse');

      expect(whWidth.value).toBe(4.0);
      expect(whWidth.source_type).toBe('PO_APPROVED');
      expect(whLength.value).toBe(6.0);
      expect(whLength.source_type).toBe('PO_APPROVED');

      expect(MOBENG_SPACE_STANDARD_V1.PARTS_WAREHOUSE.supersededDimensions).toBe('4.5m x 4.0m');
    });
  });

  // -------------------------------------------------------------------------
  // 13, 14, 15. Waste Area (4 Streams)
  // -------------------------------------------------------------------------
  describe('13, 14, 15. Waste Area Program (4 Streams)', () => {
    it('13. verifies waste total is 3m x 6m', () => {
      const totalW = accessor.getRequiredParameter('room.min_width.waste_total');
      const totalL = accessor.getRequiredParameter('room.min_length.waste_total');

      expect(totalW.value).toBe(3.0);
      expect(totalW.source_type).toBe('PO_APPROVED');
      expect(totalL.value).toBe(6.0);
      expect(totalL.source_type).toBe('PO_APPROVED');
    });

    it('14. verifies waste streams are exactly oil, tire, parts, cardboard', () => {
      const streams: MobengWasteCategory[] = ['waste_oil', 'waste_tire', 'waste_parts', 'waste_cardboard'];
      expect(streams).toHaveLength(4);
      expect(MOBENG_SPACE_STANDARD_V1.WASTE_AREA.streams.oil.category).toBe('waste_oil');
      expect(MOBENG_SPACE_STANDARD_V1.WASTE_AREA.streams.tire.category).toBe('waste_tire');
      expect(MOBENG_SPACE_STANDARD_V1.WASTE_AREA.streams.parts.category).toBe('waste_parts');
      expect(MOBENG_SPACE_STANDARD_V1.WASTE_AREA.streams.cardboard.category).toBe('waste_cardboard');
    });

    it('15. verifies waste dimensions are 3x2, 3x2, 3x1, 3x1 summing to 3x6m envelope', () => {
      const oilW = accessor.getRequiredNumericValue('room.min_width.waste_oil');
      const oilL = accessor.getRequiredNumericValue('room.min_length.waste_oil');
      const tireW = accessor.getRequiredNumericValue('room.min_width.waste_tire');
      const tireL = accessor.getRequiredNumericValue('room.min_length.waste_tire');
      const partsW = accessor.getRequiredNumericValue('room.min_width.waste_parts');
      const partsL = accessor.getRequiredNumericValue('room.min_length.waste_parts');
      const cardW = accessor.getRequiredNumericValue('room.min_width.waste_cardboard');
      const cardL = accessor.getRequiredNumericValue('room.min_length.waste_cardboard');

      expect(oilW).toBe(3.0);
      expect(oilL).toBe(2.0);

      expect(tireW).toBe(3.0);
      expect(tireL).toBe(2.0);

      expect(partsW).toBe(3.0);
      expect(partsL).toBe(1.0);

      expect(cardW).toBe(3.0);
      expect(cardL).toBe(1.0);

      expect(oilL + tireL + partsL + cardL).toBe(6.0);
    });
  });

  // -------------------------------------------------------------------------
  // 16. Mushola
  // -------------------------------------------------------------------------
  describe('16. Mini Mushola', () => {
    it('16. verifies mushola is 2m x 2m with PO_APPROVED standard', () => {
      const mushW = accessor.getRequiredParameter('room.min_width.mushola');
      const mushL = accessor.getRequiredParameter('room.min_length.mushola');

      expect(mushW.value).toBe(2.0);
      expect(mushW.constraint_level).toBe('HARD');
      expect(mushW.source_type).toBe('PO_APPROVED');

      expect(mushL.value).toBe(2.0);
      expect(mushL.constraint_level).toBe('HARD');
      expect(mushL.source_type).toBe('PO_APPROVED');
    });
  });

  // -------------------------------------------------------------------------
  // 17, 18, 19. Wudhu & Mushola Adjacency
  // -------------------------------------------------------------------------
  describe('17, 18, 19. Wudhu Ablution & Adjacency', () => {
    it('17. verifies wudhu is 1m x 2m with PO_APPROVED standard', () => {
      const wudhuW = accessor.getRequiredParameter('room.min_width.wudhu');
      const wudhuL = accessor.getRequiredParameter('room.min_length.wudhu');

      expect(wudhuW.value).toBe(1.0);
      expect(wudhuW.source_type).toBe('PO_APPROVED');
      expect(wudhuL.value).toBe(2.0);
      expect(wudhuL.source_type).toBe('PO_APPROVED');
    });

    it('18. verifies wudhu minimum faucet count is 1', () => {
      const faucets = accessor.getRequiredParameter('room.min_faucets.wudhu');
      expect(faucets.value).toBe(1);
      expect(faucets.source_type).toBe('PO_APPROVED');
    });

    it('19. verifies mushola-wudhu adjacency is represented as REQUIRED (HARD)', () => {
      const rule = accessor.getRule('ADJACENCY-MUSHOLA-WUDHU-001');
      expect(rule).toBeDefined();
      expect(rule?.severity).toBe('HARD');
      expect(rule?.active).toBe(true);
      expect(MOBENG_SPACE_STANDARD_V1.WUDHU.mandatoryAdjacencyToMushola).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 20 & 21. Customer & Employee Restrooms
  // -------------------------------------------------------------------------
  describe('20 & 21. Restroom Standards', () => {
    it('20. verifies customer toilet minimum is 1.5m x 1.5m with PO_APPROVED standard', () => {
      const custW = accessor.getRequiredParameter('room.min_width.customer_restroom');
      const custL = accessor.getRequiredParameter('room.min_length.customer_restroom');

      expect(custW.value).toBe(1.5);
      expect(custW.source_type).toBe('PO_APPROVED');
      expect(custL.value).toBe(1.5);
      expect(custL.source_type).toBe('PO_APPROVED');
    });

    it('21. verifies employee toilet minimum is 1.5m x 1.5m and semantically separate', () => {
      const empW = accessor.getRequiredParameter('room.min_width.employee_restroom');
      const empL = accessor.getRequiredParameter('room.min_length.employee_restroom');

      expect(empW.value).toBe(1.5);
      expect(empW.source_type).toBe('PO_APPROVED');
      expect(empL.value).toBe(1.5);
      expect(empL.source_type).toBe('PO_APPROVED');

      expect(MOBENG_SPACE_STANDARD_V1.CUSTOMER_TOILET).toBeDefined();
      expect(MOBENG_SPACE_STANDARD_V1.EMPLOYEE_TOILET).toBeDefined();
      expect(MOBENG_SPACE_STANDARD_V1.CUSTOMER_TOILET).not.toBe(MOBENG_SPACE_STANDARD_V1.EMPLOYEE_TOILET);
    });
  });

  // -------------------------------------------------------------------------
  // 22. Employee Mess
  // -------------------------------------------------------------------------
  describe('22. Employee Mess', () => {
    it('22. verifies employee mess minimum footprint is 3m x 6m for rest/sleeping', () => {
      const messW = accessor.getRequiredParameter('room.min_width.employee_mess');
      const messL = accessor.getRequiredParameter('room.min_length.employee_mess');

      expect(messW.value).toBe(3.0);
      expect(messW.source_type).toBe('PO_APPROVED');
      expect(messL.value).toBe(6.0);
      expect(messL.source_type).toBe('PO_APPROVED');
      expect(MOBENG_SPACE_STANDARD_V1.EMPLOYEE_MESS.functionType).toBe('sleeping_rest');
    });
  });

  // -------------------------------------------------------------------------
  // 23 & 24. Employee Motorcycle Parking
  // -------------------------------------------------------------------------
  describe('23 & 24. Employee Motorcycle Parking', () => {
    it('23. verifies employee motorcycle parking capacity is 4 with PO_APPROVED standard', () => {
      const motoCap = accessor.getRequiredParameter('parking.employee_motorcycle.min_capacity');
      expect(motoCap.value).toBe(4);
      expect(motoCap.source_type).toBe('PO_APPROVED');
      expect(MOBENG_SPACE_STANDARD_V1.EMPLOYEE_MOTORCYCLE_PARKING.minCapacityUnits).toBe(4);
    });

    it('24. verifies motorcycle physical stall and aisle dimensions remain UNKNOWN', () => {
      expect(MOBENG_SPACE_STANDARD_V1.EMPLOYEE_MOTORCYCLE_PARKING.stallDimensions).toBeUndefined();
      expect(MOBENG_SPACE_STANDARD_V1.EMPLOYEE_MOTORCYCLE_PARKING.aisleDimensions).toBeUndefined();
      expect(accessor.getParameter('parking.motorcycle.stall_width')).toBeUndefined();
      expect(accessor.getParameter('parking.motorcycle.stall_length')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 25, 26, 27, 28, 29. Equipment Electrical Requirements
  // -------------------------------------------------------------------------
  describe('25, 26, 27, 28, 29. Equipment Electrical Phase Standards', () => {
    it('25. verifies mesin spooring is 1 phase (PO_APPROVED)', () => {
      const phase = accessor.getRequiredParameter('equipment.electrical_phase.mesin_spooring');
      expect(phase.value).toBe(1);
      expect(phase.source_type).toBe('PO_APPROVED');
      expect(MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Mesin spooring'].phaseCount).toBe(1);
    });

    it('26. verifies mesin balancing is 3 phase (PO_APPROVED)', () => {
      const phase = accessor.getRequiredParameter('equipment.electrical_phase.mesin_balancing');
      expect(phase.value).toBe(3);
      expect(phase.source_type).toBe('PO_APPROVED');
      expect(MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Mesin balancing'].phaseCount).toBe(3);
    });

    it('27. verifies tire changer is 3 phase (PO_APPROVED)', () => {
      const phase = accessor.getRequiredParameter('equipment.electrical_phase.tire_changer');
      expect(phase.value).toBe(3);
      expect(phase.source_type).toBe('PO_APPROVED');
      expect(MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Tire changer'].phaseCount).toBe(3);
    });

    it('28. verifies vehicle lift is 3 phase (PO_APPROVED)', () => {
      const phase = accessor.getRequiredParameter('equipment.electrical_phase.vehicle_lift');
      expect(phase.value).toBe(3);
      expect(phase.source_type).toBe('PO_APPROVED');
      expect(MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Vehicle lift'].phaseCount).toBe(3);
    });

    it('29. verifies nitrogen electrical specification remains UNKNOWN', () => {
      expect(MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Nitrogen tire inflator'].phaseCount).toBeUndefined();
      expect(MOBENG_EQUIPMENT_ELECTRICAL_PHASES['Nitrogen tire inflator'].provenance).toBe('UNKNOWN');
      expect(accessor.getParameter('equipment.electrical_phase.nitrogen')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 30, 31, 32. Equipment List & Dimensional Integrity
  // -------------------------------------------------------------------------
  describe('30, 31, 32. Equipment Operational List & Dimensional Integrity', () => {
    it('30. verifies genset capacity is 10 kVA with PO_APPROVED standard', () => {
      const gensetCap = accessor.getRequiredParameter('equipment.capacity.genset');
      expect(gensetCap.value).toBe(10.0);
      expect(gensetCap.unit).toBe('kVA');
      expect(gensetCap.source_type).toBe('PO_APPROVED');
    });

    it('31. verifies equipment without authoritative dimensions remain UNKNOWN', () => {
      expect(MOBENG_SPACE_STANDARD_V1.GENSET.physicalDimensions).toBeUndefined();
      expect(MOBENG_OPERATIONAL_EQUIPMENT_LIST).toHaveLength(8);
      expect(MOBENG_OPERATIONAL_EQUIPMENT_LIST).toContain('ATF flushing machine');
      expect(MOBENG_OPERATIONAL_EQUIPMENT_LIST).toContain('Oil drain & suction');
      expect(MOBENG_OPERATIONAL_EQUIPMENT_LIST).toContain('Air compressor');
    });

    it('32. verifies no generic 2x2 equipment footprint is promoted to MOBENG approved standard', () => {
      const equipWidth = accessor.getParameter('equipment.width');
      // The generic parameter exists in schema as legacy geometry, but must not be classified as PO_APPROVED standard
      expect(equipWidth?.source_type).not.toBe('PO_APPROVED');
    });
  });

  // -------------------------------------------------------------------------
  // 33 & 34. Site Guidelines & GSB
  // -------------------------------------------------------------------------
  describe('33 & 34. Site Guidelines & GSB', () => {
    it('33. verifies 15x20m site remains a design guideline (SOFT), not universal hard constraint', () => {
      const siteW = accessor.getRequiredParameter('site.guideline_min_width');
      const siteD = accessor.getRequiredParameter('site.guideline_min_depth');

      expect(siteW.value).toBe(15.0);
      expect(siteW.constraint_level).toBe('SOFT');
      expect(siteW.source_type).toBe('PO_APPROVED');

      expect(siteD.value).toBe(20.0);
      expect(siteD.constraint_level).toBe('SOFT');
      expect(siteD.source_type).toBe('PO_APPROVED');

      expect(MOBENG_SPACE_STANDARD_V1.SITE_GUIDELINE.isHardEngineeringConstraint).toBe(false);
    });

    it('34. verifies GSB remains location/project-specific and unknown by default', () => {
      expect(MOBENG_SPACE_STANDARD_V1.GSB.numericValue).toBeUndefined();
      expect(MOBENG_SPACE_STANDARD_V1.GSB.isLocationProjectSpecific).toBe(true);
      expect(MOBENG_SPACE_STANDARD_V1.GSB.provenance).toBe('UNKNOWN');
      expect(accessor.getParameter('site.gsb')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Equipment Brand / Vendor Text Reference Integrity
  // -------------------------------------------------------------------------
  describe('Equipment Vendor References', () => {
    it('preserves exact PO text including "JPHN Bean" without normalization', () => {
      const spooringVendors = MOBENG_EQUIPMENT_VENDOR_REFERENCES['Mesin spooring'];
      expect(spooringVendors).toContain('Blue Point / Snap-on');
      expect(spooringVendors).toContain('John Bean');
      expect(spooringVendors).toContain('JPHN Bean'); // Exact spelling strictly preserved

      expect(MOBENG_EQUIPMENT_VENDOR_REFERENCES['Mesin balancing']).toContain('John Bean');
      expect(MOBENG_EQUIPMENT_VENDOR_REFERENCES['Tire changer']).toContain('Smart');
      expect(MOBENG_EQUIPMENT_VENDOR_REFERENCES['Nitrogen tire inflator']).toContain('brand unrestricted / free choice');
    });
  });
});
