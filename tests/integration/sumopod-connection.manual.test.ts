// ---------------------------------------------------------------------------
// Manual / Integration Test Path: SumoPod Live Connection Test
//
// Usage:
//   Option 1: Set SUMOPOD_API_KEY in .env.local and run:
//             npm run test:sumopod
//   Option 2: Inline environment variable:
//             $env:SUMOPOD_API_KEY="your_api_key"; npm run test:sumopod  (PowerShell)
//             SUMOPOD_API_KEY="your_api_key" npm run test:sumopod       (Bash/macOS)
//
// If SUMOPOD_API_KEY is not set, this test skips gracefully without error.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { SumoPodAdapter } from '@/infrastructure/ai/sumopodAdapter';
import { getSumoPodEnvConfig, maskApiKey } from '@/application/ai/providerConfig';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Basic .env.local loader for local manual testing when not loaded by Next.js.
 */
function tryLoadEnvLocal(): void {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

describe('Manual Integration: SumoPod Live Connection', () => {
  tryLoadEnvLocal();
  const envConfig = getSumoPodEnvConfig();
  const hasRealKey = Boolean(envConfig.apiKey && envConfig.apiKey.trim().length > 0);

  it('tests real SumoPod connection if SUMOPOD_API_KEY is configured', async () => {
    if (!hasRealKey) {
      console.log('\n------------------------------------------------------------');
      console.log('ℹ️  [MANUAL INTEGRATION TEST: SUMOPOD CONNECTION]');
      console.log('   SUMOPOD_API_KEY is not set in environment or .env.local.');
      console.log('   To test against live SumoPod:');
      console.log('   1. Create .env.local with:');
      console.log('      SUMOPOD_API_KEY=your_actual_key_here');
      console.log('   2. Run: npm run test:sumopod');
      console.log('------------------------------------------------------------\n');
      expect(true).toBe(true);
      return;
    }

    console.log('\n------------------------------------------------------------');
    console.log('🚀 [TESTING REAL SUMOPOD CONNECTION]');
    console.log(`   Base URL : ${envConfig.baseUrl}`);
    console.log(`   API Key  : ${maskApiKey(envConfig.apiKey)} (Masked)`);
    console.log(`   Model    : ${envConfig.model || '(not specified, listing all)'}`);
    console.log('------------------------------------------------------------');

    const adapter = new SumoPodAdapter({
      apiKey: envConfig.apiKey!,
      baseUrl: envConfig.baseUrl,
      model: envConfig.model,
    });

    const result = await adapter.testConnection();

    console.log('📋 [CONNECTION RESULT]');
    console.log(`   Success  : ${result.success}`);
    console.log(`   Status   : ${result.status}`);
    console.log(`   Latency  : ${result.latencyMs}ms`);
    console.log(`   Message  : ${result.message}`);
    if (result.availableModels && result.availableModels.length > 0) {
      console.log(`   Available Models (${result.availableModels.length}):`);
      for (const m of result.availableModels.slice(0, 10)) {
        console.log(`     - ${m}`);
      }
      if (result.availableModels.length > 10) {
        console.log(`     ... and ${result.availableModels.length - 10} more`);
      }
    }
    console.log('------------------------------------------------------------\n');

    expect(result.status).toBeDefined();
    expect(result.testedAt).toBeDefined();
  });
});
