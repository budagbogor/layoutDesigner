import { describe, it, expect } from 'vitest';

describe('Phase 1.1 — Environment & Tooling Verification', () => {
  it('verifies that vitest runs successfully', () => {
    expect(true).toBe(true);
  });

  it('verifies path alias @/ resolves properly', async () => {
    // dynamically verify path alias resolution
    const domainModule = await import('@/domain');
    expect(domainModule).toBeDefined();
  });

  it('verifies strict typing in test environment', () => {
    interface CadConfig {
      unit: 'meter';
      snapEnabled: boolean;
      gridStep: number;
    }

    const config: CadConfig = {
      unit: 'meter',
      snapEnabled: true,
      gridStep: 0.1,
    };

    expect(config.unit).toBe('meter');
    expect(config.gridStep).toBe(0.1);
  });
});
