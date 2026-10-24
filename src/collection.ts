import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,StringSelectMenuBuilder,escapeMarkdown} from 'discord.js';
import {type Card} from './cardCatalog';
import {engineCatalog as cards} from './effectRegistry';
export const PAGE_SIZE=6;
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const byId=new Map(cards.map(c=>[c.id,c]));
export function getCard(id:string): Card|undefined {return byId.get(id);}
export function searchCards(query:string): Card[] {
  const q=normalize(query);
  return cards.filter(c=>c.id.includes(q)||normalize(c.name).includes(q)||normalize(c.englishName).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
export function exactCard(query:string): Card|undefined {
  return cards.find(c=>c.id===query.trim()||normalize(c.name)===normalize(query)||normalize(c.englishName)===normalize(query));
}
const attributes:Record<string,string>={EARTH:'TERRA',WIND:'VENTO',DARK:'TREVAS',LIGHT:'LUZ',FIRE:'FOGO',WATER:'ÁGUA'};
const races:Record<string,string>={Warrior:'Guerreiro','Beast-Warrior':'Besta-Guerreira',Spellcaster:'Mago',Dragon:'Dragão'};
export function kindLabel(c:Card) {return c.fusion?'Monstro de Fusão':c.field?'Magia de Campo':c.kind==='monster'?'Monstro Normal':c.kind==='spell'?'Magia':'Armadilha';}
export function collectionMessage(owner:string, inventory:{card_key:string;quantity:number}[], requestedPage=1) {
  const owned=inventory.map(row=>({card:getCard(row.card_key),...row}));
  const known=owned.filter(row=>row.card).sort((a,b)=>a.card!.name.localeCompare(b.card!.name,'pt-BR'));
  const pages=Math.max(1,Math.ceil(known.length/PAGE_SIZE));
  const page=Math.min(pages,Math.max(1,Number.isSafeInteger(requestedPage)?requestedPage:1));
  const selected=known.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const total=inventory.reduce((sum,row)=>sum+row.quantity,0);
  const embed=new EmbedBuilder().setColor(0x75caff).setTitle('Sua coleção de cartas')
    .setDescription(`**${total} cartas • ${known.length} diferentes**\n${selected.length?'Escolha uma carta no menu para ver os detalhes.':'Escolha seu conjunto inicial com /start.'}`)
    .setFooter({text:`Página ${page}/${pages} • Fase 2 • Duelo básico disponível com /duelo`});
  for(const row of selected){const c=row.card!;embed.addFields({name:`${row.quantity}× ${c.name}`,value:`\`${c.id}\` · ${kindLabel(c)}${c.kind==='monster'?` · Nível ${c.level} · ATK ${c.atk} / DEF ${c.defense}`:''}`});}
  const unknown=owned.filter(row=>!row.card).length;
  if(unknown)embed.addFields({name:'Registros preservados',value:`${unknown} identificadores antigos fora deste catálogo. Nenhuma carta foi apagada.`});
  const rows:(ActionRowBuilder<ButtonBuilder>|ActionRowBuilder<StringSelectMenuBuilder>)[]=[];
  if(selected.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`collection:card:${owner}`).setPlaceholder('Consultar uma carta desta página').addOptions(selected.map(row=>({label:row.card!.name.slice(0,100),value:row.card!.id,description:`${row.quantity} cópia(s) • ${kindLabel(row.card!)} • ${row.card!.id}`})))));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`collection:page:${owner}:${page-1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===1),
    new ButtonBuilder().setCustomId(`collection:page:${owner}:${page}`).setLabel('Atualizar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`collection:page:${owner}:${page+1}`).setLabel('Próxima').setStyle(ButtonStyle.Secondary).setDisabled(page===pages)));
  return {embeds:[embed],components:rows,allowedMentions:{parse:[] as never[]}};
}
export function cardMessage(card:Card, quantity=0) {
  const embed=new EmbedBuilder().setColor(card.kind==='monster'?0xd6ae6d:card.kind==='spell'?0x4dbb9d:0xcb78ad)
    .setTitle(card.name).setURL(card.source).setDescription(`${escapeMarkdown(card.englishName)}\n\`ID ${card.id}\``)
    .addFields({name:'Categoria',value:kindLabel(card),inline:true},{name:'Na sua coleção',value:`${quantity} cópia(s)`,inline:true});
  if(card.kind==='monster')embed.addFields({name:'Tipo / Atributo',value:`${races[card.race!]??card.race} / ${attributes[card.attribute!]??card.attribute}`},{name:'Nível',value:String(card.level),inline:true},{name:'ATK',value:String(card.atk),inline:true},{name:'DEF',value:String(card.defense),inline:true});
  embed.addFields({name:'Resumo',value:card.summary},{name:'Disponibilidade',value:'Disponível no motor básico 1v1. Monstros normais, efeitos iniciais, Sogen e Fusão do Espadachim das Chamas implementados.'});
  embed.setFooter({text:'Catálogo inicial • Dados YAML Yugi / referência Konami • Projeto não oficial'});
  return {embeds:[embed],allowedMentions:{parse:[] as never[]}};
}
