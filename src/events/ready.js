const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    const botId = client.appEnv?.botId;
    const prefix = botId ? `Child:${botId}` : "Master";
    console.log(`[${prefix}] Logged in as ${client.user.tag}`);
  },
};
