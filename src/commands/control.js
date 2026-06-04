const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const prisma = require("../utils/prisma");
const { assertOwner } = require("../utils/permissions");
const { startBot, stopBot } = require("../master/botManager");

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_EMOJI = { RUNNING: "🟢", STOPPED: "🔴", EXPIRED: "⚫" };

/**
 * Recursively counts .js files in a directory.
 * Returns 0 gracefully if the directory does not exist.
 * @param {string} dirPath - absolute path
 * @returns {number}
 */
function countJsFiles(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return 0;
    let count = 0;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        count += countJsFiles(path.join(dirPath, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Safely resolves the child-bot source root, guards against path traversal.
 * @param {string} botName
 * @returns {string|null} resolved root, or null if traversal detected
 */
function resolveChildBotRoot(botName) {
  const childBotsRoot = path.resolve(__dirname, "../../child_bots");
  const safeName = path.basename(botName); // strip any directory components
  const resolved = path.resolve(childBotsRoot, safeName);
  // Ensure the resolved path is still inside child_bots/
  if (!resolved.startsWith(childBotsRoot + path.sep) && resolved !== childBotsRoot) {
    return null;
  }
  return resolved;
}

// ── command definition ────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("control")
    .setDescription("(Owner) Inspect and toggle a child bot.")
    .addStringOption((option) =>
      option
        .setName("bot")
        .setDescription("The child bot to inspect/toggle")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // ── autocomplete ──────────────────────────────────────────────────────────

  async autocomplete(interaction) {
    const owners = interaction.client.appEnv?.quattroOwners ?? [];
    if (!owners.includes(interaction.user.id)) {
      return interaction.respond([]);
    }

    const focused = interaction.options.getFocused().toLowerCase();

    const bots = await prisma.botInstance.findMany({
      where: { status: { not: "EXPIRED" } },
    });

    const choices = bots
      .filter((b) => b.botName.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((b) => ({
        name: `${STATUS_EMOJI[b.status] ?? "❓"} ${b.botName}`,
        value: b.botName,
      }));

    await interaction.respond(choices);
  },

  // ── execute ───────────────────────────────────────────────────────────────

  async execute(interaction) {
    // 1. Owner guard
    const isOwner = await assertOwner(interaction, interaction.client);
    if (!isOwner) return;

    // 2. Ephemeral defer
    await interaction.deferReply({ flags: 64 });

    const botName = interaction.options.getString("bot", true);

    // 3. Fetch record
    const bot = await prisma.botInstance.findUnique({ where: { botName } });

    // 4. Not found
    if (!bot) {
      await interaction.editReply({ content: `❌ No bot named **${botName}** was found in the database.` });
      return;
    }

    // 5. Expired
    if (bot.status === "EXPIRED") {
      await interaction.editReply({ content: `⚫ Bot **${botName}** has an expired subscription and cannot be toggled.` });
      return;
    }

    // 6. Toggle
    let action;
    try {
      if (bot.status === "RUNNING") {
        await stopBot(bot.botId);
        action = "stopped";
      } else {
        await startBot(bot);
        action = "started";
      }
    } catch (err) {
      console.error(`[Master] control: failed to toggle bot ${botName}:`, err.message);
      await interaction.editReply({ content: `❌ Failed to ${bot.status === "RUNNING" ? "stop" : "start"} **${botName}**: ${err.message}` });
      return;
    }

    // 7. Re-fetch updated record
    const updated = await prisma.botInstance.findUnique({ where: { botName } });

    // 8. Count files in child_bots/{botName}/src/...
    const botRoot = resolveChildBotRoot(botName);
    let slashCommands = 0;
    let prefixCommands = 0;
    let events = 0;

    if (botRoot) {
      const srcRoot = path.join(botRoot, "src");
      slashCommands = countJsFiles(path.join(srcRoot, "commands"));
      prefixCommands = countJsFiles(path.join(srcRoot, "prefixCommands"));
      events = countJsFiles(path.join(srcRoot, "events"));
    } else {
      console.warn(`[Master] control: path traversal detected for botName "${botName}"`);
    }

    // 9. Build embed
    const wasStopped = action === "stopped";
    const statusEmoji = STATUS_EMOJI[updated?.status ?? bot.status] ?? "❓";
    const embedColor = wasStopped ? 0xed4245 : 0x57f287;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${statusEmoji} ${botName}`)
      .setDescription(`Bot has been **${action}** successfully.`)
      .addFields(
        { name: "Bot ID", value: updated?.botId ?? bot.botId, inline: true },
        { name: "Template", value: updated?.templateId ?? bot.templateId, inline: true },
        { name: "Buyer ID", value: updated?.buyerId ?? bot.buyerId, inline: true },
        { name: "Guild ID", value: updated?.guildId ?? bot.guildId, inline: true },
        { name: "Prefix", value: `\`${updated?.prefix ?? bot.prefix}\``, inline: true },
        { name: "Status", value: `${statusEmoji} ${updated?.status ?? bot.status}`, inline: true },
        { name: "Slash Commands", value: String(slashCommands), inline: true },
        { name: "Prefix Commands", value: String(prefixCommands), inline: true },
        { name: "Events", value: String(events), inline: true },
        {
          name: "Subscription Expires",
          value: `<t:${Math.floor(new Date(updated?.subscriptionExpiresAt ?? bot.subscriptionExpiresAt).getTime() / 1000)}:F>`,
          inline: false,
        },
        {
          name: "Created At",
          value: `<t:${Math.floor(new Date(updated?.createdAt ?? bot.createdAt).getTime() / 1000)}:F>`,
          inline: true,
        },
        {
          name: "Updated At",
          value: `<t:${Math.floor(new Date(updated?.updatedAt ?? bot.updatedAt).getTime() / 1000)}:F>`,
          inline: true,
        }
      )
      .setFooter({ text: `Quattro Master • DB ID: ${updated?.id ?? bot.id}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
