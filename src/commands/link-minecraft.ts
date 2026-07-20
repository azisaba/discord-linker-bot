import { PlayersApi } from "@azisaba/graph";
import {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from "discord.js";
import { RedisClientType } from "redis";

const LINK_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const REDIS_KEY_PREFIX = "discord-link:";

export function buildLinkMinecraftCommand(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName("link-minecraft")
    .setDescription("MinecraftとあなたのDiscordアカウントをリンクするよ")
    .addStringOption((option) =>
      option.setName("code").setDescription("リンクコード").setRequired(true),
    )
    .toJSON();
}

export async function receiveLinkMinecraftCommand({
  interaction,
  playersApi,
  redis,
}: {
  interaction: ChatInputCommandInteraction;
  playersApi: PlayersApi;
  redis: RedisClientType;
}) {
  const userId = interaction.user.id;
  const linkCode = interaction.options.getString("code", true).trim().toUpperCase();

  await interaction.deferReply({ flags: "Ephemeral" });

  if (!LINK_CODE_PATTERN.test(linkCode)) {
    await interaction.editReply({
      content: "❌ リンクコードが見つかりません。もう一度ご確認ください。",
    });
    return;
  }

  try {
    const linkedPlayers = await playersApi.listPlayers({
      discordId: userId,
      limit: 1,
    });
    if (linkedPlayers.items.length !== 0) {
      await interaction.editReply({
        content:
          "あなたのアカウントはすでにリンクされています。別のアカウントをリンクするには、先に `/unlink-minecraft` を実行してください。",
      });
      return;
    }

    const playerId = await redis.getDel(`${REDIS_KEY_PREFIX}${linkCode}`);
    if (playerId === null) {
      await interaction.editReply({
        content: "❌ リンクコードが見つかりません。もう一度ご確認ください。",
      });
      return;
    }

    const linkedPlayer = await playersApi.updatePlayerById({
      playerId,
      updatePlayerByIdRequest: { discordId: userId },
    });

    await addLinkedRole(interaction, linkedPlayer.username);
    await interaction.editReply({
      content: `🎉 リンクが完了しました！あなたのDiscordアカウントを \`${linkedPlayer.username}\` と紐付けしました。`,
    });

    console.log(
      `Successfully linked Discord user ${userId} to Minecraft player ${linkedPlayer.username} (${linkedPlayer.id})`,
    );
  } catch (error) {
    console.error("Error during account link process:", error);
    await interaction.editReply({
      content:
        "❌ 申し訳ありません。処理の途中でエラーが発生しました。しばらくしてからもう一度お試しください。",
    });
  }
}

async function addLinkedRole(
  interaction: ChatInputCommandInteraction,
  username: string,
): Promise<void> {
  const guild = interaction.guild;
  const roleId = process.env.DISCORD_ROLE_ID;
  if (!guild || !roleId) {
    return;
  }

  try {
    const role = await guild.roles.fetch(roleId);
    if (role) {
      const member = await guild.members.fetch(interaction.user.id);
      await member.roles.add(role);
      console.log(`Assigned role to user ${interaction.user.id} (${username})`);
    }
  } catch (error) {
    console.error(`Failed to assign role to linked user ${interaction.user.id}:`, error);
  }
}
