const prisma = require("../../src/utils/prisma");
const { run } = require("./botRunner");

// Map of botId → ChildProcess
const processMap = new Map();

async function onBotExit(botId, code) {
  // If processMap still contains this bot, stopBot/restartBot is managing the
  // lifecycle and will write the correct status itself — don't race against it.
  if (processMap.has(botId)) return;

  // Unexpected exit: mark as STOPPED in the DB.
  try {
    await prisma.botInstance.update({
      where: { botId },
      data: { status: "STOPPED" },
    });
  } catch (err) {
    console.error(`[Manager] Failed to update status for bot ${botId}:`, err.message);
  }
}

async function startAllBots() {
  const now = new Date();

  const bots = await prisma.botInstance.findMany({
    where: {
      status: { not: "EXPIRED" },
      subscriptionExpiresAt: { gt: now },
    },
  });

  if (bots.length === 0) {
    console.log("[Manager] No active bots found.");
    return;
  }

  console.log(`[Manager] Starting ${bots.length} bot(s)...`);

  for (const bot of bots) {
    try {
      await startBot(bot);
    } catch {
      // Error already logged inside startBot; continue with remaining bots.
    }
  }
}

async function startBot(bot) {
  if (processMap.has(bot.botId)) {
    console.warn(`[Manager] Bot ${bot.botId} is already running.`);
    return;
  }

  try {
    run(bot, processMap, onBotExit);
    await prisma.botInstance.update({
      where: { botId: bot.botId },
      data: { status: "RUNNING" },
    });
  } catch (err) {
    console.error(`[Manager] Failed to start bot ${bot.botId}:`, err.message);
    throw err;
  }
}

async function stopBot(botId) {
  const child = processMap.get(botId);
  if (!child) {
    console.warn(`[Manager] Bot ${botId} is not running.`);
    return;
  }

  child.kill("SIGTERM");
  processMap.delete(botId);

  await prisma.botInstance.update({
    where: { botId },
    data: { status: "STOPPED" },
  });

  console.log(`[Manager] Bot ${botId} stopped.`);
}

async function restartBot(botId) {
  await stopBot(botId);

  const bot = await prisma.botInstance.findUnique({ where: { botId } });
  if (!bot) {
    console.error(`[Manager] Bot ${botId} not found in DB.`);
    return;
  }

  await startBot(bot);
  console.log(`[Manager] Bot ${botId} restarted.`);
}

module.exports = { startAllBots, startBot, stopBot, restartBot };