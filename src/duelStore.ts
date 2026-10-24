import {randomBytes,randomInt} from 'node:crypto';
import {db,getPlayer} from './database';
import {openDeck} from './decks';
import {starterContents} from './cardCatalog';
import {createDuel,step,legalActions,validateDuelCards,timeoutDuel,atk,def,type Action,type DuelState} from './duelEngine';
import {getCard} from './collection';
import {getNPC,dailyEvent} from './npcContent';
import {getEffect} from './effectRegistry';
import {getMonsterEffect} from './monsterEffects';
import {settleEncounter} from './npcProgress';
export type DuelRecord={id:string;guild_id:string;channel_id:string;message_id:string|null;status:string;revision:number;updated:number;public_revision?:number;state:DuelState|null;invite:{owner:string;opponent:string;name:string;cards:string[];extra?:string[]}|null};
db.exec(`CREATE TABLE IF NOT EXISTS duels (id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL,state TEXT,invite TEXT);
 CREATE TABLE IF NOT EXISTS duel_members (owner TEXT PRIMARY KEY,duel_id TEXT NOT NULL REFERENCES duels(id) ON DELETE CASCADE);`);
const duelColumns=new Set((db.prepare('PRAGMA table_info(duels)').all() as {name:string}[]).map(c=>c.name));
if(!duelColumns.has('public_revision'))db.exec('ALTER TABLE duels ADD COLUMN public_revision INTEGER NOT NULL DEFAULT -1');
function read(id:string):DuelRecord|undefined {const row=db.prepare('SELECT * FROM duels WHERE id=?').get(id) as any;if(!row)return;return {...row,state:row.state?JSON.parse(row.state):null,invite:row.invite?JSON.parse(row.invite):null};}
function save(record:DuelRecord){if(record.status==='finished'&&record.state?.encounter)settleEncounter(record.id,record.state);db.prepare('UPDATE duels SET status=?,revision=?,updated=?,state=?,invite=? WHERE id=?').run(record.status,record.revision,record.updated,record.state?JSON.stringify(record.state):null,record.invite?JSON.stringify(record.invite):null,record.id);if(!['pending','playing'].includes(record.status))db.prepare('DELETE FROM duel_members WHERE duel_id=?').run(record.id);}
export const DECISION_TIMEOUT_MS=30*60_000;
export const getDuel=db.transaction((id:string,now=Date.now()):DuelRecord=>{
 const record=read(id);if(!record)throw new Error('Duelo não encontrado.');
 const limit=record.status==='pending'?120_000:DECISION_TIMEOUT_MS;
 if(['pending','playing'].includes(record.status)&&now-record.updated>=limit){record.status=record.state?'finished':'expired';record.revision++;if(record.state)record.state=timeoutDuel(record.state);save(record);}
 return record;
});
export function currentDuel(owner:string){const row=db.prepare('SELECT duel_id FROM duel_members WHERE owner=?').get(owner) as {duel_id:string}|undefined;if(!row)return;const duel=getDuel(row.duel_id);return ['pending','playing'].includes(duel.status)?duel:undefined;}
function available(owner:string){if(currentDuel(owner))throw new Error('Esse duelista já tem um duelo ou convite aberto. Use /duelo ver ou /duelo sair.');}
function activeCards(owner:string){const row=db.prepare('SELECT slot FROM decks WHERE discord_id=? AND active=1').get(owner) as {slot:number}|undefined;if(!row)throw new Error('Ative um deck válido primeiro com /deck ativar.');const deck=openDeck(owner,row.slot);if(!deck.active||deck.errors.length)throw new Error('O deck ativo ficou inválido. Confira /deck ver.');const cards=deck.items.filter(c=>!getCard(c.card_key)?.fusion).flatMap(c=>Array(c.quantity).fill(c.card_key)) as string[];const extra=deck.items.filter(c=>getCard(c.card_key)?.fusion).flatMap(c=>Array(c.quantity).fill(c.card_key)) as string[];validateDuelCards(cards);return {cards,extra};}
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
 const useful=fast.find(a=>{const c=source(a),effect=c&&getEffect(c.id);if(!effect)return false;
  if(effect.kind==='reinforcements'||effect.kind==='castleWalls')return p.monsters.some(m=>m.uid===a.target&&m.faceUp);
  if(effect.kind==='trapHole')return op.monsters.some(m=>m.uid===a.target);
  if(effect.kind==='waboku')return s.pending.kind==='attack'&&s.players[s.pending.actor].id!==id;
  if(effect.kind==='justDesserts')return op.monsters.length>=2||op.lp<=op.monsters.length*500;
  return false;
 });
 if(useful)return useful;if(s.phase==='response')return actions.find(a=>a.kind==='pass');
 if(s.phase==='discard')return [...actions].sort((a,b)=>{const score=(x:Action)=>x.kind==='discard'?(getCard(p.hand.find(c=>c.uid===x.card)!.id)!.atk??0):0;return score(a)-score(b);})[0];
 if(s.phase==='choice'){
  if(s.choice?.source==='monsterTarget'&&s.pending.kind==='monsterEffect'){
   const effect=getMonsterEffect(s.pending.id);
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
 const advanced=actions.find(a=>a.kind==='field')??actions.find(a=>a.kind==='fusion'&&a.position==='atk');if(advanced)return advanced;
 const spells=actions.filter((a):a is Extract<Action,{kind:'spell'}>=>a.kind==='spell').filter(a=>{
  const c=source(a),effect=c&&getEffect(c.id);if(!effect)return false;
  if(effect.kind==='equip')return p.monsters.some(m=>m.uid===a.target);
  if(effect.kind==='darkHole')return op.monsters.length>0&&op.monsters.filter(m=>m.faceUp).reduce((n,m)=>n+atk(m,s),0)>=p.monsters.reduce((n,m)=>n+atk(m,s),0);
  if(effect.kind==='deSpell'||effect.kind==='removeTrap')return op.backrow.some(b=>b.uid===a.target)||op.field?.uid===a.target;
  if(effect.kind==='giantTrunade')return op.backrow.length+Number(!!op.field)>p.backrow.length+Number(!!p.field);
  if(effect.kind==='cardDestruction')return op.hand.length>p.hand.length+1;
  if(effect.kind==='shieldSword')return p.monsters.some(m=>m.faceUp&&(getCard(m.id)!.defense??0)>(getCard(m.id)!.atk??0));
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
   const rating=(x:Extract<Action,{kind:'monsterEffect'}>)=>x.tributes?.reduce((n,uid)=>n+(getCard(p.monsters.find(m=>m.uid===uid)!.id)?.atk??0),0)??0;
   return rating(a)-rating(b);
  });
 if(finishBurn.length)return finishBurn[0];
 const summon=actions.filter((a):a is Extract<Action,{kind:'summon'}>=>a.kind==='summon'&&a.position==='atk').sort((a,b)=>getCard(p.hand.find(c=>c.uid===b.card)!.id)!.atk!-getCard(p.hand.find(c=>c.uid===a.card)!.id)!.atk!);
 const flipSet=actions.find(a=>a.kind==='summon'&&a.position==='set'&&getMonsterEffect(p.hand.find(c=>c.uid===a.card)!.id)?.trigger==='flip');
 if(flipSet&&(!summon.length||getCard(p.hand.find(c=>c.uid===summon[0].card)!.id)!.atk!<1800))return flipSet;
 if(summon.length)return summon[0];const set=actions.find(a=>a.kind==='set');if(set)return set;
 const position=actions.find(a=>a.kind==='position'&&a.mode!=='def');if(position)return position;
 const attacks=actions.filter((a):a is Extract<Action,{kind:'attack'}>=>a.kind==='attack').filter(a=>{if(!a.target)return true;const m=p.monsters.find(m=>m.uid===a.card)!;const target=op.monsters.find(m=>m.uid===a.target)!;return !target.faceUp||atk(m,s)>=(target.position==='atk'?atk(target,s):def(target,s));});if(attacks.length)return attacks[0];
 return actions.find(a=>a.kind==='battle')??actions.find(a=>a.kind==='end');
}
function driveNPC(s:DuelState){let steps=0;while(s.phase!=='finished'){const npc=s.players.find(p=>p.id.startsWith('npc-'));if(!npc)return s;const a=chooseNPC(s,npc.id);if(!a)return s;if(++steps>100)throw new Error('Limite de ações do treino excedido.');s=step(s,npc.id,a);}return s;}
export const createTraining=db.transaction((owner:string,guild:string,channel:string,laboratory=false):DuelRecord=>{
 available(owner);const id=randomBytes(8).toString('hex');const tutorial=['24094653','34460851','44287299','86318356','54652250','07089711','31560081','28933734','60694662','11384280',...starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)).slice(0,10)];const loadout=laboratory?{cards:tutorial,extra:['45231177']}:activeCards(owner);const style=['warrior','spellcaster','dragon'][randomInt(3)];const opponent=starterContents[style].flatMap(c=>Array(c.quantity).fill(c.id));
 const state=driveNPC(createDuel([{id:owner,name:name(owner),...loadout},{id:`npc-${id}`,name:'Duelista de treino',cards:opponent}],laboratory?()=>0.999999:Math.random,laboratory?0:randomInt(2)));state.fixedOpening=laboratory;
 const r:DuelRecord={id,guild_id:guild,channel_id:channel,message_id:null,status:'playing',revision:0,updated:Date.now(),state,invite:null};insert(r,[owner]);return r;
});
export const createNPCDuel=db.transaction((owner:string,guild:string,channel:string,npcId:string,daily=false):DuelRecord=>{
 available(owner);const loadout=activeCards(owner),event=dailyEvent(),npc=getNPC(daily?event.npc.id:npcId),id=randomBytes(8).toString('hex');
 let state=createDuel([{id:owner,name:name(owner),...loadout},{id:`npc-${id}`,name:npc.name,cards:npc.cards,extra:npc.extra}],Math.random,randomInt(2));
 state.encounter={npcId:npc.id,...daily?{eventDay:event.day}:{}};state=driveNPC(state);
 const r:DuelRecord={id,guild_id:guild,channel_id:channel,message_id:null,status:'playing',revision:0,updated:Date.now(),state,invite:null};insert(r,[owner]);return r;
});
export const performDuelAction=db.transaction((id:string,owner:string,guild:string,expected:number,index:number|Action):DuelRecord=>{
 const r=getDuel(id);if(r.guild_id!==guild||r.status!=='playing'||!r.state)throw new Error('Esse duelo não está ativo neste servidor.');if(r.revision!==expected)throw new Error('Esse painel ficou antigo. Clique em Atualizar.');
 const actions=legalActions(r.state,owner);const action=typeof index==='number'?actions[index]:index;
 if(!action||(typeof index!=='number'&&action.kind!=='concede'))throw new Error('Ação inválida.');
 r.state=driveNPC(step(r.state,owner,action));r.revision++;r.updated=Date.now();if(r.state.phase==='finished')r.status='finished';save(r);return r;
});
export function setDuelMessage(id:string,channel:string,message:string){db.prepare('UPDATE duels SET channel_id=?,message_id=?,public_revision=revision WHERE id=?').run(channel,message,id);}

export function expireDueDuels(now=Date.now()):DuelRecord[]{
 const rows=db.prepare("SELECT id FROM duels WHERE (status='pending' AND updated<=?) OR (status='playing' AND updated<=?) LIMIT 100").all(now-120_000,now-DECISION_TIMEOUT_MS) as {id:string}[];
 const changed=rows.map(row=>getDuel(row.id,now));const unpublished=db.prepare("SELECT id FROM duels WHERE status IN ('finished','expired','declined') AND message_id IS NOT NULL AND public_revision<revision LIMIT 100").all() as {id:string}[];return [...new Map([...changed,...unpublished.map(row=>getDuel(row.id,now))].map(r=>[r.id,r])).values()];
}

export function markDuelPublished(id:string,revision:number){db.prepare('UPDATE duels SET public_revision=? WHERE id=? AND revision=?').run(revision,id,revision);}
