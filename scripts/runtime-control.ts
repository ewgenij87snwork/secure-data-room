import { config as loadDotenv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';

loadDotenv({ path: '.env.local' });
loadDotenv();

type MutationMode = 'review' | 'lockdown' | 'maintenance-on' | 'maintenance-off';
type Mode = MutationMode | 'status';

interface RuntimeState {
  registrationOpen: boolean;
  uploadsEnabled: boolean;
  publicLinksEnabled: boolean;
  maintenanceMode: boolean;
}

const states: Record<MutationMode, RuntimeState> = {
  review: {
    registrationOpen: true,
    uploadsEnabled: true,
    publicLinksEnabled: true,
    maintenanceMode: false,
  },
  lockdown: {
    registrationOpen: false,
    uploadsEnabled: false,
    publicLinksEnabled: false,
    maintenanceMode: false,
  },
  'maintenance-on': {
    registrationOpen: false,
    uploadsEnabled: false,
    publicLinksEnabled: false,
    maintenanceMode: true,
  },
  'maintenance-off': {
    registrationOpen: false,
    uploadsEnabled: false,
    publicLinksEnabled: false,
    maintenanceMode: false,
  },
};

function readMode(): Mode {
  const candidate = process.argv[2];
  const supportedModes = new Set<string>(['status', ...Object.keys(states)]);
  if (!candidate || !supportedModes.has(candidate)) {
    throw new Error(
      'Usage: tsx scripts/runtime-control.ts <status|review|lockdown|maintenance-on|maintenance-off> [--confirm]',
    );
  }

  const mode = candidate as Mode;
  if (mode !== 'status' && !process.argv.includes('--confirm')) {
    throw new Error(`Refusing to apply ${mode} without the explicit --confirm flag.`);
  }
  return mode;
}

function createPrismaClient(): PrismaClient {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new Error('DIRECT_URL is required. Load it from a trusted local/release environment.');
  }

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: directUrl,
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
    }),
  });
}

async function readAuthConfig(): Promise<Record<string, unknown> | null> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!accessToken || !projectRef || projectRef === 'local') return null;

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Reading Supabase Auth config failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function patchAuthConfig(disableSignup: boolean): Promise<void> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!accessToken || !projectRef || projectRef === 'local') {
    throw new Error('SUPABASE_ACCESS_TOKEN and a non-local SUPABASE_PROJECT_REF are required.');
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      disable_signup: disableSignup,
      external_email_enabled: false,
      external_anonymous_users_enabled: false,
    }),
  });
  if (!response.ok) {
    throw new Error(`Supabase Auth update failed with HTTP ${response.status}.`);
  }
}

async function writeRuntimeState(prisma: PrismaClient, state: RuntimeState): Promise<void> {
  await prisma.runtimeControl.upsert({
    where: { id: 1 },
    update: state,
    create: { id: 1, ...state },
  });
}

async function printStatus(prisma: PrismaClient): Promise<void> {
  const runtime = await prisma.runtimeControl.findUnique({ where: { id: 1 } });
  const auth = await readAuthConfig();
  console.log(
    JSON.stringify(
      {
        projectRef: process.env.SUPABASE_PROJECT_REF ?? 'not-configured',
        runtime,
        auth: auth
          ? {
              disableSignup: auth.disable_signup,
              externalEmailEnabled: auth.external_email_enabled,
              externalAnonymousUsersEnabled: auth.external_anonymous_users_enabled,
            }
          : 'not-read (local or management credentials absent)',
      },
      null,
      2,
    ),
  );
}

async function applyMode(
  prisma: PrismaClient,
  mode: MutationMode,
  nextState: RuntimeState,
): Promise<void> {
  const isReviewMode = mode === 'review';

  if (isReviewMode) {
    // Open provider signup first. If the DB gate fails, immediately fail closed again.
    await patchAuthConfig(false);
    try {
      await writeRuntimeState(prisma, nextState);
    } catch (error) {
      await patchAuthConfig(true).catch(() => undefined);
      throw error;
    }
  } else {
    // Close application capabilities first so a provider API failure cannot reopen product access.
    await writeRuntimeState(prisma, nextState);
    await patchAuthConfig(true);
  }

  console.log(
    JSON.stringify(
      {
        appliedMode: mode,
        projectRef: process.env.SUPABASE_PROJECT_REF,
        runtime: nextState,
        authSignupDisabled: !isReviewMode,
        emailPasswordAuthEnabled: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Previously issued signed upload/read capabilities remain valid until their provider TTL expires.',
  );
}

async function main(): Promise<void> {
  const mode = readMode();
  const prisma = createPrismaClient();

  try {
    if (mode === 'status') {
      await printStatus(prisma);
      return;
    }
    await applyMode(prisma, mode, states[mode]);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
