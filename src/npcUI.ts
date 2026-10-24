import {ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,StringSelectMenuBuilder} from 'discord.js';
import {getPlayer} from './database';
import {getCard} from './collection';
import {npcs,dailyEvent,getNPC} from './npcContent';
import {npcProgress} from './npcProgress';
import {classicDeck,ClassicCard} from './classicDecks';
import {GalleryView,GalleryModel,npcThemes,renderNPC} from './npcRenderer';
const views=new Set<GalleryView>(['hero','deck','card','loadout','playcard']);
export function galleryModel(owner:string,now=Date.now(),npcId='joey',view:GalleryView='hero',page=0):GalleryModel{
 if(!getPlayer(owner))throw new Error('Crie seu duelista com /start.');
 const n=getNPC(npcId),d=classicDeck(npcId),p=npcProgress(owner,now),event=dailyEvent(now);
 if(!views.has(view)||!Number.isSafeInteger(page))throw new Error('Painel inválido. Abra /npc ver.');
 const archive=view==='hero'||view==='deck'||view==='card';
 const cards:ClassicCard[]=archive?d.cards:[...n.cards,...n.extra].map((id,i)=>{const c=getCard(id)!;return {id,code:i<n.cards.length?`PRINCIPAL · ${i+1}`:`ADICIONAL · ${i-n.cards.length+1}`,name:c.name,englishName:c.englishName,kind:c.kind==='monster'?'Monster':c.kind==='spell'?'Spell':'Trap',type:c.race??'',level:c.level??null,atk:c.atk??null,defense:c.defense??null,extra:i>=n.cards.length,konamiId:c.konamiId};});
 const max=view==='deck'||view==='loadout'?Math.ceil(cards.length/10):view==='hero'?1:cards.length;
 if(page<0||page>=max)throw new Error('Página inexistente. Abra /npc ver.');
 return {id:npcId,name:n.name,index:npcs.indexOf(n),prefix:d.prefix,year:d.year,won:p.won.has(npcId),reward:`+${n.reward.dp} DP  ·  +${n.reward.xp} XP  ·  Cartas`,daily:event.npc.id===npcId,dailyClaimed:p.dailyClaimed,cards,page,view};
}
export function npcLobby(owner:string,now=Date.now(),npcId='joey',view:GalleryView='hero',page=0){
 const m=galleryModel(owner,now,npcId,view,page),n=getNPC(npcId),d=classicDeck(npcId),t=npcThemes[npcId],event=dailyEvent(now);
 const nav=(id:string,v:GalleryView,p:number)=>`npc:gallery:${owner}:${id}:${v}:${p}`;
 const btn=(label:string,id:string,style=ButtonStyle.Secondary)=>new ButtonBuilder().setLabel(label).setCustomId(id).setStyle(style);
 const embed=new EmbedBuilder().setColor(parseInt(t.color.slice(1),16)).setTitle(view==='hero'?n.name:`${n.name} • ${view==='deck'||view==='card'?'Deck clássico':'Deck do desafio'}`);
 const rows:(ActionRowBuilder<ButtonBuilder>|ActionRowBuilder<StringSelectMenuBuilder>)[]=[];
 if(view==='hero'){
  embed.setDescription(`**Duelar:** 20 cartas em regras Speed${n.extra.length?' + 1 Fusão':''}.\n**Deck clássico ${d.prefix}:** 50 cartas para inspecionar; duelo completo ainda indisponível.`);
  embed.addFields({name:m.won?'✓ Primeira vitória recebida':'Primeira vitória',value:m.won?'Revanche livre.':`**${n.reward.dp} DP + ${n.reward.xp} XP + ${n.reward.cards.length} carta${n.reward.cards.length===1?'':'s'}**`});
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btn('◀ Duelista',nav(npcs[(m.index+2)%3].id,'hero',0)),btn(`Duelar com ${n.name.split(' ')[0]}`,`npc:challenge:${owner}:${npcId}`,ButtonStyle.Primary),btn('Duelista ▶',nav(npcs[(m.index+1)%3].id,'hero',0))));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btn(`Deck clássico · ${d.prefix}`,nav(npcId,'deck',0)),btn('Deck jogável',nav(npcId,'loadout',0)),btn(`Diário: ${event.npc.name.split(' ')[0]}`,`npc:daily:${owner}:today`,ButtonStyle.Success).setDisabled(m.dailyClaimed)));
  embed.setFooter({text:`Duelista ${m.index+1}/3 • ${m.dailyClaimed?'Diário já recebido':`Diário: +${event.dp} DP + ${event.xp} XP`} • Renova à meia-noite de São Paulo`});
 }else{
  const archive=view==='deck'||view==='card',single=view==='card'||view==='playcard',total=single?m.cards.length:Math.ceil(m.cards.length/10);
  embed.setDescription(archive?`**${d.prefix} · ${d.year} · 50 cartas conferidas.**\nAcervo para consulta. O botão Duelar usa a adaptação de 20 cartas; a lista clássica completa ainda exige implementação de efeitos.`:`**${n.cards.length} cartas principais + ${n.extra.length} adicionais.**\nEste é o deck realmente usado pelo NPC nos desafios atuais.`);
  if(single){const c=m.cards[page];embed.addFields({name:`${page+1}/${m.cards.length} · ${c.name}`,value:`${c.englishName} · ${c.code}${c.extra?' · Fusão':''}`});}
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btn('◀ Anterior',nav(npcId,view,(page+total-1)%total)),btn(single?'Voltar ao deck':'Duelistas',nav(npcId,single?(archive?'deck':'loadout'):'hero',single?Math.floor(page/10):0)),btn('Próxima ▶',nav(npcId,view,(page+1)%total))));
  if(!single){const options=m.cards.slice(page*10,page*10+10).map((c,i)=>({label:`${page*10+i+1}. ${c.name}`.slice(0,100),description:`${c.code} · ${c.englishName}`.slice(0,100),value:String(page*10+i)}));rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`npc:inspect:${owner}:${npcId}:${view}:${page}`).setPlaceholder('Ampliar uma carta').addOptions(options)));}
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel(single?'Ficha oficial':'Lista oficial completa').setStyle(ButtonStyle.Link).setURL(single?`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${m.cards[page].konamiId}&request_locale=pt`:d.source)));
  embed.setFooter({text:`${single?'Carta':'Página'} ${page+1}/${total} • Nenhuma carta é concedida ao navegar`});
 }
 return {embeds:[embed],components:rows,attachments:[] as never[],allowedMentions:{parse:[] as never[]}};
}
export async function visualNPCLobby(owner:string,now=Date.now(),npcId='joey',view:GalleryView='hero',page=0){
 const payload=npcLobby(owner,now,npcId,view,page);
 try{const image=await renderNPC(galleryModel(owner,now,npcId,view,page));payload.embeds[0].setImage('attachment://duelista.png');return {...payload,files:[new AttachmentBuilder(image,{name:'duelista.png'})]};}
 catch(error){console.error('Falha no painel visual dos duelistas:',error instanceof Error?error.name:'erro');return {...payload,files:[]};}
}
