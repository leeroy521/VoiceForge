# ⚒️ VoiceForge

Bot Discord de **salons vocaux temporaires**.

- Un membre rejoint **➕ Forger un salon** → un salon vocal à son nom est créé, il en est propriétaire
- Le salon est supprimé automatiquement quand il est vide
- `/setup` (admin) installe la catégorie et le salon créateur
- Commandes propriétaire : `/voice lock · unlock · hide · show · rename · limit · kick · claim · transfer`

## Administration web

VoiceForge est conçu pour être administré depuis **[ForgePanel](https://github.com/leeroy521/ForgePanel)** : les admins de serveurs se connectent avec Discord et modifient la configuration du bot pour leur serveur (noms, modèle de nom `{user}`, limite par défaut). Le bot s'enregistre tout seul dans la base partagée avec son schéma de configuration.

Le déploiement complet (bot + panel, Docker) est documenté dans le README de ForgePanel.

## Lancer le bot seul

```bash
npm install
cp .env.example .env   # colle ton token dedans
npm start
```

## Créer l'application Discord

1. https://discord.com/developers/applications → **New Application**
2. **Bot** → **Reset Token** → colle le token dans `.env`
3. Aucun *privileged intent* requis
4. Invitation : **OAuth2 → URL Generator**, scopes `bot` + `applications.commands`, permissions `View Channels`, `Manage Channels`, `Move Members`, `Connect`
