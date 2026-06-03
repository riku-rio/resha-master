const { Client, Collection, GatewayIntentBits, REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("../config/env");

function getAllJsFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllJsFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".js")) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

async function syncCommands({ botToken, botId, guildId }, commands) {
  const rest = new REST({ version: "10" }).setToken(botToken);
  const body = commands.map((cmd) => cmd.data.toJSON());

  await rest.put(Routes.applicationGuildCommands(botId, guildId), { body });
  console.log(`[Child:${botId}] Synced ${body.length} guild command(s) to ${guildId}.`);
}

async function startChildBot(botDir) {
  const env = loadEnv();
  const { botToken, botId, guildId } = env;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.appEnv = env;
  client.commands = new Collection();
  client.componentHandlers = [];
  client.modalHandlers = [];
  client.prefixCommands = new Collection();
  client.aliases = new Collection();

  // Guild guard — leave any guild that isn't the assigned one
  client.on("guildCreate", async (guild) => {
    if (guild.id !== guildId) {
      console.warn(`[Child:${botId}] Joined unauthorized guild ${guild.id}, leaving immediately.`);
      await guild.leave();
    }
  });

  // Startup sweep — evict stale guilds that were joined before this process started
  client.once(Events.ClientReady, async () => {
    for (const [id, guild] of client.guilds.cache) {
      if (id !== guildId) {
        console.warn(`[Child:${botId}] Found unauthorized guild ${id} on startup, leaving.`);
        await guild.leave();
      }
    }
  });

  // Load prefix commands
  const prefixCommandsPath = path.join(botDir, "src/prefixCommands");
  if (fs.existsSync(prefixCommandsPath)) {
    const files = getAllJsFiles(prefixCommandsPath);
    for (const file of files) {
      const pCmd = require(file);
      client.prefixCommands.set(pCmd.name, pCmd);
      if (Array.isArray(pCmd.aliases)) {
        pCmd.aliases.forEach((alias) => client.aliases.set(alias, pCmd.name));
      }
    }
  }

  // Load slash commands
  const commandsPath = path.join(botDir, "src/commands");
  const commands = [];
  if (fs.existsSync(commandsPath)) {
    const files = getAllJsFiles(commandsPath);
    for (const file of files) {
      const command = require(file);
      commands.push(command);
      client.commands.set(command.data.name, command);
      if (Array.isArray(command.componentHandlers)) {
        client.componentHandlers.push(...command.componentHandlers);
      }
      if (Array.isArray(command.modalHandlers)) {
        client.modalHandlers.push(...command.modalHandlers);
      }
    }
  }

  // Load events
  const eventsPath = path.join(botDir, "src/events");
  if (fs.existsSync(eventsPath)) {
    const files = getAllJsFiles(eventsPath);
    for (const file of files) {
      const event = require(file);
      if (event.once || event.name === "clientReady") {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
    }
  }

  await syncCommands(env, commands);
  await client.login(botToken);
  console.log(`[Child:${botId}] Bot is online.`);
}

// botDir is passed from botRunner via env var
const botDir = process.env.BOT_DIR;
if (!botDir) {
  console.error("[Child] BOT_DIR is not set.");
  process.exit(1);
}

startChildBot(botDir).catch((err) => {
  console.error(`[Child] Failed to start:`, err.message);
  process.exit(1);
});