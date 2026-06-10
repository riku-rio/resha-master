/**
 * prisma/seed.js
 * Thin wrapper around syncBotsFromFilesystem().
 * Run with: npx prisma db seed
 */

const { syncBotsFromFilesystem } = require("../src/utils/syncBots");

async function main() {
  const result = await syncBotsFromFilesystem();

  console.log(
    `[Seed] Added: ${result.added.length} | Skipped: ${result.skipped.length} | No .env: ${result.noEnv.length} | Errors: ${result.errors.length}`
  );

  if (result.added.length) {
    console.log("[Seed] Added:", result.added.join(", "));
  }

  if (result.noEnv.length) {
    console.log("[Seed] No .env:", result.noEnv.join(", "));
  }

  if (result.errors.length) {
    result.errors.forEach((e) =>
      console.error(`[Seed] Error ${e.name}: ${e.error}`)
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
