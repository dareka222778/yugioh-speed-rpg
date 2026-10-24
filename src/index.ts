import 'dotenv/config';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, ModalBuilder, REST, Routes, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { chooseStarterDeck, createPlayer, getPlayer, updateProfile, getCollection, grantLegacyStarters, grantStarterCards, backupPendingStarterGrants, db } from './database';
import { isStarterDeck, starterDecks } from './starterDecks';
import { profileMessage, themes, validateProfile } from './profile';
import { removePortrait, savePortrait } from './portrait';
import { renderWelcome } from './cardRenderer';
import { collectionMessage, cardMessage, searchCards, exactCard, getCard } from './collection';
import { getCardArt } from './cardArt';
import {openDeck,changeDeck,renameDeck,activateDeck,fillInitialDeck} from './decks';
import {visualDeckMessage} from './deckUI';
import {markDuelPublished,expireDueDuels,challenge,acceptChallenge,declineChallenge,createTraining,currentDuel,getDuel,performDuelAction,setDuelMessage,type DuelRecord} from './duelStore';
import {visualDuelPublic,visualDuelPrivate,duelPublicMessage,duelPrivateMessage,duelZonesMessage,invitationMessage,quitMessage} from './duelUI';

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
    .addStringOption(o=>o.setName('busca').setDescription('Nome em português, inglês ou ID da carta.').setRequired(true).setAutocomplete(true).setMaxLength(100)),
  new SlashCommandBuilder().setName('deck').setDescription('Monte e escolha seu deck ativo.')
    .addSubcommand(c=>c.setName('ver').setDescription('Abre o editor de decks.').addIntegerOption(o=>o.setName('espaco').setDescription('Deck 1, 2 ou 3.').setMinValue(1).setMaxValue(3)))
    .addSubcommand(c=>c.setName('adicionar').setDescription('Adiciona cartas que você possui.').addStringOption(o=>o.setName('carta').setDescription('Nome ou ID da carta.').setRequired(true).setAutocomplete(true)).addIntegerOption(o=>o.setName('quantidade').setDescription('Quantidade de cópias.').setMinValue(1).setMaxValue(3)).addIntegerOption(o=>o.setName('espaco').setDescription('Deck 1, 2 ou 3.').setMinValue(1).setMaxValue(3)))
    .addSubcommand(c=>c.setName('remover').setDescription('Remove cartas do deck, mantendo a coleção.').addStringOption(o=>o.setName('carta').setDescription('Nome ou ID da carta.').setRequired(true).setAutocomplete(true)).addIntegerOption(o=>o.setName('quantidade').setDescription('Quantidade de cópias.').setMinValue(1).setMaxValue(3)).addIntegerOption(o=>o.setName('espaco').setDescription('Deck 1, 2 ou 3.').setMinValue(1).setMaxValue(3)))
    .addSubcommand(c=>c.setName('nome').setDescription('Renomeia um deck.').addStringOption(o=>o.setName('texto').setDescription('Nome do deck.').setRequired(true).setMaxLength(32)).addIntegerOption(o=>o.setName('espaco').setDescription('Deck 1, 2 ou 3.').setMinValue(1).setMaxValue(3)))
    .addSubcommand(c=>c.setName('ativar').setDescription('Escolhe um deck válido como ativo.').addIntegerOption(o=>o.setName('espaco').setDescription('Deck 1, 2 ou 3.').setMinValue(1).setMaxValue(3)))
    .addSubcommand(c=>c.setName('inicial').setDescription('Copia o conjunto inicial para um espaço vazio.').addIntegerOption(o=>o.setName('espaco').setDescription('Deck 1, 2 ou 3.').setMinValue(1).setMaxValue(3)))
  ,new SlashCommandBuilder().setName('duelo').setDescription('Duelo básico 1v1 com campo e mão privada.').setDMPermission(false)
    .addSubcommand(c=>c.setName('treino').setDescription('Jogue contra o bot usando seu deck ativo.'))
    .addSubcommand(c=>c.setName('treino_fusao').setDescription('Treino guiado de Campo e Fusão, sem alterar sua coleção.'))
    .addSubcommand(c=>c.setName('desafiar').setDescription('Convide outro jogador para um duelo.').addUserOption(o=>o.setName('oponente').setDescription('Jogador que receberá o convite.').setRequired(true)))
    .addSubcommand(c=>c.setName('ver').setDescription('Abra seu duelo atual e sua mão privada.'))
    .addSubcommand(c=>c.setName('sair').setDescription('Cancele seu convite ou confirme a desistência do duelo.'))
].map(c => c.toJSON());
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on(Events.Error, error => console.error('Discord client:', errorSummary(error)));
client.on(Events.Warn, warning => console.warn('Discord aviso:', warning));
client.once(Events.ClientReady, c => {console.log(`Yu-Gi-Oh! Speed RPG online como ${c.user.tag}`);const timer=setInterval(()=>void sweepDuelTimeouts(),10_000);timer.unref();void sweepDuelTimeouts();});
const help = '🎨 **Seu personagem, seu estilo**\nUse `/personalizar` para escolher **nome**, **bio**, **cor** e anexar uma **imagem** de até 2 MB (PNG/JPG/WebP).\nO botão Personalizar abre o editor de texto. Para trocar o retrato, use o campo imagem do comando.\n`/perfil publico:True` compartilha sua ficha no canal.\n`/personalizar remover_imagem:True` apaga o retrato.\n\nO RPG está na V0: use `/colecao` para ver suas cartas e `/carta` para consultar o catálogo. Use `/deck ver` para montar e ativar seus decks. Depois abra `/duelo treino` ou `/duelo desafiar`. Duelos básicos com 4000 PV, mão privada, tributos e quatro efeitos implementados; sem Skills ou Extra Deck.';
// One mutation at a time per player, including network downloads.
async function showCard(id:string, userId:string) {
  const card=getCard(id);if(!card)throw new Error('Essa carta não faz parte do catálogo inicial.');
  const quantity=getCollection(userId).find(row=>row.card_key===id)?.quantity??0;
  const message=cardMessage(card,quantity);
  const art=await getCardArt(id);
  if(art){message.embeds[0].setImage(`attachment://carta-${id}.jpg`);return {...message,files:[new AttachmentBuilder(art,{name:`carta-${id}.jpg`,description:card.name})]};}
  return message;
}
function errorSummary(error:unknown){return error instanceof Error?{name:error.name,message:error.message,code:'code' in error?error.code:undefined}:'Falha desconhecida';}
const busy = new Set<string>();
async function arenaPayload(r:DuelRecord){try{return await visualDuelPublic(r);}catch(error){console.error('Falha no campo visual:',errorSummary(error));return duelPublicMessage(r);}}
async function privatePayload(r:DuelRecord,owner:string,page=1){try{return await visualDuelPrivate(r,owner,page);}catch(error){console.error('Falha no painel visual:',errorSummary(error));return duelPrivateMessage(r,owner,page);}}
let sweepingDuels=false;
export async function sweepDuelTimeouts(){if(sweepingDuels)return;sweepingDuels=true;try{for(const r of expireDueDuels())await refreshArena(r);}catch(error){console.error('Falha ao conferir prazo dos duelos:',errorSummary(error));}finally{sweepingDuels=false;}}
const arenaUpdates=new Map<string,Promise<void>>();
async function refreshArena(record:DuelRecord){
 const previous=arenaUpdates.get(record.id)??Promise.resolve();
 const work=previous.catch(()=>{}).then(async()=>{const r=getDuel(record.id);if(!r.message_id)return;
  try{const channel=await client.channels.fetch(r.channel_id);if(!channel||!('messages' in channel))return;
   const message=await channel.messages.fetch(r.message_id);const payload=await arenaPayload(r);if(getDuel(r.id).revision===r.revision){await message.edit(payload);markDuelPublished(r.id,r.revision);}
  }catch(error){console.error('Falha ao atualizar arena; use Atualizar campo:',errorSummary(error));}
 });arenaUpdates.set(record.id,work);try{await work;}finally{if(arenaUpdates.get(record.id)===work)arenaUpdates.delete(record.id);}
}
client.on(Events.InteractionCreate, async i => {
  console.log(`Interação recebida: ${i.type} / ${'commandName' in i ? i.commandName : 'componente'}`);
  if(i.isAutocomplete()) {
    try {const matches=searchCards(String(i.options.getFocused()));const owned=i.commandName==='deck'?new Set(getCollection(i.user.id).map(c=>c.card_key)):null;await i.respond(matches.filter(c=>!owned||owned.has(c.id)).slice(0,25).map(c=>({name:`${c.name} • ${c.id}`.slice(0,100),value:c.id})));} catch(error){console.error('Falha no autocomplete:',errorSummary(error));}
    return;
  }
  if (!i.isChatInputCommand() && !i.isButton() && !i.isModalSubmit() && !i.isStringSelectMenu()) return;
  const id = i.user.id;
  const avatar = i.user.displayAvatarURL({ size: 256 });
  try {
    if((i.isButton()||i.isStringSelectMenu())&&i.customId.startsWith('duel:')){
      if(!i.guildId)throw new Error('Use os duelos dentro de um servidor.');
      const [,action,duelId,revisionText,pageText]=i.customId.split(':');let r=getDuel(duelId);
      if(r.guild_id!==i.guildId)throw new Error('Esse duelo pertence a outro servidor.');
      if(r.state?.phase==='finished'){await i.deferUpdate();await i.editReply(duelPublicMessage(r));return;}
      if(action==='zones'&&i.isButton()){await i.deferReply({flags:MessageFlags.Ephemeral});await i.editReply(duelZonesMessage(r,id));return;}
      const revision=Number(revisionText),page=Number(pageText??1);
      if(!Number.isSafeInteger(revision)||!Number.isSafeInteger(page))throw new Error('Painel inválido. Use /duelo ver.');
      if(action==='accept'&&i.isButton()){await i.deferUpdate();r=acceptChallenge(duelId,id,i.guildId,revision);await refreshArena(r);await i.followUp({content:'Duelo iniciado! Clique em Abrir meu painel / mão no campo.',flags:MessageFlags.Ephemeral});return;}
      if(action==='decline'&&i.isButton()){await i.deferUpdate();r=declineChallenge(duelId,id,i.guildId);await refreshArena(r);return;}
      if(action==='public'&&i.isButton()){await i.deferUpdate();await refreshArena(r);return;}
      if(!r.state?.players.some(p=>p.id===id))throw new Error('Só participantes podem abrir o painel privado.');
      if(action==='open'&&i.isButton()){await i.deferReply({flags:MessageFlags.Ephemeral});await i.editReply(await privatePayload(r,id));return;}
      if(action==='quit'&&i.isButton()){await i.reply({...quitMessage(r),flags:MessageFlags.Ephemeral});return;}
      if(action==='view'&&i.isButton()){await i.deferUpdate();await i.editReply(await privatePayload(r,id,page));return;}
      if(action==='act'&&i.isStringSelectMenu()){
        await i.deferUpdate();const index=Number(i.values[0]);if(!Number.isSafeInteger(index)||index<0)throw new Error('Ação inválida.');
        r=performDuelAction(duelId,id,i.guildId,revision,index);await i.editReply(await privatePayload(r,id,page));await refreshArena(r);return;
      }
      if(action==='confirm'&&i.isButton()){await i.deferUpdate();r=performDuelAction(duelId,id,i.guildId,revision,{kind:'concede'});await i.editReply({content:'Desistência registrada.',components:[]});await refreshArena(r);return;}
      throw new Error('Ação desconhecida. Use /duelo ver.');
    }
    if(i.isChatInputCommand()&&i.commandName==='duelo'){
      if(!i.guildId||!i.channelId)throw new Error('Use os duelos dentro de um servidor.');const action=i.options.getSubcommand();
      await i.deferReply(action==='ver'||action==='sair'?{flags:MessageFlags.Ephemeral}:{});
      if(action==='treino'||action==='treino_fusao'||action==='desafiar'){
        let r:DuelRecord;
        if(action==='treino'||action==='treino_fusao')r=createTraining(id,i.guildId,i.channelId,action==='treino_fusao');
        else{const other=i.options.getUser('oponente',true);if(other.bot)throw new Error('Para enfrentar o bot, use /duelo treino.');r=challenge(id,other.id,i.guildId,i.channelId);}
        const message=await i.editReply(await arenaPayload(r));setDuelMessage(r.id,message.channelId,message.id);return;
      }
      const r=currentDuel(id);if(!r||r.guild_id!==i.guildId)throw new Error('Você não tem duelo ativo neste servidor. Use /duelo treino ou /duelo desafiar.');
      if(action==='sair'){if(r.status==='pending'){const closed=declineChallenge(r.id,id,i.guildId);await i.editReply({content:'Convite cancelado.'});await refreshArena(closed);}else await i.editReply(quitMessage(r));return;}
      await i.editReply(r.status==='pending'?{content:'Seu convite aguarda resposta.',...invitationMessage(r)}:await privatePayload(r,id));return;
    }
    if((i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())&&i.customId.startsWith('deck:')) {
      const [,action,owner,slotText,revisionText,pageText,cardId]=i.customId.split(':');
      if(owner!==id){await i.reply({content:'Abra seu próprio editor com /deck ver.',flags:MessageFlags.Ephemeral});return;}
      const slot=Number(slotText),revision=Number(revisionText),page=Number(pageText);
      if(!Number.isSafeInteger(revision)||!Number.isSafeInteger(page))throw new Error('Painel inválido. Abra /deck ver.');
      if(action==='rename'&&i.isButton()){
        const deck=openDeck(id,slot);
        if(deck.revision!==revision)throw new Error('Esse painel ficou antigo. Clique em Atualizar.');
        const field=new TextInputBuilder().setCustomId('name').setLabel('Nome do deck').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(deck.name);
        await i.showModal(new ModalBuilder().setCustomId(`deck:save-name:${id}:${slot}:${revision}:${page}:${cardId}`).setTitle('Renomear deck').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)));return;
      }
      if(action==='save-name'&&i.isModalSubmit()){
        await i.deferReply({flags:MessageFlags.Ephemeral});renameDeck(id,slot,i.fields.getTextInputValue('name'),revision);await i.editReply(await visualDeckMessage(id,slot,page,cardId,'✦ Nome salvo.'));return;
      }
      if(!i.isButton()&&!i.isStringSelectMenu())return;
      await i.deferUpdate();
      let selected=cardId;let targetSlot=slot;
      if(action==='plus'&&i.isButton())changeDeck(id,slot,cardId,1,revision);
      else if(action==='minus'&&i.isButton())changeDeck(id,slot,cardId,-1,revision);
      else if(action==='activate'&&i.isButton())activateDeck(id,slot,revision);
      else if(action==='initial'&&i.isButton())fillInitialDeck(id,slot,revision);
      else if(action==='select'&&i.isStringSelectMenu())selected=i.values[0];
      else if(action==='slot'&&i.isStringSelectMenu()){targetSlot=Number(i.values[0]);selected='';}
      else if(action!=='view')throw new Error('Ação desconhecida. Abra /deck ver.');
      await i.editReply(await visualDeckMessage(id,targetSlot,action==='slot'?1:page,selected));return;
    }
    if (i.isChatInputCommand()) {
      if(i.commandName==='deck'){
        await i.deferReply({flags:MessageFlags.Ephemeral});
        const slot=i.options.getInteger('espaco')??1;const action=i.options.getSubcommand();let selected:string|undefined;
        if(action==='adicionar'||action==='remover'){
          const query=i.options.getString('carta',true);const card=exactCard(query);if(!card)throw new Error('Use o nome completo ou selecione uma sugestão de carta.');
          selected=card.id;changeDeck(id,slot,card.id,(i.options.getInteger('quantidade')??1)*(action==='adicionar'?1:-1));
        }else if(action==='nome')renameDeck(id,slot,i.options.getString('texto',true));
        else if(action==='ativar')activateDeck(id,slot);
        else if(action==='inicial')fillInitialDeck(id,slot);
        await i.editReply(await visualDeckMessage(id,slot,1,selected));return;
      }
      if (i.commandName === 'ping') { await i.reply({ content: '🏓 Pong! O RPG está online.', flags: MessageFlags.Ephemeral }); return; }
      if (i.commandName === 'start') {
        const player = createPlayer(id, i.user.username);
        if (player.starter_deck) { grantStarterCards(id); await i.deferReply({ flags: MessageFlags.Ephemeral }); await i.editReply(await profileMessage(player, avatar)); return; }
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const welcomeImage = new AttachmentBuilder(await renderWelcome(), {name:'primeira-jogada.png'});
        const embed = new EmbedBuilder().setColor(themes.ouro).setAuthor({ name: 'SPEED RPG • PRIMEIRA JOGADA', iconURL: avatar })
          .setTitle('A primeira jogada é sua')
          .setDescription('Escolha o estilo do seu duelista. A escolha será permanente nesta versão.\n\nVocê receberá **20 cartas**: 16 monstros e 4 Magias/Armadilhas. Veja depois com `/colecao`. Ative seu deck com /deck ativar e use /duelo treino.')
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
    console.error('Falha na interação:', errorSummary(error));
    const content = error instanceof Error && !('code' in error) ? error.message : 'Não foi possível concluir. Tente novamente.';
    try {
      if ((i.isButton()||i.isStringSelectMenu())&&i.customId.startsWith('duel:')&&i.deferred) await i.followUp({content,flags:MessageFlags.Ephemeral});
      else if (i.deferred) await i.editReply({ content, embeds: [], components: [], attachments: [] });
      else if (i.replied) await i.followUp({ content, flags: MessageFlags.Ephemeral });
      else await i.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (replyError) { console.error('Falha ao responder:', errorSummary(replyError)); }
  }
});
async function main() {
  if(await backupPendingStarterGrants()) console.log('Fase 2: backup de segurança do banco concluído.');
  console.log(`Fase 2: ${grantLegacyStarters()} conjunto(s) inicial(is) entregue(s).`);
  const inventoryAudit=db.prepare('SELECT COALESCE(SUM(quantity),0) AS total FROM player_cards WHERE quantity > 0').get() as {total:number};
  console.log(`Fase 2: ${inventoryAudit.total} cartas persistidas nas coleções.`);
  await renderWelcome();
  console.log('Fase 4.1: W.O. automático, Campo, Deck Adicional, Fusão e Cemitério carregados.');
  console.log('Renderer verificado: letras incorporadas, sem fontes do sistema.');
  await client.login(token);
  const rest = new REST({ version: '10' }).setToken(token!);
  console.log('Sincronizando comandos sem bloquear a conexão do bot.');
  try {
    await rest.put(guildId ? Routes.applicationGuildCommands(clientId!,guildId) : Routes.applicationCommands(clientId!), { body: commands });
    console.log('Fase 4: /duelo, /deck, /colecao e /carta registrados.');
  } catch(error) {
    console.error('Falha ao sincronizar comandos; a conexão do bot continua ativa:',errorSummary(error));
  }
}
main().catch(error => { console.error(errorSummary(error)); process.exit(1); });
