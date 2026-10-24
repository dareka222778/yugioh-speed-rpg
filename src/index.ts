import 'dotenv/config';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, ModalBuilder, REST, Routes, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { chooseStarterDeck, createPlayer, getPlayer, updateProfile, getCollection, grantLegacyStarters, grantStarterCards, backupPendingStarterGrants, db } from './database';
import { isStarterDeck, starterDecks } from './starterDecks';
import { profileMessage, themes, validateProfile } from './profile';
import { removePortrait, savePortrait } from './portrait';
import { renderWelcome } from './cardRenderer';
import { collectionMessage, cardMessage, searchCards, exactCard, getCard } from './collection';
import { getCardArt } from './cardArt';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !clientId) throw new Error('Preencha DISCORD_TOKEN e DISCORD_CLIENT_ID no ambiente da hospedagem.');

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Testa se o bot está online.'),
  new SlashCommandBuilder().setName('start').setDescription('Cria seu duelista e escolhe um estilo inicial.'),
  new SlashCommandBuilder().setName('perfil').setDescription('Abre sua ficha de personagem.')
    .addBooleanOption(o => o.setName('publico').setDescription('Compartilha o perfil neste canal.')),
  new SlashCommandBuilder().setName('personalizar').setDescription('Edita a aparência e a história do seu personagem.')
    .addStringOption(o => o.setName('nome').setDescription('Nome do personagem (até 32 caracteres).').setMaxLength(32))
    .addStringOption(o => o.setName('bio').setDescription('Sua história (até 240 caracteres).').setMaxLength(240))
    .addStringOption(o => o.setName('cor').setDescription('Cor do seu perfil.').addChoices(...Object.keys(themes).map(v => ({ name: v, value: v }))))
    .addAttachmentOption(o => o.setName('imagem').setDescription('Retrato PNG, JPG ou WebP, até 2 MB.'))
    .addBooleanOption(o => o.setName('remover_imagem').setDescription('Apaga o retrato salvo.')),
  new SlashCommandBuilder().setName('colecao').setDescription('Veja suas cartas e quantidades.')
    .addIntegerOption(o=>o.setName('pagina').setDescription('Página da coleção.').setMinValue(1)),
  new SlashCommandBuilder().setName('carta').setDescription('Consulte uma carta do catálogo inicial.')
    .addStringOption(o=>o.setName('busca').setDescription('Nome em português, inglês ou ID da carta.').setRequired(true).setAutocomplete(true).setMaxLength(100))
].map(c => c.toJSON());
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on(Events.Error, error => console.error('Discord client:', error));
client.on(Events.Warn, warning => console.warn('Discord aviso:', warning));
client.once(Events.ClientReady, c => console.log(`Yu-Gi-Oh! Speed RPG online como ${c.user.tag}`));
const help = '🎨 **Seu personagem, seu estilo**\nUse `/personalizar` para escolher **nome**, **bio**, **cor** e anexar uma **imagem** de até 2 MB (PNG/JPG/WebP).\nO botão Personalizar abre o editor de texto. Para trocar o retrato, use o campo imagem do comando.\n`/perfil publico:True` compartilha sua ficha no canal.\n`/personalizar remover_imagem:True` apaga o retrato.\n\nO RPG está na V0: use `/colecao` para ver suas cartas e `/carta` para consultar o catálogo. Duelos ainda estão em desenvolvimento.';
// One mutation at a time per player, including network downloads.
async function showCard(id:string, userId:string) {
  const card=getCard(id);if(!card)throw new Error('Essa carta não faz parte do catálogo inicial.');
  const quantity=getCollection(userId).find(row=>row.card_key===id)?.quantity??0;
  const message=cardMessage(card,quantity);
  const art=await getCardArt(id);
  if(art){message.embeds[0].setImage(`attachment://carta-${id}.jpg`);return {...message,files:[new AttachmentBuilder(art,{name:`carta-${id}.jpg`,description:card.name})]};}
  return message;
}
const busy = new Set<string>();
client.on(Events.InteractionCreate, async i => {
  console.log(`Interação recebida: ${i.type} / ${'commandName' in i ? i.commandName : 'componente'}`);
  if(i.isAutocomplete()) {
    try {await i.respond(searchCards(String(i.options.getFocused())).slice(0,25).map(c=>({name:`${c.name} • ${c.id}`.slice(0,100),value:c.id})));} catch(error){console.error('Falha no autocomplete:',error);}
    return;
  }
  if (!i.isChatInputCommand() && !i.isButton() && !i.isModalSubmit() && !i.isStringSelectMenu()) return;
  const id = i.user.id;
  const avatar = i.user.displayAvatarURL({ size: 256 });
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === 'ping') { await i.reply({ content: '🏓 Pong! O RPG está online.', flags: MessageFlags.Ephemeral }); return; }
      if (i.commandName === 'start') {
        const player = createPlayer(id, i.user.username);
        if (player.starter_deck) { grantStarterCards(id); await i.deferReply({ flags: MessageFlags.Ephemeral }); await i.editReply(await profileMessage(player, avatar)); return; }
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const welcomeImage = new AttachmentBuilder(await renderWelcome(), {name:'primeira-jogada.png'});
        const embed = new EmbedBuilder().setColor(themes.ouro).setAuthor({ name: 'SPEED RPG • PRIMEIRA JOGADA', iconURL: avatar })
          .setTitle('A primeira jogada é sua')
          .setDescription('Escolha o estilo do seu duelista. A escolha será permanente nesta versão.\n\nVocê receberá **20 cartas**: 16 monstros e 4 Magias/Armadilhas. Veja depois com `/colecao`. Duelos ainda estão em desenvolvimento.')
          .setImage('attachment://primeira-jogada.png')
          .setFooter({ text: 'Depois da escolha, personalize seu personagem com /personalizar.' });
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(Object.entries(starterDecks).map(([key,d]) => new ButtonBuilder().setCustomId(`starter:${key}`).setLabel(d.name).setEmoji(d.emoji).setStyle(ButtonStyle.Primary)));
        await i.editReply({ embeds: [embed], files:[welcomeImage], components: [row] }); return;
      }
      if(i.commandName==='carta') {
        const query=i.options.getString('busca',true);
        const exact=exactCard(query);const matches=exact?[exact]:searchCards(query);
        await i.deferReply({flags:MessageFlags.Ephemeral});
        if(matches.length===1){await i.editReply(await showCard(matches[0].id,id));return;}
        await i.editReply({content:matches.length?`Encontrei ${matches.length} cartas. Escolha uma sugestão do comando ou use o ID:\n${matches.slice(0,10).map(c=>`\`${c.id}\` — ${c.name}`).join('\n')}`:'Não encontrei essa carta no catálogo inicial. Use as sugestões de /carta.'});return;
      }
      const player = getPlayer(id);
      if (!player) { await i.reply({ content: 'Crie seu duelista primeiro com `/start`.', flags: MessageFlags.Ephemeral }); return; }
      if(i.commandName==='colecao') {
        await i.deferReply({flags:MessageFlags.Ephemeral});
        grantStarterCards(id);
        await i.editReply(collectionMessage(id,getCollection(id),i.options.getInteger('pagina')??1));return;
      }
      if (i.commandName === 'perfil') {
        const publicProfile = i.options.getBoolean('publico') ?? false;
        await i.deferReply(publicProfile ? {} : { flags: MessageFlags.Ephemeral });
        await i.editReply(await profileMessage(player, avatar, !publicProfile)); return;
      }
      if (i.commandName === 'personalizar') {
        if (busy.has(id)) { await i.reply({ content: 'Sua alteração anterior ainda está sendo salva.', flags: MessageFlags.Ephemeral }); return; }
        const image = i.options.getAttachment('imagem');
        const remove = i.options.getBoolean('remover_imagem');
        if (image && remove) throw new Error('Escolha enviar ou remover a imagem, uma opção por vez.');
        const profile = validateProfile(i.options.getString('nome') ?? (player.character_name || i.user.username), i.options.getString('bio') ?? player.biography, i.options.getString('cor') ?? player.theme);
        busy.add(id);
        try {
          await i.deferReply({ flags: MessageFlags.Ephemeral });
          if (image) await savePortrait(id, image);
          if (remove) await removePortrait(id);
          updateProfile(id, profile);
          await i.editReply({ content: '✦ Personagem atualizado.', ...await profileMessage(getPlayer(id)!, avatar) });
        } finally { busy.delete(id); }
        return;
      }
    }
    if (i.isButton() && i.customId.startsWith('starter:')) {
      const key = i.customId.split(':')[1];
      if (!isStarterDeck(key)) return;
      createPlayer(id, i.user.username);
      const success = chooseStarterDeck(id, key);
      await i.deferUpdate();
      await i.editReply({ attachments: [], content: success ? '✦ Você recebeu suas 20 cartas iniciais! Use /colecao para conferir.' : 'Seu conjunto inicial já foi escolhido. Use /colecao para conferir.', ...await profileMessage(getPlayer(id)!, avatar) }); return;
    }
    if((i.isButton()||i.isStringSelectMenu())&&i.customId.startsWith('collection:')) {
      const [,action,owner,page]=i.customId.split(':');
      if(owner!==id){await i.reply({content:'Abra sua coleção com /colecao.',flags:MessageFlags.Ephemeral});return;}
      if(!getPlayer(id))throw new Error('Crie seu duelista com /start.');
      if(action==='page'&&i.isButton()){await i.update(collectionMessage(id,getCollection(id),Number(page)));return;}
      if(action==='card'&&i.isStringSelectMenu()){
        const selected=i.values[0];
        if(!getCollection(id).some(row=>row.card_key===selected))throw new Error('Essa carta não está na sua coleção.');
        await i.deferReply({flags:MessageFlags.Ephemeral});await i.editReply(await showCard(selected,id));return;
      }
      return;
    }
    if (i.isButton() && i.customId.startsWith('profile:')) {
      const [,action,owner] = i.customId.split(':');
      if (owner !== id) { await i.reply({ content: 'Abra sua própria ficha com `/perfil`.', flags: MessageFlags.Ephemeral }); return; }
      const player = getPlayer(id);
      if (!player) throw new Error('Crie seu duelista com /start.');
      if (action === 'help') { await i.reply({ content: help, flags: MessageFlags.Ephemeral }); return; }
      if (action === 'refresh') { await i.deferUpdate(); await i.editReply({ ...await profileMessage(player, avatar), attachments: [] }); return; }
      if (action === 'edit') {
        const modal = new ModalBuilder().setCustomId(`profile-edit:${id}`).setTitle('Seu personagem');
        for (const [key,label,value,max,style] of [
          ['name','Nome do personagem',player.character_name || i.user.username,32,TextInputStyle.Short],
          ['bio','Biografia',player.biography,240,TextInputStyle.Paragraph],
          ['theme','Cor: ametista, ouro, oceano, rubi, esmeralda',player.theme,16,TextInputStyle.Short]
        ] as const) {
          const input = new TextInputBuilder().setCustomId(key).setLabel(label).setStyle(style).setMaxLength(max).setRequired(key !== 'bio');
          if (value) input.setValue(value);
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        }
        await i.showModal(modal); return;
      }
    }
    if (i.isModalSubmit() && i.customId === `profile-edit:${id}`) {
      if (busy.has(id)) throw new Error('Sua alteração anterior ainda está sendo salva.');
      if (!getPlayer(id)) throw new Error('Crie seu duelista com /start.');
      const profile = validateProfile(i.fields.getTextInputValue('name'), i.fields.getTextInputValue('bio'), i.fields.getTextInputValue('theme').trim().toLowerCase());
      updateProfile(id, profile);
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await i.editReply({ content: '✦ Personagem atualizado.', ...await profileMessage(getPlayer(id)!, avatar) });
    }
  } catch (error) {
    console.error('Falha na interação:', error);
    const content = error instanceof Error && !('code' in error) ? error.message : 'Não foi possível concluir. Tente novamente.';
    try {
      if (i.deferred) await i.editReply({ content, embeds: [], components: [], attachments: [] });
      else if (i.replied) await i.followUp({ content, flags: MessageFlags.Ephemeral });
      else await i.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (replyError) { console.error('Falha ao responder:', replyError); }
  }
});
async function main() {
  if(await backupPendingStarterGrants()) console.log('Fase 2: backup de segurança do banco concluído.');
  console.log(`Fase 2: ${grantLegacyStarters()} conjunto(s) inicial(is) entregue(s).`);
  const inventoryAudit=db.prepare('SELECT COALESCE(SUM(quantity),0) AS total FROM player_cards WHERE quantity > 0').get() as {total:number};
  console.log(`Fase 2: ${inventoryAudit.total} cartas persistidas nas coleções.`);
  await renderWelcome();
  console.log('Renderer verificado: letras incorporadas, sem fontes do sistema.');
  await client.login(token);
  const rest = new REST({ version: '10' }).setToken(token!);
  console.log('Sincronizando comandos sem bloquear a conexão do bot.');
  try {
    await rest.put(guildId ? Routes.applicationGuildCommands(clientId!,guildId) : Routes.applicationCommands(clientId!), { body: commands });
    console.log('Fase 2: comandos /colecao e /carta registrados.');
  } catch(error) {
    console.error('Falha ao sincronizar comandos; a conexão do bot continua ativa:',error);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
