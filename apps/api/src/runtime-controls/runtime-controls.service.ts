import { Injectable } from '@nestjs/common';
import type { RuntimeControls } from '@data-room/contracts';

export interface RuntimeControlsTransaction {
  runtimeControl: {
    upsert(args: {
      where: { id: number };
      create: { id: number };
      update: Record<string, never>;
      select: {
        registrationOpen: true;
        uploadsEnabled: true;
        publicLinksEnabled: true;
        maintenanceMode: true;
        updatedAt: true;
      };
    }): Promise<{
      registrationOpen: boolean;
      uploadsEnabled: boolean;
      publicLinksEnabled: boolean;
      maintenanceMode: boolean;
      updatedAt: Date;
    }>;
  };
}

@Injectable()
export class RuntimeControlsService {
  async read(tx: RuntimeControlsTransaction): Promise<RuntimeControls> {
    const controls = await tx.runtimeControl.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
      select: {
        registrationOpen: true,
        uploadsEnabled: true,
        publicLinksEnabled: true,
        maintenanceMode: true,
        updatedAt: true,
      },
    });
    return { ...controls, updatedAt: controls.updatedAt.toISOString() };
  }
}
