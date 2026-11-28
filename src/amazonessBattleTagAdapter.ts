import {createHash} from 'node:crypto';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {bindTarget,targetBindingValid,type TargetBinding,synchronizeCardLifetimes} from './cardLifetime';
import {addTemporaryModifier,canAffectMonster,monsterEffectsNegated} from './continuousEffects';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import type {DuelState,Monster} from './duelEngine';

export const AMAZONESS_BLOWPIPER_ID='73574678';
export const AMAZONESS_BLOWPIPER_KONAMI_CID=5646;
export const AMAZONESS_SWORDS_WOMAN_ID='94004268';
export const AMAZONESS_SWORDS_WOMAN_KONAMI_CID=5284;
export const AMAZONESS_TIGER_ID='10979723';
export const AMAZONESS_TIGER_KONAMI_CID=5647;
export const AMAZONESS_CHAIN_MASTER_ID='29654737';
export const AMAZONESS_CHAIN_MASTER_KONAMI_CID=5291;

export type AmazonessEffect='blowpiper-standby-debuff'|'swords-woman-damage-replacement'|'tiger-aura-and-attack-lock';
export type AmazonessCardDefinition={
 id:string;name:string;kind:'monster';race:string;level:number;atk:number;defense:number;
 effect?:AmazonessEffect;archetypes?:readonly string[]
};
export type AmazonessLookup=(id:string)=>AmazonessCardDefinition|undefined;
export type AmazonessNegationCheck=(duel:DuelState,uid:string)=>boolean;
type Team=0|1;
type Seat=0|1|2|3;
type CardInfo={name?:string;kind?:string;race?:string;level?:number;atk?:number;defense?:number;fusion?:boolean;monsterType?:string;archetypes?:readonly string[]};
type MonsterOnField={team:Team;monster:Monster};

const definitions:Readonly<Record<string,AmazonessCardDefinition>>={
 [AMAZONESS_BLOWPIPER_ID]:{id:AMAZONESS_BLOWPIPER_ID,name:'Amazoness Blowpiper',kind:'monster',race:'Warrior',level:3,atk:800,defense:1500,effect:'blowpiper-standby-debuff',archetypes:['Amazoness']},
 [AMAZONESS_SWORDS_WOMAN_ID]:{id:AMAZONESS_SWORDS_WOMAN_ID,name:'Amazoness Swords Woman',kind:'monster',race:'Warrior',level:4,atk:1500,defense:1600,effect:'swords-woman-damage-replacement',archetypes:['Amazoness']},
 [AMAZONESS_TIGER_ID]:{id:AMAZONESS_TIGER_ID,name:'Amazoness Tiger',kind:'monster',race:'Beast',level:4,atk:1100,defense:1500,effect:'tiger-aura-and-attack-lock',archetypes:['Amazoness']}
};
export function defaultAmazonessLookup(id:string):AmazonessCardDefinition|undefined{return definitions[id];}

function assertId(value:string,label:string):void{
 if(typeof value!=='string'||!value.trim()||value.length>128||!/^[a-zA-Z0-9:_-]+$/.test(value)||['__proto__','constructor','prototype'].includes(value))throw new Error(label+' inválido.');
}
function fingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function physicalSeat(uid:string):Seat{
 const match=/^m([0-3]):/.exec(uid);if(!match)throw new Error('UID físico 2v2 inválido.');
 return Number(match[1]) as Seat;
}
function cardInfo(id:string,lookup:AmazonessLookup):CardInfo|undefined{return lookup(id)??getDuelCard(id) as CardInfo|undefined;}
function effectOf(id:string,lookup:AmazonessLookup):AmazonessEffect|undefined{return lookup(id)?.effect;}
function isAmazoness(id:string,lookup:AmazonessLookup):boolean{
 const info=cardInfo(id,lookup);if(!info)return false;
 const name=(info.name??'').trim().toLowerCase();
 return name==='amazoness'||name.startsWith('amazoness ')||!!info.archetypes?.some(value=>value.toLowerCase()==='amazoness');
}
function findMonster(duel:TagDuel,uid:string):MonsterOnField|undefined{
 let found:MonsterOnField|undefined;
 for(const team of [0,1] as const){
  const monster=duel.core.players[team].monsters.find(value=>value.uid===uid);
  if(monster){if(found)throw new Error('UID duplicado no campo.');found={team,monster};}
 }
 return found;
}
function assertClassic(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('A adaptação exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2)throw new Error('Estrutura física 2v2 incompleta.');
}
export function assertAmazonessRules(duel:TagDuel):void{
 assertClassic(duel);
 const rules=rulesFor(duel.core);
 if(rules.id!==RULES_PROFILE.id||rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.extraDeckMax!==5||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.handLimit!==6||rules.handCheck!=='end')throw new Error('Perfil clássico do proprietário divergente.');
 for(const player of duel.core.players){
  if(player.monsters.length>3||player.backrow.length>3)throw new Error('Limite de zonas 3+3 excedido.');
 }
 const extraUids=new Set<string>();
 for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const ref of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  const seat=physicalSeat(ref.uid),info=getDuelCard(ref.id) as CardInfo|undefined;
  if(!info)throw new Error('Carta fora do catálogo habilitado.');
  if(extraUids.has(ref.uid)||info.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(value=>value.entityKind!=='token')){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function assertInventoryUnchanged(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size||[...before].some(([uid,id])=>after.get(uid)!==id))throw new Error('A adaptação alterou ou concedeu inventário.');
}
function key(eventId:string,sourceUid:string):string{return eventId+':'+sourceUid;}

export type AmazonessStandbyEvent={eventId:string;turn:number;activeSeat:Seat;phase:'standby'};
export type AmazonessStandbyPlan={
 eventId:string;sourceUid:string;targetUid:string;controllerTeam:Team;activeSeat:Seat;turn:number;
 sourceBinding:TargetBinding;targetBinding:TargetBinding;fingerprint:string
};
export type AmazonessStandbyResult={
 eventId:string;sourceUid:string;targetUid:string;turn:number;
 status:'applied'|'source-lost'|'source-inactive'|'source-negated'|'target-lost'|'target-unaffected'|'duplicate';
 replayed:boolean;originalStatus?:AmazonessStandbyResult['status']
};
export type AmazonessBattleDamageEvent={
 eventId:string;turn:number;damageKind:'battle'|'effect';damageToTeam:Team;amount:number;
 involvedMonsterUids:readonly string[]
};
export type AmazonessSwordsWomanPlan={
 eventId:string;sourceUid:string;damageToTeam:Team;targetTeam:Team;amount:number;turn:number;
 lpBefore:number;sourceBinding:TargetBinding;fingerprint:string
};
export type AmazonessSwordsWomanPreparation={status:'not-applicable'}|{status:'prepared';plan:AmazonessSwordsWomanPlan};
export type AmazonessSwordsWomanResult={
 eventId:string;sourceUid:string;damageToTeam:Team;status:'redirected'|'source-lost'|'source-inactive'|'source-negated'|'duplicate';
 amount:number;targetTeam?:Team;turn:number;replayed:boolean;originalStatus?:AmazonessSwordsWomanResult['status']
};
type Cached<T>={fingerprint:string;result:T};
export type AmazonessBattleSession={
 duel:TagDuel;lookup:AmazonessLookup;isNegated:AmazonessNegationCheck;
 pendingStandby:Record<string,AmazonessStandbyPlan>;standbyReceipts:Record<string,Cached<AmazonessStandbyResult>>;
 standbyUses:Record<string,string>;pendingReflections:Record<string,AmazonessSwordsWomanPlan>;
 reflectionReceipts:Record<string,Cached<AmazonessSwordsWomanResult>>
};
function assertSession(session:AmazonessBattleSession):void{
 if(!session||typeof session!=='object'||!session.duel||typeof session.lookup!=='function'||typeof session.isNegated!=='function'||!session.pendingStandby||!session.standbyReceipts||!session.standbyUses||!session.pendingReflections||!session.reflectionReceipts)throw new Error('Sessão Amazoness inválida.');
 assertAmazonessRules(session.duel);
}
export function createAmazonessBattleSession(input:TagDuel,lookup:AmazonessLookup=defaultAmazonessLookup,isNegated:AmazonessNegationCheck=monsterEffectsNegated):AmazonessBattleSession{
 assertAmazonessRules(input);
 const session:AmazonessBattleSession={duel:structuredClone(input),lookup,isNegated,pendingStandby:{},standbyReceipts:{},standbyUses:{},pendingReflections:{},reflectionReceipts:{}};
 assertSession(session);return session;
}
function standbyTeam(duel:TagDuel,event:AmazonessStandbyEvent):Team{
 assertId(event.eventId,'Evento de Standby');
 if(!Number.isSafeInteger(event.turn)||event.turn!==duel.core.turn||!Number.isInteger(event.activeSeat)||event.activeSeat<0||event.activeSeat>3||event.phase!=='standby')throw new Error('Evento de Standby fora do turno/fase.');
 const team=(event.activeSeat%2) as Team;
 if(duel.cursor!==event.activeSeat||duel.active[team]!==event.activeSeat||duel.core.current!==team||duel.core.phase!=='main')throw new Error('Somente o assento físico ativo pode resolver o Standby.');
 return team;
}
/** One explicit Standby event per physical source instance and turn. */
export function prepareAmazonessBlowpiperStandby(session:AmazonessBattleSession,event:AmazonessStandbyEvent,sourceUid:string,targetUid:string):AmazonessStandbyPlan{
 assertSession(session);assertId(sourceUid,'Fonte');assertId(targetUid,'Alvo');
 const team=standbyTeam(session.duel,event),source=findMonster(session.duel,sourceUid),target=findMonster(session.duel,targetUid);
 if(!source||source.team!==team||!source.monster.faceUp||effectOf(source.monster.id,session.lookup)!=='blowpiper-standby-debuff')throw new Error('Amazoness Blowpiper não está ativa no campo da equipe.');
 if(!target||target.team===team||!target.monster.faceUp)throw new Error('Blowpiper exige um monstro adversário com a face para cima.');
 const sourceBinding=bindTarget(session.duel.core,sourceUid),targetBinding=bindTarget(session.duel.core,targetUid);
 if(!sourceBinding||!targetBinding)throw new Error('Não foi possível vincular as identidades físicas.');
 const useKey=sourceUid+':'+sourceBinding.epoch+':'+event.turn,eventKey=key(event.eventId,sourceUid);
 if(Object.hasOwn(session.standbyUses,useKey)||Object.hasOwn(session.pendingStandby,eventKey)||Object.hasOwn(session.standbyReceipts,eventKey))throw new Error('Este Blowpiper já foi usado neste Standby.');
 const payload={eventId:event.eventId,sourceUid,targetUid,controllerTeam:team,activeSeat:event.activeSeat,turn:event.turn,sourceBinding,targetBinding};
 const plan:AmazonessStandbyPlan={...payload,fingerprint:fingerprint(payload)};
 session.pendingStandby[eventKey]=plan;session.standbyUses[useKey]=eventKey;
 assertSession(session);return structuredClone(plan);
}
/** The selected target is never replaced if its physical instance leaves the field. */
export function resolveAmazonessBlowpiperStandby(session:AmazonessBattleSession,eventId:string,sourceUid:string):AmazonessStandbyResult{
 assertSession(session);assertId(eventId,'Evento');assertId(sourceUid,'Fonte');
 const eventKey=key(eventId,sourceUid),cached=session.standbyReceipts[eventKey];
 if(cached)return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 const plan=session.pendingStandby[eventKey];if(!plan)throw new Error('Ativação de Blowpiper não encontrada.');
 const before=inventorySnapshot(session.duel),working=structuredClone(session.duel);
 let status:AmazonessStandbyResult['status']='target-lost';
 const source=findMonster(working,plan.sourceUid);
 if(!source||!targetBindingValid(working.core,plan.sourceBinding))status='source-lost';
 else if(!source.monster.faceUp)status='source-inactive';
 else if(session.isNegated(working.core,plan.sourceUid))status='source-negated';
 else{
  const target=findMonster(working,plan.targetUid);
  if(!target||target.team===plan.controllerTeam||!target.monster.faceUp||!targetBindingValid(working.core,plan.targetBinding))status='target-lost';
  else if(!canAffectMonster(working.core,plan.targetUid,'monster'))status='target-unaffected';
  else{addTemporaryModifier(working.core,plan.targetUid,-500,0);status='applied';}
 }
 session.duel=working;delete session.pendingStandby[eventKey];
 const result:AmazonessStandbyResult={eventId,sourceUid,targetUid:plan.targetUid,turn:plan.turn,status,replayed:false};
 session.standbyReceipts[eventKey]={fingerprint:plan.fingerprint,result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}

function validateBattleDamageEvent(duel:TagDuel,event:AmazonessBattleDamageEvent):void{
 assertId(event.eventId,'Evento de batalha');
 if(!Number.isSafeInteger(event.turn)||event.turn!==duel.core.turn||!['battle','effect'].includes(event.damageKind)||event.damageToTeam!==0&&event.damageToTeam!==1||!Number.isSafeInteger(event.amount)||event.amount<0||!Array.isArray(event.involvedMonsterUids)||event.involvedMonsterUids.length>2||new Set(event.involvedMonsterUids).size!==event.involvedMonsterUids.length)throw new Error('Evento de dano inválido.');
 for(const uid of event.involvedMonsterUids)assertId(uid,'UID envolvido');
}
/** Captures replacement damage before the engine applies the original battle damage. */
export function prepareAmazonessSwordsWomanDamage(session:AmazonessBattleSession,event:AmazonessBattleDamageEvent):AmazonessSwordsWomanPreparation{
 assertSession(session);validateBattleDamageEvent(session.duel,event);
 if(event.damageKind!=='battle'||event.amount===0)return {status:'not-applicable'};
 const candidates=event.involvedMonsterUids.map(uid=>findMonster(session.duel,uid)).filter((value):value is MonsterOnField=>!!value&&value.team===event.damageToTeam&&value.monster.faceUp&&effectOf(value.monster.id,session.lookup)==='swords-woman-damage-replacement'&&!session.isNegated(session.duel.core,value.monster.uid));
 if(!candidates.length)return {status:'not-applicable'};
 candidates.sort((a,b)=>a.monster.uid.localeCompare(b.monster.uid));
 const source=candidates[0],sourceBinding=bindTarget(session.duel.core,source.monster.uid);
 if(!sourceBinding)throw new Error('Não foi possível vincular Amazoness Swords Woman.');
 const payload={eventId:event.eventId,turn:event.turn,damageKind:event.damageKind,damageToTeam:event.damageToTeam,amount:event.amount,involvedMonsterUids:[...event.involvedMonsterUids].sort(),sourceUid:source.monster.uid,sourceBinding};
 const fp=fingerprint(payload),cached=session.pendingReflections[event.eventId],receipt=session.reflectionReceipts[event.eventId];
 if(cached||receipt)throw new Error('Evento de dano já preparado ou resolvido.');
 const plan:AmazonessSwordsWomanPlan={eventId:event.eventId,sourceUid:source.monster.uid,damageToTeam:event.damageToTeam,targetTeam:(1-event.damageToTeam) as Team,amount:event.amount,turn:event.turn,lpBefore:session.duel.core.players[event.damageToTeam].lp,sourceBinding,fingerprint:fp};
 session.pendingReflections[event.eventId]=plan;assertSession(session);return {status:'prepared',plan:structuredClone(plan)};
}
/** Returns replacement routing; the caller must apply it instead of original damage exactly once. */
export function resolveAmazonessSwordsWomanDamage(session:AmazonessBattleSession,eventId:string):AmazonessSwordsWomanResult{
 assertSession(session);assertId(eventId,'Evento');
 const cached=session.reflectionReceipts[eventId];
 if(cached)return {...cached.result,status:'duplicate',replayed:true,originalStatus:cached.result.status};
 const plan=session.pendingReflections[eventId];if(!plan)throw new Error('Substituição de dano de Swords Woman não encontrada.');
 const before=inventorySnapshot(session.duel),source=findMonster(session.duel,plan.sourceUid);
 let status:AmazonessSwordsWomanResult['status']='redirected';
 if(!source||!targetBindingValid(session.duel.core,plan.sourceBinding))status='source-lost';
 else if(!source.monster.faceUp)status='source-inactive';
 else if(session.isNegated(session.duel.core,plan.sourceUid))status='source-negated';
 else if(session.duel.core.players[plan.damageToTeam].lp!==plan.lpBefore)throw new Error('A substituição deve ocorrer antes de aplicar o dano original.');
 delete session.pendingReflections[eventId];
 const result:AmazonessSwordsWomanResult={eventId,sourceUid:plan.sourceUid,damageToTeam:plan.damageToTeam,status,amount:status==='redirected'?plan.amount:0,...status==='redirected'?{targetTeam:plan.targetTeam}:{},turn:plan.turn,replayed:false};
 session.reflectionReceipts[eventId]={fingerprint:plan.fingerprint,result};
 assertSession(session);assertInventoryUnchanged(before,session.duel);return structuredClone(result);
}

/** Only the face-up, non-negated Tiger supplies its team-wide attack restriction. */
export function amazonessTigerAtkBonus(duel:TagDuel,monsterUid:string,lookup:AmazonessLookup=defaultAmazonessLookup,isNegated:AmazonessNegationCheck=monsterEffectsNegated):number{
 assertAmazonessRules(duel);
 const target=findMonster(duel,monsterUid);
 if(!target||!target.monster.faceUp||effectOf(target.monster.id,lookup)!=='tiger-aura-and-attack-lock'||isNegated(duel.core,monsterUid))return 0;
 return duel.core.players[target.team].monsters.filter(monster=>monster.faceUp&&isAmazoness(monster.id,lookup)).length*400;
}
export function amazonessTigerAllowsAttackTarget(duel:TagDuel,attackerTeam:number,targetUid:string,lookup:AmazonessLookup=defaultAmazonessLookup,isNegated:AmazonessNegationCheck=monsterEffectsNegated):boolean{
 assertAmazonessRules(duel);
 if(attackerTeam!==0&&attackerTeam!==1)throw new Error('Equipe atacante inválida.');
 const target=findMonster(duel,targetUid);if(!target)return false;
 if(target.team===attackerTeam||!target.monster.faceUp||!isAmazoness(target.monster.id,lookup))return true;
 const tigers=duel.core.players[target.team].monsters.filter(monster=>monster.faceUp&&effectOf(monster.id,lookup)==='tiger-aura-and-attack-lock'&&!isNegated(duel.core,monster.uid));
 return tigers.length===0||tigers.some(tiger=>tiger.uid===targetUid);
}
/** The control limit is a rule, not an effect, so negation does not remove it. */
export function amazonessTigerCanBeControlled(duel:TagDuel,team:number,candidateUid:string|undefined,lookup:AmazonessLookup=defaultAmazonessLookup):boolean{
 assertAmazonessRules(duel);
 if(team!==0&&team!==1)throw new Error('Equipe inválida.');
 return !duel.core.players[team].monsters.some(monster=>monster.uid!==candidateUid&&effectOf(monster.id,lookup)==='tiger-aura-and-attack-lock');
}
