import {ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags} from 'discord.js';
import {acceptTag,actTag,getTag,quitTag,type TagRecord} from './tagStore';
import {tagPrivateMessage,tagPublicMessage} from './tagUI';
/** Transport adapter: acknowledgements precede mutation; revisions reject double clicks. */
export async function handleTagComponent(i:any,refresh:(r:TagRecord)=>Promise<void>,onDefer:(kind:'reply'|'update')=>void){
 const [,raw,id,revision,owner]=i.customId.split(':'),[action,bound,page]=raw.split(',');
 if(!i.guildId)throw Error('Use o 2v2 dentro do servidor.');const r=getTag(id);if(r.guild!==i.guildId)throw Error('Esta partida pertence a outro servidor.');
 const actor=i.user.id;if(!r.members.some(p=>p.id===actor))throw Error('Você não participa desta partida.');
 if((bound&&bound!==actor)||(owner&&owner!==actor))throw Error('Abra sua própria mão no campo.');
 if(action==='refresh'){await i.deferUpdate();onDefer('update');await i.editReply(tagPublicMessage(r));return;}
 if(action==='open'){await i.deferReply({flags:MessageFlags.Ephemeral});onDefer('reply');await i.editReply(tagPrivateMessage(r,actor));return;}
 if(action==='page'){await i.deferUpdate();onDefer('update');await i.editReply(tagPrivateMessage(r,actor,Number(page)));return;}
 if(action==='quit'){
  await i.deferUpdate();onDefer('update');await i.editReply({content:'Desistir encerra a partida para sua equipe. Confirma?',embeds:[],attachments:[],files:[],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`tag:confirm,${actor}:${id}:${r.revision}`).setLabel('Confirmar desistência da equipe').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`tag:page,${actor},0:${id}:${r.revision}`).setLabel('Continuar jogando').setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[]}});return;
 }
 if(!['accept','cancel','confirm','act'].includes(action))throw Error('Controle 2v2 inválido.');
 await i.deferUpdate();onDefer('update');
 const next=action==='accept'?acceptTag(id,actor,i.guildId,Number(revision)):action==='act'?actTag(id,actor,i.guildId,Number(revision),Number(i.values?.[0])):quitTag(id,actor,i.guildId,Number(revision));
 // Public refresh still runs if a committed action cannot edit the private response.
 try{await i.editReply(action==='act'||action==='confirm'?tagPrivateMessage(next,actor):tagPublicMessage(next));}finally{await refresh(next);}
}
