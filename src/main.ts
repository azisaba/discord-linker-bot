import { Configuration, PlayersApi } from "@azisaba/graph";
import { Client, Events, GatewayIntentBits } from "discord.js";

import { buildLinkCommand, receiveLinkCommand } from "./commands/link";
import { createConnectionFromEnv, createTablesIfNotExists } from "./database";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function main() {
  console.log("Starting...");

  const discordBotToken = process.env.DISCORD_BOT_TOKEN;
  if (!discordBotToken) {
    throw new Error("`DISCORD_BOT_TOKEN` must be set");
  }

  const graphApiKey = process.env.GRAPH_API_KEY;
  if (!graphApiKey) {
    throw new Error("`GRAPH_API_KEY` must be set");
  }

  const playersApi = new PlayersApi(
    new Configuration({
      accessToken: graphApiKey,
    }),
  );

  const connection = await createConnectionFromEnv();
  await createTablesIfNotExists(connection);

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);

    const commands = [buildLinkCommand()];
    await readyClient.application.commands.set(commands);
    console.log(`Registered ${commands.length} command(s)`);

    console.log("Client is ready");
  });

  client.on(Events.Error, async (error) => {
    console.error("Discord client error:", error);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === "link") {
      await receiveLinkCommand({
        interaction,
        connection,
        playersApi,
      });
    }
  });

  await client.login(discordBotToken);
}

async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`);
  try {
    await client.destroy();
    console.log("Client destroyed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  console.error("Error during startup:", error);
  process.exit(1);
});
