import { PlayersApi, UpdatePlayerByIdRequest } from "@azisaba/graph";
import {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from "discord.js";

export function buildUnlinkMinecraftCommand(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName("unlink-minecraft")
    .setDescription("Minecraftアカウントとのリンクを解除するよ")
    .toJSON();
}

export async function receiveUnlinkMinecraftCommand({
  interaction,
  playersApi,
}: {
  interaction: ChatInputCommandInteraction;
  playersApi: PlayersApi;
}) {
  const userId = interaction.user.id;
  await interaction.deferReply({ flags: "Ephemeral" });

  try {
    const linkedPlayers = await playersApi.listPlayers({
      discordId: userId,
      limit: 1,
    });
    const player = linkedPlayers.items[0];
    if (!player) {
      await interaction.editReply({
        content: "❌ あなたのDiscordアカウントにリンクされたMinecraftアカウントはありません。",
      });
      return;
    }

    await playersApi.updatePlayerById({
      playerId: player.id,
      updatePlayerByIdRequest: {
        discordId: null,
      } as unknown as UpdatePlayerByIdRequest,
    });

    await removeLinkedRole(interaction);
    await interaction.editReply({
      content: `Minecraftアカウント \`${player.username}\` とのリンクを解除しました。`,
    });

    console.log(
      `Successfully unlinked Discord user ${userId} from Minecraft player ${player.username} (${player.id})`,
    );
  } catch (error) {
    console.error("Error during account unlink process:", error);
    await interaction.editReply({
      content:
        "❌ 申し訳ありません。処理の途中でエラーが発生しました。しばらくしてからもう一度お試しください。",
    });
  }
}

async function removeLinkedRole(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const roleId = process.env.DISCORD_ROLE_ID;
  if (!guild || !roleId) {
    return;
  }

  try {
    const member = await guild.members.fetch(interaction.user.id);
    await member.roles.remove(roleId);
  } catch (error) {
    console.error(`Failed to remove role from unlinked user ${interaction.user.id}:`, error);
  }
}
