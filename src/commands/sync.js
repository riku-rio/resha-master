/**
 * sync.js
 * (Owner-only) Syncs child_bots/ filesystem into the database,
 * then automatically starts every newly added bot.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const prisma = require("../utils/prisma");
const { assertOwner } = require("../utils/permissions");
const { syncBotsFromFilesystem } = require("../utils/syncBots");
const { startBot } = require("../master/botManager");

// ── command definition ────────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName("sync")
  .setDescription("(Owner) Scan child_bots/, sync new bots to the database, and start them.");

// ── execute ───────────────────────────────────────────────────────────────────

async function execute(interaction) {
  const isOwner = await assertOwner(interaction, interaction.client);
  if (!isOwner) return;

  await interaction.deferReply({ flags: 64 });

  let result;
  try {
    result = await syncBotsFromFilesystem();
  } catch (err) {
    await interaction.editReply({ content: `❌ Sync failed: ${err.message}` });
    return;
  }

  // Auto-start every bot that was just added to the DB
  const started = [];
  for (const botName of result.added) {
    try {
      const bot = await prisma.botInstance.findUnique({ where: { botName } });
      if (!bot) throw new Error("Bot not found in DB after sync.");
      await startBot(bot);
      started.push(botName);
    } catch (err) {
      console.error(`[Sync] Failed to start bot "${botName}":`, err.message);
      result.errors.push({ name: botName, error: `Started failed: ${err.message}` });
    }
  }

  const embedColor = started.length > 0 ? 0x5865f2 : 0x95a5a6;

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle("🔄 Bot Sync")
    .setDescription("Scanned `child_bots/`, synced to database, and started new bots.")
    .addFields(
      {
        name: "✅ Added & Started",
        value: started.length > 0 ? started.join(", ") : "none",
        inline: false,
      },
      {
        name: "⏭️ Skipped",
        value: result.skipped.length > 0 ? result.skipped.join(", ") : "none",
        inline: false,
      },
      {
        name: "⚠️ No .env",
        value: result.noEnv.length > 0 ? result.noEnv.join(", ") : "none",
        inline: false,
      },
      {
        name: "❌ Errors",
        value:
          result.errors.length > 0
            ? result.errors.map((e) => `**${e.name}**: ${e.error}`).join("\n")
            : "none",
        inline: false,
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── export ────────────────────────────────────────────────────────────────────

module.exports = {
  data,
  execute,
  componentHandlers: [],
  modalHandlers: [],
};
