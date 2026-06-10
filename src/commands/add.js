/**
 * add.js
 * (Owner-only) Promotes a dev child bot to a full template.
 *
 * Flow:
 *   /add bot:<name (autocomplete, dev bots only)>
 *     → Select Menu: subscription duration   [add_sub_{botName}]
 *     → Copies child_bots/{botName} → template_bots/{botName}
 *     → Writes template.json, deletes .env, creates .env.example if missing
 *     → Updates DB record (templateId = new UUID, subscriptionExpiresAt)
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../utils/prisma");
const { assertOwner } = require("../utils/permissions");

// ── paths ─────────────────────────────────────────────────────────────────────

const childBotsRoot = path.resolve(__dirname, "../../child_bots");
const templateBotsRoot = path.resolve(__dirname, "../../template_bots");

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_EMOJI = { RUNNING: "🟢", STOPPED: "🔴", EXPIRED: "⚫" };

/**
 * Compute the subscription expiry Date from a duration string.
 * @param {"1mo"|"3mo"|"1year"|"custom"} duration
 * @returns {Date}
 */
function getExpiresAt(duration) {
  const now = new Date();
  switch (duration) {
    case "1mo": {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 1);
      return d;
    }
    case "3mo": {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 3);
      return d;
    }
    case "1year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() + 1);
      return d;
    }
    case "custom":
    default: {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() + 10);
      return d;
    }
  }
}

// ── command definition ────────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName("add")
  .setDescription("(Owner) Promote a dev bot to a template.")
  .addStringOption((option) =>
    option
      .setName("bot")
      .setDescription("The dev bot to promote")
      .setRequired(true)
      .setAutocomplete(true)
  );

// ── autocomplete ──────────────────────────────────────────────────────────────

async function autocomplete(interaction) {
  const owners = interaction.client.appEnv?.quattroOwners ?? [];
  if (!owners.includes(interaction.user.id)) {
    return interaction.respond([]);
  }

  const focused = interaction.options.getFocused().toLowerCase();

  const bots = await prisma.botInstance.findMany({
    where: { templateId: "base" },
  });

  const choices = bots
    .filter((b) => b.botName.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((b) => ({
      name: `${STATUS_EMOJI[b.status] ?? "❓"} ${b.botName}`,
      value: b.botName,
    }));

  await interaction.respond(choices);
}

// ── execute ───────────────────────────────────────────────────────────────────

async function execute(interaction) {
  const isOwner = await assertOwner(interaction, interaction.client);
  if (!isOwner) return;

  const botName = interaction.options.getString("bot", true);

  // Show duration select menu
  const subMenu = new StringSelectMenuBuilder()
    .setCustomId(`add_sub_${botName}`)
    .setPlaceholder("Select subscription duration…")
    .addOptions([
      { label: "1 Month", value: "1mo" },
      { label: "3 Months", value: "3mo" },
      { label: "1 Year", value: "1year" },
      { label: "Custom (10 years)", value: "custom" },
    ]);

  await interaction.reply({
    content: `Promoting **${botName}** to a template. Select a subscription duration:`,
    components: [new ActionRowBuilder().addComponents(subMenu)],
    flags: 64,
  });
}

// ── component handlers ────────────────────────────────────────────────────────

const componentHandlers = [
  {
    customIdPrefix: "add_sub_",
    async execute(interaction) {
      const isOwner = await assertOwner(interaction, interaction.client);
      if (!isOwner) return;

      await interaction.deferUpdate();

      // Parse botName from customId: "add_sub_{botName}"
      const botName = interaction.customId.slice("add_sub_".length);
      const duration = interaction.values[0];

      // Fetch bot from DB
      let bot;
      try {
        bot = await prisma.botInstance.findUnique({ where: { botName } });
      } catch (err) {
        await interaction.editReply({
          content: `❌ Database error while fetching bot: ${err.message}`,
          components: [],
        });
        return;
      }

      if (!bot) {
        await interaction.editReply({
          content: `❌ No bot named **${botName}** was found in the database.`,
          components: [],
        });
        return;
      }

      // Path safety for destination
      const safeName = path.basename(botName);
      const destPath = path.resolve(templateBotsRoot, safeName);
      if (!destPath.startsWith(templateBotsRoot + path.sep)) {
        await interaction.editReply({
          content: `❌ Path traversal detected for bot name "${botName}".`,
          components: [],
        });
        return;
      }

      // Path safety for source
      const srcName = path.basename(botName);
      const srcPath = path.resolve(childBotsRoot, srcName);
      if (!srcPath.startsWith(childBotsRoot + path.sep)) {
        await interaction.editReply({
          content: `❌ Path traversal detected for source bot "${botName}".`,
          components: [],
        });
        return;
      }

      if (!fs.existsSync(srcPath)) {
        await interaction.editReply({
          content: `❌ child_bots/${botName} does not exist on disk. Cannot promote.`,
          components: [],
        });
        return;
      }

      if (fs.existsSync(destPath)) {
        await interaction.editReply({
          content: `❌ template_bots/${botName} already exists. Remove it first.`,
          components: [],
        });
        return;
      }

      try {
        // Copy child bot to template folder
        fs.cpSync(srcPath, destPath, { recursive: true });

        // Write template.json
        const templateId = crypto.randomUUID();
        const templateJson = {
          id: templateId,
          name: botName,
          description: "Promoted from dev bot",
        };
        fs.writeFileSync(
          path.join(destPath, "template.json"),
          JSON.stringify(templateJson, null, 2),
          "utf8"
        );

        // Delete .env from template (secrets must not leak into template)
        const tplEnvPath = path.join(destPath, ".env");
        if (fs.existsSync(tplEnvPath)) {
          fs.rmSync(tplEnvPath);
        }

        // Create a blank .env.example if one doesn't already exist
        const tplEnvExamplePath = path.join(destPath, ".env.example");
        if (!fs.existsSync(tplEnvExamplePath)) {
          fs.writeFileSync(tplEnvExamplePath, "", "utf8");
        }

        // Update DB record
        const subscriptionExpiresAt = getExpiresAt(duration);
        await prisma.botInstance.update({
          where: { botName },
          data: { templateId, subscriptionExpiresAt },
        });

        await interaction.editReply({
          content: [
            `✅ **${botName}** has been promoted to a template!`,
            `Template ID: \`${templateId}\``,
            `Subscription expires: <t:${Math.floor(subscriptionExpiresAt.getTime() / 1000)}:F>`,
          ].join("\n"),
          components: [],
        });
      } catch (err) {
        console.error(`[Add] Failed to promote bot "${botName}":`, err.message);

        // Attempt cleanup of partially created template folder
        if (fs.existsSync(destPath)) {
          try {
            fs.rmSync(destPath, { recursive: true, force: true });
          } catch (cleanupErr) {
            console.error(`[Add] Failed to clean up "${destPath}":`, cleanupErr.message);
          }
        }

        await interaction.editReply({
          content: `❌ Failed to promote **${botName}**: ${err.message}`,
          components: [],
        });
      }
    },
  },
];

// ── export ────────────────────────────────────────────────────────────────────

module.exports = {
  data,
  autocomplete,
  execute,
  componentHandlers,
  modalHandlers: [],
};
