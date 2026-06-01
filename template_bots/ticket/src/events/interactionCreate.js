const { Events } = require("discord.js");

async function runHandler(interaction, label, handler) {
  try {
    await handler();
  } catch (error) {
    console.error(`${label} failed:`, error.message);
    const content = "An error occurred while executing this interaction.";
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content, flags: 64 });
    } else {
      await interaction.followUp({ content, flags: 64 });
    }
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      await runHandler(interaction, `Command ${interaction.commandName}`, async () => {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          const content = "Unknown command.";
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content, flags: 64 });
          } else {
            await interaction.followUp({ content, flags: 64 });
          }
          return;
        }

        await command.execute(interaction);
      });
      return;
    }

    if (interaction.isAnySelectMenu()) {
      const handler = interaction.client.componentHandlers.find((entry) => entry.matches(interaction.customId));
      if (!handler) {
        return;
      }

      await runHandler(interaction, `Component handler ${interaction.customId}`, async () => {
        await handler.execute(interaction);
      });
      return;
    }

    if (!interaction.isModalSubmit()) {
      return;
    }

    const handler = interaction.client.modalHandlers.find((entry) => entry.matches(interaction.customId));
    if (!handler) {
      return;
    }

    await runHandler(interaction, `Modal handler ${interaction.customId}`, async () => {
      await handler.execute(interaction);
    });
  },
};
