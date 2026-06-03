const { Events } = require("discord.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    const prefix = message.client.appEnv?.prefix || "!";
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command =
      message.client.prefixCommands.get(commandName) ||
      message.client.prefixCommands.get(message.client.aliases.get(commandName));

    if (!command) return;

    try {
      await command.execute(message, args);
    } catch (error) {
      console.error(`[Master] Prefix command ${commandName} failed:`, error.message);
      await message.reply({ content: "There was an error trying to execute that command!" });
    }
  },
};
