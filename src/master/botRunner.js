const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");

const botEntryPath = path.join(__dirname, "./botEntry.js");
const childBotsRoot = path.resolve(__dirname, "../../child_bots");

/**
 * Scan child_bots/ to find the actual folder whose .env BOT_NAME === botName.
 * This handles the case where the folder name on disk differs from BOT_NAME.
 * @param {string} botName  the DB botName value
 * @returns {string|null}   absolute path to the folder, or null if not found
 */
function findBotDirByName(botName) {
  let entries;
  try {
    entries = fs.readdirSync(childBotsRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const envPath = path.join(childBotsRoot, entry.name, ".env");
    if (!fs.existsSync(envPath)) continue;

    try {
      const raw = fs.readFileSync(envPath, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key === "BOT_NAME" && value === botName) {
          return path.join(childBotsRoot, entry.name);
        }
      }
    } catch {
      // unreadable .env — skip
    }
  }

  return null;
}

/**
 * @param {object} bot - BotInstance from DB
 * @param {Map} processMap - botId → ChildProcess
 * @param {Function} onExit - callback(botId) when process exits
 */
function run(bot, processMap, onExit) {
  const { botId, botToken, guildId, buyerId, templateId, subscriptionExpiresAt, prefix, botName } = bot;

  const safeName = path.basename(botName);
  let botDir = path.resolve(childBotsRoot, safeName);
  if (!botDir.startsWith(childBotsRoot + path.sep)) {
    throw new Error(`[Runner] Path traversal detected for botName: ${botName}`);
  }

  // If the folder doesn't exist under the DB botName, scan for the real folder
  // whose .env BOT_NAME matches (handles folder name ≠ BOT_NAME).
  if (!fs.existsSync(botDir)) {
    const found = findBotDirByName(botName);
    if (!found) {
      throw new Error(`[Runner] No folder found for bot "${botName}" in child_bots/`);
    }
    console.warn(`[Runner] Folder mismatch for "${botName}" — using discovered path: ${found}`);
    botDir = found;
  }

  const child = fork(botEntryPath, [], {
    env: {
      ...process.env,
      BOT_TOKEN: botToken,
      BOT_ID: botId,
      GUILD_ID: guildId,
      BUYER_ID: buyerId,
      TEMPLATE_ID: templateId,
      SUBSCRIPTION_EXPIRES_AT:
        subscriptionExpiresAt instanceof Date && !isNaN(subscriptionExpiresAt)
          ? subscriptionExpiresAt.toISOString()
          : "",
      PREFIX: prefix,
      BOT_DIR: botDir,
    },
    silent: false,
  });

  processMap.set(botId, child);
  console.log(`[Runner] Started bot ${botName} (${botId}), PID: ${child.pid}`);

  child.on("exit", (code, signal) => {
    processMap.delete(botId);
    console.warn(`[Runner] Bot ${botName} (${botId}) exited. Code: ${code}, Signal: ${signal}`);
    if (onExit) {
      try {
        onExit(botId, code, signal);
      } catch (err) {
        console.error(`[Runner] onExit callback threw for bot ${botName} (${botId}):`, err);
      }
    }
  });

  child.on("error", (err) => {
    console.error(`[Runner] Bot ${botName} (${botId}) error:`, err.message);
  });

  return child;
}

module.exports = { run };