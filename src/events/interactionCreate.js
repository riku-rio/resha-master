const { Events } = require("discord.js");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Route component interactions (buttons, select menus, etc.)
    if (interaction.isMessageComponent()) {
      const handler = interaction.client.componentHandlers?.find((h) =>
        h.customId === interaction.customId || (h.customIdPrefix && interaction.customId.startsWith(h.customIdPrefix))
      );
      if (handler) await handler.execute(interaction);
      return;
    }

    // Route modal submissions
    if (interaction.isModalSubmit()) {
      const handler = interaction.client.modalHandlers?.find((h) =>
        h.customId === interaction.customId || (h.customIdPrefix && interaction.customId.startsWith(h.customIdPrefix))
      );
      if (handler) await handler.execute(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unknown command.", flags: 64 });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Master] Command ${interaction.commandName} failed:`, error.message);
      const content = "An error occurred while executing this command.";
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content, flags: 64 });
      } else {
        await interaction.followUp({ content, flags: 64 });
      }
    }
  },
};
