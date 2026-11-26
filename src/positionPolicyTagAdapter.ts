import type {Backrow,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {discardBackrow} from './classicEffects';
import {getMonsterEffect} from './monsterEffects';
export const FINAL_ATTACK_ORDERS_ID='52503575';
export const LIGHT_OF_INTERVENTION_ID='62867251';
export type PositionPolicyEffect='final-attack-orders'|'light-of-intervention'|'royal-command';
export type PositionPolicyLookup=(id:string)=>{kind:'trap';effect:PositionPolicyEffect}|undefined;
type Team=0|1;type Seat=0|1|2|3;type PositionMode='attack'|'defense'|'flip'|'set';
type Plan={activationId:string;effect:PositionPolicyEffect;sourceUid:string;sourceId:string;sourceOwnerSeat:Seat;controllerTeam:Team;actorSeat:Seat;turn:number;sourceBinding:TargetBinding};
type Pending={plan:Plan};
export type PositionPolicyResult={activationId:string;effect:PositionPolicyEffect;negation:'none'|'activation'|'effect';activated:boolean;effectApplied:boolean;sourceActive:boolean;changedPositions:string[]};
export type PositionPolicySession={duel:TagDuel;pending:Record<string,Pending>;resolved:Record<string,PositionPolicyResult>};
export type SetMonsterResult={uid:string;mode:'set'|'normal-summon';faceUp:boolean;position:'atk'|'def';turn:number};
export type PositionChangeResult={uid:string;faceUp:boolean;position:'atk'|'def';turn:number};
const defaultLookup:PositionPolicyLookup=(id)=>{
 if(id===FINAL_ATTACK_ORDERS_ID)return {kind:'trap',effect:'final-attack-orders'};
 if(id===LIGHT_OF_INTERVENTION_ID)return {kind:'trap',effect:'light-of-intervention'};
 if(id==='33950246')return {kind:'trap',effect:'royal-command'};
 return undefined;
};
function physicalSeat(uid:string):Seat|null{const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as Seat:null;}
function assertActivationId(value:string):void{if(typeof value!=='string'||value.length<1||value.length>128||!/^[-a-zA-Z0-9:_]+$/.test(value))throw new Error('Identificador de ativação inválido.');}
function assertClassic(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2)throw new Error('Estrutura física TagDuel incompleta.');
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A resolução alterou a quantidade de cartas físicas.');
 for(const [uid,id]of before)if(after.get(uid)!==id)throw new Error('A resolução alterou a identidade física: '+uid);
}
function findBackrow(duel:TagDuel,uid:string):{team:Team;card:Backrow}|undefined{
 for(const team of [0,1] as const){const card=duel.core.players[team].backrow.find(card=>card.uid===uid);if(card)return {team,card};}return undefined;
}
function findMonster(duel:TagDuel,uid:string):{team:Team;monster:Monster}|undefined{
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(monster=>monster.uid===uid);if(monster)return {team,monster};}return undefined;
}
function activeEffects(duel:TagDuel,lookup:PositionPolicyLookup):Set<PositionPolicyEffect>{
 const result=new Set<PositionPolicyEffect>();
 for(const team of [0,1] as const)for(const card of duel.core.players[team].backrow){
  if(!card.faceUp||card.resolved!==true)continue;const info=lookup(card.id);if(info?.kind==='trap')result.add(info.effect);
 }return result;
}
function applyContinuousPositionPolicies(duel:TagDuel,lookup:PositionPolicyLookup):string[]{
 const changed:string[]=[];if(!activeEffects(duel,lookup).has('final-attack-orders'))return changed;
 for(const team of [0,1] as const)for(const monster of duel.core.players[team].monsters)if(monster.faceUp&&monster.position!=='atk'){monster.position='atk';changed.push(monster.uid);}
 return changed;
}
export function assertPositionPolicyRules(duel:TagDuel,lookup:PositionPolicyLookup=defaultLookup):void{
 assertClassic(duel);const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('O adapter exige Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 const extraUids=new Set<string>();
 for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  const seat=physicalSeat(card.uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  const metadata=getDuelCard(card.id);if(!metadata)throw new Error('Carta física sem metadados habilitados: '+card.id);
  if(extraUids.has(card.uid)||metadata.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 for(const team of [0,1] as const){const player=duel.core.players[team];if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Limite de três Monster Zones excedido.');if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Limite de três Spell/Trap Zones excedido.');}
 // Hands may exceed six during a turn; the hand check remains exclusive to the End Phase.
}
function assertSession(session:PositionPolicySession,lookup:PositionPolicyLookup):void{
 if(!session||!session.duel||!session.pending||!session.resolved||typeof session.pending!=='object'||typeof session.resolved!=='object')throw new Error('Sessão de política de posição inválida.');
 assertPositionPolicyRules(session.duel,lookup);
}
function expectedActorTeam(duel:TagDuel):Team{return (duel.core.phase==='response'?duel.core.priority:duel.core.current) as Team;}
function assertActiveSeat(duel:TagDuel,actorSeat:number):Team{
 if(!Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3)throw new Error('Assento físico inválido.');
 if(!['main','battle','response'].includes(duel.core.phase)||duel.core.damageStep)throw new Error('A ativação/mudança não é permitida nesta janela.');
 const team=(actorSeat%2) as Team;if(expectedActorTeam(duel)!==team||duel.active[team]!==actorSeat)throw new Error('A ação pertence ao participante ativo da equipe.');return team;
}
export function createPositionPolicyAdapter(lookup:PositionPolicyLookup=defaultLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):PositionPolicySession{
  const working=structuredClone(duel);applyContinuousPositionPolicies(working,lookup);assertPositionPolicyRules(working,lookup);
  return {duel:working,pending:{},resolved:{}};
 }
 function prepareActivation(session:PositionPolicySession,actorSeat:number,sourceUid:string,activationId:string):Plan{
  assertSession(session,lookup);assertActivationId(activationId);
  if(Object.hasOwn(session.pending,activationId)||Object.hasOwn(session.resolved,activationId))throw new Error('Ativação duplicada.');
  const working=structuredClone(session.duel),team=assertActiveSeat(working,actorSeat),found=findBackrow(working,sourceUid);
  if(!found||found.team!==team)throw new Error('A Armadilha não está na Zona de Magias/Armadilhas da equipe.');
  const source=found.card,info=lookup(source.id),metadata=getDuelCard(source.id);
  if(!info||info.kind!=='trap'||metadata?.kind!=='trap')throw new Error('A carta não pertence à família de políticas contínuas de posição.');
  if(source.faceUp)throw new Error('A Armadilha já está face-up.');
  if(source.setTurn>=working.core.turn)throw new Error('Uma Armadilha não pode ser ativada no mesmo turno em que foi Baixada.');
  const ownerSeat=physicalSeat(source.uid);if(ownerSeat===null)throw new Error('UID físico inválido para a Armadilha.');
  const binding=bindTarget(working.core,sourceUid);if(!binding||binding.zone!=='backrow')throw new Error('Não foi possível vincular a Armadilha à Zona de Magias/Armadilhas.');
  source.faceUp=true;source.resolved=false;synchronizeCardLifetimes(working.core);
  const plan:Plan={activationId,effect:info.effect,sourceUid,sourceId:source.id,sourceOwnerSeat:ownerSeat,controllerTeam:team,actorSeat:actorSeat as Seat,turn:working.core.turn,sourceBinding:binding};
  assertPositionPolicyRules(working,lookup);assertTagDuel(working);session.duel=working;session.pending[activationId]={plan};return structuredClone(plan);
 }
 function resolveActivation(session:PositionPolicySession,activationId:string,negation:'none'|'activation'|'effect'='none'):PositionPolicyResult{
  assertSession(session,lookup);assertActivationId(activationId);
  const cached=session.resolved[activationId];if(cached)return structuredClone(cached);
  const pending=session.pending[activationId];if(!pending)throw new Error('Ativação de Armadilha não preparada.');
  const working=structuredClone(session.duel),plan=pending.plan,before=inventorySnapshot(working);
  if(working.core.turn!==plan.turn)throw new Error('A ativação ficou obsoleta após a mudança de turno.');
  const found=findBackrow(working,plan.sourceUid),sourceValid=!!found&&found.card.faceUp&&targetBindingValid(working.core,plan.sourceBinding);
  const activated=negation!=='activation'&&sourceValid;let effectApplied=false;
  if(negation==='activation'){if(found)discardBackrow(working.core,plan.sourceUid);}
  else if(sourceValid&&found){if(negation==='effect')found.card.resolved=false;else{found.card.resolved=true;effectApplied=true;}}
  const changedPositions=applyContinuousPositionPolicies(working,lookup);synchronizeCardLifetimes(working.core);
  const source=findBackrow(working,plan.sourceUid)?.card;
  const result:PositionPolicyResult={activationId,effect:plan.effect,negation,activated,effectApplied,sourceActive:!!source?.faceUp&&source.resolved===true,changedPositions};
  assertPositionPolicyRules(working,lookup);assertSameInventory(before,working);assertTagDuel(working);
  session.duel=working;session.resolved[activationId]=result;delete session.pending[activationId];return structuredClone(result);
 }
 function applyContinuousPolicies(session:PositionPolicySession):string[]{
  assertSession(session,lookup);const working=structuredClone(session.duel),before=inventorySnapshot(working),changed=applyContinuousPositionPolicies(working,lookup);
  synchronizeCardLifetimes(working.core);assertPositionPolicyRules(working,lookup);assertSameInventory(before,working);assertTagDuel(working);session.duel=working;return changed;
 }
 function removeContinuousTrap(session:PositionPolicySession,sourceUid:string):boolean{
  assertSession(session,lookup);const working=structuredClone(session.duel),before=inventorySnapshot(working);
  if(!findBackrow(working,sourceUid))return false;
  discardBackrow(working.core,sourceUid);applyContinuousPositionPolicies(working,lookup);synchronizeCardLifetimes(working.core);
  assertPositionPolicyRules(working,lookup);assertSameInventory(before,working);assertTagDuel(working);session.duel=working;return true;
 }
 function canChangeBattlePosition(session:PositionPolicySession,uid:string,mode:PositionMode):boolean{
  assertSession(session,lookup);const found=findMonster(session.duel,uid);if(!found)return false;
  const monster=found.monster,active=activeEffects(session.duel,lookup);
  if(monster.changed===session.duel.core.turn||monster.positionLockedThrough!==undefined&&session.duel.core.turn<=monster.positionLockedThrough)return false;
  if(mode==='flip')return !monster.faceUp;if(!monster.faceUp)return false;
  if(active.has('final-attack-orders'))return false;if(mode==='set'&&active.has('light-of-intervention'))return false;return true;
 }
 function flipEffectAllowed(session:PositionPolicySession,uid:string):boolean{
  assertSession(session,lookup);const found=findMonster(session.duel,uid);if(!found)return true;
  return !activeEffects(session.duel,lookup).has('royal-command')||getMonsterEffect(found.monster.id)?.trigger!=='flip';
 }
 function canSetMonsterFaceDown(session:PositionPolicySession,uid:string):boolean{
  assertSession(session,lookup);const found=findMonster(session.duel,uid);if(!found||!found.monster.faceUp)return false;
  const active=activeEffects(session.duel,lookup);return !active.has('final-attack-orders')&&!active.has('light-of-intervention');
 }
 function resolveSetMonster(session:PositionPolicySession,actorSeat:number,cardUid:string):SetMonsterResult{
  assertSession(session,lookup);const working=structuredClone(session.duel),team=assertActiveSeat(working,actorSeat);
  if(working.core.phase!=='main'||working.core.current!==team)throw new Error('Set/Invocação-Normal exige a Fase Principal da equipe.');
  const player=working.core.players[team];if(player.summoned)throw new Error('A equipe já consumiu sua Invocação-Normal/Set neste turno.');
  if(player.monsters.length>=RULES_PROFILE.monsterZones)throw new Error('Não há Monster Zone livre.');
  const index=player.hand.findIndex(card=>card.uid===cardUid);if(index<0)throw new Error('A carta não está na mão privada do participante ativo.');
  const card=player.hand[index],metadata=getDuelCard(card.id);
  if(metadata?.kind!=='monster'||metadata.fusion||metadata.monsterType==='ritual'||card.entityKind==='token')throw new Error('A carta não pode ser Invocada-Normal ou Baixada.');
  const before=inventorySnapshot(working),lightActive=activeEffects(working,lookup).has('light-of-intervention');player.hand.splice(index,1);
  const monster:Monster={...card,position:'def',faceUp:lightActive,entered:working.core.turn,changed:working.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:team,...(lightActive?{lastSummonedTurn:working.core.turn}:{})};
  player.monsters.push(monster);player.summoned=true;applyContinuousPositionPolicies(working,lookup);
  const actual=player.monsters.find(value=>value.uid===cardUid)!;synchronizeCardLifetimes(working.core);
  assertPositionPolicyRules(working,lookup);assertSameInventory(before,working);assertTagDuel(working);session.duel=working;
  return {uid:actual.uid,mode:lightActive?'normal-summon':'set',faceUp:actual.faceUp,position:actual.position,turn:working.core.turn};
 }
 function changeMonsterPosition(session:PositionPolicySession,actorSeat:number,uid:string,mode:PositionMode):PositionChangeResult{
  assertSession(session,lookup);const working=structuredClone(session.duel),team=assertActiveSeat(working,actorSeat);
  if(working.core.phase!=='main'||working.core.current!==team)throw new Error('Mudança de posição exige a Fase Principal da equipe.');
  const found=findMonster(working,uid);if(!found||found.team!==team)throw new Error('O monstro não é controlado pela equipe ativa.');
  if(!canChangeBattlePosition(session,uid,mode))throw new Error('Uma política contínua ou o histórico do monstro impede a mudança de posição.');
  const monster=found.monster;
  if(mode==='flip'){monster.faceUp=true;monster.position='atk';}
  else if(mode==='set'){monster.faceUp=false;monster.position='def';}
  else if(mode==='attack')monster.position='atk';else monster.position='def';
  monster.changed=working.core.turn;applyContinuousPositionPolicies(working,lookup);synchronizeCardLifetimes(working.core);
  assertPositionPolicyRules(working,lookup);assertTagDuel(working);session.duel=working;
  const current=findMonster(working,uid)!.monster;return {uid,faceUp:current.faceUp,position:current.position,turn:working.core.turn};
 }
 return {createSession,prepareActivation,resolveActivation,applyContinuousPolicies,removeContinuousTrap,canChangeBattlePosition,canSetMonsterFaceDown,flipEffectAllowed,resolveSetMonster,changeMonsterPosition};
}
