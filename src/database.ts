import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const databasePath = process.env.DATABASE_PATH ?? './data/game.sqlite';
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    duelist_level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    dp INTEGER NOT NULL DEFAULT 1000,
    starter_deck TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS player_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    card_key TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (discord_id) REFERENCES players(discord_id) ON DELETE CASCADE,
    UNIQUE(discord_id, card_key)
  );
`);

export type Player = {
  discord_id: string;
  username: string;
  duelist_level: number;
  xp: number;
  dp: number;
  starter_deck: string | null;
};

export function getPlayer(discordId: string): Player | undefined {
  return db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId) as Player | undefined;
}

export function createPlayer(discordId: string, username: string): Player {
  db.prepare(`
    INSERT OR IGNORE INTO players (discord_id, username)
    VALUES (?, ?)
  `).run(discordId, username);

  return getPlayer(discordId)!;
}

export function chooseStarterDeck(discordId: string, deck: string): boolean {
  const player = getPlayer(discordId);
  if (!player || player.starter_deck) return false;

  db.prepare('UPDATE players SET starter_deck = ? WHERE discord_id = ?').run(deck, discordId);
  return true;
}
