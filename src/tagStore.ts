import {transitionEvents,type DuelTransitionEvent} from './duelTransitions';
import {findActionReceipt,saveActionReceipt,type ActionReceipt} from './actionReceipts';
import {npcs,getNPC} from './npcContent';
import {step,decisionPlayer} from './duelEngine';
import {randomBytes,randomInt} from 'node:crypto';
import {db,getPlayer} from './database';
import {currentDuel,activeCards,chooseNPC,DECISION_TIMEOUT_MS} from './duelStore';
import {createTagDuel,assertTagDuel,stepTagDuel,tagActions,tagNormalCardIds,timeoutTagDuel,tagDecisionMember,type TagDuel} from './tagDuel';
import {getPlayableCard} from './effectRegistry';
export type TagRecord={events?:DuelTransitionEvent[];receipt?:ActionReceipt;id:string;guild:string;channel:string;message:string|null;revision:number;updated:number;status:'lobby'|'playing'|'finished'|'cancelled'|'expired';members:{id:string;name:string;accepted:boolean;automated?:boolean;deckSource?:string;cards?:string[];extra?:string[]}[];state:TagDuel|null;public_revision?:number;rules?:'normal'|'classic-loan'|'classic-owned'};
db.exec(`CREATE TABLE IF NOT EXISTS tag_sessions(id TEXT PRIMARY KEY,guild TEXT NOT NULL,channel TEXT NOT NULL,message TEXT,revision INTEGER NOT NULL,updated INTEGER NOT NULL,status TEXT NOT NULL,members TEXT NOT NULL,state TEXT);
CREATE TABLE IF NOT EXISTS tag_members(owner TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES tag_sessions(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS tag_action_receipts (
 request_id TEXT PRIMARY KEY,duel_id TEXT NOT NULL REFERENCES tag_sessions(id),actor TEXT NOT NULL,
 guild_id TEXT NOT NULL,expected_revision INTEGER NOT NULL,action_json TEXT NOT NULL,committed_revision INTEGER NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS tag_transition_events(session_id TEXT NOT NULL REFERENCES tag_sessions(id),revision INTEGER NOT NULL,events_json TEXT NOT NULL,PRIMARY KEY(session_id,revision));`);
function tagTransitionEvents(before:TagDuel,after:TagDuel):DuelTransitionEvent[]{return transitionEvents(before.core,after.core).map(event=>{
 if(event.visibility!=='private')return event;
 const uid='uid' in event?event.uid:undefined,seat=uid?/^m([0-3]):/.exec(uid):undefined;
 const team=after.core.players.findIndex(p=>p.id===event.player),member=seat?Number(seat[1]):after.active[team];
 if(!after.members[member])throw new Error('Destinatário privado de evento inválido.');return {...event,player:after.members[member].id};
});}
export function tagEventsAt(id:string,revision:number):DuelTransitionEvent[]{const row=db.prepare('SELECT events_json FROM tag_transition_events WHERE session_id=? AND revision=?').get(id,revision) as {events_json:string}|undefined;return row?JSON.parse(row.events_json):[];}
const columns=new Set((db.prepare('PRAGMA table_info(tag_sessions)').all() as {name:string}[]).map(c=>c.name));if(!columns.has('public_revision'))db.exec('ALTER TABLE tag_sessions ADD COLUMN public_revision INTEGER NOT NULL DEFAULT -1');
if(!columns.has('rules'))db.exec("ALTER TABLE tag_sessions ADD COLUMN rules TEXT NOT NULL DEFAULT 'normal'");
const LOBBY_MS=5*60_000;
function read(id:string):TagRecord{const r=db.prepare('SELECT * FROM tag_sessions WHERE id=?').get(id) as any;if(!r)throw Error('Partida 2v2 não encontrada.');try{r.members=JSON.parse(r.members);r.state=r.state?JSON.parse(r.state):null;}catch{throw Error('Sessão 2v2 inválida. Nenhum dado foi alterado.');}if(!Array.isArray(r.members)||r.members.length!==4||new Set(r.members.map((p:any)=>p.id)).size!==4||r.members.some((p:any)=>!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||typeof p.accepted!=='boolean')||!['lobby','playing','finished','cancelled','expired'].includes(r.status)||['playing','finished'].includes(r.status)!==!!r.state)throw Error('Sessão 2v2 inconsistente. Nenhum dado foi alterado.');if(!['normal','classic-loan','classic-owned'].includes(r.rules))throw Error('Formato 2v2 desconhecido.');if(r.state){assertTagDuel(r.state);if((r.rules==='normal')!==(r.state.mode==='tag-normal-lab'))throw Error('Modo e estado 2v2 incompatíveis.');if(r.state.members.some((p:any,i:number)=>p.id!==r.members[i].id)||r.status==='playing'&&r.state.core.phase==='finished'||r.status==='finished'&&r.state.core.phase!=='finished')throw Error('Participantes/resultado 2v2 inconsistentes.');}return r;}
function save(r:TagRecord){if(r.state)assertTagDuel(r.state);db.prepare('UPDATE tag_sessions SET message=?,revision=?,updated=?,status=?,members=?,state=? WHERE id=?').run(r.message,r.revision,r.updated,r.status,JSON.stringify(r.members),r.state?JSON.stringify(r.state):null,r.id);if(r.events)db.prepare('INSERT INTO tag_transition_events VALUES(?,?,?)').run(r.id,r.revision,JSON.stringify(r.events));if(!['lobby','playing'].includes(r.status))db.prepare('DELETE FROM tag_members WHERE session_id=?').run(r.id);return r;}
export const getTag=db.transaction((id:string,now=Date.now())=>{const r=read(id);if(['lobby','playing'].includes(r.status)&&now-r.updated>=(r.status==='lobby'?LOBBY_MS:DECISION_TIMEOUT_MS)){r.status=r.state?'finished':'expired';if(r.state){const before=r.state;r.state=timeoutTagDuel(before);r.events=tagTransitionEvents(before,r.state);}r.revision++;save(r);}return r;});
export function currentTag(owner:string){const link=db.prepare('SELECT session_id FROM tag_members WHERE owner=?').get(owner) as {session_id:string}|undefined;if(!link)return;const r=getTag(link.session_id);return ['lobby','playing'].includes(r.status)?r:undefined;}
function available(owner:string){if(currentTag(owner)||currentDuel(owner))throw Error('Esse participante já possui um duelo ou convite aberto. Encerre-o antes de entrar no 2v2.');}
export function tagLoanDeck(){const ids=tagNormalCardIds.filter(id=>(getPlayableCard(id)?.level??0)<=4&&(getPlayableCard(id)?.atk??0)>=1400).slice(0,10);if(ids.length!==10)throw Error('Catálogo insuficiente.');return ids.flatMap(id=>[id,id,id]);}
export const createTagLobby=db.transaction((ids:string[],guild:string,channel:string,rules:NonNullable<TagRecord['rules']>='normal'):TagRecord=>{
 if(!['normal','classic-loan','classic-owned'].includes(rules))throw Error('Modo de cartas 2v2 inválido.');
 if(ids.length!==4||new Set(ids).size!==4)throw Error('Escolha quatro humanos diferentes.');
 const members=ids.map((id,index)=>{available(id);const p=getPlayer(id);if(!p)throw Error('Todos os participantes precisam criar o perfil com /start.');return {id,name:(p.character_name||p.username).slice(0,32),accepted:index===0};});
 const r:TagRecord={id:randomBytes(8).toString('hex'),guild,channel,message:null,revision:0,updated:Date.now(),status:'lobby',members,state:null,rules};if(rules==='classic-owned'){const host=members[0] as TagRecord['members'][number];Object.assign(host,activeCards(ids[0]));}
 db.prepare('INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)').run(r.id,guild,channel,null,0,r.updated,r.status,JSON.stringify(members),null,rules);db.prepare('INSERT INTO tag_members VALUES(?,?)').run(ids[0],r.id);return r;
});
function authorize(r:TagRecord,actor:string,guild:string){if(r.guild!==guild||!r.members.some(p=>p.id===actor))throw Error('Você não participa deste 2v2 neste servidor.');}
export const acceptTag=db.transaction((id:string,actor:string,guild:string,revision:number)=>{const r=getTag(id);authorize(r,actor,guild);if(r.status!=='lobby'||r.revision!==revision)throw Error('Convite atualizado ou encerrado. Use Atualizar.');const member=r.members.find(p=>p.id===actor)!;if(member.accepted)throw Error('Você já confirmou. Aguarde os outros participantes.');available(actor);db.prepare('INSERT INTO tag_members VALUES(?,?)').run(actor,id);if(r.rules==='classic-owned')Object.assign(member,activeCards(actor));member.accepted=true;r.revision++;
 // The lobby deadline never extends when one participant confirms.
 if(r.members.every(p=>p.accepted)){r.state=createTagDuel(r.members.map((p,i)=>({id:p.id,name:p.name,...r.rules==='classic-owned'?{cards:p.cards!,extra:p.extra??[]}:r.rules==='classic-loan'?{cards:[...npcs[i%3].cards],extra:[...npcs[i%3].extra]}:{cards:tagLoanDeck()}})) as Parameters<typeof createTagDuel>[0],{first:randomInt(4),classic:r.rules!=='normal'});r.status='playing';r.updated=Date.now();}return save(r);
});
export const actTag=db.transaction((id:string,actor:string,guild:string,revision:number,index:number,requestId?:string)=>{
 const request={id,actor,guild,expected:revision,action:index,requestId},receipt=findActionReceipt('tag',request);
 if(receipt){const current=read(id);authorize(current,actor,guild);return {...current,receipt};}
 const r=getTag(id);authorize(r,actor,guild);if(r.status!=='playing'||!r.state||r.revision!==revision)throw Error('Painel desatualizado. Atualize antes de jogar.');const actions=tagActions(r.state,actor);if(!Number.isSafeInteger(index)||index<0||index>=actions.length)throw Error('Jogada indisponível.');const before=r.state;r.state=stepTagDuel(before,actor,actions[index]);r.events=tagTransitionEvents(before,r.state);r.revision++;r.updated=Date.now();if(r.state.core.phase==='finished')r.status='finished';save(r);if(requestId)r.receipt=saveActionReceipt('tag',request,r.revision);return r;});
export const quitTag=db.transaction((id:string,actor:string,guild:string,revision:number)=>{const r=getTag(id);authorize(r,actor,guild);if(!['lobby','playing'].includes(r.status)||r.revision!==revision)throw Error('Partida atualizada ou encerrada.');if(r.state){
 const team=r.state.members.find(p=>p.id===actor)!.team;
 // Any member can concede for their team, even when the partner must act.
 const before=r.state;r.state=structuredClone(before);r.state.core=step(r.state.core,'tag-team-'+team,{kind:'concede'});assertTagDuel(r.state);r.events=tagTransitionEvents(before,r.state);r.status='finished';
 }else r.status='cancelled';r.revision++;return save(r);});
export function setTagMessage(id:string,message:string,channel?:string){db.prepare('UPDATE tag_sessions SET message=?,channel=COALESCE(?,channel),public_revision=-1 WHERE id=?').run(message,channel??null,id);}
export function dueTags(){const rows=db.prepare("SELECT id FROM tag_sessions WHERE status IN ('lobby','playing') OR (message IS NOT NULL AND public_revision<revision)").all() as {id:string}[];return rows.flatMap(p=>{try{const r=getTag(p.id);return (r.public_revision??-1)<r.revision||isTagBotDecision(r)?[r]:[];}catch{console.error('Sessão 2v2 inválida preservada para revisão:',p.id);return [];}});}
export function markTagPublished(id:string,revision:number){db.prepare('UPDATE tag_sessions SET public_revision=? WHERE id=? AND revision=?').run(revision,id,revision);}
export function tagDeadline(r:TagRecord){return r.updated+(r.status==='lobby'?LOBBY_MS:DECISION_TIMEOUT_MS);}
export {tagDecisionMember};


/** Training uses exactly the same saved four-seat state; only the real user occupies a global seat lock. */
export const createTagTraining=db.transaction((owner:string,guild:string,channel:string,source='yugi'):TagRecord=>{
 available(owner);const player=getPlayer(owner);if(!player)throw Error('Crie seu perfil com /start.');const id=randomBytes(8).toString('hex');
 const human=source==='meu_deck'?activeCards(owner):getNPC(source),opponents=[getNPC('kaiba'),getNPC('yugi'),getNPC('joey')];
 const members:TagRecord['members']=[{id:owner,name:(player.character_name||player.username).slice(0,32),accepted:true,deckSource:source},...opponents.map((p,i)=>({id:`tag-npc-${id}-${i+1}`,name:p.name,accepted:true,automated:true}))];
 const decks=[human,...opponents];const state=createTagDuel(members.map((p,i)=>({id:p.id,name:p.name,cards:[...decks[i].cards],extra:[...decks[i].extra??[]]})) as Parameters<typeof createTagDuel>[0],{classic:true,first:randomInt(4)});
 const r:TagRecord={id,guild,channel,message:null,revision:0,updated:Date.now(),status:'playing',members,state,rules:'classic-loan'};
 db.prepare('INSERT INTO tag_sessions(id,guild,channel,message,revision,updated,status,members,state,rules) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,guild,channel,null,0,r.updated,r.status,JSON.stringify(members),JSON.stringify(state),r.rules);db.prepare('INSERT INTO tag_members VALUES(?,?)').run(owner,id);return r;
});
export function isTagBotDecision(r:TagRecord){return r.status==='playing'&&!!r.state&&r.members.some(p=>p.id===tagDecisionMember(r.state!).id&&p.automated===true);}
export function runTagBots(id:string,limit=300){let r=getTag(id),count=0;while(isTagBotDecision(r)){
 if(++count>limit)throw Error('O treino chegou ao limite de processamento. Reabra com /dupla ver para continuar.');const s=r.state!,owner=tagDecisionMember(s).id,a=chooseNPC(s.core,s.core.players[decisionPlayer(s.core)].id);if(!a)throw Error('O NPC ficou sem jogada legal. O estado foi preservado.');const index=tagActions(s,owner).findIndex(candidate=>JSON.stringify(candidate)===JSON.stringify(a));if(index<0)throw Error('Decisão de NPC inválida. O estado foi preservado.');r=actTag(r.id,owner,r.guild,r.revision,index);
 }return r;}
