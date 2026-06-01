const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  execute(client) {
    console.log(`Bot is ready as ${client.user.tag}`);
  },
};
