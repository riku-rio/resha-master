const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`[Base Template] Ready! Logged in as ${client.user.tag}`);
  },
};
