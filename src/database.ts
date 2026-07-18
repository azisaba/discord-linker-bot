import { Connection, createConnection } from "mysql2/promise";

export type PendingAccountLinksRecord = {
  id: string;
  username: string;
  code: string;
};

export async function createConnectionFromEnv() {
  const host = process.env.DB_HOST || "localhost";
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_DATABASE || "minecraft";

  return createConnection({
    host,
    user,
    password,
    database,
  });
}

export async function createTablesIfNotExists(connection: Connection) {
  try {
    await connection.execute(
      "CREATE TABLE IF NOT EXISTS pending_account_links (id VARCHAR(36) PRIMARY KEY, username VARCHAR(32) NOT NULL, code VARCHAR(8) NOT NULL)",
    );
    console.log("Pending account links table created or already exists");
  } catch (error) {
    console.error("Failed to create pending account links table", error);
    throw error;
  }
}
