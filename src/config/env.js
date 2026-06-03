const dotenv = require("dotenv");

function loadEnv() {
  dotenv.config({ quiet: true });

  const isChildBot = !!process.env.BOT_TOKEN;

  if (isChildBot) {
    return loadChildEnv();
  }

  return loadMasterEnv();
}

function loadMasterEnv() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  const prefix = process.env.PREFIX || "!";
  const nodeEnv = String(process.env.NODE_ENV || "development").toLowerCase();
  const isProduction = nodeEnv === "production";

  const missing = [];
  if (!token) missing.push("DISCORD_TOKEN");
  if (!clientId) missing.push("DISCORD_CLIENT_ID");
  if (!guildId) missing.push("DISCORD_GUILD_ID");

  if (missing.length > 0) {
    throw new Error(`[Master] Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    mode: "master",
    token,
    clientId,
    guildId,
    prefix,
    nodeEnv,
    isProduction,
  };
}

function loadChildEnv() {
  const botToken = process.env.BOT_TOKEN;
  const botId = process.env.BOT_ID;
  const guildId = process.env.GUILD_ID;
  const buyerId = process.env.BUYER_ID;
  const templateId = process.env.TEMPLATE_ID;
  const subscriptionExpiresAt = process.env.SUBSCRIPTION_EXPIRES_AT;
  const prefix = process.env.PREFIX || "!";
  const nodeEnv = String(process.env.NODE_ENV || "development").toLowerCase();
  const isProduction = nodeEnv === "production";

  const missing = [];
  if (!botToken) missing.push("BOT_TOKEN");
  if (!botId) missing.push("BOT_ID");
  if (!guildId) missing.push("GUILD_ID");
  if (!buyerId) missing.push("BUYER_ID");
  if (!templateId) missing.push("TEMPLATE_ID");
  if (!subscriptionExpiresAt) missing.push("SUBSCRIPTION_EXPIRES_AT");

  if (missing.length > 0) {
    throw new Error(`[Child Bot] Missing required environment variables: ${missing.join(", ")}`);
  }

  const expiresAt = new Date(subscriptionExpiresAt);
  if (isNaN(expiresAt.getTime())) {
    throw new Error(`[Child Bot] SUBSCRIPTION_EXPIRES_AT is not a valid date: ${subscriptionExpiresAt}`);
  }

  if (expiresAt < new Date()) {
    throw new Error(`[Child Bot] Subscription expired at ${subscriptionExpiresAt}`);
  }

  return {
    mode: "child",
    botToken,
    botId,
    guildId,
    buyerId,
    templateId,
    subscriptionExpiresAt: expiresAt,
    prefix,
    nodeEnv,
    isProduction,
  };
}

module.exports = { loadEnv };