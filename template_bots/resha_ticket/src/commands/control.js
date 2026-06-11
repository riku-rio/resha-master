/**
 * /control — Ticket system setup wizard for admins & owners.
 *
 * Subcommands:
 *   /control setup         — Interactive setup wizard (category, support role, transcript channel)
 *   /control view          — View current ticket config
 *   /control addrole       — Add a support role
 *   /control removerole    — Remove a support role
 *   /control setcategory   — Set ticket category
 *   /control settranscripts— Set transcript log channel
 *   /control setcolor      — Set embed accent color (hex)
 *   /control setembed      — Customize the ticket panel embed title/description/footer
 *   /control setmax        — Set max open tickets per user
 *   /control listtickets   — List all currently open tickets
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const store = require("../utils/ticketStore");
const { isAdminOrOwner } = require("../utils/ticketHelpers");

// ─── Permission guard helper ─────────────────────────────────────────────────
async function denyAccess(interaction) {
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🚫 Access Denied")
        .setDescription("Only **administrators** and the **server owner** can use this command."),
    ],
    flags: 64,
  });
}

// ─── Subcommand handlers ─────────────────────────────────────────────────────

async function handleView(interaction) {
  const cfg = store.getConfig();

  const supportRolesDisplay =
    cfg.supportRoleIds.length > 0
      ? cfg.supportRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "`None set`";

  const embed = new EmbedBuilder()
    .setColor(cfg.embedColor)
    .setTitle("⚙️ Ticket System Configuration")
    .addFields(
      { name: "📁 Ticket Category",       value: cfg.ticketCategoryId ? `<#${cfg.ticketCategoryId}>` : "`Not set`",  inline: true },
      { name: "📑 Transcript Channel",    value: cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "`Not set`", inline: true },
      { name: "🔢 Max Tickets / User",    value: `\`${cfg.maxOpenTickets}\``, inline: true },
      { name: "🛡️ Support Roles",         value: supportRolesDisplay },
      { name: "🎨 Embed Color",           value: `\`#${cfg.embedColor.toString(16).toUpperCase().padStart(6, "0")}\``, inline: true },
      { name: "📝 Embed Title",           value: `\`${cfg.embedTitle}\``, inline: true },
      { name: "📋 Ticket Types",          value: cfg.ticketTypes.map((t) => `${t.label}`).join("\n") },
    )
    .setFooter({ text: "Use /control subcommands to update any setting." })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleSetup(interaction) {
  const cfg = store.getConfig();

  // Step 1: Show a summary + dropdown to jump to any setting
  const embed = new EmbedBuilder()
    .setColor(cfg.embedColor)
    .setTitle("🛠️ Ticket System Setup Wizard")
    .setDescription(
      "Use this wizard to configure your ticket system.\n" +
      "Select a setting to change from the dropdown below.\n\n" +
      "**Current Status:**\n" +
      `> Category: ${cfg.ticketCategoryId ? `<#${cfg.ticketCategoryId}>` : "⚠️ Not set"}\n` +
      `> Support Roles: ${cfg.supportRoleIds.length > 0 ? cfg.supportRoleIds.map((id) => `<@&${id}>`).join(", ") : "⚠️ None"}\n` +
      `> Transcript Channel: ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "⚠️ Not set"}\n` +
      `> Max Open Tickets: \`${cfg.maxOpenTickets}\``
    )
    .setFooter({ text: "Tip: Use /control view to see full config at any time." });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("control:setup_select")
      .setPlaceholder("🔧 What would you like to configure?")
      .addOptions([
        { label: "📁 Set Ticket Category",        value: "set_category",     description: "Category where ticket channels are created" },
        { label: "🛡️ Manage Support Roles",        value: "manage_roles",     description: "Add or remove support/staff roles" },
        { label: "📑 Set Transcript Channel",      value: "set_transcript",   description: "Where ticket transcripts are sent" },
        { label: "🔢 Set Max Open Tickets",        value: "set_max",          description: "Max simultaneous tickets per user" },
        { label: "🎨 Set Embed Color",             value: "set_color",        description: "Change the ticket embed accent color" },
        { label: "📝 Edit Panel Embed Text",       value: "edit_embed",       description: "Change title / description / footer of panel" },
      ])
  );

  return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

async function handleAddRole(interaction) {
  const role = interaction.options.getRole("role", true);
  const cfg = store.getConfig();

  if (cfg.supportRoleIds.includes(role.id)) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription(`⚠️ ${role} is already a support role.`)],
      flags: 64,
    });
  }

  store.updateConfig({ supportRoleIds: [...cfg.supportRoleIds, role.id] });

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Support Role Added")
        .setDescription(`${role} has been added as a support role.\n\nMembers with this role can view and manage all ticket channels.`),
    ],
    flags: 64,
  });
}

async function handleRemoveRole(interaction) {
  const role = interaction.options.getRole("role", true);
  const cfg = store.getConfig();

  if (!cfg.supportRoleIds.includes(role.id)) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription(`⚠️ ${role} is not a configured support role.`)],
      flags: 64,
    });
  }

  store.updateConfig({ supportRoleIds: cfg.supportRoleIds.filter((id) => id !== role.id) });

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Support Role Removed")
        .setDescription(`${role} has been removed from the support roles list.`),
    ],
    flags: 64,
  });
}

async function handleSetCategory(interaction) {
  const channel = interaction.options.getChannel("category", true);

  if (channel.type !== ChannelType.GuildCategory) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ Please select a **category** channel, not a text/voice channel.")],
      flags: 64,
    });
  }

  store.updateConfig({ ticketCategoryId: channel.id });

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Ticket Category Set")
        .setDescription(`Ticket channels will now be created under **${channel.name}**.`),
    ],
    flags: 64,
  });
}

async function handleSetTranscripts(interaction) {
  const channel = interaction.options.getChannel("channel", true);

  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ Please select a **text channel** for transcripts.")],
      flags: 64,
    });
  }

  store.updateConfig({ transcriptChannelId: channel.id });

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Transcript Channel Set")
        .setDescription(`Ticket transcripts will now be sent to ${channel}.`),
    ],
    flags: 64,
  });
}

async function handleSetColor(interaction) {
  const hex = interaction.options.getString("hex", true).replace(/^#/, "");

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ Invalid hex color. Example: `5865F2` or `#5865F2`")],
      flags: 64,
    });
  }

  const colorInt = parseInt(hex, 16);
  store.updateConfig({ embedColor: colorInt });

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(colorInt)
        .setTitle("✅ Embed Color Updated")
        .setDescription(`Ticket embeds will now use the color **#${hex.toUpperCase()}**.\nThis preview uses the new color!`),
    ],
    flags: 64,
  });
}

async function handleSetEmbed(interaction) {
  const title       = interaction.options.getString("title");
  const description = interaction.options.getString("description");
  const footer      = interaction.options.getString("footer");

  const partial = {};
  if (title)       partial.embedTitle = title;
  if (description) partial.embedDescription = description;
  if (footer)      partial.embedFooter = footer;

  if (Object.keys(partial).length === 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xfee75c).setDescription("⚠️ Please provide at least one field to update.")],
      flags: 64,
    });
  }

  const cfg = store.updateConfig(partial);

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(cfg.embedColor)
        .setTitle("✅ Panel Embed Updated")
        .addFields(
          { name: "Title",       value: `\`${cfg.embedTitle}\``,       inline: false },
          { name: "Description", value: cfg.embedDescription,           inline: false },
          { name: "Footer",      value: `\`${cfg.embedFooter}\``,       inline: false },
        ),
    ],
    flags: 64,
  });
}

async function handleSetMax(interaction) {
  const max = interaction.options.getInteger("amount", true);

  if (max < 1 || max > 10) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ Max open tickets must be between **1** and **10**.")],
      flags: 64,
    });
  }

  store.updateConfig({ maxOpenTickets: max });

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Max Tickets Updated")
        .setDescription(`Users can now have a maximum of **${max}** open ticket(s) at a time.`),
    ],
    flags: 64,
  });
}

async function handleListTickets(interaction) {
  const tickets = store.getAllOpenTickets();

  if (tickets.length === 0) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("📭 There are currently **no open tickets**.")],
      flags: 64,
    });
  }

  const cfg = store.getConfig();
  const lines = tickets.map((t, i) => {
    const typeInfo = cfg.ticketTypes.find((x) => x.value === t.type) ?? { label: t.type };
    const elapsed = Math.floor((Date.now() - t.openedAt) / 60000);
    const claimed = t.claimedBy ? ` • Claimed by <@${t.claimedBy}>` : "";
    const priority = t.priority === "high" ? " 🔴 HIGH" : "";
    return `**${i + 1}.** <#${t.channelId}> — ${typeInfo.label}${priority}\n> Opened by <@${t.userId}> • ${elapsed}m ago${claimed}`;
  });

  const embed = new EmbedBuilder()
    .setColor(cfg.embedColor)
    .setTitle(`📋 Open Tickets (${tickets.length})`)
    .setDescription(lines.join("\n\n"))
    .setTimestamp();

  return interaction.reply({ embeds: [embed], flags: 64 });
}

// ─── Setup select-menu component handler ─────────────────────────────────────

const setupSelectHandler = {
  customIdPrefix: "control:setup_select",
  async execute(interaction) {
    if (!isAdminOrOwner(interaction.member, interaction.client)) {
      return interaction.reply({ content: "🚫 Access denied.", flags: 64 });
    }

    const value = interaction.values[0];

    const instructions = {
      set_category: {
        title: "📁 Set Ticket Category",
        body:  "Use `/control setcategory` and mention a **category** channel.\nTicket channels will be created inside it.",
      },
      manage_roles: {
        title: "🛡️ Manage Support Roles",
        body:  "Use:\n• `/control addrole @role` — grant staff access to tickets\n• `/control removerole @role` — revoke staff access",
      },
      set_transcript: {
        title: "📑 Set Transcript Channel",
        body:  "Use `/control settranscripts #channel` to set where closed ticket logs are sent.",
      },
      set_max: {
        title: "🔢 Set Max Open Tickets",
        body:  "Use `/control setmax <number>` (1–10) to limit how many open tickets a user can have at once.",
      },
      set_color: {
        title: "🎨 Set Embed Color",
        body:  "Use `/control setcolor <hex>` to change the accent color.\nExample: `/control setcolor 5865F2`",
      },
      edit_embed: {
        title: "📝 Edit Panel Embed Text",
        body:  "Use `/control setembed` with optional `title`, `description`, and `footer` options to customize the ticket panel.",
      },
    };

    const info = instructions[value];
    const embed = new EmbedBuilder()
      .setColor(store.getConfig().embedColor)
      .setTitle(info.title)
      .setDescription(info.body)
      .setFooter({ text: "Dismiss this message when you're ready." });

    return interaction.reply({ embeds: [embed], flags: 64 });
  },
};

// ─── Command definition ───────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("control")
    .setDescription("🎛️ Ticket system setup and management (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName("setup").setDescription("Open the interactive setup wizard")
    )
    .addSubcommand((sub) =>
      sub.setName("view").setDescription("View the current ticket system configuration")
    )
    .addSubcommand((sub) =>
      sub
        .setName("addrole")
        .setDescription("Add a support/staff role")
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to add as support staff").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("removerole")
        .setDescription("Remove a support/staff role")
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to remove from support staff").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("setcategory")
        .setDescription("Set the category where ticket channels are created")
        .addChannelOption((opt) =>
          opt.setName("category").setDescription("The category channel").setRequired(true)
            .addChannelTypes(ChannelType.GuildCategory)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("settranscripts")
        .setDescription("Set the channel where ticket transcripts are sent")
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("Text channel for transcripts").setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("setcolor")
        .setDescription("Set the embed accent color (hex, e.g. 5865F2)")
        .addStringOption((opt) => opt.setName("hex").setDescription("Hex color code").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("setembed")
        .setDescription("Customize the ticket panel embed text")
        .addStringOption((opt) => opt.setName("title").setDescription("New embed title"))
        .addStringOption((opt) => opt.setName("description").setDescription("New embed description"))
        .addStringOption((opt) => opt.setName("footer").setDescription("New embed footer"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("setmax")
        .setDescription("Set the max number of open tickets per user (1–10)")
        .addIntegerOption((opt) =>
          opt.setName("amount").setDescription("Maximum open tickets").setRequired(true).setMinValue(1).setMaxValue(10)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("listtickets").setDescription("List all currently open tickets")
    ),

  componentHandlers: [setupSelectHandler],

  async execute(interaction) {
    if (!isAdminOrOwner(interaction.member, interaction.client)) {
      return denyAccess(interaction);
    }

    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case "setup":          return handleSetup(interaction);
      case "view":           return handleView(interaction);
      case "addrole":        return handleAddRole(interaction);
      case "removerole":     return handleRemoveRole(interaction);
      case "setcategory":    return handleSetCategory(interaction);
      case "settranscripts": return handleSetTranscripts(interaction);
      case "setcolor":       return handleSetColor(interaction);
      case "setembed":       return handleSetEmbed(interaction);
      case "setmax":         return handleSetMax(interaction);
      case "listtickets":    return handleListTickets(interaction);
      default:
        return interaction.reply({ content: "Unknown subcommand.", flags: 64 });
    }
  },
};
