require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const db = require('./db');
const { attachVoiceForge, CONFIG_SCHEMA } = require('./voiceforge');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

// Permissions demandées dans le lien d'invitation
const INVITE_PERMISSIONS = (
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.MoveMembers |
  PermissionFlagsBits.Connect
).toString();

const registerBot = db.prepare(`
  INSERT INTO bots (client_id, name, avatar_url, invite_permissions, config_schema, last_seen)
  VALUES (@client_id, @name, @avatar_url, @invite_permissions, @config_schema, @last_seen)
  ON CONFLICT(client_id) DO UPDATE SET
    name = @name, avatar_url = @avatar_url,
    invite_permissions = @invite_permissions,
    config_schema = @config_schema, last_seen = @last_seen
`);
const upsertGuild = db.prepare(`
  INSERT INTO bot_guilds (client_id, guild_id, guild_name) VALUES (?, ?, ?)
  ON CONFLICT(client_id, guild_id) DO UPDATE SET guild_name = excluded.guild_name
`);
const removeGuild = db.prepare('DELETE FROM bot_guilds WHERE client_id = ? AND guild_id = ?');

function syncGuilds() {
  for (const guild of client.guilds.cache.values()) {
    upsertGuild.run(client.user.id, guild.id, guild.name);
  }
}

client.once('ready', () => {
  console.log(`⚒️  VoiceForge connecté : ${client.user.tag}`);
  registerBot.run({
    client_id: client.user.id,
    name: client.user.username,
    avatar_url: client.user.displayAvatarURL({ size: 64 }),
    invite_permissions: INVITE_PERMISSIONS,
    config_schema: JSON.stringify(CONFIG_SCHEMA),
    last_seen: Date.now()
  });
  syncGuilds();
  // heartbeat : le dashboard sait si le bot est en ligne
  setInterval(() => {
    registerBot.run({
      client_id: client.user.id,
      name: client.user.username,
      avatar_url: client.user.displayAvatarURL({ size: 64 }),
      invite_permissions: INVITE_PERMISSIONS,
      config_schema: JSON.stringify(CONFIG_SCHEMA),
      last_seen: Date.now()
    });
  }, 60_000);
});

client.on('guildCreate', (g) => upsertGuild.run(client.user.id, g.id, g.name));
client.on('guildDelete', (g) => removeGuild.run(client.user.id, g.id));

attachVoiceForge(client);

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant (fichier .env).');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);
