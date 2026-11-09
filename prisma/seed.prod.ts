import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedRules } from "./seed";

/**
 * Production seed script.
 *
 * Seeds only:
 *   - The ADMIN platform operator account, configured via environment
 *     variables `ADMIN_EMAIL` and `ADMIN_PASSWORD` (so credentials are never
 *     hardcoded in the repo).
 *   - The core QCO / IS-standard rule knowledge base (reuses the same
 *     `seedRules` function as the dev seed, which is idempotent).
 *
 * Unlike the dev seed (`prisma/seed.ts`), this script does NOT create:
 *   - Demo firms (Acme Steel Imports, Bharat Customs Brokers)
 *   - Demo USER accounts (asha@acme.in, rahul@bharat.in)
 *   - Any test determinations or batches
 *
 * Usage:
 *   ADMIN_EMAIL=admin@yourdomain.com ADMIN_PASSWORD=StrongPass123! \
 *     npx tsx prisma/seed.prod.ts
 *
 * Or via npm script:
 *   npm run db:seed:prod
 */

const prisma = new PrismaClient();

/** Read a required env var or throw a clear, actionable error. */
function requireSeedEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Production seed requires "${name}" to be set in the environment. ` +
        `Pass it as: ${name}=value npx tsx prisma/seed.prod.ts`,
    );
  }
  return value;
}

async function main() {
  const adminEmail = requireSeedEnv("ADMIN_EMAIL").toLowerCase();
  const adminPassword = requireSeedEnv("ADMIN_PASSWORD");

  if (adminPassword.length < 8) {
    throw new Error(
      `ADMIN_PASSWORD must be at least 8 characters (got ${adminPassword.length}).`,
    );
  }

  // --- Seed the ADMIN account (idempotent upsert on email) -------------------
  const adminHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Platform Admin",
      passwordHash: adminHash,
      role: "ADMIN",
      firmId: null,
    },
    create: {
      email: adminEmail,
      name: "Platform Admin",
      passwordHash: adminHash,
      role: "ADMIN",
      firmId: null,
    },
  });

  // --- Seed the rule knowledge base (shared with dev seed) ------------------
  await seedRules(prisma);

  console.log("Production seed complete:");
  console.log(`  ADMIN  ${adminEmail}  (no firm)`);
  console.log("  Rules: Steel QCO 2020 (E250, HR sheet, CRGO) + Fasteners QCO");
  console.log(
    "  Circulars + transitional arrangements + exemptions seeded",
  );
  console.log("  (Gazette refs / exact dates marked VERIFY pending curation)");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
