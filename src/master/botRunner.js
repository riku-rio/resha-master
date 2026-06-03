const { fork } = require("child_process");
const path = require("path");

const botEntryPath = path.join(__dirname, "./botEntry.js");
const childBotsRoot = path.resolve(__dirname, "../../child_bots");

/**
 * @param {object} bot - BotInstance from DB
 * @param {Map} processMap - botId → ChildProcess
 * @param {Function} onExit - callback(botId) when process exits
 */
function run(bot, processMap, onExit) {
  const { botId, botToken, guildId, buyerId, templateId, subscriptionExpiresAt, prefix, botName } = bot;

  const safeName = path.basename(botName);
  const botDir = path.resolve(childBotsRoot, safeName);
  if (!botDir.startsWith(childBotsRoot + path.sep)) {
    throw new Error(`[Runner] Path traversal detected for botName: ${botName}`);
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