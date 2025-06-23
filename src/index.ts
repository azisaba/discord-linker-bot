import { Client, GatewayIntentBits, SlashCommandBuilder, ChatInputCommandInteraction, REST, Routes } from 'discord.js';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

interface Player {
  id: string;
  name: string;
  discord_id: string | null;
  link_code: string | null;
}

class DiscordLinkerBot {
  private client: Client;
  private db: mysql.Connection | null = null;

  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds]
    });
  }

  async connectToDatabase() {
    try {
      this.db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'minecraft'
      });

      console.log('Connected to MariaDB database');
      await this.createTablesIfNotExists();
    } catch (error) {
      console.error('Failed to connect to database:', error);
      process.exit(1);
    }
  }

  async createTablesIfNotExists() {
    if (!this.db) return;

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(32) NOT NULL,
        discord_id VARCHAR(100) NULL,
        link_code VARCHAR(8) NULL
      )
    `;

    try {
      await this.db.execute(createTableQuery);
      console.log('Players table created or already exists');
    } catch (error) {
      console.error('Failed to create players table:', error);
    }
  }

  async registerSlashCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName('link')
        .setDescription('Minecraftアカウントとリンクします')
        .addStringOption(option =>
          option.setName('code')
            .setDescription('リンクコード')
            .setRequired(true)
        )
    ];

    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

    try {
      console.log('Started refreshing application (/) commands.');

      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
        { body: commands }
      );

      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error('Failed to register slash commands:', error);
    }
  }

  async handleLinkCommand(interaction: ChatInputCommandInteraction) {
    const linkCode = interaction.options.getString('code', true);
    const userId = interaction.user.id;

    if (!this.db) {
      await interaction.reply({
        content: 'データベース接続エラーが発生しました。後でもう一度お試しください。',
        ephemeral: true
      });
      return;
    }

    try {
      // Check if user is already linked
      const [existingRows] = await this.db.execute(
        'SELECT * FROM players WHERE discord_id = ?',
        [userId]
      ) as [Player[], mysql.FieldPacket[]];

      if (existingRows.length > 0) {
        await interaction.reply({
          content: 'あなたのアカウントは既にリンクされています。新しいアカウントをリンクするにはサポートにお問い合わせください。',
          ephemeral: true
        });
        return;
      }

      // Find player with matching link code
      const [playerRows] = await this.db.execute(
        'SELECT * FROM players WHERE link_code = ? AND discord_id IS NULL',
        [linkCode]
      ) as [Player[], mysql.FieldPacket[]];

      if (playerRows.length === 0) {
        await interaction.reply({
          content: '無効なリンクコードです。正しいコードを入力してください。',
          ephemeral: true
        });
        return;
      }

      const player = playerRows[0];

      // Update player with Discord ID and clear link code
      await this.db.execute(
        'UPDATE players SET discord_id = ?, link_code = NULL WHERE id = ?',
        [userId, player.id]
      );

      // Assign role to user
      const guild = interaction.guild;
      if (guild && process.env.DISCORD_ROLE_ID) {
        const member = await guild.members.fetch(userId);
        const role = await guild.roles.fetch(process.env.DISCORD_ROLE_ID);
        
        if (role) {
          await member.roles.add(role);
          console.log(`Assigned role to user ${userId} (${player.name})`);
        }
      }

      await interaction.reply({
        content: `リンクが完了しました！Minecraftプレイヤー "${player.name}" とDiscordアカウントが正常にリンクされました。`,
        ephemeral: true
      });

      console.log(`Successfully linked Discord user ${userId} to Minecraft player ${player.name} (${player.id})`);

    } catch (error) {
      console.error('Error during link process:', error);
      await interaction.reply({
        content: 'リンク処理中にエラーが発生しました。後でもう一度お試しください。',
        ephemeral: true
      });
    }
  }

  async start() {
    await this.connectToDatabase();

    this.client.once('ready', async () => {
      console.log(`Logged in as ${this.client.user?.tag}!`);
      await this.registerSlashCommands();
    });

    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'link') {
        await this.handleLinkCommand(interaction);
      }
    });

    await this.client.login(process.env.DISCORD_TOKEN);
  }
}

const bot = new DiscordLinkerBot();
bot.start().catch(console.error);
