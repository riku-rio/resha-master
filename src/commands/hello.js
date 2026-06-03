const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Replies with Hello! (master bot handler test)"),
  async execute(interaction) {
    await interaction.reply({ content: `Hello, ${interaction.user.username}! 👋` });
  },
};
