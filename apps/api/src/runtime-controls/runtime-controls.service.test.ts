import { describe, expect, it, vi } from 'vitest';
import {
  RuntimeControlsService,
  type RuntimeControlsTransaction,
} from './runtime-controls.service.js';

describe('RuntimeControlsService', () => {
  it('maps the singleton snapshot without reopening disabled controls', async () => {
    const tx = {
      runtimeControl: {
        upsert: vi.fn().mockResolvedValue({
          registrationOpen: false,
          uploadsEnabled: false,
          publicLinksEnabled: true,
          maintenanceMode: true,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    } satisfies RuntimeControlsTransaction;

    await expect(new RuntimeControlsService().read(tx)).resolves.toEqual({
      registrationOpen: false,
      uploadsEnabled: false,
      publicLinksEnabled: true,
      maintenanceMode: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('propagates the original database rejection unchanged', async () => {
    const rejection = new Error('database unavailable');
    const tx = {
      runtimeControl: { upsert: vi.fn().mockRejectedValue(rejection) },
    } satisfies RuntimeControlsTransaction;

    await expect(new RuntimeControlsService().read(tx)).rejects.toBe(rejection);
  });
});
