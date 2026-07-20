import { Configuration, PlayersApi } from "@azisaba/graph";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { createClient } from "redis";

import { buildLinkMinecraftCommand, receiveLinkMinecraftCommand } from "./commands/link-minecraft";
import {
  buildUnlinkMinecraftCommand,
  receiveUnlinkMinecraftCommand,
} from "./commands/unlink-minecraft";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});
redis.on("error", (error) => console.error("Redis client error:", error));

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

  await redis.connect();
  console.log("Connected to Redis");

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);

    const commands = [buildLinkMinecraftCommand(), buildUnlinkMinecraftCommand()];
    await readyClient.application.commands.set(commands);
    console.log(`Registered ${commands.length} command(s)`);

    console.log("Client is ready");
  });

  client.on(Events.Error, async (error) => {
    console.error("Discord client error:", error);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    switch (interaction.commandName) {
      case "link-minecraft":
        await receiveLinkMinecraftCommand({ interaction, playersApi, redis });
        break;
      case "unlink-minecraft":
        await receiveUnlinkMinecraftCommand({ interaction, playersApi });
        break;
    }
  });

  await client.login(discordBotToken);
}

async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`);
  try {
    await client.destroy();
    if (redis.isOpen) {
      await redis.quit();
    }
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
