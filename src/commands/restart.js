/**
 * restart.js
 * (Owner-only) Cascade-restarts all RUNNING child bots.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const prisma = require("../utils/prisma");
const { assertOwner } = require("../utils/permissions");
const { restartBot } = require("../master/botManager");

// ── command definition ────────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName("restart")
  .setDescription("(Owner) Cascade-restart all currently RUNNING child bots.");

// ── execute ───────────────────────────────────────────────────────────────────

async function execute(interaction) {
  const isOwner = await assertOwner(interaction, interaction.client);
  if (!isOwner) return;

  await interaction.deferReply({ flags: 64 });

  // Fetch all running bots
  let runningBots;
  try {
    runningBots = await prisma.botInstance.findMany({
      where: { status: "RUNNING" },
    });
  } catch (err) {
    await interaction.editReply({ content: `❌ Failed to query running bots: ${err.message}` });
    return;
  }

  if (runningBots.length === 0) {
    await interaction.editReply({ content: "ℹ️ No bots are currently RUNNING." });
    return;
  }

  const restarted = [];
  const failed = [];

  for (const bot of runningBots) {
    try {
      await restartBot(bot.botId);
      restarted.push(bot.botName);
    } catch (err) {
      console.error(`[Restart] Failed to restart bot "${bot.botName}":`, err.message);
      failed.push({ name: bot.botName, error: err.message });
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔁 Cascade Restart")
    .setDescription(`Restarted **${restarted.length}** bot(s).`)
    .addFields(
      {
        name: "✅ Restarted",
        value: restarted.length > 0 ? restarted.join(", ") : "none",
        inline: false,
      },
      {
        name: "❌ Failed",
        value:
          failed.length > 0
            ? failed.map((f) => `**${f.name}**: ${f.error}`).join("\n")
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
