import sharp from 'sharp';
import {ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,StringSelectMenuBuilder,escapeMarkdown} from 'discord.js';
import {legalActions,actionLabel,type DuelState} from './duelEngine';
import {DECISION_TIMEOUT_MS,type DuelRecord} from './duelStore';
import {renderDuel,phaseNames} from './duelRenderer';
import {getCard} from './collection';
export function publicDuelData(s:DuelState){return {turn:s.turn,phase:s.phase,current:s.current,winner:s.winner,reason:s.reason,players:s.players.map(p=>({id:p.id,name:p.name,lp:p.lp,deckCount:p.deck.length,handCount:p.hand.length,grave:p.grave.map(c=>c.id),extraCount:p.extra?.length??0,banishedCount:p.banished?.length??0,field:p.field?{id:p.field.faceUp?p.field.id:null,faceUp:p.field.faceUp}:null,monsters:p.monsters.map(m=>({id:m.faceUp?m.id:null,position:m.position,faceUp:m.faceUp})),backrow:p.backrow.map(c=>({id:c.faceUp?c.id:null,faceUp:c.faceUp}))})),log:s.log};}
export function invitationMessage(r:DuelRecord){const embed=new EmbedBuilder().setColor(0xb59aff).setTitle('Desafio de duelo 1v1').setDescription(`${escapeMarkdown(r.invite!.name)} convidou <@${r.invite!.opponent}> para duelar.\n\n4000 PV • Deck ativo • Regras básicas\nO convite expira em 2 minutos. Sem apostas ou recompensas.`);
 return {embeds:[embed],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`duel:accept:${r.id}:${r.revision}`).setLabel('Aceitar duelo').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`duel:decline:${r.id}:${r.revision}`).setLabel('Recusar / cancelar').setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[] as never[]}};
}
export function duelPublicMessage(r:DuelRecord){
 if(r.status==='pending')return invitationMessage(r);
 if(!r.state)return {embeds:[new EmbedBuilder().setTitle('Convite encerrado').setDescription(r.status==='expired'?'O convite expirou.':'Convite cancelado.')],components:[],attachments:[],allowedMentions:{parse:[] as never[]}};
 const view=publicDuelData(r.state);const acting=r.state.phase==='response'?r.state.priority:r.state.phase==='choice'?r.state.choice!.actor:r.state.current;
 const embed=new EmbedBuilder().setColor(0xc7a267).setTitle(r.state.phase==='finished'?'Duelo encerrado':'Arena • Duelo 1v1')
 .setDescription(`${view.players.map(p=>`**${escapeMarkdown(p.name)}** — ${p.lp} PV | Mão ${p.handCount} | Deck ${p.deckCount}`).join('\n')}\n\nTurno ${view.turn} • ${phaseNames[view.phase]}${view.phase==='finished'?`\n${view.winner?escapeMarkdown(view.players.find(p=>p.id===view.winner)!.name)+' venceu':'Sem vencedor'}: ${view.reason}`:`\nAguardando **${escapeMarkdown(view.players[acting].name)}**.`}`)
 .addFields({name:'Últimas jogadas',value:view.log.slice(-4).map(line=>escapeMarkdown(line)).join('\n').slice(-1000)||'O duelo começou.'}).setFooter({text:'Arena clássica • Mãos privadas • Sem recompensas'});
 if(view.phase!=='finished')embed.addFields({name:'Limite da decisão',value:`<t:${Math.floor((r.updated+DECISION_TIMEOUT_MS)/1000)}:R> • 30 minutos. Quem deve agir perde por W.O. ao esgotar o prazo.`});
 embed.setFooter({text:r.state.fixedOpening?'Laboratório de fusão • Mão inicial fixa para testar a receita':'Baralho embaralhado no início • Compra do topo • Sem escolha da próxima carta'});
 const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`duel:open:${r.id}:${r.revision}`).setLabel('🃏 Ver minha mão / jogar').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`duel:public:${r.id}:${r.revision}`).setLabel('Atualizar campo').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`duel:zones:${r.id}:${r.revision}`).setLabel('Cemitério / zonas').setStyle(ButtonStyle.Secondary));
 return {embeds:[embed],components:r.state.phase==='finished'?[]:[row],attachments:[],allowedMentions:{parse:[] as never[]}};
}
export async function visualDuelPublic(r:DuelRecord){const p=duelPublicMessage(r);if(!r.state)return p;const png=await renderDuel(r.state);p.embeds[0].setImage('attachment://campo-duelo.png');return {...p,files:[new AttachmentBuilder(png,{name:'campo-duelo.png'})]};}
export function duelPrivateMessage(r:DuelRecord,owner:string,requestedPage=1){
 if(!r.state||!r.state.players.some(p=>p.id===owner))throw new Error('Só participantes podem abrir a mão deste duelo.');
 const s=r.state;const p=s.players.find(p=>p.id===owner)!;const actions=legalActions(s,owner);const pages=Math.max(1,Math.ceil(actions.length/20));const page=Math.min(pages,Math.max(1,Number.isInteger(requestedPage)?requestedPage:1));
 const embed=new EmbedBuilder().setColor(0xc7a267).setTitle(`🃏 Sua mão • ${escapeMarkdown(p.name)}`).setDescription(`**${p.lp} PV** • **${p.deck.length} cartas para comprar** • Turno ${s.turn} • ${phaseNames[s.phase]}\n${s.phase==='finished'?s.reason:actions.length?'**Sua vez de decidir.**':'Aguardando o outro jogador.'}`).addFields({name:'Sua mão',value:p.hand.map((c,n)=>`${n+1}. ${getCard(c.id)!.name}`).join('\n')||'Sem cartas.'});
 if(s.phase!=='finished')embed.addFields({name:'Próximo passo',value:actions.length?'Escolha uma jogada no menu. Ela será executada imediatamente.':'Aguarde o outro jogador. Use Atualizar para acompanhar.'});
 embed.setFooter({text:`Ações ${page}/${pages} • ${s.fixedOpening?'Treino de fusão: mão inicial fixa':'Baralho embaralhado • Compra do topo'} • Só você vê sua mão`});
 if(s.phase==='finished')return {embeds:[embed],components:[],attachments:[],allowedMentions:{parse:[] as never[]}};
 const rows:(ActionRowBuilder<ButtonBuilder>|ActionRowBuilder<StringSelectMenuBuilder>)[]=[];
 if(actions.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`duel:act:${r.id}:${r.revision}:${page}`).setPlaceholder('Escolha sua próxima jogada').addOptions(actions.slice((page-1)*20,page*20).map((a,i)=>({label:(('card' in a&&p.hand.some(c=>c.uid===a.card)?`[${p.hand.findIndex(c=>c.uid===a.card)+1}] `:'')+actionLabel(s,owner,a)).slice(0,100),value:String((page-1)*20+i)})))));
 const quick=actions.map((a,index)=>({a,index})).filter(({a})=>['battle','end','pass'].includes(a.kind));
 if(quick.length)rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...quick.map(({a,index})=>new ButtonBuilder().setCustomId(`duel:quick:${r.id}:${r.revision}:${index}`).setLabel(a.kind==='battle'?'⚔️ Ir à batalha':a.kind==='end'?'Encerrar turno':'Passar resposta').setStyle(a.kind==='battle'?ButtonStyle.Success:ButtonStyle.Secondary))));
 rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`duel:view:${r.id}:${r.revision}:${page-1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page===1),new ButtonBuilder().setCustomId(`duel:view:${r.id}:${r.revision}:${page}`).setLabel('Atualizar').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`duel:view:${r.id}:${r.revision}:${page+1}`).setLabel('Próxima').setStyle(ButtonStyle.Secondary).setDisabled(page===pages),new ButtonBuilder().setCustomId(`duel:quit:${r.id}:${r.revision}`).setLabel('Desistir').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`duel:zones:${r.id}:${r.revision}`).setLabel('Cemitério / zonas').setStyle(ButtonStyle.Secondary)));
 return {embeds:[embed],components:rows,attachments:[],allowedMentions:{parse:[] as never[]}};
}
export async function visualDuelPrivate(r:DuelRecord,owner:string,page=1){
 const p=duelPrivateMessage(r,owner,page),s=r.state!,png=await renderDuel(s,owner);
 if(!s.players.find(player=>player.id===owner)!.hand.length){p.embeds[0].setImage('attachment://meu-campo.png');return {...p,files:[new AttachmentBuilder(png,{name:'meu-campo.png'})]};}
 // Separate images keep Discord from shrinking the hand to fit a tall board.
 const [hand,field]=await Promise.all([sharp(png).extract({left:0,top:0,width:1400,height:340}).png().toBuffer(),sharp(png).extract({left:0,top:340,width:1400,height:1020}).png().toBuffer()]);
 p.embeds[0].setImage('attachment://minha-mao.png');p.embeds.push(new EmbedBuilder().setColor(0xc7a267).setTitle('Campo de duelo • visão privada').setImage('attachment://meu-campo.png'));
 return {...p,files:[new AttachmentBuilder(hand,{name:'minha-mao.png'}),new AttachmentBuilder(field,{name:'meu-campo.png'})]};
}
export function quitMessage(r:DuelRecord){return {content:'Desistir encerra o duelo. Confirma?',components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`duel:confirm:${r.id}:${r.revision}`).setLabel('Sim, desistir').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`duel:open:${r.id}:${r.revision}`).setLabel('Continuar jogando').setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[] as never[]}};}

export function duelZonesMessage(r:DuelRecord,viewer:string){
 if(!r.state)throw new Error('O duelo ainda não começou.');const embed=new EmbedBuilder().setColor(0x9b82d6).setTitle('Cemitério e zonas do duelo');
 const list=(cards:{id:string}[])=>{const counts=new Map<string,number>();for(const c of cards)counts.set(c.id,(counts.get(c.id)??0)+1);return [...counts].map(([id,n])=>`${n}× ${getCard(id)?.name??id}`).join('\n').slice(0,1000)||'Vazio';};
 for(const p of r.state.players){embed.addFields({name:`${p.name} • Cemitério (${p.grave.length})`,value:list(p.grave)},{name:`${p.name} • Magia de Campo`,value:p.field?(p.field.faceUp||p.id===viewer?getCard(p.field.id)!.name:'Carta virada para baixo'):'Zona vazia'},{name:`${p.name} • Deck Adicional (${p.extra?.length??0})`,value:p.id===viewer?list(p.extra??[]):'Identidade das cartas oculta.'},{name:`${p.name} • Banidas (${p.banished?.length??0})`,value:list(p.banished??[])});}
 return {embeds:[embed],components:[],allowedMentions:{parse:[] as never[]}};
}
