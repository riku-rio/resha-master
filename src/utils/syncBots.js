/**
 * syncBots.js
 * Shared logic: scan child_bots/ and upsert records into the DB.
 * Used by both prisma/seed.js (CLI) and the /sync slash command.
 *
 * Rules:
 *  - Does NOT call startBot — only DB sync.
 *  - Does NOT use dotenv.config() — parses each .env file manually.
 *  - Uses BOT_NAME from .env (not the folder name) as the canonical botName.
 */

const fs = require("fs");
const path = require("path");
const prisma = require("./prisma");

const childBotsRoot = path.resolve(__dirname, "../../child_bots");

/**
 * Parse a .env file into a key→value map.
 * Lines starting with # are ignored. Empty lines are ignored.
 * Only the first `=` is treated as the separator.
 * @param {string} filePath  absolute path to the .env file
 * @returns {Record<string, string>}
 */
function parseEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    map[key] = value;
  }
  return map;
}

/**
 * Scan child_bots/ and sync every bot that has a valid .env into the DB.
 *
 * @returns {Promise<{
 *   added:   string[],
 *   skipped: string[],
 *   noEnv:   string[],
 *   errors:  { name: string, error: string }[]
 * }>}
 */
async function syncBotsFromFilesystem() {
  const result = { added: [], skipped: [], noEnv: [], errors: [] };

  // Ensure the child_bots directory exists
  if (!fs.existsSync(childBotsRoot)) {
    console.warn("[SyncBots] child_bots/ directory does not exist — nothing to sync.");
    return result;
  }

  let entries;
  try {
    entries = fs.readdirSync(childBotsRoot, { withFileTypes: true });
  } catch (err) {
    result.errors.push({ name: "<root>", error: `Failed to read child_bots/: ${err.message}` });
    return result;
  }

  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const folder of folders) {
    // Path traversal guard — basename should equal the folder name already, but be explicit
    const safeName = path.basename(folder);
    const botDir = path.resolve(childBotsRoot, safeName);
    if (!botDir.startsWith(childBotsRoot + path.sep)) {
      result.errors.push({ name: folder, error: "Path traversal detected — skipped." });
      continue;
    }

    const envPath = path.join(botDir, ".env");

    // Step a: check .env exists
    if (!fs.existsSync(envPath)) {
      result.noEnv.push(folder);
      continue;
    }

    try {
      // Step b: parse .env manually
      const env = parseEnvFile(envPath);

      const required = [
        "BOT_NAME",
        "BOT_TOKEN",
        "BOT_ID",
        "GUILD_ID",
        "TEMPLATE_ID",
        "BUYER_ID",
        "SUBSCRIPTION_EXPIRES_AT",
      ];

      const missing = required.filter((k) => !env[k]);
      if (missing.length > 0) {
        result.errors.push({
          name: folder,
          error: `Missing required .env keys: ${missing.join(", ")}`,
        });
        continue;
      }

      const botName = env.BOT_NAME;
      const botToken = env.BOT_TOKEN;
      const botId = env.BOT_ID;
      const guildId = env.GUILD_ID;
      const templateId = env.TEMPLATE_ID;
      const buyerId = env.BUYER_ID || "unknown";
      const prefix = env.PREFIX || "!";
      // Support both Unix-ms timestamps (e.g. "9999999999999") and ISO strings.
      const rawExpiry = env.SUBSCRIPTION_EXPIRES_AT;
      const subscriptionExpiresAt = /^\d+$/.test(rawExpiry)
        ? new Date(Number(rawExpiry))
        : new Date(rawExpiry);

      if (isNaN(subscriptionExpiresAt.getTime())) {
        result.errors.push({
          name: folder,
          error: `Invalid SUBSCRIPTION_EXPIRES_AT: "${env.SUBSCRIPTION_EXPIRES_AT}"`,
        });
        continue;
      }

      // Step c: check if already in DB
      const existing = await prisma.botInstance.findUnique({ where: { botName } });
      if (existing) {
        result.skipped.push(botName);
        continue;
      }

      // Step d: create DB record
      await prisma.botInstance.create({
        data: {
          botName,
          botToken,
          botId,
          guildId,
          templateId,
          buyerId,
          prefix,
          status: "STOPPED",
          subscriptionExpiresAt,
        },
      });

      // Step e: mark as added
      result.added.push(botName);
    } catch (err) {
      result.errors.push({ name: folder, error: err.message });
    }
  }

  return result;
}

module.exports = { syncBotsFromFilesystem };
