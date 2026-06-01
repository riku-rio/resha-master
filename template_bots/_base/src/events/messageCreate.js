const { Events } = require('discord.js');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot) return;

    const prefix = client.appEnv?.prefix || process.env.PREFIX || '!';

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.prefixCommands.get(commandName) || client.prefixCommands.get(client.aliases.get(commandName));

    if (!command) return;

    try {
      await command.execute(message, args, client);
    } catch (error) {
      console.error(error);
      await message.reply('There was an error executing that command!');
    }
  },
};
