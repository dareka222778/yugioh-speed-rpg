import {db,getPlayer} from './database';
import {getNPC,dailyEvent,eventDay} from './npcContent';
import type {DuelState} from './duelEngine';
db.exec(`CREATE TABLE IF NOT EXISTS npc_results(duel_id TEXT PRIMARY KEY,discord_id TEXT NOT NULL REFERENCES players(discord_id),npc_id TEXT NOT NULL,won INTEGER NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS npc_first_wins(discord_id TEXT NOT NULL REFERENCES players(discord_id),npc_id TEXT NOT NULL,duel_id TEXT NOT NULL UNIQUE,PRIMARY KEY(discord_id,npc_id));
 CREATE TABLE IF NOT EXISTS npc_daily_claims(discord_id TEXT NOT NULL REFERENCES players(discord_id),event_day TEXT NOT NULL,duel_id TEXT NOT NULL UNIQUE,PRIMARY KEY(discord_id,event_day));`);
export function npcProgress(owner:string,now=Date.now()){
 const won=new Set((db.prepare('SELECT npc_id FROM npc_first_wins WHERE discord_id=?').all(owner) as {npc_id:string}[]).map(r=>r.npc_id));
 const dailyClaimed=!!db.prepare('SELECT 1 FROM npc_daily_claims WHERE discord_id=? AND event_day=?').get(owner,eventDay(now));
 const stats=db.prepare('SELECT COUNT(*) AS played,COALESCE(SUM(won),0) AS wins FROM npc_results WHERE discord_id=?').get(owner) as {played:number;wins:number};
 return {won,dailyClaimed,...stats};
}
// Called inside the same transaction that stores the terminal duel state.
export const settleEncounter=db.transaction((duelId:string,s:DuelState,now=Date.now()):void=>{
 if(s.phase!=='finished'||!s.encounter)return;
 const existing=db.prepare('SELECT result FROM npc_results WHERE duel_id=?').get(duelId) as {result:string}|undefined;
 if(existing){s.reward=JSON.parse(existing.result);return;}
 const owner=s.players[0].id,npc=getNPC(s.encounter.npcId);if(!getPlayer(owner)||!s.players[1].id.startsWith('npc-'))throw new Error('Desafio de NPC inválido.');
 const won=s.winner===owner&&['pontos de vida','não conseguiu comprar uma carta'].includes(s.reason);
 const reward:NonNullable<DuelState['reward']>={dp:0,xp:0,cards:[],first:false,daily:false,note:''};
 if(won){
  const first=db.prepare('INSERT OR IGNORE INTO npc_first_wins(discord_id,npc_id,duel_id) VALUES(?,?,?)').run(owner,npc.id,duelId).changes;
  if(first){reward.first=true;reward.dp+=npc.reward.dp;reward.xp+=npc.reward.xp;}
  const daily=dailyEvent(now);
  if(s.encounter.eventDay===daily.day&&daily.npc.id===npc.id&&db.prepare('INSERT OR IGNORE INTO npc_daily_claims(discord_id,event_day,duel_id) VALUES(?,?,?)').run(owner,daily.day,duelId).changes){reward.daily=true;reward.dp+=daily.dp;reward.xp+=daily.xp;}
 }
 const expired=!!s.encounter.eventDay&&s.encounter.eventDay!==eventDay(now);
 reward.note=won?(reward.first||reward.daily?'Recompensas creditadas automaticamente.':s.encounter.eventDay&&s.encounter.eventDay!==eventDay(now)?'O evento virou à meia-noite; bônus diário expirado.':'Primeira vitória e bônus diário já recebidos; revanche sem recompensa.'):'Derrota, desistência ou W.O.: sem recompensa.';
 if(won&&expired&&(reward.first||reward.daily))reward.note+=' Bônus diário expirado na virada de São Paulo.';
 if(reward.dp||reward.xp)db.prepare('UPDATE players SET dp=dp+?,xp=xp+?,duelist_level=MAX(duelist_level,1+CAST((xp+?)/100 AS INTEGER)) WHERE discord_id=?').run(reward.dp,reward.xp,reward.xp,owner);
 // Ordinary encounters never write inventory. Card distribution requires a separate explicit event flow.
 db.prepare('INSERT INTO npc_results(duel_id,discord_id,npc_id,won,result,created_at) VALUES(?,?,?,?,?,?)').run(duelId,owner,npc.id,Number(won),JSON.stringify(reward),now);s.reward=reward;
});
