import {findActionReceipt,saveActionReceipt,type ActionReceipt} from './actionReceipts';
import {tacticalSummon,tacticalPosition,tacticalAttack,handCardValue,publicBattleAssessment} from './npcStrategy';
import {randomBytes,randomInt} from 'node:crypto';
import {applyDuelAction,transitionEvents,type DuelTransitionEvent} from './duelTransitions';
import {assertDuelState} from './duelIntegrity';
import {db,getPlayer} from './database';
import {openDeck} from './decks';
import {starterContents} from './cardCatalog';
import {createDuel,step,legalActions,validateDuelCards,timeoutDuel,atk,def,type Action,type DuelState} from './duelEngine';
import {getCard} from './collection';
import {getNPC,dailyEvent} from './npcContent';
import {economicOperations} from './effectModels';
import {getEffect} from './effectRegistry';
import {getMonsterEffect} from './monsterEffects';
import {settleEncounter} from './npcProgress';
export type DuelRecord={receipt?:ActionReceipt;events?:DuelTransitionEvent[];id:string;guild_id:string;channel_id:string;message_id:string|null;status:string;revision:number;updated:number;public_revision?:number;state:DuelState|null;invite:{owner:string;opponent:string;name:string;cards:string[];extra?:string[]}|null};
db.exec(`CREATE TABLE IF NOT EXISTS duels (id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL,state TEXT,invite TEXT);
 CREATE TABLE IF NOT EXISTS duel_members (owner TEXT PRIMARY KEY,duel_id TEXT NOT NULL REFERENCES duels(id) ON DELETE CASCADE);`);
// Additive tables: old snapshots and membership rows remain unchanged.
db.exec(`CREATE TABLE IF NOT EXISTS duel_action_receipts (
 request_id TEXT PRIMARY KEY,duel_id TEXT NOT NULL REFERENCES duels(id),actor TEXT NOT NULL,
 guild_id TEXT NOT NULL,expected_revision INTEGER NOT NULL,action_json TEXT NOT NULL,
 committed_revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS duel_transition_events (
 duel_id TEXT NOT NULL REFERENCES duels(id),revision INTEGER NOT NULL,events_json TEXT NOT NULL,
 PRIMARY KEY(duel_id,revision));`);
const duelColumns=new Set((db.prepare('PRAGMA table_info(duels)').all() as {name:string}[]).map(c=>c.name));
if(!duelColumns.has('public_revision'))db.exec('ALTER TABLE duels ADD COLUMN public_revision INTEGER NOT NULL DEFAULT -1');
function read(id:string):DuelRecord|undefined {const row=db.prepare('SELECT * FROM duels WHERE id=?').get(id) as any;if(!row)return;let state,invite;try{state=row.state?JSON.parse(row.state):null;invite=row.invite?JSON.parse(row.invite):null;}catch{throw new Error('Dados salvos do duelo inválidos. Nenhuma alteração foi gravada.');}if(state)assertDuelState(state);if(row.status==='playing'&&!state)throw new Error('Estado do duelo inválido: partida ativa sem dados. Nenhuma alteração foi gravada.');return {...row,state,invite};}
function save(record:DuelRecord){if(record.state)assertDuelState(record.state);if(record.status==='finished'&&record.state?.encounter)settleEncounter(record.id,record.state);db.prepare('UPDATE duels SET status=?,revision=?,updated=?,state=?,invite=? WHERE id=?').run(record.status,record.revision,record.updated,record.state?JSON.stringify(record.state):null,record.invite?JSON.stringify(record.invite):null,record.id);if(!['pending','playing'].includes(record.status))db.prepare('DELETE FROM duel_members WHERE duel_id=?').run(record.id);}
export const DECISION_TIMEOUT_MS=30*60_000;
export const getDuel=db.transaction((id:string,now=Date.now()):DuelRecord=>{
 const record=read(id);if(!record)throw new Error('Duelo não encontrado.');
 const limit=record.status==='pending'?120_000:DECISION_TIMEOUT_MS;
 if(['pending','playing'].includes(record.status)&&now-record.updated>=limit){record.status=record.state?'finished':'expired';record.revision++;if(record.state)record.state=timeoutDuel(record.state);save(record);}
 return record;
});
export function currentDuel(owner:string){const row=db.prepare('SELECT duel_id FROM duel_members WHERE owner=?').get(owner) as {duel_id:string}|undefined;if(!row)return;const duel=getDuel(row.duel_id);return ['pending','playing'].includes(duel.status)?duel:undefined;}
function available(owner:string){if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tag_members'").get()&&db.prepare('SELECT 1 FROM tag_members WHERE owner=?').get(owner))throw Error('Você está reservado em um 2v2. Abra /dupla ver para encerrá-lo antes.');if(currentDuel(owner))throw new Error('Esse duelista já tem um duelo ou convite aberto. Use /duelo ver ou /duelo sair.');}
export function activeCards(owner:string){const row=db.prepare('SELECT slot FROM decks WHERE discord_id=? AND active=1').get(owner) as {slot:number}|undefined;if(!row)throw new Error('Ative um deck válido primeiro com /deck ativar.');const deck=openDeck(owner,row.slot);if(!deck.active||deck.errors.length)throw new Error('O deck ativo ficou inválido. Confira /deck ver.');const cards=deck.items.filter(c=>!getCard(c.card_key)?.fusion).flatMap(c=>Array(c.quantity).fill(c.card_key)) as string[];const extra=deck.items.filter(c=>getCard(c.card_key)?.fusion).flatMap(c=>Array(c.quantity).fill(c.card_key)) as string[];validateDuelCards(cards);return {cards,extra};}
function name(owner:string){const p=getPlayer(owner);if(!p)throw new Error('Crie seu duelista com /start.');return p.character_name||p.username;}
function insert(r:DuelRecord,owners:string[]){db.prepare('INSERT INTO duels(id,guild_id,channel_id,message_id,status,revision,updated,state,invite) VALUES(?,?,?,?,?,?,?,?,?)').run(r.id,r.guild_id,r.channel_id,r.message_id,r.status,r.revision,r.updated,r.state?JSON.stringify(r.state):null,r.invite?JSON.stringify(r.invite):null);const put=db.prepare('INSERT INTO duel_members VALUES(?,?)');for(const owner of owners)put.run(owner,r.id);}
export const challenge=db.transaction((owner:string,opponent:string,guild:string,channel:string):DuelRecord=>{
 if(owner===opponent)throw new Error('Escolha outro jogador ou use /duelo treino.');available(owner);available(opponent);const cards=activeCards(owner);
 const r:DuelRecord={id:randomBytes(8).toString('hex'),guild_id:guild,channel_id:channel,message_id:null,status:'pending',revision:0,updated:Date.now(),state:null,invite:{owner,opponent,name:name(owner),cards:cards.cards,extra:cards.extra}};insert(r,[owner]);return r;
});
export const acceptChallenge=db.transaction((id:string,actor:string,guild:string,expected:number):DuelRecord=>{
 const r=getDuel(id);if(r.guild_id!==guild||r.status!=='pending'||r.revision!==expected)throw new Error('O convite expirou ou já foi respondido.');if(r.invite!.opponent!==actor)throw new Error('Só o jogador convidado pode aceitar.');available(actor);
 const invite=r.invite!;r.state=createDuel([{id:invite.owner,name:invite.name,cards:invite.cards,extra:invite.extra},{id:actor,name:name(actor),...activeCards(actor)}],Math.random,randomInt(2));
 db.prepare('INSERT INTO duel_members VALUES(?,?)').run(actor,id);r.invite=null;r.status='playing';r.revision++;r.updated=Date.now();save(r);return r;
});
export const declineChallenge=db.transaction((id:string,actor:string,guild:string):DuelRecord=>{const r=getDuel(id);if(r.guild_id!==guild||r.status!=='pending'||![r.invite!.owner,r.invite!.opponent].includes(actor))throw new Error('Não é possível cancelar esse convite.');r.status='declined';r.revision++;r.updated=Date.now();save(r);return r;});
export function chooseNPC(s:DuelState,id:string):Action|undefined {
 const actions=legalActions(s,id);const p=s.players.find(p=>p.id===id)!;const op=s.players.find(p=>p.id!==id)!;
 const source=(a:Extract<Action,{kind:'trap'|'spell'}>)=>[...p.hand,...p.backrow].find(c=>c.uid===a.card);
 const fast=actions.filter((a):a is Extract<Action,{kind:'trap'}>=>a.kind==='trap');
 const useful=fast.filter(a=>{const c=source(a),effect=c&&getEffect(c.id);if(!effect)return false;
  if(effect.kind==='sequence'){
   const draws=(id:string)=>{const effect=getEffect(id);return effect?(economicOperations(effect)??[]).reduce((n,op)=>n+(op.kind==='draw'?op.count:0),0):0;};
   const index=s.players.indexOf(p),root=s.pending;
   const committed=(root.kind==='spell'&&root.actor===index?draws(root.id):0)+s.chain.filter(link=>link.actor===index).reduce((n,link)=>n+draws(link.id),0);
   const ownDraw=effect.operations.reduce((n,op)=>n+(op.kind==='draw'?op.count:0),0);
   return ownDraw>0&&p.deck.length>=committed+ownDraw;
  }
  if(effect.kind==='attackResponse')return s.pending.kind==='attack'&&s.pending.actor!==s.players.indexOf(p)&&!s.chain.some(link=>link.actor===s.players.indexOf(p)&&getEffect(link.id)?.kind==='attackResponse');
  if(effect.kind==='reinforcements'||effect.kind==='castleWalls')return p.monsters.some(m=>m.uid===a.target&&m.faceUp);
  if(effect.kind==='trapHole'||effect.kind==='bottomlessTrapHole')return op.monsters.some(m=>m.uid===a.target);
  if(effect.kind==='torrentialTribute')return op.monsters.length>0&&op.monsters.length>=p.monsters.length;
  if(effect.kind==='sakuretsuArmor')return s.pending.kind==='attack'&&s.players[s.pending.actor].id!==id&&op.monsters.some(m=>m.uid===a.target);
  if(effect.kind==='magicJammer')
   return s.pending.kind!=='none'&&'actor' in s.pending&&s.pending.actor!==s.players.indexOf(p);
  if(effect.kind==='sevenTools'){
   const last=s.chain.at(-1);
   return !!last&&last.actor!==s.players.indexOf(p);
  }
  if(effect.kind==='waboku'||effect.kind==='mirrorForce')return s.pending.kind==='attack'&&s.players[s.pending.actor].id!==id;
  if(effect.kind==='justDesserts')return op.monsters.length>=2||op.lp<=op.monsters.length*500;
  return false;
 }).sort((a,b)=>{
  const score=(x:Extract<Action,{kind:'trap'}>)=>x.discards?.reduce((n,uid)=>n+(getCard(p.hand.find(c=>c.uid===uid)!.id)?.atk??0),0)??0;
  return score(a)-score(b);
 })[0];
 if(useful)return useful;
 if(s.phase==='response'){
  const handShield=actions.find(a=>a.kind==='monsterEffect'&&p.hand.some(c=>c.uid===a.card&&getMonsterEffect(c.id)?.operation.kind==='battleShield'));
  const alreadyProtected=p.battleProtectedUntil===s.turn||s.chain.some(link=>link.actor===s.players.indexOf(p)&&link.monsterEffect&&getMonsterEffect(link.id)?.operation.kind==='battleShield');
  if(handShield&&!alreadyProtected&&s.pending.kind==='attack'){
   const attack=s.pending;
   const attacker=op.monsters.find(m=>m.uid===attack.card&&m.faceUp);
   const defender=p.monsters.find(m=>m.uid===attack.target);
   const damage=attacker?defender?(defender.position==='atk'?Math.max(0,atk(attacker,s)-atk(defender,s)):0):atk(attacker,s):0;
   if(damage>0)return handShield;
  }
  const counterTarget=s.chain.at(-1);
  const book=actions.filter((a):a is Extract<Action,{kind:'spell'}>=>a.kind==='spell')
   .filter(a=>getEffect(source(a)?.id??'')?.kind==='bookOfMoon');
  const protect=counterTarget&&['trapHole','sakuretsuArmor'].includes(getEffect(counterTarget.id)?.kind??'')
   ?book.find(a=>a.target===counterTarget.target&&p.monsters.some(m=>m.uid===a.target)):undefined;
  if(protect)return protect;
  if(s.pending.kind==='attack'&&s.pending.actor!==s.players.indexOf(p)){
   const attackingUid=s.pending.card;
   const save=book.find(a=>a.target===attackingUid);
   if(save)return save;
  }
  // Prefer destroying a known enemy Field/Spell/Trap; never inspect hidden
  // identities or waste a Quick-Play on a friendly card.
  const quick=actions.filter((a):a is Extract<Action,{kind:'spell'}>=>a.kind==='spell')
   .filter(a=>getEffect(source(a)?.id??'')?.kind==='mysticalSpaceTyphoon')
   .filter(a=>op.backrow.some(b=>b.uid===a.target)||op.field?.uid===a.target)
   .sort((a,b)=>{
    const priority=(x:Extract<Action,{kind:'spell'}>)=>
      op.field?.uid===x.target?3:op.backrow.some(c=>c.uid===x.target&&c.faceUp)?2:1;
    return priority(b)-priority(a);
   });
  return quick[0]??actions.find(a=>a.kind==='pass');
 }
 if(s.phase==='discard')return [...actions].sort((a,b)=>{const score=(x:Action)=>x.kind==='discard'?handCardValue(p.hand.find(c=>c.uid===x.card)!.id):0;return score(a)-score(b);})[0];
 if(s.phase==='choice'){
  if(s.choice?.source==='attackReplay'&&s.pending.kind==='attack'){
   const attackingUid=s.pending.card,attacking=p.monsters.find(m=>m.uid===attackingUid);
   if(attacking){
    const options=actions.filter((a):a is Extract<Action,{kind:'choose'}>=>a.kind==='choose');
    const direct=options.find(a=>a.target==='__direct__');if(direct)return direct;
    // Use exactly the declaration policy, without reading hidden identities.
    const safe=options.filter(a=>{const m=op.monsters.find(m=>m.uid===a.target);return !!m&&publicBattleAssessment(s,attacking,m).safe;});
    return safe[0]??options.find(a=>a.target==='__cancel__');
   }
  }
  if(s.choice?.source==='monsterRecruit'){
   const options=actions.filter((a):a is Extract<Action,{kind:'choose'}>=>a.kind==='choose'&&a.target!=='__skip__');
   return options.sort((a,b)=>{
    const ca=getCard(p.deck.find(c=>c.uid===a.target)!.id),cb=getCard(p.deck.find(c=>c.uid===b.target)!.id);
    return (cb?.atk??0)-(ca?.atk??0);
   })[0]??actions[0];
  }
  if(s.choice?.source==='triggerTarget'||s.choice?.source==='monsterTarget'&&s.pending.kind==='monsterEffect'){
   const effect=getMonsterEffect(s.choice?.source==='triggerTarget'?s.triggerBuild!.selected!.id:(s.pending as Extract<typeof s.pending,{kind:'monsterEffect'}>).id);
   if(effect?.operation.kind==='destroy'||effect?.operation.kind==='bounce'){
    // Prefer the strongest visible enemy. Never inspect an unrevealed opponent.
    const enemies=actions.filter((a):a is Extract<Action,{kind:'choose'}>=>a.kind==='choose')
     .map(a=>({action:a,monster:op.monsters.find(m=>m.uid===a.target)}))
     .filter(x=>x.monster);
    if(enemies.length)return enemies.sort((a,b)=>{
     const score=(x:typeof enemies[number])=>x.monster!.faceUp?atk(x.monster!,s):1000;
     return score(b)-score(a);
    })[0].action;
   }
  }
  return actions[0];
 }
 const threat=Math.max(0,...op.monsters.filter(m=>m.faceUp&&m.position==='atk').map(m=>atk(m,s)));
 const advanced=actions.find(a=>a.kind==='field')??actions.find(a=>a.kind==='fusion'&&a.position===((getCard(p.extra?.find(c=>c.uid===a.extra)?.id??'')?.atk??0)<threat?'def':'atk'));if(advanced)return advanced;
 const spells=actions.filter((a):a is Extract<Action,{kind:'spell'}>=>a.kind==='spell').filter(a=>{
  const c=source(a),effect=c&&getEffect(c.id);if(!effect)return false;
  if(effect.kind==='sequence'){
   const selfDamage=effect.operations.flatMap(op=>op.kind==='damage'?op.recipients:[]).filter(r=>r.player==='self').reduce((sum,r)=>sum+r.amount,0);
   if(p.lp<=selfDamage)return false;
  }
  if(effect.kind==='equip')return p.monsters.some(m=>m.uid===a.target);
  if(effect.kind==='destroySpellTraps'){const enemy=op.backrow.length+Number(!!op.field),own=p.backrow.filter(b=>b.uid!==a.card).length+Number(!!p.field);return enemy>0&&(effect.scope==='opponent'||enemy>=own);}
  if(effect.kind==='darkHole')return op.monsters.length>0&&op.monsters.filter(m=>m.faceUp).reduce((n,m)=>n+atk(m,s),0)>=p.monsters.reduce((n,m)=>n+atk(m,s),0);
  if(effect.kind==='deSpell'||effect.kind==='removeTrap')return op.backrow.some(b=>b.uid===a.target)||op.field?.uid===a.target;
  if(effect.kind==='giantTrunade')return op.backrow.length+Number(!!op.field)>p.backrow.length+Number(!!p.field);
  if(effect.kind==='cardDestruction')return op.hand.length>p.hand.length+1;
  if(effect.kind==='shieldSword')return p.monsters.some(m=>m.faceUp&&(getCard(m.id)!.defense??0)>(getCard(m.id)!.atk??0));
  if(effect.kind==='bookOfMoon')return op.monsters.some(m=>m.uid===a.target&&m.faceUp);
  return true;
 });
 const value=(a:Extract<Action,{kind:'spell'}>)=>{
  // Only our monsters, face-up rival monsters and public graves inform target scores.
  const own=p.monsters.find(m=>m.uid===a.target),rival=op.monsters.find(m=>m.uid===a.target&&m.faceUp),grave=[...p.grave,...op.grave].find(m=>m.uid===a.target);
  const target=own??rival??grave;return target?(getCard(target.id)?.atk??0):0;
 };
 if(spells.length)return spells.sort((a,b)=>value(b)-value(a))[0];
 const finishBurn=actions.filter((a):a is Extract<Action,{kind:'monsterEffect'}>=>a.kind==='monsterEffect')
  .filter(a=>{const effect=getMonsterEffect(p.monsters.find(m=>m.uid===a.card)!.id);return effect?.operation.kind==='burn'&&op.lp<=effect.operation.amount;})
  .sort((a,b)=>{
   const rating=(x:Extract<Action,{kind:'monsterEffect'}>)=>x.tributes?.reduce((n,uid)=>n+(getCard(p.monsters.find(m=>m.uid===uid)!.id)?.atk??0)+(uid===x.card?10000:0),0)??0;
   return rating(a)-rating(b);
  });
 if(finishBurn.length)return finishBurn[0];
 const summon=tacticalSummon(s,id,actions);if(summon)return summon;
 const set=actions.find(a=>a.kind==='set');if(set)return set;
 const position=tacticalPosition(s,id,actions);if(position)return position;
 const attack=tacticalAttack(s,id,actions);if(attack)return attack;
 return actions.find(a=>a.kind==='battle')??actions.find(a=>a.kind==='end');
}
function driveNPC(s:DuelState,events?:DuelTransitionEvent[]){let steps=0;while(s.phase!=='finished'){const npc=s.players.find(p=>p.id.startsWith('npc-'));if(!npc)return s;const a=chooseNPC(s,npc.id);if(!a)return s;if(++steps>100)throw new Error('Limite de ações do treino excedido.');const before=s;s=step(s,npc.id,a);events?.push(...transitionEvents(before,s));}return s;}
export const createTraining=db.transaction((owner:string,guild:string,channel:string,laboratory=false):DuelRecord=>{
 available(owner);const id=randomBytes(8).toString('hex');const tutorial=['24094653','34460851','44287299','86318356','54652250','07089711','31560081','28933734','60694662','11384280','26202165','78010363','77585513','54098121','77414722','03819470','83011277','55144522','12580477','05318639','14087893','53582587','56120475','29401950'];const loadout=laboratory?{cards:tutorial,extra:['45231177']}:activeCards(owner);const style=['warrior','spellcaster','dragon'][randomInt(3)];const opponent=starterContents[style].flatMap(c=>Array(c.quantity).fill(c.id));
 const state=driveNPC(createDuel([{id:owner,name:name(owner),...loadout},{id:`npc-${id}`,name:'Duelista de treino',cards:opponent}],laboratory?()=>0.999999:Math.random,laboratory?0:randomInt(2)));state.fixedOpening=laboratory;
 const r:DuelRecord={id,guild_id:guild,channel_id:channel,message_id:null,status:'playing',revision:0,updated:Date.now(),state,invite:null};insert(r,[owner]);return r;
});
export const createNPCDuel=db.transaction((owner:string,guild:string,channel:string,npcId:string,daily=false):DuelRecord=>{
 available(owner);const loadout=activeCards(owner),event=dailyEvent(),npc=getNPC(daily?event.npc.id:npcId),id=randomBytes(8).toString('hex');
 let state=createDuel([{id:owner,name:name(owner),...loadout},{id:`npc-${id}`,name:npc.name,cards:npc.cards,extra:npc.extra}],Math.random,randomInt(2));
 state.encounter={npcId:npc.id,...daily?{eventDay:event.day}:{}};state=driveNPC(state);
 const r:DuelRecord={id,guild_id:guild,channel_id:channel,message_id:null,status:'playing',revision:0,updated:Date.now(),state,invite:null};insert(r,[owner]);return r;
});
/** Acquire the writer before reading receipts/state: deferred upgrades can starve under WAL contention. */
export const performDuelAction=db.transaction((id:string,owner:string,guild:string,expected:number,index:number|Action,requestId?:string):DuelRecord=>{
 const request={id,actor:owner,guild,expected,action:index,requestId},receipt=findActionReceipt('duel',request);
 if(receipt){const current=read(id);if(!current)throw new Error('Duelo inexistente.');return {...current,receipt};}
 const r=getDuel(id);if(r.guild_id!==guild||r.status!=='playing'||!r.state)throw new Error('Esse duelo não está ativo neste servidor.');if(r.revision!==expected)throw new Error('Esse painel ficou antigo. Clique em Atualizar.');
 const actions=legalActions(r.state,owner);const action=typeof index==='number'?actions[index]:index;
 if(!action||(typeof index!=='number'&&action.kind!=='concede'))throw new Error('Ação inválida.');
 const before=r.state,applied=applyDuelAction(before,owner,action);r.events=[...applied.events];r.state=driveNPC(applied.state,r.events);r.revision++;r.updated=Date.now();if(r.state.phase==='finished')r.status='finished';save(r);
 db.prepare('INSERT INTO duel_transition_events(duel_id,revision,events_json) VALUES(?,?,?)').run(id,r.revision,JSON.stringify(r.events));
 if(requestId)r.receipt=saveActionReceipt('duel',request,r.revision);
 return r;
}).immediate;
export function setDuelMessage(id:string,channel:string,message:string,publishedRevision=-1){
 if(!Number.isSafeInteger(publishedRevision)||publishedRevision< -1)throw new Error('Revisão de publicação inválida.');
 // Creating a Discord message may race a state commit. Acknowledge only the
 // snapshot actually rendered, never whatever revision is current now.
 db.prepare('UPDATE duels SET channel_id=?,message_id=?,public_revision=CASE WHEN ?>=0 AND ?<=revision THEN ? ELSE -1 END WHERE id=?').run(channel,message,publishedRevision,publishedRevision,publishedRevision,id);
}

export function expireDueDuels(now=Date.now()):DuelRecord[]{
 const rows=db.prepare("SELECT id FROM duels WHERE (status='pending' AND updated<=?) OR (status='playing' AND updated<=?) LIMIT 100").all(now-120_000,now-DECISION_TIMEOUT_MS) as {id:string}[];
 const unpublished=db.prepare("SELECT id FROM duels WHERE status IN ('pending','playing','finished','expired','declined') AND message_id IS NOT NULL AND public_revision<revision LIMIT 100").all() as {id:string}[];
 return [...new Set([...rows,...unpublished].map(row=>row.id))].flatMap(id=>{
  try{return [getDuel(id,now)];}catch(error){console.error('Duelo preservado para revisão:',id,error instanceof Error?error.message:'falha desconhecida');return [];}
 });
}

/** Read-only quarantine inspection: never repairs, expires or replaces raw data. */
export function inspectSavedDuel(id:string){
 try{const record=read(id);return record?{status:'valid' as const,record}:{status:'missing' as const,id};}
 catch(error){return {status:'quarantined' as const,id,reason:error instanceof Error?error.message:'Estado ilegível'};}
}

/** Private events are filtered at delivery by projectTransitionEvents, never broadcast raw. */
export function duelEventsAt(id:string,revision:number):DuelTransitionEvent[]{
 const row=db.prepare('SELECT events_json FROM duel_transition_events WHERE duel_id=? AND revision=?').get(id,revision) as {events_json:string}|undefined;
 return row?JSON.parse(row.events_json):[];
}
export function markDuelPublished(id:string,revision:number){db.prepare('UPDATE duels SET public_revision=? WHERE id=? AND revision=?').run(revision,id,revision);}
