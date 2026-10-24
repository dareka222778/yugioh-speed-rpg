import {AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,StringSelectMenuBuilder,escapeMarkdown} from 'discord.js';
import {getCollection} from './database';
import {openDeck} from './decks';
import {getCard} from './collection';
import {renderDeck} from './deckRenderer';
export function deckMessage(owner:string,slot=1,requestedPage=1,selected?:string,notice?:string){
 const deck=openDeck(owner,slot);const owned=getCollection(owner);
 const ids=[...new Set([...owned.map(c=>c.card_key),...deck.items.map(c=>c.card_key)])].filter(id=>getCard(id)).sort((a,b)=>getCard(a)!.name.localeCompare(getCard(b)!.name,'pt-BR'));
 const pages=Math.max(1,Math.ceil(ids.length/6));const page=Math.max(1,Math.min(pages,Number.isInteger(requestedPage)?requestedPage:1));
 const visible=ids.slice((page-1)*6,page*6);const choice=selected&&visible.includes(selected)?selected:visible[0];
 const inDeck=(id:string)=>deck.items.find(c=>c.card_key===id)?.quantity??0;
 const have=(id:string)=>owned.find(c=>c.card_key===id)?.quantity??0;
 const key=(action:string,p=page)=>`deck:${action}:${owner}:${slot}:${deck.revision}:${p}:${choice??''}`;
 const embed=new EmbedBuilder().setColor(deck.active?0x4dbb9d:0x75caff).setTitle(`Deck ${slot} • ${escapeMarkdown(deck.name)}`)
 .setDescription(`${notice?`${notice}\n\n`:''}**${deck.total}/30 cartas • ${deck.active?'ATIVO':deck.errors.length?'RASCUNHO':'VÁLIDO — pode ativar'}**\n${deck.errors.length?deck.errors.slice(0,3).join('\n'):'Tamanho e cópias conferidos com sua coleção.'}\n\nEdite pelo menu e pelos botões. As cartas continuam na coleção e podem ser usadas em outros decks.`)
 .setFooter({text:`Página ${page}/${pages} • Decks de 20–30 cartas • Até 3 cópias • Duelo básico com /duelo`});
 for(const id of visible)embed.addFields({name:`${inDeck(id)}× ${getCard(id)!.name}`,value:`Possui: ${have(id)} • ID ${id}${choice===id?' • SELECIONADA':''}`});
 const slotRow=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(key('slot')).setPlaceholder('Trocar espaço do deck').addOptions([1,2,3].map(n=>({label:`Deck ${n}`,value:String(n),default:n===slot}))));
 const rows:(ActionRowBuilder<StringSelectMenuBuilder>|ActionRowBuilder<ButtonBuilder>)[]=[slotRow];
 if(visible.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(key('select')).setPlaceholder('Escolha a carta para editar').addOptions(visible.map(id=>({label:getCard(id)!.name,value:id,description:`No deck: ${inDeck(id)} • Na coleção: ${have(id)}`,default:id===choice})))));
 rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
 new ButtonBuilder().setCustomId(key('minus')).setLabel('− 1 cópia').setStyle(ButtonStyle.Secondary).setDisabled(!choice||inDeck(choice)===0),
 new ButtonBuilder().setCustomId(key('plus')).setLabel('+ 1 cópia').setStyle(ButtonStyle.Primary).setDisabled(!choice||inDeck(choice)>=Math.min(3,have(choice))||deck.total>=30),
 new ButtonBuilder().setCustomId(key('activate')).setLabel(deck.active?'Deck ativo':'Ativar deck').setStyle(ButtonStyle.Success).setDisabled(!!deck.errors.length||!!deck.active),
 new ButtonBuilder().setCustomId(key('rename')).setLabel('Renomear').setStyle(ButtonStyle.Secondary)));
 rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
 new ButtonBuilder().setCustomId(key('view',page-1)).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===1),
 new ButtonBuilder().setCustomId(key('view')).setLabel('Atualizar').setStyle(ButtonStyle.Secondary),
 new ButtonBuilder().setCustomId(key('view',page+1)).setLabel('Próxima').setStyle(ButtonStyle.Secondary).setDisabled(page===pages),
 new ButtonBuilder().setCustomId(key('initial')).setLabel('Copiar conjunto inicial').setStyle(ButtonStyle.Secondary).setDisabled(deck.total!==0)));
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
