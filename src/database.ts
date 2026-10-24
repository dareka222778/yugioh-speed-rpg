import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { starterContents } from './cardCatalog';
import { isStarterDeck } from './starterDecks';

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

// Additive migration: preserve existing duelists, balances and starter choices.
const columns = new Set((db.prepare('PRAGMA table_info(players)').all() as {name: string}[]).map(c => c.name));
for (const [name, definition] of Object.entries({ character_name: "TEXT NOT NULL DEFAULT ''", biography: "TEXT NOT NULL DEFAULT ''", theme: "TEXT NOT NULL DEFAULT 'ametista'" })) {
  if (!columns.has(name)) db.exec(`ALTER TABLE players ADD COLUMN ${name} ${definition}`);
}

export type Player = {
  character_name: string;
  biography: string;
  theme: string;
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

// A receipt and all inventory rows commit together, or none of them do.
db.exec(`CREATE TABLE IF NOT EXISTS starter_grants (
  discord_id TEXT PRIMARY KEY REFERENCES players(discord_id) ON DELETE CASCADE,
  starter_deck TEXT NOT NULL,
  catalog_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

export const grantStarterCards = db.transaction((discordId: string): boolean => {
  const player = getPlayer(discordId);
  if (!player?.starter_deck || !isStarterDeck(player.starter_deck)) return false;
  if (db.prepare('SELECT 1 FROM starter_grants WHERE discord_id = ?').get(discordId)) return false;
  const contents = starterContents[player.starter_deck];
  if (!contents || contents.reduce((sum,item)=>sum+item.quantity,0) !== 20) throw new Error('Conjunto inicial inválido.');
  db.prepare('INSERT INTO starter_grants (discord_id, starter_deck) VALUES (?, ?)').run(discordId,player.starter_deck);
  const add = db.prepare(`INSERT INTO player_cards (discord_id,card_key,quantity) VALUES (?,?,?)
    ON CONFLICT(discord_id,card_key) DO UPDATE SET quantity = quantity + excluded.quantity`);
  for (const item of contents) add.run(discordId,item.id,item.quantity);
  return true;
});

export const chooseStarterDeck = db.transaction((discordId: string, deck: string): boolean => {
  if (!isStarterDeck(deck)) return false;
  const result = db.prepare('UPDATE players SET starter_deck = ? WHERE discord_id = ? AND starter_deck IS NULL').run(deck,discordId);
  if (!result.changes) return false;
  grantStarterCards(discordId);
  return true;
});

export function grantLegacyStarters(): number {
  const pending = db.prepare(`SELECT p.discord_id FROM players p LEFT JOIN starter_grants g ON p.discord_id = g.discord_id
    WHERE p.starter_deck IS NOT NULL AND g.discord_id IS NULL`).all() as {discord_id:string}[];
  return pending.reduce((sum,p)=>sum+Number(grantStarterCards(p.discord_id)),0);
}

export function getCollection(id:string): {card_key:string;quantity:number}[] {
  return db.prepare('SELECT card_key,quantity FROM player_cards WHERE discord_id = ? AND quantity > 0 ORDER BY card_key').all(id) as {card_key:string;quantity:number}[];
}

export function updateProfile(id: string, profile: { character_name: string; biography: string; theme: string }) {
  db.prepare('UPDATE players SET character_name = ?, biography = ?, theme = ? WHERE discord_id = ?')
    .run(profile.character_name, profile.biography, profile.theme, id);
}
