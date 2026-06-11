/**
 * ticketStore.js
 * In-memory store for ticket system configuration and open tickets.
 * Persists config to a JSON file so it survives bot restarts.
 */

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "../../data/ticketConfig.json");

/**
 * Default config shape.
 */
const DEFAULT_CONFIG = {
  supportRoleIds: [],        // roles that can see / manage tickets
  transcriptChannelId: null, // channel where transcripts are sent
  ticketCategoryId: null,    // category where ticket channels are created
  maxOpenTickets: 3,         // max open tickets per user
  ticketTypes: [             // ticket categories shown in the open-ticket select menu
    { label: "🛠️ Support",     value: "support",     description: "General support questions" },
    { label: "💰 Billing",     value: "billing",     description: "Payment or subscription issues" },
    { label: "🐛 Bug Report",  value: "bug_report",  description: "Report a bug or issue" },
    { label: "💡 Suggestion",  value: "suggestion",  description: "Suggest a feature or improvement" },
  ],
  embedColor: 0x5865f2,     // ticket embed accent color
  embedTitle: "🎫 Support Tickets",
  embedDescription: "Need help? Open a ticket below and our team will assist you as soon as possible.",
  embedFooter: "Response time: typically under 24 hours",
};

let _config = null;

function ensureDataDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadConfig() {
  if (_config) return _config;
  ensureDataDir();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    _config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    _config = { ...DEFAULT_CONFIG };
  }
  return _config;
}

function saveConfig() {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(_config, null, 2), "utf8");
}

function getConfig() {
  return loadConfig();
}

function updateConfig(partial) {
  const cfg = loadConfig();
  Object.assign(cfg, partial);
  saveConfig();
  return cfg;
}

/**
 * In-memory map: channelId → { userId, type, openedAt, claimedBy, priority }
 */
const openTickets = new Map();

function openTicket(channelId, data) {
  openTickets.set(channelId, { ...data, openedAt: Date.now() });
}

function closeTicket(channelId) {
  openTickets.delete(channelId);
}

function getTicket(channelId) {
  return openTickets.get(channelId) ?? null;
}

function getUserOpenTickets(userId) {
  const result = [];
  for (const [chId, ticket] of openTickets) {
    if (ticket.userId === userId) result.push({ channelId: chId, ...ticket });
  }
  return result;
}

function getAllOpenTickets() {
  const result = [];
  for (const [chId, ticket] of openTickets) {
    result.push({ channelId: chId, ...ticket });
  }
  return result;
}

function claimTicket(channelId, staffId) {
  const ticket = openTickets.get(channelId);
  if (ticket) {
    ticket.claimedBy = staffId;
    openTickets.set(channelId, ticket);
  }
}

function escalateTicket(channelId) {
  const ticket = openTickets.get(channelId);
  if (ticket) {
    ticket.priority = "high";
    openTickets.set(channelId, ticket);
  }
}

module.exports = {
  getConfig,
  updateConfig,
  openTicket,
  closeTicket,
  getTicket,
  getUserOpenTickets,
  getAllOpenTickets,
  claimTicket,
  escalateTicket,
};
