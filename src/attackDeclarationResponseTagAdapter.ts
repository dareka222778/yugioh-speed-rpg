import type {Backrow,Monster,DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import type {Effect} from './effectDefinitions';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {bindTarget,targetBindingValid,synchronizeCardLifetimes,type TargetBinding} from './cardLifetime';
import {atk} from './duelEngine';
import {resolveAttackResponse} from './attackResponses';
import {cardActivationAllowed,continuousTrapActivationsBlocked,continuousTrapsNegated} from './continuousEffects';

export const MAGIC_CYLINDER_ID='62279055';
export const MAGIC_CYLINDER_KONAMI_CID=5124;
export const DRAINING_SHIELD_ID='43250041';
export const DRAINING_SHIELD_KONAMI_CID=5994;
export const NEGATE_ATTACK_ID='14315573';
export const NEGATE_ATTACK_KONAMI_CID=4804;

export type AttackResponseTeam=0|1;
export type AttackResponseSeat=0|1|2|3;
export type AttackResponseEffect='magic-cylinder'|'draining-shield'|'negate-attack';
export type AttackResponseLookup=(id:string)=>{kind:'trap';effect:AttackResponseEffect;speed:2|3}|undefined;
export type AttackResponseActivation={
 attackId:string;activationId:string;sourceUid:string;targetUid:string;team:AttackResponseTeam;attackTeam:AttackResponseTeam;
 ownerSeat:AttackResponseSeat;actorSeat:AttackResponseSeat;turn:number;speed:2|3;
 sourceBinding:TargetBinding;targetBinding:TargetBinding;effect:AttackResponseEffect;
};
export type AttackResponseResolution={
 attackId:string;activationId:string;sourceUid:string;targetUid:string;
 status:'attack-negated'|'activation-negated'|'effect-negated'|'source-left-field'|'target-left-field'|'attack-already-negated';
 attackNegated:boolean;endBattle:boolean;amount:number;damageTeam?:AttackResponseTeam;gainTeam?:AttackResponseTeam;replayed:boolean;
};
export type AttackResponseSession={
 duel:TagDuel;
 activations:Record<string,AttackResponseActivation>;
 resolutions:Record<string,AttackResponseResolution>;
};
const isTeam=(v:unknown):v is AttackResponseTeam=>v===0||v===1;
const isSeat=(v:unknown):v is AttackResponseSeat=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=3;
function assertId(v:unknown,label:string,max=128):asserts v is string{
 if(typeof v!=='string'||!v.trim()||v.length>max||!/^[a-zA-Z0-9:_-]+$/.test(v))throw new Error(label+' inválido.');
}
function teamForSeat(seat:AttackResponseSeat):AttackResponseTeam{return (seat%2) as AttackResponseTeam;}
function physicalSeat(uid:string):AttackResponseSeat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as AttackResponseSeat:null;
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2||!duel.core.teamRotation||
  !Array.isArray(duel.core.chain)||!duel.reserves)throw new Error('Estrutura física TagDuel incompleta.');
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(c=>c.entityKind!=='token')){
  const seat=physicalSeat(card.uid);
  if(seat===null||duel.members[seat]?.team!==teamForSeat(seat)||result.has(card.uid))throw new Error('Identidade física inválida: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
/** Enforces the owner's 20–30 / 6-at-End / 3+3 / Field / Extra-5 layout. */
export function assertAttackDeclarationResponseRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 const extraUids=new Set<string>(),main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!getDuelCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão só é limitada na End Phase; não se descarta durante a resolução de ataque.
}
function findMonster(duel:TagDuel,uid:string):{team:AttackResponseTeam;monster:Monster}|undefined{
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(m=>m.uid===uid);if(monster)return {team,monster};}
 return undefined;
}
function findBackrow(duel:TagDuel,uid:string):{team:AttackResponseTeam;card:Backrow}|undefined{
 for(const team of [0,1] as const){const card=duel.core.players[team].backrow.find(c=>c.uid===uid);if(card)return {team,card};}
 return undefined;
}
function assertActiveSeat(duel:TagDuel,team:AttackResponseTeam,seat:AttackResponseSeat):void{
 if(!isTeam(team)||!isSeat(seat)||duel.cursor!==seat||duel.active[team]!==seat||teamForSeat(seat)!==team){
  throw new Error('A resposta pertence ao assento ativo da equipe defensora.');
 }
}
function assertAttackWindow(duel:TagDuel,team:AttackResponseTeam,targetUid:string):void{
 const core=duel.core,pending=core.pending;
 if(core.phase!=='response'||core.priority!==team||pending.kind!=='attack'||pending.stage!=='declare'||
  pending.actor===team||pending.card!==targetUid||pending.cancelled||core.damageStep){
  throw new Error('A Armadilha exige a declaração de ataque de um monstro oponente.');
 }
}
function finishByLP(core:DuelState):void{
 const [a,b]=core.players;
 if(a.lp>0&&b.lp>0)return;
 delete core.movementSelection;delete core.afterEffectFlips;delete core.effectFlips;delete core.ritual;delete core.standby;
 core.phase='finished';core.damageStep=undefined;core.turnEnding=undefined;core.pendingNegated=undefined;core.winner=a.lp<=0&&b.lp<=0?null:a.lp<=0?b.id:a.id;
 core.reason='pontos de vida';core.pending={kind:'none'};core.chain=[];core.choice=undefined;core.handFlow=undefined;
 core.triggerBuild=undefined;core.chainRoot=undefined;core.afterMonsterEffect=undefined;core.graveTriggers=[];core.summonTriggers=[];core.battleFlip=undefined;
}
function moveTrapToOwnerGrave(duel:TagDuel,uid:string):boolean{
 const location=findBackrow(duel,uid),ownerSeat=physicalSeat(uid);
 if(!location||ownerSeat===null)return false;
 const card=location.card;
 duel.core.players[location.team].backrow=duel.core.players[location.team].backrow.filter(item=>item.uid!==uid);
 duel.core.players[ownerSeat%2].grave.push({uid:card.uid,id:card.id});
 synchronizeCardLifetimes(duel.core);return true;
}
export const defaultAttackResponseLookup:AttackResponseLookup=(id)=>{
 if(id===MAGIC_CYLINDER_ID)return {kind:'trap',effect:'magic-cylinder',speed:2};
 if(id===DRAINING_SHIELD_ID)return {kind:'trap',effect:'draining-shield',speed:2};
 if(id===NEGATE_ATTACK_ID)return {kind:'trap',effect:'negate-attack',speed:3};
 return undefined;
};
function attackEffect(meta:{speed:2|3;effect:AttackResponseEffect}):Extract<Effect,{kind:'attackResponse'}>{
 return {kind:'attackResponse',activation:{speed:meta.speed,window:'attackDeclared',damage:'never',opponentOnly:true},
  endBattle:meta.effect==='negate-attack',reflectAttack:meta.effect==='magic-cylinder'};
}
function assertSession(session:AttackResponseSession):void{
 if(!session||!session.duel||!session.activations||!session.resolutions)throw new Error('Sessão M683 inválida.');
 assertAttackDeclarationResponseRules(session.duel);
 for(const [id,activation] of Object.entries(session.activations)){
  if(!activation||activation.activationId!==id||!isTeam(activation.team)||!isTeam(activation.attackTeam)||
   !isSeat(activation.actorSeat)||!isSeat(activation.ownerSeat)||!Number.isSafeInteger(activation.turn))throw new Error('Ativação de resposta inválida.');
 }
}
export function createAttackDeclarationResponseAdapter(lookup:AttackResponseLookup=defaultAttackResponseLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):AttackResponseSession{
  assertAttackDeclarationResponseRules(duel);return {duel:structuredClone(duel),activations:{},resolutions:{}};
 }
 function activate(session:AttackResponseSession,input:{activationId:string;attackId:string;sourceUid:string;targetUid:string;actorSeat:AttackResponseSeat}):AttackResponseActivation{
  assertSession(session);assertId(input.activationId,'ID de ativação');assertId(input.attackId,'ID de ataque');
  assertId(input.sourceUid,'UID da Armadilha');assertId(input.targetUid,'UID do atacante');
  const previous=session.activations[input.activationId];
  if(previous){
   if(previous.attackId!==input.attackId||previous.sourceUid!==input.sourceUid||previous.targetUid!==input.targetUid||previous.actorSeat!==input.actorSeat){
    throw new Error('ID de ativação reutilizado com fatos diferentes.');
   }
   return {...previous};
  }
  const source=findBackrow(session.duel,input.sourceUid),ownerSeat=physicalSeat(input.sourceUid);
  const meta=source?lookup(source.card.id):undefined;
  if(!source||source.card.faceUp||source.card.setTurn>=session.duel.core.turn||!meta||meta.kind!=='trap'||ownerSeat===null){
   throw new Error('A Armadilha precisa estar Baixada desde um turno anterior.');
  }
  const team=source.team,core=session.duel.core,pending=core.pending;
  assertActiveSeat(session.duel,team,input.actorSeat);assertAttackWindow(session.duel,team,input.targetUid);
  const attacker=findMonster(session.duel,input.targetUid);
  if(!attacker||attacker.team!==1-team||!attacker.monster.faceUp||attacker.monster.position!=='atk'||pending.kind!=='attack'||pending.actor!==attacker.team){
   throw new Error('O alvo precisa ser o monstro atacante face-up do oponente.');
  }
  const last=core.chain.at(-1) as {speed?:number}|undefined;
  if(last?.speed===3&&meta.speed!==3)throw new Error('Uma Armadilha comum não pode responder a uma Counter Trap.');
  if(continuousTrapActivationsBlocked(core)||!cardActivationAllowed(core,team,'trap'))throw new Error('A ativação de Armadilhas está bloqueada.');
  const working=structuredClone(session.duel),sourceWorking=findBackrow(working,input.sourceUid)!;
  const sourceBinding=bindTarget(working.core,input.sourceUid),targetBinding=bindTarget(working.core,input.targetUid);
  if(!sourceBinding||sourceBinding.zone!=='backrow'||!targetBinding||targetBinding.zone!=='monsters')throw new Error('Vínculo de UID/epoch inválido.');
  sourceWorking.card.faceUp=true;sourceWorking.card.resolved=false;
  synchronizeCardLifetimes(working.core);assertTagDuel(working);assertSameInventory(inventorySnapshot(session.duel),working);
  const activation:AttackResponseActivation={activationId:input.activationId,attackId:input.attackId,sourceUid:input.sourceUid,
   targetUid:input.targetUid,team,attackTeam:attacker.team,ownerSeat,actorSeat,turn:working.core.turn,speed:meta.speed,
   sourceBinding,targetBinding,effect:meta.effect};
  session.duel=working;session.activations[input.activationId]=structuredClone(activation);
  return {...activation};
 }
 function resolve(session:AttackResponseSession,activationId:string,options:{activationNegated?:boolean;effectNegated?:boolean}={}):AttackResponseResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.resolutions[activationId];if(previous)return {...previous,replayed:true};
  const activation=session.activations[activationId];if(!activation)throw new Error('Ativação de resposta inexistente.');
  const base=(status:AttackResponseResolution['status'],extra:Partial<AttackResponseResolution>={}):AttackResponseResolution=>{
   const result:AttackResponseResolution={attackId:activation.attackId,activationId,sourceUid:activation.sourceUid,targetUid:activation.targetUid,
    status,attackNegated:false,endBattle:false,amount:0,replayed:false,...extra};
   session.resolutions[activationId]=result;return {...result};
  };
  const source=findBackrow(session.duel,activation.sourceUid),attacker=findMonster(session.duel,activation.targetUid);
  if(!source||!source.card.faceUp||!targetBindingValid(session.duel.core,activation.sourceBinding)){
   return base('source-left-field');
  }
  if(!attacker||!targetBindingValid(session.duel.core,activation.targetBinding)||!attacker.monster.faceUp||attacker.monster.position!=='atk'){
   moveTrapToOwnerGrave(session.duel,activation.sourceUid);assertTagDuel(session.duel);return base('target-left-field');
  }
  if(options.activationNegated){
   moveTrapToOwnerGrave(session.duel,activation.sourceUid);assertTagDuel(session.duel);return base('activation-negated');
  }
  if(options.effectNegated||continuousTrapsNegated(session.duel.core)){
   moveTrapToOwnerGrave(session.duel,activation.sourceUid);assertTagDuel(session.duel);return base('effect-negated');
  }
  const pending=session.duel.core.pending;
  if(pending.kind!=='attack'||pending.stage!=='declare'||pending.card!==activation.targetUid||pending.actor!==activation.attackTeam||pending.cancelled){
   moveTrapToOwnerGrave(session.duel,activation.sourceUid);assertTagDuel(session.duel);return base('attack-already-negated');
  }
  const core=session.duel.core,lpBefore=core.players[activation.team].lp,opponentBefore=core.players[activation.attackTeam].lp;
  const amount=atk(attacker.monster,core),effect=attackEffect({speed:activation.speed,effect:activation.effect});
  const applied=resolveAttackResponse(core,activation.team,activation.targetUid,effect,{attack:(monster,state)=>atk(monster,state),checkLP:finishByLP});
  if(!applied){
   moveTrapToOwnerGrave(session.duel,activation.sourceUid);assertTagDuel(session.duel);return base('attack-already-negated');
  }
  let damageTeam:AttackResponseTeam|undefined,gainTeam:AttackResponseTeam|undefined;
  if(activation.effect==='magic-cylinder')damageTeam=activation.attackTeam;
  if(activation.effect==='draining-shield'){
   core.players[activation.team].lp+=amount;gainTeam=activation.team;
  }
  const endBattle=activation.effect==='negate-attack';
  const damage=damageTeam?Math.max(0,opponentBefore-core.players[damageTeam].lp):0;
  const gained=gainTeam?Math.max(0,core.players[gainTeam].lp-lpBefore):0;
  moveTrapToOwnerGrave(session.duel,activation.sourceUid);assertTagDuel(session.duel);
  assertSameInventory(inventorySnapshot(session.duel),session.duel);
  return base('attack-negated',{attackNegated:true,endBattle,amount:damageTeam?damage:gained,damageTeam,gainTeam});
 }
 return {createSession,activate,resolve};
}
