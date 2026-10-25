import {cardRulesPT,racePT,attributePT} from './cardText';
import {ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,StringSelectMenuBuilder} from 'discord.js';
import {getPlayer} from './database';
import {getCard,kindLabel} from './collection';
import {npcs,dailyEvent,getNPC} from './npcContent';
import {npcProgress} from './npcProgress';
import {GalleryView,GalleryModel,GalleryCard,renderNPC} from './npcRenderer';
import {embedColors} from './duelTheme';

/** Only the actual, playable thirty-card NPC loadouts appear in the RPG.
 * No parallel product gallery or non-playable NPC card lists.
 */
const views=new Set<GalleryView>(['hero','deck','card']);
export function galleryModel(owner:string,now=Date.now(),npcId='joey',view:GalleryView='hero',page=0):GalleryModel{
 if(!getPlayer(owner))throw new Error('Crie seu duelista com /start.');
 const npc=getNPC(npcId),progress=npcProgress(owner,now),event=dailyEvent(now);
 if(!views.has(view)||!Number.isSafeInteger(page))throw new Error('Painel inválido. Abra /npc ver.');
 const cards:GalleryCard[]=[...npc.cards,...npc.extra].map((id,index)=>{
  const info=getCard(id);
  if(!info)throw new Error('Uma carta do deck deste duelista não está habilitada no RPG.');
  return {...info,slot:index<npc.cards.length?`PRINCIPAL · ${index+1}`:`ADICIONAL · ${index-npc.cards.length+1}`,isExtra:index>=npc.cards.length,category:kindLabel(info)};
 });
 const max=view==='hero'?1:view==='deck'?Math.ceil(cards.length/10):cards.length;
 if(page<0||page>=max)throw new Error('Página inexistente. Abra /npc ver.');
 return {id:npcId,name:npc.name,index:npcs.indexOf(npc),style:npc.style,description:npc.description,
  won:progress.won.has(npcId),reward:`+${npc.reward.dp} DP  ·  +${npc.reward.xp} XP`,
  daily:event.npc.id===npcId,dailyClaimed:progress.dailyClaimed,cards,page,view,mainCount:npc.cards.length,extraCount:npc.extra.length};
}
export function npcLobby(owner:string,now=Date.now(),npcId='joey',view:GalleryView='hero',page=0){
 const m=galleryModel(owner,now,npcId,view,page),npc=getNPC(npcId),event=dailyEvent(now);
 const nav=(id:string,v:GalleryView,p:number)=>`npc:gallery:${owner}:${id}:${v}:${p}`;
 const btn=(label:string,id:string,style=ButtonStyle.Secondary)=>new ButtonBuilder().setLabel(label).setCustomId(id).setStyle(style);
 const embed=new EmbedBuilder().setColor(embedColors.npc).setTitle(view==='hero'?npc.name:`${npc.name} • ${view==='deck'?'Deck de duelo':'Ficha da carta'}`);
 const rows:(ActionRowBuilder<ButtonBuilder>|ActionRowBuilder<StringSelectMenuBuilder>)[]=[];
 if(view==='hero'){
  embed.setDescription(`**${npc.style}**\n${npc.description}\n\n**Deck jogável:** ${npc.cards.length} cartas principais${npc.extra.length?` + ${npc.extra.length} no Adicional`:''}. O deck exibido é exatamente o que este duelista usa contra você.`);
  embed.addFields({name:m.won?'✓ Primeira vitória recebida':'Primeira vitória',value:m.won?'Revanche livre.':`**${npc.reward.dp} DP + ${npc.reward.xp} XP**`});
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
   btn('◀ Duelista',nav(npcs[(m.index+npcs.length-1)%npcs.length].id,'hero',0)),
   btn(`Duelar com ${npc.name.split(' ')[0]}`,`npc:challenge:${owner}:${npcId}`,ButtonStyle.Primary),
   btn('Duelista ▶',nav(npcs[(m.index+1)%npcs.length].id,'hero',0))));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
   btn(`Ver deck · ${npc.cards.length} cartas`,nav(npcId,'deck',0),ButtonStyle.Primary),
   btn(`Diário: ${event.npc.name.split(' ')[0]}`,`npc:daily:${owner}:today`,ButtonStyle.Success).setDisabled(m.dailyClaimed)));
  embed.setFooter({text:`Duelista ${m.index+1}/${npcs.length} • ${m.dailyClaimed?'Diário concluído':`Diário: +${event.dp} DP + ${event.xp} XP`} • Renova à meia-noite de São Paulo`});
 }else{
  const single=view==='card',total=single?m.cards.length:Math.ceil(m.cards.length/10);
  embed.setDescription(`**Deck realmente utilizado por ${npc.name}:** ${m.mainCount} cartas principais${m.extraCount?` e ${m.extraCount} carta(s) adicionais`:''}.\nAs cartas podem ser inspecionadas individualmente, mas navegar não altera seu inventário.`);
  if(single){const c=m.cards[page];
   embed.addFields(
    {name:`${page+1}/${m.cards.length} · ${c.name}`,value:`${c.slot} • ${c.category}`},
    {name:'Efeito e informações',value:cardRulesPT(c.id)});
   if(c.kind==='monster')embed.addFields({name:'Estatísticas',value:`Nível ${c.level} • ${attributePT[c.attribute??'']??'—'} • ${racePT[c.race??'']??'—'}\nATK ${c.atk} / DEF ${c.defense}`});
  }
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
   btn('◀ Anterior',nav(npcId,view,(page+total-1)%total)),
   btn(single?'Voltar ao deck':'Voltar ao duelista',nav(npcId,single?'deck':'hero',single?Math.floor(page/10):0),ButtonStyle.Primary),
   btn('Próxima ▶',nav(npcId,view,(page+1)%total))));
  if(!single){
   const options=m.cards.slice(page*10,page*10+10).map((c,i)=>({
    label:`${page*10+i+1}. ${c.name}`.slice(0,100),
    description:`${c.slot} · ${c.category}`.slice(0,100),
    value:String(page*10+i)
   }));
   rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`npc:inspect:${owner}:${npcId}:deck:${page}`)
     .setPlaceholder('Ampliar carta deste deck').addOptions(options)));
  }
  embed.setFooter({text:`${single?'Carta':'Página'} ${page+1}/${total} • Deck do RPG • Somente leitura`});
 }
 return {embeds:[embed],components:rows,attachments:[] as never[],allowedMentions:{parse:[] as never[]}};
}
export async function visualNPCLobby(owner:string,now=Date.now(),npcId='joey',view:GalleryView='hero',page=0){
 const payload=npcLobby(owner,now,npcId,view,page);
 try{const image=await renderNPC(galleryModel(owner,now,npcId,view,page));payload.embeds[0].setImage('attachment://duelista.png');return {...payload,files:[new AttachmentBuilder(image,{name:'duelista.png'})]};}
 catch(error){console.error('Falha no painel visual dos duelistas:',error instanceof Error?error.name:'erro');return {...payload,files:[]};}
}
