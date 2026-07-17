import {Configuration, PlayersApi} from '@azisaba/graph';
import {Connection, FieldPacket} from 'mysql2/promise';

type PlayerRecord = {
  id: string;
  discord_id: string | null;
};

export async function migrateToGraph(connection: Connection) {
  console.log('Migrating Discord links to graph');

  const apiKey = process.env.GRAPH_API_KEY;
  if (!apiKey) {
    throw new Error('GRAPH_API_KEY is not set');
  }

  const playersApi = new PlayersApi(
    new Configuration({
      accessToken: apiKey,
    }),
  );

  const [players] = await connection.execute('SELECT id, discord_id FROM players') as [PlayerRecord[], FieldPacket[]];

  for (const {id, discord_id} of players) {
    await playersApi.updatePlayerById({
      playerId: id,
      updatePlayerByIdRequest: {
        discordId: discord_id ?? undefined,
      }
    });
  }

  console.log(`Migration complete (${players.length} player[s])`);
}
