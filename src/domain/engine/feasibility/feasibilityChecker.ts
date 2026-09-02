import { LayoutEngineInput, FeasibilityReport } from '../types';
import { StandardAccessor } from '../StandardAccessor';

/**
 * Deterministic Geometric Feasibility Pre-Check.
 * Verifies physical, geometric, and access feasibility prior to executing expensive
 * candidate layout generators.
 *
 * Rules:
 * - NO engineering parameter fallbacks (all queries go through StandardAccessor)
 * - Topology and strategy constraints must be verified (e.g. PREMIUM_FLOW / drive-through requires dedicated ingress & egress)
 * - Pure, deterministic function with zero side effects
 */
export function checkProgramFeasibility(
  input: LayoutEngineInput,
  accessor: StandardAccessor
): FeasibilityReport {
  const { building, program, accessPoints = [], strategies = [] } = input;
  const criticalDeficits: string[] = [];

  // 1. Read required parameters from standard snapshot (throws if missing!)
  const wallThickness = accessor.getRequiredNumericValue('building.wall_thickness');
  const bayMinWidth = accessor.getRequiredNumericValue('bay.min_width');
  const bayMinLength = accessor.getRequiredNumericValue('bay.min_length');
  const aisleMinWidth = accessor.getRequiredNumericValue('circulation.drive_aisle.min_width');

  // 2. Interior usable dimensions (accounting for outer building envelope)
  const interiorW = Math.max(0, building.width - 2 * wallThickness);
  const interiorL = Math.max(0, building.length - 2 * wallThickness);

  // 3. Minimum geometric space for a single service row + drive aisle
  const singleRowMinLength = bayMinLength + aisleMinWidth;
  const doubleRowMinLength = 2 * bayMinLength + aisleMinWidth;

  if (interiorL < singleRowMinLength) {
    criticalDeficits.push(
      `Interior building length (${interiorL.toFixed(2)}m) is less than the minimum required ` +
      `for one bay row (${bayMinLength}m) plus circulation drive aisle (${aisleMinWidth}m) = ${singleRowMinLength.toFixed(2)}m.`
    );
  }

  if (interiorW < bayMinWidth) {
    criticalDeficits.push(
      `Interior building width (${interiorW.toFixed(2)}m) is less than minimum service bay width (${bayMinWidth}m).`
    );
  }

  // 4. Calculate theoretical maximum bay capacity
  let maxPossibleBays = 0;
  if (interiorW >= bayMinWidth && interiorL >= singleRowMinLength) {
    const baysPerRow = Math.floor(interiorW / bayMinWidth);
    if (interiorL >= doubleRowMinLength) {
      maxPossibleBays = baysPerRow * 2;
    } else {
      maxPossibleBays = baysPerRow;
    }
  }

  const requestedBays = program.bays.reduce((sum, b) => sum + b.quantity, 0);
  if (requestedBays > maxPossibleBays) {
    criticalDeficits.push(
      `Requested program of ${requestedBays} service bays exceeds the theoretical maximum capacity of ` +
      `${maxPossibleBays} bays for the ${building.width.toFixed(1)}m × ${building.length.toFixed(1)}m building.`
    );
  }

  // 5. Access Point Validation for Topology Strategies
  const entrances = accessPoints.filter((a) => a.type === 'entrance');
  const exits = accessPoints.filter((a) => a.type === 'exit');
  const bidirectionals = accessPoints.filter((a) => a.type === 'bidirectional');

  const hasDedicatedEntrance = entrances.length > 0;
  const hasDedicatedExit = exits.length > 0;
  const hasBidirectionalAccess = bidirectionals.length > 0;

  const meetsDriveThroughRequirements = (hasDedicatedEntrance && hasDedicatedExit) || (bidirectionals.length >= 2);

  const accessDeficits: string[] = [];

  // Check drive-through or PREMIUM_FLOW strategy requirements
  const isPremiumFlowRequested = strategies.includes('PREMIUM_FLOW');
  const isDriveThroughRequested = program.circulationRequirement === 'drive_through';

  if ((isPremiumFlowRequested || isDriveThroughRequested) && !meetsDriveThroughRequirements) {
    const msg =
      `Topology strategy 'PREMIUM_FLOW' / circulation 'drive_through' requires separate dedicated ` +
      `entrance and exit access points. The engine cannot invent access doors. ` +
      `Provided: ${entrances.length} entrance(s), ${exits.length} exit(s), ${bidirectionals.length} bidirectional gate(s).`;
    accessDeficits.push(msg);
    criticalDeficits.push(msg);
  }

  if (accessPoints.length === 0) {
    const noDoorMsg =
      `No site access points provided. The workshop layout cannot be connected to external circulation routes.`;
    accessDeficits.push(noDoorMsg);
    criticalDeficits.push(noDoorMsg);
  }

  return {
    isFeasible: criticalDeficits.length === 0,
    maxTheoreticallyPossibleBays: maxPossibleBays,
    requestedBays,
    criticalDeficits,
    accessPointValidation: {
      hasDedicatedEntrance,
      hasDedicatedExit,
      hasBidirectionalAccess,
      meetsDriveThroughRequirements,
      deficits: accessDeficits,
    },
  };
}
