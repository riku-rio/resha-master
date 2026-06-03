const { fork } = require("child_process");
const path = require("path");

const botEntryPath = path.join(__dirname, "./botEntry.js");

/**
 * @param {object} bot - BotInstance from DB
 * @param {Map} processMap - botId → ChildProcess
 * @param {Function} onExit - callback(botId) when process exits
 */
function run(bot, processMap, onExit) {
  const { botId, botToken, guildId, buyerId, templateId, subscriptionExpiresAt, prefix, botName } = bot;

  const botDir = path.join(__dirname, `../../child_bots/${botName}`);

  const child = fork(botEntryPath, [], {
    env: {
      ...process.env,
      BOT_TOKEN: botToken,
      BOT_ID: botId,
      GUILD_ID: guildId,
      BUYER_ID: buyerId,
      TEMPLATE_ID: templateId,
      SUBSCRIPTION_EXPIRES_AT: subscriptionExpiresAt.toISOString(),
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
    if (onExit) onExit(botId, code, signal);
  });

  child.on("error", (err) => {
    console.error(`[Runner] Bot ${botName} (${botId}) error:`, err.message);
  });

  return child;
}

module.exports = { run };