/**
 * create.js
 * (Owner-only) Creates a new child bot from the base template or a template bot.
 *
 * Flow:
 *   /create
 *     → Select Menu: "Dev Bot" or "Template Bot"           [create_type]
 *     → If "dev": show modal immediately                   [modal_create_dev]
 *     → If "template":
 *         → Select Menu: pick a template                   [create_tpl_select]
 *         → Select Menu: pick subscription duration        [create_sub_select_{folderName}]
 *         → Show modal                                     [modal_create_tpl_{folderName}_{duration}]
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const path = require("path");
const fs = require("fs");
const prisma = require("../utils/prisma");
const { assertOwner } = require("../utils/permissions");
const { startBot } = require("../master/botManager");

// ── paths ─────────────────────────────────────────────────────────────────────

const childBotsRoot = path.resolve(__dirname, "../../child_bots");
const templateBotsRoot = path.resolve(__dirname, "../../template_bots");
// The base template lives in template_bots/_base/
const baseFolderName = "_base";

// ── helpers ───────────────────────────────────────────────────────────────────

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

/**
 * Validate botName and return a path-safe botDir.
 * @param {string} botName
 * @returns {{ safe: true, botDir: string } | { safe: false, reason: string }}
 */
function resolveSafeBotDir(botName) {
  const safeName = path.basename(botName);
  const botDir = path.resolve(childBotsRoot, safeName);
  if (!botDir.startsWith(childBotsRoot + path.sep)) {
    return { safe: false, reason: "Path traversal detected." };
  }
  return { safe: true, botDir };
}

/**
 * Build the .env file content for a child bot.
 */
function buildEnvContent({ botName, token, botId, guildId, prefix, buyerId, templateId, subscriptionExpiresAt }) {
  return [
    `BOT_NAME=${botName}`,
    `BOT_TOKEN=${token}`,
    `BOT_ID=${botId}`,
    `GUILD_ID=${guildId}`,
    `PREFIX=${prefix || "!"}`,
    `BUYER_ID=${buyerId}`,
    `TEMPLATE_ID=${templateId}`,
    `SUBSCRIPTION_EXPIRES_AT=${subscriptionExpiresAt instanceof Date ? subscriptionExpiresAt.toISOString() : subscriptionExpiresAt}`,
    `NODE_ENV=production`,
  ].join("\n");
}

/**
 * Read all non-base template folders and build Select Menu options.
 * Skips folders without template.json; skips the base folder.
 * @returns {{ label: string, value: string, description: string }[]}
 */
function buildTemplateOptions() {
  const options = [];
  let entries;
  try {
    entries = fs.readdirSync(templateBotsRoot, { withFileTypes: true });
  } catch {
    return options;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === baseFolderName) continue; // skip base

    const tplJsonPath = path.join(templateBotsRoot, entry.name, "template.json");
    if (!fs.existsSync(tplJsonPath)) {
      console.warn(`[Create] Skipping template folder "${entry.name}" — missing template.json`);
      continue;
    }

    try {
      const tpl = JSON.parse(fs.readFileSync(tplJsonPath, "utf8"));
      options.push({
        label: tpl.name ?? entry.name,
        value: entry.name,
        description: (tpl.description ?? "").slice(0, 100),
      });
    } catch (err) {
      console.warn(`[Create] Failed to parse template.json in "${entry.name}":`, err.message);
    }
  }

  return options;
}

// ── duration select menu options (shared) ─────────────────────────────────────

const DURATION_OPTIONS = [
  { label: "1 Month", value: "1mo" },
  { label: "3 Months", value: "3mo" },
  { label: "1 Year", value: "1year" },
  { label: "Custom (10 years)", value: "custom" },
];

// ── command definition ────────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName("create")
  .setDescription("(Owner) Create a new child bot from a template.");

// ── execute ───────────────────────────────────────────────────────────────────

async function execute(interaction) {
  const isOwner = await assertOwner(interaction, interaction.client);
  if (!isOwner) return;

  const typeMenu = new StringSelectMenuBuilder()
    .setCustomId("create_type")
    .setPlaceholder("What kind of bot do you want to create?")
    .addOptions(
      { label: "Dev Bot", value: "dev", description: "Creates a dev bot from the base template (no subscription)." },
      { label: "Template Bot", value: "template", description: "Creates a bot from one of your templates." }
    );

  const row = new ActionRowBuilder().addComponents(typeMenu);

  await interaction.reply({
    content: "Select the type of bot to create:",
    components: [row],
    flags: 64,
  });
}

// ── component handlers ────────────────────────────────────────────────────────

const componentHandlers = [
  // ── Step 1: type selected ─────────────────────────────────────────────────
  {
    customId: "create_type",
    async execute(interaction) {
      const isOwner = await assertOwner(interaction, interaction.client);
      if (!isOwner) return;

      const chosen = interaction.values[0];

      if (chosen === "dev") {
        // Show modal immediately
        const modal = new ModalBuilder()
          .setCustomId("modal_create_dev")
          .setTitle("Create Dev Bot");

        const botNameInput = new TextInputBuilder()
          .setCustomId("botName")
          .setLabel("Bot Name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const tokenInput = new TextInputBuilder()
          .setCustomId("token")
          .setLabel("Bot Token")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const botIdInput = new TextInputBuilder()
          .setCustomId("botId")
          .setLabel("Bot ID (Application ID)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const guildIdInput = new TextInputBuilder()
          .setCustomId("guildId")
          .setLabel("Guild ID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const prefixInput = new TextInputBuilder()
          .setCustomId("prefix")
          .setLabel("Prefix (default: !)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue("!");

        modal.addComponents(
          new ActionRowBuilder().addComponents(botNameInput),
          new ActionRowBuilder().addComponents(tokenInput),
          new ActionRowBuilder().addComponents(botIdInput),
          new ActionRowBuilder().addComponents(guildIdInput),
          new ActionRowBuilder().addComponents(prefixInput)
        );

        await interaction.showModal(modal);
        return;
      }

      // "template" selected — show template picker
      const tplOptions = buildTemplateOptions();
      if (tplOptions.length === 0) {
        await interaction.update({
          content: "❌ No templates found in `template_bots/`. Add a template folder with a `template.json` first.",
          components: [],
        });
        return;
      }

      const tplMenu = new StringSelectMenuBuilder()
        .setCustomId("create_tpl_select")
        .setPlaceholder("Select a template…")
        .addOptions(tplOptions);

      await interaction.update({
        content: "Select a template:",
        components: [new ActionRowBuilder().addComponents(tplMenu)],
      });
    },
  },

  // ── Step 2 (template): template selected ─────────────────────────────────
  {
    customId: "create_tpl_select",
    async execute(interaction) {
      const isOwner = await assertOwner(interaction, interaction.client);
      if (!isOwner) return;

      const folderName = interaction.values[0];

      const subMenu = new StringSelectMenuBuilder()
        .setCustomId(`create_sub_select_${folderName}`)
        .setPlaceholder("Select subscription duration…")
        .addOptions(DURATION_OPTIONS);

      await interaction.update({
        content: `Template **${folderName}** selected. Choose subscription duration:`,
        components: [new ActionRowBuilder().addComponents(subMenu)],
      });
    },
  },

  // ── Step 3 (template): duration selected → show modal ────────────────────
  {
    customIdPrefix: "create_sub_select_",
    async execute(interaction) {
      const isOwner = await assertOwner(interaction, interaction.client);
      if (!isOwner) return;

      // customId = "create_sub_select_{folderName}"
      const folderName = interaction.customId.slice("create_sub_select_".length);
      const duration = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`modal_create_tpl_${folderName}_${duration}`)
        .setTitle(`Create Bot from "${folderName}"`);

      const botNameInput = new TextInputBuilder()
        .setCustomId("botName")
        .setLabel("Bot Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const tokenInput = new TextInputBuilder()
        .setCustomId("token")
        .setLabel("Bot Token")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const botIdInput = new TextInputBuilder()
        .setCustomId("botId")
        .setLabel("Bot ID (Application ID)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const guildIdInput = new TextInputBuilder()
        .setCustomId("guildId")
        .setLabel("Guild ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const buyerIdInput = new TextInputBuilder()
        .setCustomId("buyerId")
        .setLabel("Buyer ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      // Note: Discord modals support max 5 rows; prefix goes as 6th — omit or
      // combine. We include prefix as it's important for child bots.
      // Five inputs fit exactly.
      modal.addComponents(
        new ActionRowBuilder().addComponents(botNameInput),
        new ActionRowBuilder().addComponents(tokenInput),
        new ActionRowBuilder().addComponents(botIdInput),
        new ActionRowBuilder().addComponents(guildIdInput),
        new ActionRowBuilder().addComponents(buyerIdInput)
      );

      await interaction.showModal(modal);
    },
  },
];

// ── modal handlers ────────────────────────────────────────────────────────────

const modalHandlers = [
  // ── Dev bot creation ──────────────────────────────────────────────────────
  {
    customIdPrefix: "modal_create_dev",
    async execute(interaction) {
      const isOwner = await assertOwner(interaction, interaction.client);
      if (!isOwner) return;

      await interaction.deferReply({ flags: 64 });

      const botName = interaction.fields.getTextInputValue("botName").trim();
      const token = interaction.fields.getTextInputValue("token").trim();
      const botId = interaction.fields.getTextInputValue("botId").trim();
      const guildId = interaction.fields.getTextInputValue("guildId").trim();
      const prefix = (interaction.fields.getTextInputValue("prefix") || "!").trim() || "!";
      const buyerId = interaction.user.id;
      const templateId = "base";
      const subscriptionExpiresAt = getExpiresAt("custom"); // dev bots get +10 years

      // Path safety
      const resolved = resolveSafeBotDir(botName);
      if (!resolved.safe) {
        await interaction.editReply({ content: `❌ Invalid bot name: ${resolved.reason}` });
        return;
      }
      const { botDir } = resolved;

      // Uniqueness checks
      try {
        const existingName = await prisma.botInstance.findUnique({ where: { botName } });
        if (existingName) {
          await interaction.editReply({ content: `❌ A bot named **${botName}** already exists in the database.` });
          return;
        }

        const existingId = await prisma.botInstance.findUnique({ where: { botId } });
        if (existingId) {
          await interaction.editReply({ content: `❌ A bot with ID \`${botId}\` already exists in the database.` });
          return;
        }
      } catch (err) {
        console.error("[Create] DB uniqueness check failed:", err.message);
        await interaction.editReply({ content: `❌ Database error: ${err.message}` });
        return;
      }

      if (fs.existsSync(botDir)) {
        await interaction.editReply({ content: `❌ Folder \`child_bots/${botName}\` already exists.` });
        return;
      }

      // Copy base template
      const baseDir = path.resolve(templateBotsRoot, baseFolderName);
      let copied = false;
      try {
        fs.cpSync(baseDir, botDir, { recursive: true });
        copied = true;

        // Write .env
        const envContent = buildEnvContent({ botName, token, botId, guildId, prefix, buyerId, templateId, subscriptionExpiresAt });
        fs.writeFileSync(path.join(botDir, ".env"), envContent, "utf8");

        // Create DB record
        const bot = await prisma.botInstance.create({
          data: { botName, botToken: token, botId, guildId, templateId, buyerId, prefix, status: "STOPPED", subscriptionExpiresAt },
        });

        // Start the bot
        await startBot(bot);

        await interaction.editReply({
          content: `✅ Dev bot **${botName}** created and started successfully!`,
        });
      } catch (err) {
        console.error(`[Create] Failed to create dev bot "${botName}":`, err.message);

        // Cleanup on error
        if (copied && fs.existsSync(botDir)) {
          try {
            fs.rmSync(botDir, { recursive: true, force: true });
          } catch (cleanupErr) {
            console.error(`[Create] Failed to clean up "${botDir}":`, cleanupErr.message);
          }
        }

        await interaction.editReply({ content: `❌ Failed to create bot **${botName}**: ${err.message}` });
      }
    },
  },

  // ── Template bot creation ─────────────────────────────────────────────────
  {
    customIdPrefix: "modal_create_tpl_",
    async execute(interaction) {
      const isOwner = await assertOwner(interaction, interaction.client);
      if (!isOwner) return;

      await interaction.deferReply({ flags: 64 });

      // customId = "modal_create_tpl_{folderName}_{duration}"
      // folderName may contain underscores, but duration is the last segment
      const suffix = interaction.customId.slice("modal_create_tpl_".length);
      const lastUnderscore = suffix.lastIndexOf("_");
      const folderName = suffix.slice(0, lastUnderscore);
      const duration = suffix.slice(lastUnderscore + 1);

      const botName = interaction.fields.getTextInputValue("botName").trim();
      const token = interaction.fields.getTextInputValue("token").trim();
      const botId = interaction.fields.getTextInputValue("botId").trim();
      const guildId = interaction.fields.getTextInputValue("guildId").trim();
      const buyerId = interaction.fields.getTextInputValue("buyerId").trim();
      const prefix = "!"; // template modal doesn't have a prefix field (5-input limit)
      const subscriptionExpiresAt = getExpiresAt(duration);

      // Path safety
      const resolved = resolveSafeBotDir(botName);
      if (!resolved.safe) {
        await interaction.editReply({ content: `❌ Invalid bot name: ${resolved.reason}` });
        return;
      }
      const { botDir } = resolved;

      // Uniqueness checks
      try {
        const existingName = await prisma.botInstance.findUnique({ where: { botName } });
        if (existingName) {
          await interaction.editReply({ content: `❌ A bot named **${botName}** already exists in the database.` });
          return;
        }

        const existingId = await prisma.botInstance.findUnique({ where: { botId } });
        if (existingId) {
          await interaction.editReply({ content: `❌ A bot with ID \`${botId}\` already exists in the database.` });
          return;
        }
      } catch (err) {
        console.error("[Create] DB uniqueness check failed:", err.message);
        await interaction.editReply({ content: `❌ Database error: ${err.message}` });
        return;
      }

      if (fs.existsSync(botDir)) {
        await interaction.editReply({ content: `❌ Folder \`child_bots/${botName}\` already exists.` });
        return;
      }

      // Read template.json
      let templateData;
      const tplJsonPath = path.resolve(templateBotsRoot, path.basename(folderName), "template.json");
      try {
        templateData = JSON.parse(fs.readFileSync(tplJsonPath, "utf8"));
      } catch (err) {
        await interaction.editReply({ content: `❌ Could not read template.json for **${folderName}**: ${err.message}` });
        return;
      }

      const templateId = templateData.id;
      const templateDir = path.resolve(templateBotsRoot, path.basename(folderName));

      let copied = false;
      try {
        fs.cpSync(templateDir, botDir, { recursive: true });
        copied = true;

        // Write .env
        const envContent = buildEnvContent({ botName, token, botId, guildId, prefix, buyerId, templateId, subscriptionExpiresAt });
        fs.writeFileSync(path.join(botDir, ".env"), envContent, "utf8");

        // Create DB record
        const bot = await prisma.botInstance.create({
          data: { botName, botToken: token, botId, guildId, templateId, buyerId, prefix, status: "STOPPED", subscriptionExpiresAt },
        });

        // Start the bot
        await startBot(bot);

        await interaction.editReply({
          content: `✅ Template bot **${botName}** (from \`${folderName}\`) created and started!\nSubscription expires: <t:${Math.floor(subscriptionExpiresAt.getTime() / 1000)}:F>`,
        });
      } catch (err) {
        console.error(`[Create] Failed to create template bot "${botName}":`, err.message);

        // Cleanup on error
        if (copied && fs.existsSync(botDir)) {
          try {
            fs.rmSync(botDir, { recursive: true, force: true });
          } catch (cleanupErr) {
            console.error(`[Create] Failed to clean up "${botDir}":`, cleanupErr.message);
          }
        }

        await interaction.editReply({ content: `❌ Failed to create bot **${botName}**: ${err.message}` });
      }
    },
  },
];

// ── export ────────────────────────────────────────────────────────────────────

module.exports = {
  data,
  execute,
  componentHandlers,
  modalHandlers,
};
