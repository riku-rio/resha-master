module.exports = {
  name: 'ping',
  aliases: ['p'],
  async execute(message, args, client) {
    await message.reply('Pong!');
  },
};
