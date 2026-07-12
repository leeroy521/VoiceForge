const {
  ChannelType, PermissionFlagsBits, SlashCommandBuilder
} = require('discord.js');
const db = require('./db');

// Schéma de configuration exposé au dashboard : il génère le formulaire.
const CONFIG_SCHEMA = [
  { key: 'category_name', label: 'Nom de la catégorie', type: 'text', default: '🔥 VoiceForge', help: "Appliqué automatiquement en quelques secondes (après un premier /setup)" },
  { key: 'creator_name', label: 'Nom du salon créateur', type: 'text', default: '➕ Forger un salon', help: "Appliqué automatiquement en quelques secondes (après un premier /setup)" },
  { key: 'name_template', label: 'Modèle de nom des salons', type: 'text', default: '🔊 Salon de {user}', help: '{user} = pseudo du membre' },
  { key: 'default_limit', label: 'Limite de membres par défaut', type: 'number', default: 0, min: 0, max: 99, help: '0 = illimité' }
];

const getConfigRow = db.prepare('SELECT data FROM configs WHERE client_id = ? AND guild_id = ?');
const setConfigRow = db.prepare(`
  INSERT INTO configs (client_id, guild_id, data) VALUES (?, ?, ?)
  ON CONFLICT(client_id, guild_id) DO UPDATE SET data = excluded.data
`);

function configFor(clientId, guildId) {
  const defaults = Object.fromEntries(CONFIG_SCHEMA.map(f => [f.key, f.default]));
  const row = getConfigRow.get(clientId, guildId);
  let stored = {};
  if (row) { try { stored = JSON.parse(row.data); } catch {} }
  return { ...defaults, ...stored };
}

function patchConfig(clientId, guildId, patch) {
  const current = configFor(clientId, guildId);
  setConfigRow.run(clientId, guildId, JSON.stringify({ ...current, ...patch }));
}

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Installe VoiceForge sur ce serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Gérer ton salon vocal temporaire')
    .addSubcommand(s => s.setName('lock').setDescription('Verrouiller le salon'))
    .addSubcommand(s => s.setName('unlock').setDescription('Déverrouiller le salon'))
    .addSubcommand(s => s.setName('hide').setDescription('Rendre le salon invisible'))
    .addSubcommand(s => s.setName('show').setDescription('Rendre le salon visible'))
    .addSubcommand(s => s.setName('rename').setDescription('Renommer le salon')
      .addStringOption(o => o.setName('nom').setDescription('Nouveau nom').setRequired(true)))
    .addSubcommand(s => s.setName('limit').setDescription('Limite de membres')
      .addIntegerOption(o => o.setName('nombre').setDescription('0 = illimité').setMinValue(0).setMaxValue(99).setRequired(true)))
    .addSubcommand(s => s.setName('kick').setDescription('Expulser un membre du salon')
      .addUserOption(o => o.setName('membre').setDescription('Membre à expulser').setRequired(true)))
    .addSubcommand(s => s.setName('claim').setDescription("Devenir propriétaire si l'ancien est parti"))
    .addSubcommand(s => s.setName('transfer').setDescription('Transférer la propriété')
      .addUserOption(o => o.setName('membre').setDescription('Nouveau propriétaire').setRequired(true)))
].map(c => c.toJSON());

// Renomme la catégorie et le salon créateur si le nom configuré dans le panel
// diffère du nom réel sur Discord (plutôt que d'attendre un nouveau /setup).
async function syncManagedChannelNames(client) {
  for (const guild of client.guilds.cache.values()) {
    const cfg = configFor(client.user.id, guild.id);
    if (!cfg.creator_channel_id) continue;

    try {
      const creator = await guild.channels.fetch(cfg.creator_channel_id).catch(() => null);
      if (!creator) continue;
      if (creator.name !== cfg.creator_name) {
        await creator.setName(cfg.creator_name);
      }

      const categoryId = cfg.category_id || creator.parentId;
      if (!categoryId) continue;
      const category = await guild.channels.fetch(categoryId).catch(() => null);
      if (!category) continue;
      if (category.name !== cfg.category_name) {
        await category.setName(cfg.category_name);
      }
      if (!cfg.category_id) {
        patchConfig(client.user.id, guild.id, { category_id: categoryId });
      }
    } catch (err) {
      console.error(`Sync nommage (guild ${guild.id}) :`, err.message);
    }
  }
}

function attachTempVoice(client) {
  const tempChannels = new Map(); // { channelId: { ownerId } }

  client.once('ready', async () => {
    await client.application.commands.set(commands);
    syncManagedChannelNames(client);
    setInterval(() => syncManagedChannelNames(client), 15_000);
  });

  client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;
    const cfg = configFor(client.user.id, guild.id);

    if (newState.channelId && newState.channelId === cfg.creator_channel_id) {
      try {
        const member = newState.member;
        const name = String(cfg.name_template)
          .replaceAll('{user}', member.displayName).slice(0, 100);

        const channel = await guild.channels.create({
          name,
          type: ChannelType.GuildVoice,
          parent: newState.channel.parentId,
          userLimit: Number(cfg.default_limit) || 0,
          permissionOverwrites: [{
            id: member.id,
            allow: [
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.Connect
            ]
          }]
        });

        tempChannels.set(channel.id, { ownerId: member.id });
        await member.voice.setChannel(channel);
      } catch (err) {
        console.error('Erreur création salon :', err.message);
      }
    }

    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
      const channel = oldState.channel;
      if (channel && channel.members.size === 0) {
        tempChannels.delete(channel.id);
        channel.delete().catch(() => {});
      }
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup') {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      const cfg = configFor(client.user.id, guild.id);

      const category = await guild.channels.create({
        name: cfg.category_name, type: ChannelType.GuildCategory
      });
      const creator = await guild.channels.create({
        name: cfg.creator_name, type: ChannelType.GuildVoice, parent: category.id
      });

      patchConfig(client.user.id, guild.id, { creator_channel_id: creator.id, category_id: category.id });
      return interaction.editReply(`✅ VoiceForge est installé ! Rejoins ${creator} pour forger ton salon.`);
    }

    if (interaction.commandName === 'voice') {
      const member = interaction.member;
      const channel = member.voice?.channel;

      if (!channel || !tempChannels.has(channel.id)) {
        return interaction.reply({ content: '❌ Tu dois être dans **ton** salon temporaire.', ephemeral: true });
      }

      const data = tempChannels.get(channel.id);
      const sub = interaction.options.getSubcommand();

      if (sub === 'claim') {
        if (channel.members.has(data.ownerId)) {
          return interaction.reply({ content: '❌ Le propriétaire est encore dans le salon.', ephemeral: true });
        }
        data.ownerId = member.id;
        await channel.permissionOverwrites.edit(member.id, {
          ManageChannels: true, MoveMembers: true, Connect: true
        });
        return interaction.reply({ content: '👑 Tu es maintenant propriétaire de ce salon !', ephemeral: true });
      }

      if (data.ownerId !== member.id) {
        return interaction.reply({ content: '❌ Seul le propriétaire peut faire ça (`/voice claim` s\'il est parti).', ephemeral: true });
      }

      switch (sub) {
        case 'lock':
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
          return interaction.reply({ content: '🔒 Salon verrouillé.', ephemeral: true });
        case 'unlock':
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: null });
          return interaction.reply({ content: '🔓 Salon déverrouillé.', ephemeral: true });
        case 'hide':
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
          return interaction.reply({ content: '👻 Salon caché.', ephemeral: true });
        case 'show':
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: null });
          return interaction.reply({ content: '👀 Salon visible.', ephemeral: true });
        case 'rename': {
          const nom = interaction.options.getString('nom').slice(0, 100);
          await channel.setName(nom);
          return interaction.reply({ content: `✏️ Salon renommé en **${nom}**.`, ephemeral: true });
        }
        case 'limit': {
          const n = interaction.options.getInteger('nombre');
          await channel.setUserLimit(n);
          return interaction.reply({ content: `👥 Limite : **${n === 0 ? 'illimité' : n}**.`, ephemeral: true });
        }
        case 'kick': {
          const cible = interaction.options.getUser('membre');
          const cibleMembre = channel.members.get(cible.id);
          if (!cibleMembre) {
            return interaction.reply({ content: '❌ Ce membre n\'est pas dans ton salon.', ephemeral: true });
          }
          await cibleMembre.voice.disconnect();
          return interaction.reply({ content: `👢 ${cible} a été expulsé.`, ephemeral: true });
        }
        case 'transfer': {
          const cible = interaction.options.getUser('membre');
          if (!channel.members.has(cible.id)) {
            return interaction.reply({ content: '❌ Ce membre doit être dans le salon.', ephemeral: true });
          }
          data.ownerId = cible.id;
          await channel.permissionOverwrites.edit(cible.id, {
            ManageChannels: true, MoveMembers: true, Connect: true
          });
          return interaction.reply({ content: `👑 Propriété transférée à ${cible}.`, ephemeral: true });
        }
      }
    }
  });
}

module.exports = { attachTempVoice, CONFIG_SCHEMA };
