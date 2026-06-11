/**
 * ticketHelpers.js
 * Shared helper functions for building embeds, permission checks, transcripts, etc.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const store = require("./ticketStore");

// ─── Permission Guard ────────────────────────────────────────────────────────

/**
 * Returns true if the member is admin / bot-owner / has a support role.
 */
function isStaff(member, client) {
  const cfg = store.getConfig();
  const buyerId = client.appEnv?.buyerId ?? "";

  if (member.id === buyerId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (cfg.supportRoleIds.some((id) => member.roles.cache.has(id))) return true;
  return false;
}

/**
 * Returns true if the member is admin or owner only (not support roles).
 */
function isAdminOrOwner(member, client) {
  const buyerId = client.appEnv?.buyerId ?? "";
  if (member.id === buyerId) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

// ─── Embeds ──────────────────────────────────────────────────────────────────

/**
 * Builds the main ticket panel embed (sent by /send).
 */
function buildTicketPanelEmbed() {
  const cfg = store.getConfig();
  return new EmbedBuilder()
    .setColor(cfg.embedColor)
    .setTitle(cfg.embedTitle)
    .setDescription(cfg.embedDescription)
    .addFields({
      name: "📋 How it works",
      value:
        "1. Select a category from the dropdown below\n" +
        "2. A private channel will be created for you\n" +
        "3. Describe your issue and our team will help you",
    })
    .setFooter({ text: cfg.embedFooter })
    .setTimestamp();
}

/**
 * Builds the select menu for opening a ticket.
 */
function buildOpenTicketSelectMenu() {
  const cfg = store.getConfig();
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket:open_select")
    .setPlaceholder("📂 Choose a category to open a ticket…")
    .addOptions(
      cfg.ticketTypes.map((t) => ({
        label: t.label,
        value: t.value,
        description: t.description,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

/**
 * Builds the ticket channel embed (shown inside the ticket channel after creation).
 */
function buildTicketChannelEmbed(member, ticketType) {
  const cfg = store.getConfig();
  const typeInfo = cfg.ticketTypes.find((t) => t.value === ticketType) ?? { label: ticketType };
  return new EmbedBuilder()
    .setColor(cfg.embedColor)
    .setTitle(`${typeInfo.label} — Ticket Opened`)
    .setDescription(
      `Welcome, ${member}! 👋\n\nPlease describe your issue in as much detail as possible and a staff member will be with you shortly.\n\n` +
      `> **Category:** ${typeInfo.label}\n` +
      `> **Opened by:** ${member.user.tag}\n` +
      `> **Opened at:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: "Use the controls below to manage this ticket." })
    .setTimestamp();
}

/**
 * Builds the action row shown inside a ticket channel (for the user + staff).
 */
function buildTicketControlRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket:manage_select")
      .setPlaceholder("⚙️ Ticket actions…")
      .addOptions([
        { label: "🔒 Close Ticket",      value: "close",     description: "Close and archive this ticket" },
        { label: "🛡️ Claim Ticket",      value: "claim",     description: "Staff: claim this ticket as yours" },
        { label: "⬆️ Escalate",           value: "escalate",  description: "Staff: mark as high-priority" },
        { label: "📝 Rename Ticket",      value: "rename",    description: "Staff: rename this ticket channel" },
        { label: "🚫 Ban from Tickets",   value: "ban",       description: "Staff: ban user from opening tickets" },
        { label: "📄 Save Transcript",    value: "transcript",description: "Staff: save a transcript of this ticket" },
      ])
  );
}

/**
 * Builds a close-confirmation embed with Yes/No buttons.
 */
function buildCloseConfirmEmbed() {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🔒 Close Ticket?")
    .setDescription("Are you sure you want to close this ticket? This action will archive the channel.");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:close_confirm").setLabel("Yes, Close").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket:close_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );

  return { embed, row };
}

// ─── Transcript ───────────────────────────────────────────────────────────────

/**
 * Fetches up to 200 messages from a channel and returns a formatted string transcript.
 */
async function buildTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].reverse();

  const lines = sorted.map((m) => {
    const time = new Date(m.createdTimestamp).toISOString();
    const attachments = m.attachments.size
      ? " [Attachments: " + m.attachments.map((a) => a.url).join(", ") + "]"
      : "";
    return `[${time}] ${m.author.tag}: ${m.content || "(embed/component)"}${attachments}`;
  });

  return lines.join("\n");
}

// ─── Channel Helpers ──────────────────────────────────────────────────────────

/**
 * Creates a ticket channel under the configured category.
 * Grants read/write to the opener and all support roles, hides from @everyone.
 */
async function createTicketChannel(guild, member, ticketType, client) {
  const cfg = store.getConfig();
  const count = store.getAllOpenTickets().length + 1;
  const slugType = ticketType.replace(/_/g, "-");
  const channelName = `🎫┃${slugType}-${String(count).padStart(4, "0")}`;

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  for (const roleId of cfg.supportRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }
  }

  // Also grant bot itself
  permissionOverwrites.push({
    id: client.user.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageChannels,
    ],
  });

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: cfg.ticketCategoryId ?? null,
    permissionOverwrites,
    topic: `Ticket | User: ${member.user.tag} | Type: ${ticketType} | Opened: ${new Date().toISOString()}`,
  });

  return channel;
}

module.exports = {
  isStaff,
  isAdminOrOwner,
  buildTicketPanelEmbed,
  buildOpenTicketSelectMenu,
  buildTicketChannelEmbed,
  buildTicketControlRow,
  buildCloseConfirmEmbed,
  buildTranscript,
  createTicketChannel,
};
