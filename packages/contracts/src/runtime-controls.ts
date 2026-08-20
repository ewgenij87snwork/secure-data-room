import { z } from 'zod';

export const runtimeControlsSchema = z.object({
  registrationOpen: z.boolean(),
  uploadsEnabled: z.boolean(),
  publicLinksEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type RuntimeControls = z.infer<typeof runtimeControlsSchema>;
