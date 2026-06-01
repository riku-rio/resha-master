const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Not Implemented yet"),
  async execute(interaction) {
    await interaction.reply({ content: "Ticket command not implemented yet." });
  },
};
