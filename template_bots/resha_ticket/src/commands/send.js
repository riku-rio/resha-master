/**
 * /send — Send the ticket panel embed to a channel so users can open tickets.
 *
 * Usage: /send [channel]
 *   channel (optional) — target channel, defaults to current channel
 *
 * This also wires in ALL the component + modal handlers for the ticket system:
 *   • ticket:open_select       — user picks a ticket type to open
 *   • ticket:manage_select     — user/staff picks a ticket action
 *   • ticket:close_confirm     — confirm close button
 *   • ticket:close_cancel      — cancel close button
 *   • ticket:rename_modal      — rename ticket modal submit
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require("discord.js");

const store = require("../utils/ticketStore");
const helpers = require("../utils/ticketHelpers");

// ─── Banned users (in-memory) ─────────────────────────────────────────────────
const bannedFromTickets = new Set();

// ─── Ticket Open Select Handler ───────────────────────────────────────────────

const openSelectHandler = {
  customId: "ticket:open_select",
  async execute(interaction) {
    const ticketType = interaction.values[0];
    const member     = interaction.member;
    const guild      = interaction.guild;
    const cfg        = store.getConfig();

    // Ban check
    if (bannedFromTickets.has(member.id)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🚫 Banned from Tickets")
            .setDescription("You have been banned from opening tickets. Please contact an admin if you believe this is a mistake."),
        ],
        flags: 64,
      });
    }

    // Max tickets check
    const userTickets = store.getUserOpenTickets(member.id);
    if (userTickets.length >= cfg.maxOpenTickets) {
      const links = userTickets.map((t) => `<#${t.channelId}>`).join(", ");
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("⚠️ Too Many Open Tickets")
            .setDescription(
              `You already have **${userTickets.length}** open ticket(s): ${links}\n\n` +
              `Please close your existing tickets before opening a new one.\n` +
              `Maximum allowed: **${cfg.maxOpenTickets}**`
            ),
        ],
        flags: 64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    // Create the ticket channel
    let channel;
    try {
      channel = await helpers.createTicketChannel(guild, member, ticketType, interaction.client);
    } catch (err) {
      console.error("[Ticket] Failed to create channel:", err);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription("❌ Failed to create ticket channel. Make sure the bot has **Manage Channels** permission."),
        ],
      });
    }

    // Register in store
    store.openTicket(channel.id, { userId: member.id, type: ticketType, priority: "normal" });

    // Send the ticket embed + control row inside the new channel
    const ticketEmbed = helpers.buildTicketChannelEmbed(member, ticketType);
    const controlRow  = helpers.buildTicketControlRow();

    await channel.send({
      content: `Welcome ${member} 👋  |  Staff: ${cfg.supportRoleIds.map((id) => `<@&${id}>`).join(", ") || "*No support roles configured*"}`,
      embeds:  [ticketEmbed],
      components: [controlRow],
    });

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(cfg.embedColor)
          .setTitle("✅ Ticket Opened!")
          .setDescription(`Your ticket has been created: ${channel}\n\nPlease head over and describe your issue.`),
      ],
    });
  },
};

// ─── Ticket Manage Select Handler ─────────────────────────────────────────────

const manageSelectHandler = {
  customId: "ticket:manage_select",
  async execute(interaction) {
    const action  = interaction.values[0];
    const channel = interaction.channel;
    const member  = interaction.member;
    const ticket  = store.getTicket(channel.id);

    if (!ticket) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ This doesn't appear to be a valid ticket channel.")],
        flags: 64,
      });
    }

    const isStaff = helpers.isStaff(member, interaction.client);

    // ── close ────────────────────────────────────────────────────────────────
    if (action === "close") {
      const { embed, row } = helpers.buildCloseConfirmEmbed();
      return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    }

    // ── claim ────────────────────────────────────────────────────────────────
    if (action === "claim") {
      if (!isStaff) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("🚫 Only support staff can claim tickets.")],
          flags: 64,
        });
      }
      store.claimTicket(channel.id, member.id);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(`🛡️ **${member.user.tag}** has claimed this ticket and will be handling it.`),
        ],
      });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ You have claimed this ticket.")],
        flags: 64,
      });
    }

    // ── escalate ─────────────────────────────────────────────────────────────
    if (action === "escalate") {
      if (!isStaff) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("🚫 Only support staff can escalate tickets.")],
          flags: 64,
        });
      }
      store.escalateTicket(channel.id);
      // Rename channel to reflect priority
      try {
        await channel.setName("🔴┃" + channel.name.replace(/^[^┃]+┃/, ""));
      } catch { /* permission issue — ignore */ }

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔴 Ticket Escalated")
            .setDescription(`This ticket has been marked as **HIGH PRIORITY** by ${member}.\nSenior staff will be notified.`),
        ],
      });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("🔴 Ticket escalated to high priority.")],
        flags: 64,
      });
    }

    // ── rename ────────────────────────────────────────────────────────────────
    if (action === "rename") {
      if (!isStaff) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("🚫 Only support staff can rename tickets.")],
          flags: 64,
        });
      }
      const modal = new ModalBuilder()
        .setCustomId("ticket:rename_modal")
        .setTitle("Rename Ticket Channel");

      const nameInput = new TextInputBuilder()
        .setCustomId("ticket:rename_input")
        .setLabel("New channel name (without emoji prefix)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. billing-john-doe")
        .setMaxLength(90)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
      return interaction.showModal(modal);
    }

    // ── ban ───────────────────────────────────────────────────────────────────
    if (action === "ban") {
      if (!helpers.isAdminOrOwner(member, interaction.client)) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("🚫 Only administrators can ban users from tickets.")],
          flags: 64,
        });
      }
      bannedFromTickets.add(ticket.userId);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription(`🚫 <@${ticket.userId}> has been banned from opening new tickets by ${member}.`),
        ],
      });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ <@${ticket.userId}> banned from tickets.`)],
        flags: 64,
      });
    }

    // ── transcript ────────────────────────────────────────────────────────────
    if (action === "transcript") {
      if (!isStaff) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("🚫 Only support staff can save transcripts.")],
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const transcriptText = await helpers.buildTranscript(channel);
        const cfg = store.getConfig();
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName  = `transcript-${channel.name}-${timestamp}.txt`;

        const buffer     = Buffer.from(transcriptText, "utf8");
        const attachment = new AttachmentBuilder(buffer, { name: fileName });

        // Send to transcript channel if configured
        if (cfg.transcriptChannelId) {
          const transcriptChannel = await interaction.guild.channels.fetch(cfg.transcriptChannelId).catch(() => null);
          if (transcriptChannel) {
            await transcriptChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(cfg.embedColor)
                  .setTitle("📄 Ticket Transcript Saved")
                  .addFields(
                    { name: "Channel",  value: channel.name,             inline: true },
                    { name: "Saved by", value: member.user.tag,          inline: true },
                    { name: "Saved at", value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
                  ),
              ],
              files: [attachment],
            });
          }
        }

        // Also send to the interaction user
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle("📄 Transcript Saved")
              .setDescription(
                `Transcript has been saved as \`${fileName}\`.` +
                (cfg.transcriptChannelId ? `\nAlso sent to <#${cfg.transcriptChannelId}>.` : "")
              ),
          ],
          files: [new AttachmentBuilder(Buffer.from(transcriptText, "utf8"), { name: fileName })],
        });
      } catch (err) {
        console.error("[Ticket] Transcript error:", err);
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ Failed to generate transcript.")],
        });
      }
    }

    return interaction.reply({ content: "Unknown action.", flags: 64 });
  },
};

// ─── Close Confirm Button Handler ─────────────────────────────────────────────

const closeConfirmHandler = {
  customId: "ticket:close_confirm",
  async execute(interaction) {
    const channel = interaction.channel;
    const member  = interaction.member;
    const ticket  = store.getTicket(channel.id);
    const cfg     = store.getConfig();

    if (!ticket) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ No ticket record found for this channel.")],
        flags: 64,
      });
    }

    // Only the ticket opener or staff can close
    if (ticket.userId !== member.id && !helpers.isStaff(member, interaction.client)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("🚫 Only the ticket opener or staff can close this ticket.")],
        flags: 64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    // Save transcript before closing
    let transcriptSent = false;
    if (cfg.transcriptChannelId) {
      try {
        const transcriptText     = await helpers.buildTranscript(channel);
        const timestamp          = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName           = `transcript-${channel.name}-${timestamp}.txt`;
        const attachment         = new AttachmentBuilder(Buffer.from(transcriptText, "utf8"), { name: fileName });
        const transcriptChannel  = await interaction.guild.channels.fetch(cfg.transcriptChannelId).catch(() => null);

        if (transcriptChannel) {
          await transcriptChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(cfg.embedColor)
                .setTitle("🔒 Ticket Closed — Transcript")
                .addFields(
                  { name: "Channel",    value: channel.name,                                  inline: true },
                  { name: "Opener",     value: `<@${ticket.userId}>`,                         inline: true },
                  { name: "Closed by",  value: member.user.tag,                               inline: true },
                  { name: "Duration",   value: `${Math.floor((Date.now() - ticket.openedAt) / 60000)}m`, inline: true },
                  { name: "Type",       value: ticket.type,                                   inline: true },
                  { name: "Priority",   value: ticket.priority ?? "normal",                   inline: true },
                ),
            ],
            files: [attachment],
          });
          transcriptSent = true;
        }
      } catch (err) {
        console.error("[Ticket] Failed to save transcript on close:", err);
      }
    }

    store.closeTicket(channel.id);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🔒 Ticket Closed")
          .setDescription(
            `This ticket has been closed by ${member}.\n` +
            (transcriptSent ? `📄 Transcript saved to <#${cfg.transcriptChannelId}>.` : "") +
            `\n\nThis channel will be deleted in **5 seconds**.`
          )
          .setTimestamp(),
      ],
    });

    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Ticket closed. Channel will be deleted shortly.")],
    });

    // Delete channel after 5s
    setTimeout(async () => {
      try {
        await channel.delete("Ticket closed by " + member.user.tag);
      } catch (err) {
        console.error("[Ticket] Failed to delete channel:", err);
      }
    }, 5000);
  },
};

// ─── Close Cancel Button Handler ──────────────────────────────────────────────

const closeCancelHandler = {
  customId: "ticket:close_cancel",
  async execute(interaction) {
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("👍 Close cancelled. The ticket remains open.")],
      components: [],
    });
  },
};

// ─── Rename Modal Handler ─────────────────────────────────────────────────────

const renameModalHandler = {
  customId: "ticket:rename_modal",
  async execute(interaction) {
    const rawName = interaction.fields.getTextInputValue("ticket:rename_input");
    const safeName = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90);
    const newName  = `🎫┃${safeName}`;

    try {
      await interaction.channel.setName(newName);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Channel Renamed")
            .setDescription(`Ticket channel renamed to **${newName}**.`),
        ],
        flags: 64,
      });
    } catch (err) {
      console.error("[Ticket] Rename failed:", err);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ Failed to rename channel. Check bot permissions.")],
        flags: 64,
      });
    }
  },
};

// ─── /send command ────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("send")
    .setDescription("📨 Send the ticket panel to a channel so users can open tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to send the ticket panel to (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText)
    ),

  componentHandlers: [openSelectHandler, manageSelectHandler, closeConfirmHandler, closeCancelHandler],
  modalHandlers: [renameModalHandler],

  async execute(interaction) {
    if (!helpers.isAdminOrOwner(interaction.member, interaction.client)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🚫 Access Denied")
            .setDescription("Only **administrators** and the **server owner** can send the ticket panel."),
        ],
        flags: 64,
      });
    }

    const target = interaction.options.getChannel("channel") ?? interaction.channel;
    const cfg    = store.getConfig();

    const embed     = helpers.buildTicketPanelEmbed();
    const selectRow = helpers.buildOpenTicketSelectMenu();

    try {
      await target.send({ embeds: [embed], components: [selectRow] });
    } catch (err) {
      console.error("[Send] Failed to send ticket panel:", err);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription(`❌ Failed to send panel to ${target}. Make sure I have **Send Messages** permission there.`),
        ],
        flags: 64,
      });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(cfg.embedColor)
          .setTitle("✅ Ticket Panel Sent")
          .setDescription(
            `The ticket panel has been sent to ${target}.\n\n` +
            `Users can now select a category from the dropdown to open a ticket.\n\n` +
            (cfg.ticketCategoryId
              ? `📁 Channels will be created under <#${cfg.ticketCategoryId}>.`
              : "⚠️ **Warning:** No ticket category is set. Use `/control setcategory` first.")
          ),
      ],
      flags: 64,
    });
  },
};
