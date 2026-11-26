import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {RULES_PROFILE,rulesFor} from './rulesProfile';

export const STAUNCH_DEFENDER_ID='92854392';
export const DARK_SPIRIT_OF_THE_SILENT_ID='93599951';
export type BattleTargetEffect='staunch-defender'|'dark-spirit-of-the-silent';
type Team=0|1;
type Seat=0|1|2|3;
export type BattleTargetLookup=(id:string)=>{kind:'trap';effect:BattleTargetEffect}|undefined;
export type AttackTargetOption=string|null;
export type BattleTargetPlan={
 activationId:string;effect:BattleTargetEffect;actorSeat:Seat;sourceUid:string;sourceOwnerSeat:Seat;
 attackerTeam:Team;defenderTeam:Team;attackerUid:string;declaredTargetUid:string|null;turn:number;targetOptions:string[];
};
export type BattleTargetResult={
 activationId:string;effect:BattleTargetEffect;sourceUid:string;sourceOwnerSeat:Seat;
 attackerTeam:Team;defenderTeam:Team;originalAttackerUid:string;attackTargetUid:string|null;
 selectedUid:string;forcedTargetUid?:string;replacementAttackerUid?:string;turn:number;
};
export type StaunchPolicy={
 activationId:string;sourceUid:string;controllerTeam:Team;attackerTeam:Team;targetUid:string;activatedTurn:number;
};
export type BattleTargetSession={
 duel:TagDuel;pending:Record<string,BattleTargetPlan>;resolved:Record<string,BattleTargetResult>;
 policies:StaunchPolicy[];endPhaseReceipts:string[];
};
export type BattleTargetResolution=BattleTargetResult&{state:TagDuel};
export type EndPhasePolicyResult={status:'advanced'|'duplicate'|'none';state:TagDuel;expiredTargetUids:string[]};

const defaultLookup:BattleTargetLookup=(id)=>{
 if(id===STAUNCH_DEFENDER_ID)return {kind:'trap',effect:'staunch-defender'};
 if(id===DARK_SPIRIT_OF_THE_SILENT_ID)return {kind:'trap',effect:'dark-spirit-of-the-silent'};
 return undefined;
};
const validTeam=(value:unknown):value is Team=>value===0||value===1;
const hasOwn=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function validActivationId(value:unknown):value is string{
 return typeof value==='string'&&value.trim().length>0&&value.length<=128&&/^[-a-zA-Z0-9:_]+$/.test(value);
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic'||!duel.core||!Array.isArray(duel.core.players)||duel.core.players.length!==2||
  !Array.isArray(duel.active)||duel.active.length!==2||!Array.isArray(duel.members)||duel.members.length!==4||
  !duel.reserves||!duel.core.teamRotation||!Array.isArray(duel.core.chain)){
  throw new Error('O adapter exige um TagDuel clássico 2v2 válido.');
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const cards=tagInventory(duel).filter(card=>card.entityKind!=='token'),result=new Map<string,string>();
 for(const card of cards){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  if(physicalSeat(card.uid)===null)throw new Error('UID físico 2v2 inválido: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function handSnapshot(duel:TagDuel):string[]{
 const result:string[]=[];
 for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
 return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('O adapter alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('O adapter alterou a identidade física: '+uid);
}
function assertHandsUnchanged(before:string[],duel:TagDuel):void{
 if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel)))throw new Error('O adapter alterou uma mão privada.');
}
export function assertBattleTargetPolicyRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5 são obrigatórios.');
 }
 const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones na equipe.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones na equipe.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);
  if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!getDuelCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A Field Zone é independente e não consome uma das três Spell/Trap Zones.
}
function assertSession(session:BattleTargetSession):void{
 if(!session||!session.duel||!session.pending||!session.resolved||!Array.isArray(session.policies)||!Array.isArray(session.endPhaseReceipts)){
  throw new Error('Sessão de política de alvo inválida.');
 }
 assertTagDuel(session.duel);
 assertBattleTargetPolicyRules(session.duel);
}
function findMonster(duel:TagDuel,team:Team,uid:string){
 const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);
 return monster?{team,monster}:undefined;
}
function findMonsterAnyTeam(duel:TagDuel,uid:string){
 for(const team of [0,1] as const){const found=findMonster(duel,team,uid);if(found)return found;}
 return undefined;
}
function readAttackDeclaration(duel:TagDuel,actorSeat:number){
 const pending=duel.core.pending;
 if(duel.core.phase!=='response'||pending.kind!=='attack'||pending.stage!=='declare'||
  duel.core.choice||duel.core.turnEnding||duel.core.damageStep){
  throw new Error('A Armadilha só pode responder à declaração de ataque, antes do cálculo de dano.');
 }
 const attackerTeam=duel.core.current as Team,defenderTeam=(1-attackerTeam) as Team;
 if(!validTeam(attackerTeam)||pending.actor!==attackerTeam||duel.core.priority!==defenderTeam||
  !Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3||duel.active[defenderTeam]!==actorSeat){
  throw new Error('Somente o participante ativo da equipe defensora pode responder ao ataque.');
 }
 const attacker=findMonster(duel,attackerTeam,pending.card);
 if(!attacker||!attacker.monster.faceUp||attacker.monster.position!=='atk'){
  throw new Error('O atacante declarado não está face-up em Posição de Ataque.');
 }
 const declaredTargetUid=pending.target??null;
 if(declaredTargetUid!==null&&!findMonster(duel,defenderTeam,declaredTargetUid)){
  throw new Error('O alvo declarado não pertence à equipe defensora.');
 }
 return {attackerTeam,defenderTeam,attackerUid:pending.card,declaredTargetUid,turn:duel.core.turn};
}
function locateSetTrap(duel:TagDuel,defenderTeam:Team,sourceUid:string,cardId:string){
 const ownerSeat=physicalSeat(sourceUid);
 if(ownerSeat===null||ownerSeat%2!==defenderTeam)throw new Error('A Armadilha preparada não pertence à equipe defensora.');
 const backrow=duel.core.players[defenderTeam].backrow,index=backrow.findIndex(card=>card.uid===sourceUid&&card.id===cardId);
 if(index<0)throw new Error('A Armadilha não está na Zona de Magias/Armadilhas da equipe defensora.');
 const source=backrow[index];
 if(source.faceUp)throw new Error('A Armadilha já está face-up.');
 if(!Number.isInteger(source.setTurn)||source.setTurn>=duel.core.turn)throw new Error('A Armadilha precisa ter sido Baixada antes deste turno.');
 return {index,ownerSeat:ownerSeat as Seat};
}
function targetOptions(duel:TagDuel,effect:BattleTargetEffect,attackerTeam:Team,defenderTeam:Team,attackerUid:string):string[]{
 if(effect==='staunch-defender'){
  return duel.core.players[defenderTeam].monsters.filter(monster=>monster.faceUp).map(monster=>monster.uid);
 }
 return duel.core.players[attackerTeam].monsters.filter(monster=>
  monster.uid!==attackerUid&&monster.faceUp&&monster.attacked===0&&(monster.attackCount??0)===0
 ).map(monster=>monster.uid);
}
function currentPolicy(session:BattleTargetSession,attackerTeam:Team):StaunchPolicy|undefined{
 const policies=session.policies.filter(policy=>policy.attackerTeam===attackerTeam&&policy.activatedTurn===session.duel.core.turn);
 const policy=policies.length?policies[policies.length-1]:undefined;
 if(!policy)return undefined;
 const target=findMonster(session.duel,policy.controllerTeam,policy.targetUid);
 if(!target){
  session.policies=session.policies.filter(item=>item.activationId!==policy.activationId);
  return undefined;
 }
 return policy;
}
function replacePolicy(policies:StaunchPolicy[],plan:BattleTargetPlan,targetUid:string):StaunchPolicy[]{
 return [...policies.filter(policy=>!(policy.attackerTeam===plan.attackerTeam&&policy.activatedTurn===plan.turn)),
  {activationId:plan.activationId,sourceUid:plan.sourceUid,controllerTeam:plan.defenderTeam,
   attackerTeam:plan.attackerTeam,targetUid,activatedTurn:plan.turn}];
}

export function createBattleTargetPolicyAdapter(lookup:BattleTargetLookup=defaultLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):BattleTargetSession{
  assertTagDuel(duel);assertBattleTargetPolicyRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:{},policies:[],endPhaseReceipts:[]};
 }
 function prepareActivation(session:BattleTargetSession,actorSeat:number,sourceUid:string,activationId:string):BattleTargetPlan{
  assertSession(session);
  if(!validActivationId(activationId)||typeof sourceUid!=='string'||sourceUid.length<1||
   !Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3)throw new Error('Evento de ativação inválido.');
  if(hasOwn(session.pending,activationId)||hasOwn(session.resolved,activationId))throw new Error('Ativação duplicada.');
  const window=readAttackDeclaration(session.duel,actorSeat),sourceSeat=physicalSeat(sourceUid);
  if(sourceSeat===null||sourceSeat%2!==window.defenderTeam)throw new Error('UID físico da Armadilha inválido para a equipe defensora.');
  const backrow=session.duel.core.players[window.defenderTeam].backrow.find(card=>card.uid===sourceUid);
  if(!backrow)throw new Error('A carta-fonte não está preparada no campo.');
  const info=lookup(backrow.id);
  if(!info||info.kind!=='trap')throw new Error('A carta não pertence à família de políticas de alvo.');
  locateSetTrap(session.duel,window.defenderTeam,sourceUid,backrow.id);
  const options=targetOptions(session.duel,info.effect,window.attackerTeam,window.defenderTeam,window.attackerUid);
  if(options.length===0)throw new Error('Não existe alvo legal para resolver esta Armadilha.');
  const plan:BattleTargetPlan={
   activationId,effect:info.effect,actorSeat:actorSeat as Seat,sourceUid,sourceOwnerSeat:sourceSeat,
   attackerTeam:window.attackerTeam,defenderTeam:window.defenderTeam,attackerUid:window.attackerUid,
   declaredTargetUid:window.declaredTargetUid,turn:window.turn,targetOptions:options
  };
  session.pending[activationId]=structuredClone(plan);
  return structuredClone(plan);
 }
 function resolveActivation(session:BattleTargetSession,activationId:string,selectedUid:string):BattleTargetResolution{
  assertSession(session);
  const plan=session.pending[activationId];
  if(!plan||hasOwn(session.resolved,activationId))throw new Error('A ativação não aguarda escolha ou já foi resolvida.');
  if(typeof selectedUid!=='string'||!selectedUid)throw new Error('Selecione um monstro válido.');
  const working=structuredClone(session.duel),window=readAttackDeclaration(working,plan.actorSeat);
  if(window.turn!==plan.turn||window.attackerTeam!==plan.attackerTeam||window.defenderTeam!==plan.defenderTeam||
   window.attackerUid!==plan.attackerUid||window.declaredTargetUid!==plan.declaredTargetUid){
   throw new Error('A declaração de ataque mudou antes da resolução.');
  }
  const sourceId=working.core.players[plan.defenderTeam].backrow.find(card=>card.uid===plan.sourceUid)?.id??'';
  const source=locateSetTrap(working,plan.defenderTeam,plan.sourceUid,sourceId);
  const options=targetOptions(working,plan.effect,plan.attackerTeam,plan.defenderTeam,plan.attackerUid);
  if(!plan.targetOptions.includes(selectedUid)||!options.includes(selectedUid)){
   throw new Error('O alvo deixou de ser válido antes da resolução.');
  }
  const before=inventorySnapshot(working),handsBefore=handSnapshot(working);
  const backrow=working.core.players[plan.defenderTeam].backrow,[trap]=backrow.splice(source.index,1);
  trap.faceUp=true;
  working.core.players[plan.defenderTeam].grave.push({uid:trap.uid,id:trap.id});
  const pending=working.core.pending;
  if(pending.kind!=='attack'||pending.stage!=='declare')throw new Error('A declaração de ataque não está mais pendente.');
  let result:BattleTargetResult;
  let nextPolicies=session.policies;
  if(plan.effect==='staunch-defender'){
   pending.target=selectedUid;
   nextPolicies=replacePolicy(session.policies,plan,selectedUid);
   result={activationId,effect:plan.effect,sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    attackerTeam:plan.attackerTeam,defenderTeam:plan.defenderTeam,originalAttackerUid:plan.attackerUid,
    attackTargetUid:selectedUid,selectedUid,forcedTargetUid:selectedUid,turn:plan.turn};
  }else{
   const replacement=findMonster(working,plan.attackerTeam,selectedUid);
   if(!replacement)throw new Error('O monstro substituto deixou o campo.');
   replacement.monster.position='atk';
   replacement.monster.faceUp=true;
   replacement.monster.changed=working.core.turn;
   pending.card=selectedUid;
   result={activationId,effect:plan.effect,sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    attackerTeam:plan.attackerTeam,defenderTeam:plan.defenderTeam,originalAttackerUid:plan.attackerUid,
    attackTargetUid:plan.declaredTargetUid,selectedUid,replacementAttackerUid:selectedUid,turn:plan.turn};
  }
  session.duel=working;
  session.policies=nextPolicies;
  delete session.pending[activationId];
  session.resolved[activationId]=structuredClone(result);
  assertSameInventory(before,session.duel);
  assertHandsUnchanged(handsBefore,session.duel);
  assertBattleTargetPolicyRules(session.duel);
  assertTagDuel(session.duel);
  return {...structuredClone(result),state:session.duel};
 }
 function allowedAttackTargets(session:BattleTargetSession,attackerUid:string,availableTargets:AttackTargetOption[]):AttackTargetOption[]{
  assertSession(session);
  if(!Array.isArray(availableTargets))throw new Error('Lista de alvos de ataque inválida.');
  const found=findMonsterAnyTeam(session.duel,attackerUid);
  if(!found)throw new Error('Atacante não está em uma Monster Zone.');
  const attacker=found.monster;
  if(!attacker.faceUp||attacker.position!=='atk')return [];
  const policy=currentPolicy(session,found.team);
  if(!policy)return [...availableTargets];
  return availableTargets.includes(policy.targetUid)?[policy.targetUid]:[];
 }
 function assertAttackTargetAllowed(session:BattleTargetSession,attackerUid:string,targetUid:AttackTargetOption,availableTargets:AttackTargetOption[]):void{
  if(!allowedAttackTargets(session,attackerUid,availableTargets).includes(targetUid)){
   throw new Error('Staunch Defender exige que o monstro ataque o alvo escolhido.');
  }
 }
 function advanceEndPhase(session:BattleTargetSession,endingTeam:number,turn:number):EndPhasePolicyResult{
  assertSession(session);
  if(!validTeam(endingTeam)||!Number.isInteger(turn)||turn<1)throw new Error('End Phase inválida.');
  const receipt=turn+':'+endingTeam;
  if(session.endPhaseReceipts.includes(receipt))return {status:'duplicate',state:session.duel,expiredTargetUids:[]};
  const expired=session.policies.filter(policy=>policy.attackerTeam===endingTeam&&policy.activatedTurn===turn).map(policy=>policy.targetUid);
  session.policies=session.policies.filter(policy=>!(policy.attackerTeam===endingTeam&&policy.activatedTurn===turn));
  session.endPhaseReceipts.push(receipt);
  return {status:expired.length?'advanced':'none',state:session.duel,expiredTargetUids:expired};
 }
 return {createSession,prepareActivation,resolveActivation,allowedAttackTargets,assertAttackTargetAllowed,advanceEndPhase};
}
