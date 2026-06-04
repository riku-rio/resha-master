module.exports = {
  name: "ping",
  aliases: ["p"],
  async execute(message, args) {
    await message.reply("Pong!");
  },
};
