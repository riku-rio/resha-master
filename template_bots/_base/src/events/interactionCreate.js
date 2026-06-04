const { Events } = require("discord.js");

/**
 * Shared error-handling wrapper for all interaction handlers.
 * Mirrors the error-handling used by the chat-input command path.
 */
async function runHandler(handler, interaction) {
  try {
    await handler.execute(interaction);
  } catch (error) {
    console.error(`Handler ${interaction.customId} failed:`, error.message);
    const content = "An error occurred while handling this interaction.";
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content, flags: 64 });
      } else {
        await interaction.followUp({ content, flags: 64 });
      }
    } catch (replyError) {
      console.error(`Could not send error reply for ${interaction.customId}:`, replyError.message);
    }
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Route component interactions (buttons, select menus, etc.)
    if (interaction.isMessageComponent()) {
      const handler = interaction.client.componentHandlers?.find((h) =>
        h.customId === interaction.customId || (h.customIdPrefix && interaction.customId.startsWith(h.customIdPrefix))
      );
      if (handler) await runHandler(handler, interaction);
      return;
    }

    // Route modal submissions
    if (interaction.isModalSubmit()) {
      const handler = interaction.client.modalHandlers?.find((h) =>
        h.customId === interaction.customId || (h.customIdPrefix && interaction.customId.startsWith(h.customIdPrefix))
      );
      if (handler) await runHandler(handler, interaction);
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
      console.error(`Command ${interaction.commandName} failed:`, error.message);
      const content = "An error occurred while executing this command.";
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content, flags: 64 });
        } else {
          await interaction.followUp({ content, flags: 64 });
        }
      } catch (replyError) {
        console.error(`Could not send error reply for ${interaction.commandName}:`, replyError.message);
      }
    }
  },
};
