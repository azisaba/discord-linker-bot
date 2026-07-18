import { PlayersApi } from "@azisaba/graph";
import {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandBuilder,
} from "discord.js";
import { Connection, FieldPacket } from "mysql2/promise";

import { PendingAccountLinksRecord } from "../database";

export function buildLinkCommand(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName("link")
    .setDescription("MinecraftとあなたのDiscordアカウントをリンクするよ")
    .addStringOption((option) =>
      option.setName("code").setDescription("リンクコード").setRequired(true),
    )
    .toJSON();
}

export async function receiveLinkCommand({
  interaction,
  connection,
  playersApi,
}: {
  interaction: ChatInputCommandInteraction;
  connection: Connection;
  playersApi: PlayersApi;
}) {
  const userId = interaction.user.id;

  const linkCode = interaction.options.getString("code", true);

  await interaction.deferReply({ flags: "Ephemeral" });

  const linkedPlayers = await playersApi.listPlayers({
    discordId: userId,
    limit: 1,
  });

  if (linkedPlayers.items.length !== 0) {
    await interaction.editReply({
      content: `あなたのアカウントはすでにリンクされています。
        新しいアカウントをリンクするにはサポートにお問い合わせください。
        `,
    });
    return;
  }

  try {
    await connection.beginTransaction();

    const [pendingAccountLinks] = (await connection.execute(
      "SELECT id, username, code FROM pending_account_links WHERE code = ?",
      [linkCode],
    )) as [PendingAccountLinksRecord[], FieldPacket[]];

    if (pendingAccountLinks.length === 0) {
      await connection.rollback();
      await interaction.editReply({
        content: "❌ リンクコードが見つかりません。もう一度ご確認ください。",
      });
      return;
    }

    const pendingAccountLink = pendingAccountLinks[0];

    await playersApi.updatePlayerById({
      playerId: pendingAccountLink.id,
      updatePlayerByIdRequest: {
        discordId: userId,
      },
    });

    await connection.execute("DELETE FROM pending_account_links WHERE code = ?", [linkCode]);

    const guild = interaction.guild;
    const roleId = process.env.DISCORD_ROLE_ID;
    if (guild && roleId) {
      const role = await guild.roles.fetch(roleId);
      const guildMember = await guild.members.fetch(userId);

      if (role && guildMember) {
        await guildMember.roles.add(role);
        console.log(`Assigned role to user ${userId} (${pendingAccountLink.username})`);
      }
    }

    await interaction.editReply({
      content: `🎉 リンクが完了しました！あなたのDiscordアカウントを \`${pendingAccountLink.username}\` と紐付けしました。`,
    });

    console.log(
      `Successfully linked Discord user ${userId} to Minecraft player ${pendingAccountLink.username} (${pendingAccountLink.id})`,
    );
  } catch (error) {
    console.error("Error during account link process:", error);
    await connection.rollback();
    await interaction.editReply({
      content:
        "❌ 申し訳ありません。処理の途中でエラーが発生しました。しばらくしてからもう一度お試しください。",
    });
  }
}
