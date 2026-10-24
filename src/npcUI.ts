import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,escapeMarkdown} from 'discord.js';
import {getPlayer} from './database';
import {getCard} from './collection';
import {npcs,dailyEvent} from './npcContent';
import {npcProgress} from './npcProgress';
export function npcLobby(owner:string,now=Date.now()){
 const player=getPlayer(owner);if(!player)throw new Error('Crie seu duelista com /start.');const progress=npcProgress(owner,now),event=dailyEvent(now);
 const names=(ids:string[])=>ids.map(id=>getCard(id)!.name).join(' + ');
 const embed=new EmbedBuilder().setColor(0xc7a267).setTitle('Portal dos duelistas • Fase 5').setDescription(`**${escapeMarkdown(player.character_name||player.username)}** • ${player.dp} DP • Nível ${player.duelist_level} • ${player.xp} XP\n${progress.wins} vitórias em ${progress.played} desafios concluídos.\n\nUse seu deck ativo. Cada NPC tem um deck de 20 cartas e joga com as mesmas regras. As recompensas entram automaticamente ao vencer.`);
 for(const npc of npcs)embed.addFields({name:`${progress.won.has(npc.id)?'✓':'◇'} ${npc.name} • ${npc.style}`,value:`${npc.description}\n${progress.won.has(npc.id)?'Primeira vitória recebida. Revanche livre, sem prêmio repetido.':`**Primeira vitória: ${npc.reward.dp} DP + ${npc.reward.xp} XP**\nCartas: ${names(npc.reward.cards)}`}`});
 embed.addFields({name:`Evento diário • ${event.day} • ${event.npc.name}`,value:`${progress.dailyClaimed?'✓ Bônus de hoje já recebido.':`**+${event.dp} DP + ${event.xp} XP + ${names(event.cards)}** na primeira vitória pelo botão Evento diário.`}\nRenova à meia-noite de São Paulo. Vença antes da virada. Bônus diário e primeira vitória do NPC podem somar.`});
 embed.setFooter({text:'100 XP por nível • Prêmios globais por conta • Treino e PvP continuam sem recompensas'});
 const row=new ActionRowBuilder<ButtonBuilder>().addComponents(...npcs.map(n=>new ButtonBuilder().setCustomId(`npc:challenge:${owner}:${n.id}`).setLabel(`Duelar: ${n.name}`).setStyle(ButtonStyle.Primary)),new ButtonBuilder().setCustomId(`npc:daily:${owner}:today`).setLabel(progress.dailyClaimed?'Diário recebido':'Evento diário').setStyle(ButtonStyle.Success).setDisabled(progress.dailyClaimed),new ButtonBuilder().setCustomId(`npc:lobby:${owner}:all`).setLabel('Atualizar').setStyle(ButtonStyle.Secondary));
 return {embeds:[embed],components:[row],allowedMentions:{parse:[] as never[]}};
}
