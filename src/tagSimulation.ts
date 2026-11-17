import {EmbedBuilder} from 'discord.js';
import {getPlayableCard} from './effectRegistry';
import {chooseNPC} from './duelStore';
import {decisionPlayer} from './duelEngine';
import {createTagDuel,stepTagDuel,tagDecisionMember,publicTagDuel,tagNormalCardIds,assertTagDuel} from './tagDuel';
export function simulateTag(seed?:string){
 const normals=tagNormalCardIds.filter(id=>(getPlayableCard(id)?.level??0)<=4&&(getPlayableCard(id)?.atk??0)>=1400).slice(0,10);if(normals.length<10)throw Error('Catálogo insuficiente para laboratório 2v2.');
 const cards=normals.flatMap(id=>[id,id,id]);let game=createTagDuel(['Azul 1','Vermelho 1','Azul 2','Vermelho 2'].map((name,i)=>({id:'lab-'+i,name,cards})) as Parameters<typeof createTagDuel>[0],{seed});let decisions=0,restores=0;
 while(game.core.phase!=='finished'){
  const actor=game.core.players[decisionPlayer(game.core)].id,action=chooseNPC(game.core,actor);if(!action)throw Error('Laboratório 2v2 sem ação legal.');game=stepTagDuel(game,tagDecisionMember(game).id,action);if(++decisions>2000)throw Error('Limite da simulação 2v2.');
  if(decisions%13===0){game=JSON.parse(JSON.stringify(game));assertTagDuel(game);restores++;}
 }
 return {game:publicTagDuel(game),decisions,restores};
}
export function tagSimulationMessage(result:ReturnType<typeof simulateTag>){
 const g=result.game,winner=g.winner==='tag-team-0'?'Equipe Azul':g.winner==='tag-team-1'?'Equipe Vermelha':'Empate';
 return {embeds:[new EmbedBuilder().setColor(0x1688D8).setTitle('Laboratório 2v2 • simulação').setDescription(`**${winner}** • ${g.reason}\nQuatro participantes virtuais; nenhum item ou progresso do seu personagem foi alterado.`).addFields({name:'Equipes',value:g.teams.map(t=>`${t.name}: ${t.lp} PV`).join('\n')},{name:'Motor exercitado',value:`${g.turn} turnos • ${result.decisions} decisões • ${result.restores} restaurações JSON.\nRotação A1 → B1 → A2 → B2; campos e 4000 PV compartilhados por equipe; mãos/decks separados.`},{name:'Escopo desta primeira etapa',value:'Somente monstros normais. Não é uma partida entre quatro humanos. Magias, Armadilhas, efeitos, convites e interação 2v2 ainda não estão habilitados.'}).setFooter({text:'Fase 6 • Laboratório isolado • 1v1 preservado'})],allowedMentions:{parse:[] as never[]}};
}
