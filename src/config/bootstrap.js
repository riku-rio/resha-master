const { Client, Collection, GatewayIntentBits, REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./env");

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

async function syncCommands({ token, clientId, guildId }, commands) {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map((cmd) => cmd.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`[Master] Synced ${body.length} guild command(s) to ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log(`[Master] Synced ${body.length} global command(s).`);
}

async function bootstrap() {
  try {
    const env = loadEnv();

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

    // Load prefix commands
    const prefixCommandsPath = path.join(__dirname, "../prefixCommands");
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
    const commandsPath = path.join(__dirname, "../commands");
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
    const eventsPath = path.join(__dirname, "../events");
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
    await client.login(env.token);

    console.log("[Master] Bot logged in, starting child bots...");
    const { startAllBots } = require("../master/botManager");
    await startAllBots();
  } catch (error) {
    console.error("[Master] Startup failed:", error.message);
    process.exit(1);
  }
}

module.exports = { bootstrap };