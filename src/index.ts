import 'dotenv/config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';
import { chooseStarterDeck, createPlayer, getPlayer } from './database';
import { isStarterDeck, starterDecks } from './starterDecks';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  throw new Error('Preencha DISCORD_TOKEN e DISCORD_CLIENT_ID no .env.');
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Testa se o bot está online.'),
  new SlashCommandBuilder().setName('start').setDescription('Cria seu duelista e escolhe um deck inicial.'),
  new SlashCommandBuilder().setName('perfil').setDescription('Mostra seu perfil de duelista.')
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token!);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId!, guildId), { body: commands });
    console.log('Comandos registrados no servidor de teste.');
  } else {
    await rest.put(Routes.applicationCommands(clientId!), { body: commands });
    console.log('Comandos globais registrados.');
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, readyClient => {
  console.log(`Yu-Gi-Oh! Speed RPG online como ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ping') {
      await interaction.reply({ content: '🏓 Pong! O RPG está online.', ephemeral: true });
      return;
    }

    if (interaction.commandName === 'start') {
      const player = createPlayer(interaction.user.id, interaction.user.username);

      if (player.starter_deck) {
        await interaction.reply({ content: 'Você já escolheu seu deck inicial. Use `/perfil`.', ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('⚡ Yu-Gi-Oh! Speed RPG')
        .setDescription('Sua jornada como duelista começa agora. Escolha seu primeiro deck. Esta escolha será permanente na V0.')
        .addFields(Object.entries(starterDecks).map(([, deck]) => ({
          name: `${deck.emoji} ${deck.name}`,
          value: deck.description
        })));

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        Object.entries(starterDecks).map(([key, deck]) =>
          new ButtonBuilder()
            .setCustomId(`starter:${key}`)
            .setLabel(deck.name)
            .setEmoji(deck.emoji)
            .setStyle(ButtonStyle.Primary)
        )
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    if (interaction.commandName === 'perfil') {
      const player = getPlayer(interaction.user.id);
      if (!player) {
        await interaction.reply({ content: 'Você ainda não é um duelista. Use `/start`.', ephemeral: true });
        return;
      }

      const deck = player.starter_deck && isStarterDeck(player.starter_deck)
        ? `${starterDecks[player.starter_deck].emoji} ${starterDecks[player.starter_deck].name}`
        : 'Ainda não escolhido';

      const embed = new EmbedBuilder()
        .setTitle(`🪪 ${interaction.user.username}`)
        .addFields(
          { name: 'Nível', value: String(player.duelist_level), inline: true },
          { name: 'XP', value: String(player.xp), inline: true },
          { name: 'DP', value: `${player.dp} DP`, inline: true },
          { name: 'Deck inicial', value: deck }
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('starter:')) {
    const key = interaction.customId.split(':')[1];
    if (!isStarterDeck(key)) return;

    createPlayer(interaction.user.id, interaction.user.username);
    const success = chooseStarterDeck(interaction.user.id, key);

    if (!success) {
      await interaction.update({ content: 'Você já escolheu seu deck inicial.', embeds: [], components: [] });
      return;
    }

    const deck = starterDecks[key];
    await interaction.update({
      content: `${deck.emoji} **${deck.name} escolhido!**\nVocê recebeu seu primeiro deck. Use \`/perfil\` para ver seu duelista.`,
      embeds: [],
      components: []
    });
  }
});

async function main() {
  await registerCommands();
  await client.login(token);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
