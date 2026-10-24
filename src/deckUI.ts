import {AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,StringSelectMenuBuilder,escapeMarkdown} from 'discord.js';
import {getCollection} from './database';
import {openDeck} from './decks';
import {getCard,kindLabel} from './collection';
import {getCardArt} from './cardArt';
import {renderDeck} from './deckRenderer';
import {embedColors} from './duelTheme';
export function deckMessage(owner:string,slot=1,requestedPage=1,selected?:string,notice?:string){
 const deck=openDeck(owner,slot);const owned=getCollection(owner);
 const ids=[...new Set([...owned.map(c=>c.card_key),...deck.items.map(c=>c.card_key)])].filter(id=>getCard(id)).sort((a,b)=>getCard(a)!.name.localeCompare(getCard(b)!.name,'pt-BR'));
 const pages=Math.max(1,Math.ceil(ids.length/6));const page=Math.max(1,Math.min(pages,Number.isInteger(requestedPage)?requestedPage:1));
 const visible=ids.slice((page-1)*6,page*6);const choice=selected&&visible.includes(selected)?selected:visible[0];
 const inDeck=(id:string)=>deck.items.find(c=>c.card_key===id)?.quantity??0;
 const have=(id:string)=>owned.find(c=>c.card_key===id)?.quantity??0;
 const key=(action:string,p=page)=>`deck:${action}:${owner}:${slot}:${deck.revision}:${p}:${choice??''}`;
 const embed=new EmbedBuilder().setColor(embedColors.deck).setTitle(`Deck ${slot} • ${escapeMarkdown(deck.name)}`)
 .setDescription(`${notice?`${notice}\n\n`:''}**${deck.total}/30 no Principal • ${deck.extraTotal}/6 no Adicional • ${deck.active?'ATIVO':deck.errors.length?'RASCUNHO':'VÁLIDO — pode ativar'}**\n${deck.errors.length?deck.errors.slice(0,3).join('\n'):'Tamanho e cópias conferidos com sua coleção.'}\n\nEdite pelo menu e pelos botões. As cartas continuam na coleção e podem ser usadas em outros decks.`)
 .setFooter({text:`Página ${page}/${pages} • Decks de 20–30 cartas • Até 3 cópias • Duelo básico com /duelo`});
 for(const id of visible)embed.addFields({name:`${inDeck(id)}× ${getCard(id)!.name}`,value:`Possui: ${have(id)} • ID ${id}${choice===id?' • SELECIONADA':''}`});
 const slotRow=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(key('slot')).setPlaceholder('Trocar espaço do deck').addOptions([1,2,3].map(n=>({label:`Deck ${n}`,value:String(n),default:n===slot}))));
 const rows:(ActionRowBuilder<StringSelectMenuBuilder>|ActionRowBuilder<ButtonBuilder>)[]=[slotRow];
 if(visible.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(key('select')).setPlaceholder('Escolha a carta para editar').addOptions(visible.map(id=>({label:getCard(id)!.name,value:id,description:`No deck: ${inDeck(id)} • Na coleção: ${have(id)}`,default:id===choice})))));
 rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
 new ButtonBuilder().setCustomId(key('minus')).setLabel('− 1 cópia').setStyle(ButtonStyle.Secondary).setDisabled(!choice||inDeck(choice)===0),
 new ButtonBuilder().setCustomId(key('plus')).setLabel('+ 1 cópia').setStyle(ButtonStyle.Primary).setDisabled(!choice||inDeck(choice)>=Math.min(3,have(choice))||(choice&&getCard(choice)?.fusion?deck.extraTotal>=6:deck.total>=30)),
 new ButtonBuilder().setCustomId(key('activate')).setLabel(deck.active?'Deck ativo':'Ativar deck').setStyle(ButtonStyle.Success).setDisabled(!!deck.errors.length||!!deck.active),
 new ButtonBuilder().setCustomId(key('rename')).setLabel('Renomear').setStyle(ButtonStyle.Secondary),
 new ButtonBuilder().setCustomId(key('inspect')).setLabel('Ver carta').setStyle(ButtonStyle.Primary).setDisabled(!choice)));
 rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
 new ButtonBuilder().setCustomId(key('view',page-1)).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===1),
 new ButtonBuilder().setCustomId(key('view')).setLabel('Atualizar').setStyle(ButtonStyle.Secondary),
 new ButtonBuilder().setCustomId(key('view',page+1)).setLabel('Próxima').setStyle(ButtonStyle.Secondary).setDisabled(page===pages),
 new ButtonBuilder().setCustomId(key('initial')).setLabel('Copiar conjunto inicial').setStyle(ButtonStyle.Secondary).setDisabled(deck.total!==0||deck.extraTotal!==0)));
 return {embeds:[embed],components:rows,attachments:[],allowedMentions:{parse:[] as never[]}};
}

export async function visualDeckMessage(owner:string,slot=1,page=1,selected?:string,notice?:string){
 const message=deckMessage(owner,slot,page,selected,notice);
 const deck=openDeck(owner,slot);
 const menu=message.components[1]?.toJSON().components[0];
 const options=menu&&'options' in menu?menu.options:[];
 const visible=options.map(o=>o.value);const choice=options.find(o=>o.default)?.value;
 const footer=message.embeds[0].toJSON().footer?.text??'';const position=footer.match(/Página (\d+)\/(\d+)/);
 const bytes=await renderDeck({deck,visible,selected:choice,owned:getCollection(owner),page:Number(position?.[1]??1),pages:Number(position?.[2]??1)});
 const name='oficina-de-decks.png';
 message.embeds[0].spliceFields(0,25).setImage(`attachment://${name}`);
 return {...message,files:[new AttachmentBuilder(bytes,{name,description:`Deck ${deck.name}, ${deck.total} cartas. ${visible.map(id=>`${getCard(id)!.name}: ${deck.items.find(c=>c.card_key===id)?.quantity??0} no deck`).join('; ')}`.slice(0,1024)})]};
}

/** Single-card view of a card actually present in the player's own collection.
 * The revision and owner are verified again by the Discord interaction router.
 * A user cannot invent another card ID or see another player's inventory.
 */
function ownCardIds(owner:string,slot:number){
 const deck=openDeck(owner,slot),inventory=getCollection(owner);
 return [...new Set([...inventory.filter(i=>i.quantity>0).map(i=>i.card_key),...deck.items.map(i=>i.card_key)])]
  .filter(id=>!!getCard(id)).sort((a,b)=>getCard(a)!.name.localeCompare(getCard(b)!.name,'pt-BR'));
}
export function getDeckCardIndex(owner:string,slot:number,cardId:string){
 const index=ownCardIds(owner,slot).indexOf(cardId);
 if(index<0)throw new Error('Essa carta não pertence à sua coleção.');
 return index;
}
export function deckCardMessage(owner:string,slot=1,requestedIndex=0){
 const deck=openDeck(owner,slot),ids=ownCardIds(owner,slot);
 if(!Number.isSafeInteger(requestedIndex)||requestedIndex<0||requestedIndex>=ids.length)
  throw new Error('Carta inexistente na sua coleção. Volte ao editor de decks.');
 const id=ids[requestedIndex],card=getCard(id)!,inventory=getCollection(owner);
 const quantity=deck.items.find(item=>item.card_key===id)?.quantity??0;
 const owned=inventory.find(item=>item.card_key===id)?.quantity??0;
 const key=(action:string,index:number,selected=id)=>`deck:${action}:${owner}:${slot}:${deck.revision}:${index}:${selected}`;
 const embed=new EmbedBuilder().setColor(embedColors.deck)
  .setTitle(`${requestedIndex+1}/${ids.length} • ${escapeMarkdown(card.name)}`)
  .setDescription(`**${kindLabel(card)}**${card.kind==='monster'?` • ${card.attribute??'—'} • ${card.race??'—'}\n**NÍVEL ${card.level}  /  ATK ${card.atk}  /  DEF ${card.defense}**`:''}\n\n${card.summary}\n\n**No seu deck:** ${quantity} ×  •  **Na coleção:** ${owned} ×`)
  .setFooter({text:`Seu deck ${slot}/3 • Carta ${requestedIndex+1}/${ids.length} • Somente você pode editar`});
 const rows=[new ActionRowBuilder<ButtonBuilder>().addComponents(
   new ButtonBuilder().setCustomId(key('card',(requestedIndex-1+ids.length)%ids.length)).setLabel('◀ Carta anterior').setStyle(ButtonStyle.Secondary),
   new ButtonBuilder().setCustomId(key('view',Math.floor(requestedIndex/6)+1)).setLabel('Voltar ao deck').setStyle(ButtonStyle.Primary),
   new ButtonBuilder().setCustomId(key('card',(requestedIndex+1)%ids.length)).setLabel('Próxima carta ▶').setStyle(ButtonStyle.Secondary)
 )];
 return {cardId:id,embeds:[embed],components:rows,attachments:[],allowedMentions:{parse:[] as never[]}};
}
export async function visualDeckCard(owner:string,slot=1,index=0){
 const {cardId,...payload}=deckCardMessage(owner,slot,index);
 try{
  const bytes=await getCardArt(cardId);
  if(bytes){
   const name='minha-carta.jpg';
   payload.embeds[0].setImage(`attachment://${name}`);
   return {...payload,files:[new AttachmentBuilder(bytes,{name})]};
  }
 }catch{/* Text-only view remains accessible if the card image CDN is unavailable. */}
 return {...payload,files:[]};
}
