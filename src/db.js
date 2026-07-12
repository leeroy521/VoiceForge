const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './data/botpanel.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Schéma partagé entre les bots et le dashboard.
// Chaque bot s'enregistre dans `bots` avec un schéma de config JSON :
// le dashboard génère les formulaires à partir de ce schéma, ce qui
// permet de gérer plusieurs bots différents sans toucher au site.
db.exec(`
CREATE TABLE IF NOT EXISTS bots (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  invite_permissions TEXT NOT NULL DEFAULT '0',
  config_schema TEXT NOT NULL DEFAULT '[]',
  last_seen INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bot_guilds (
  client_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  guild_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (client_id, guild_id)
);

CREATE TABLE IF NOT EXISTS configs (
  client_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (client_id, guild_id)
);
`);

module.exports = db;
