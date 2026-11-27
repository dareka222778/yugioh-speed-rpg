import type {Backrow,CardRef} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {rulesFor} from './rulesProfile';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import {synchronizeCardLifetimes} from './cardLifetime';

export const THREATENING_ROAR_ID='36361633';
export const SCRAP_IRON_SCARECROW_ID='98427577';
export type BattlePhaseDenialEffect='threatening-roar'|'scrap-iron-scarecrow';
export type BattlePhaseDenialLookup=(id:string)=>{kind:'trap';effect:BattlePhaseDenialEffect}|undefined;
type Team=0|1;
type Seat=0|1|2|3;
type Plan={
 activationId:string;effect:BattlePhaseDenialEffect;sourceUid:string;sourceCardId:string;
 actorSeat:Seat;sourceOwnerSeat:Seat;controllerTeam:Team;opponentTeam:Team;turn:number;
 attackerUid:string|null
};
type Receipt={
 activationId:string;effect:BattlePhaseDenialEffect;
 status:'attack-lock-created'|'attack-cancelled'|'activation-negated'|'effect-negated';
 sourceUid:string;attackerUid:string|null;turn:number;
 activationNegated:boolean;effectNegated:boolean;replayed:boolean
};
type AttackLock={team:Team;turn:number;sourceUid:string;activationId:string};
export type BattlePhaseDenialSession={
 duel:TagDuel;activations:Record<string,Plan>;receipts:Record<string,Receipt>;attackLocks:AttackLock[]
};
export type BattlePhaseDenialResolution=Receipt&{state:TagDuel};

const defaultLookup:BattlePhaseDenialLookup=(id)=>{
 if(id===THREATENING_ROAR_ID)return {kind:'trap',effect:'threatening-roar'};
 if(id===SCRAP_IRON_SCARECROW_ID)return {kind:'trap',effect:'scrap-iron-scarecrow'};
 return undefined;
};
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function teamForSeat(seat:Seat):Team{return (seat%2) as Team;}
function assertSeat(value:unknown):asserts value is Seat{
 if(!Number.isInteger(value)||Number(value)<0||Number(value)>3)throw new Error('Assento físico inválido.');
}
function assertTeam(value:unknown):asserts value is Team{
 if(value!==0&&value!==1)throw new Error('Equipe inválida.');
}
function assertId(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>128||!/^[a-zA-Z0-9:_-]+$/.test(value)||
  ['__proto__','constructor','prototype'].includes(value))throw new Error(label+' inválido.');
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  if(physicalSeat(card.uid)===null)throw new Error('Carta sem proprietário físico m0–m3: '+card.uid);
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
function assertSameHands(before:string[],duel:TagDuel):void{
 if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel)))throw new Error('O adapter alterou uma mão privada.');
}
export function assertBattlePhaseDenialRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Perfil de regras incompatível com o proprietário.');
 }
 const extraUids=new Set<string>(),main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>3)throw new Error('Equipe excedeu três Monster Zones.');
  if(player.backrow.length>3)throw new Error('Equipe excedeu três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const owner=physicalSeat(uid);
  if(owner===null)throw new Error('Carta sem proprietário físico.');
  if(!getDuelCard(id))throw new Error('Carta sem metadados habilitados no estado de teste: '+id);
  if(extraUids.has(uid)||!!getDuelCard(id)?.fusion)extra[owner]++;else main[owner]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A Field Zone é independente e não consome uma das três Spell/Trap Zones.
}
function locateBackrow(duel:TagDuel,team:Team,uid:string):{team:Team;index:number;card:Backrow}|undefined{
 const backrow=duel.core.players[team].backrow,index=backrow.findIndex(card=>card.uid===uid);
 return index<0?undefined:{team,index,card:backrow[index]};
}
function removeBackrow(duel:TagDuel,location:{team:Team;index:number}):Backrow{
 const [card]=duel.core.players[location.team].backrow.splice(location.index,1);
 if(!card)throw new Error('Armadilha deixou a zona antes da movimentação.');
 return card;
}
function pushToOwnerGrave(duel:TagDuel,ownerSeat:Seat,card:CardRef):void{
 duel.core.players[teamForSeat(ownerSeat)].grave.push({
  uid:card.uid,id:card.id,...(card.properlySummoned?{properlySummoned:true}:{})
 });
}
function locateSetTrap(duel:TagDuel,team:Team,sourceUid:string,turn:number){
 const ownerSeat=physicalSeat(sourceUid);
 if(ownerSeat===null||teamForSeat(ownerSeat)!==team)throw new Error('Armadilha não pertence fisicamente à equipe defensora.');
 const found=locateBackrow(duel,team,sourceUid);
 if(!found)throw new Error('A Armadilha não está na Spell/Trap Zone da equipe defensora.');
 if(found.card.faceUp)throw new Error('A Armadilha já está face-up.');
 if(!Number.isInteger(found.card.setTurn)||found.card.setTurn>=turn)throw new Error('A Armadilha precisa ter sido Baixada antes deste turno.');
 return { ...found,ownerSeat };
}
function readTrapWindow(duel:TagDuel,actorSeat:Seat,turn:number,effect:BattlePhaseDenialEffect){
 if(!Number.isSafeInteger(turn)||turn!==duel.core.turn||duel.core.turnEnding===true||
  duel.core.damageStep===true||duel.core.handFlow!==undefined||!!duel.core.choice||duel.core.chain.length!==0){
  throw new Error('Janela de ativação inválida.');
 }
 const attackerTeam=duel.core.current as Team,defenderTeam=(1-attackerTeam) as Team;
 if(duel.core.priority!==defenderTeam||duel.active[defenderTeam]!==actorSeat){
  throw new Error('Somente o participante ativo da equipe defensora pode ativar esta Armadilha.');
 }
 const pending=duel.core.pending;
 if(effect==='scrap-iron-scarecrow'){
  if(duel.core.phase!=='response'||pending.kind!=='attack'||pending.stage!=='declare'){
   throw new Error('Scrap-Iron Scarecrow só responde à declaração de ataque.');
  }
 }else{
  if(!['main','battle','response'].includes(duel.core.phase)||
   duel.core.phase==='response'&&!(pending.kind==='attack'&&pending.stage==='declare')||
   duel.core.phase!=='response'&&pending.kind!=='none'){
   throw new Error('Threatening Roar exige uma janela livre no turno adversário.');
  }
 }
 let attackerUid:string|null=null;
 if(pending.kind==='attack'){
  const attacker=duel.core.players[attackerTeam].monsters.find(card=>card.uid===pending.card);
  if(!attacker||!attacker.faceUp||attacker.position!=='atk'){
   throw new Error('O atacante não está face-up em Posição de Ataque.');
  }
  attackerUid=attacker.uid;
 }
 return {attackerTeam,defenderTeam,turn,attackerUid};
}
function samePlan(a:Plan,b:Plan):boolean{
 return a.effect===b.effect&&a.sourceUid===b.sourceUid&&a.actorSeat===b.actorSeat&&
  a.turn===b.turn&&a.attackerUid===b.attackerUid;
}
function sameReceipt(a:Receipt,activationNegated:boolean,effectNegated:boolean):boolean{
 return a.activationNegated===activationNegated&&a.effectNegated===effectNegated;
}
function assertSession(session:BattlePhaseDenialSession):void{
 if(!session||!session.duel||!session.activations||!session.receipts||!Array.isArray(session.attackLocks)){
  throw new Error('Sessão de bloqueio de Fase de Batalha inválida.');
 }
 assertBattlePhaseDenialRules(session.duel);
 for(const lock of session.attackLocks){
  if(!lock||!Number.isInteger(lock.turn)||!validTeamValue(lock.team)||typeof lock.sourceUid!=='string'||
   typeof lock.activationId!=='string')throw new Error('Bloqueio de ataque persistido inválido.');
 }
}
function validTeamValue(value:unknown):value is Team{return value===0||value===1;}

export function createBattlePhaseDenialAdapter(lookup:BattlePhaseDenialLookup=defaultLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 return {
  createSession(duel:TagDuel):BattlePhaseDenialSession{
   assertBattlePhaseDenialRules(duel);
   return {duel:structuredClone(duel),activations:Object.create(null) as Record<string,Plan>,
    receipts:Object.create(null) as Record<string,Receipt>,attackLocks:[]};
  },
  activate(session:BattlePhaseDenialSession,input:{activationId:string;sourceUid:string;actorSeat:Seat;turn:number}):{
   activationId:string;effect:BattlePhaseDenialEffect;sourceUid:string;attackerUid:string|null;replayed:boolean
  }{
   assertSession(session);
   assertId(input.activationId,'Identificador de ativação');assertId(input.sourceUid,'UID da Armadilha');assertSeat(input.actorSeat);
   const duel=session.duel;
   const previous=session.activations[input.activationId];
   const sourceLocation=locateSetTrap(duel,(1-duel.core.current) as Team,input.sourceUid,input.turn);
   const info=lookup(sourceLocation.card.id);
   if(!info||info.kind!=='trap')throw new Error('A carta não pertence à família de bloqueio de ataques.');
   const window=readTrapWindow(duel,input.actorSeat,input.turn,info.effect);
   const plan:Plan={
    activationId:input.activationId,effect:info.effect,sourceUid:input.sourceUid,sourceCardId:sourceLocation.card.id,
    actorSeat:input.actorSeat,sourceOwnerSeat:sourceLocation.ownerSeat,controllerTeam:window.defenderTeam,
    opponentTeam:window.attackerTeam,turn:window.turn,attackerUid:window.attackerUid
   };
   if(previous){
    if(!samePlan(previous,plan))throw new Error('Identificador de ativação reutilizado com conteúdo diferente.');
    return {activationId:input.activationId,effect:previous.effect,sourceUid:previous.sourceUid,attackerUid:previous.attackerUid,replayed:true};
   }
   if(session.receipts[input.activationId])throw new Error('Identificador de ativação já resolvido.');
   session.activations[input.activationId]=structuredClone(plan);
   return {activationId:input.activationId,effect:info.effect,sourceUid:input.sourceUid,attackerUid:window.attackerUid,replayed:false};
  },
  resolve(session:BattlePhaseDenialSession,input:{activationId:string;activationNegated?:boolean;effectNegated?:boolean}):Receipt{
   assertSession(session);
   assertId(input.activationId,'Identificador de ativação');
   if(input.activationNegated!==undefined&&typeof input.activationNegated!=='boolean'||
    input.effectNegated!==undefined&&typeof input.effectNegated!=='boolean')throw new Error('Estado de negação inválido.');
   const activationNegated=input.activationNegated===true,effectNegated=input.effectNegated===true;
   const previous=session.receipts[input.activationId];
   if(previous){
    if(!sameReceipt(previous,activationNegated,effectNegated))throw new Error('Resolução repetida com resultado diferente.');
    return {...previous,replayed:true};
   }
   const plan=session.activations[input.activationId];
   if(!plan)throw new Error('Ativação da Armadilha não encontrada.');
   const before=inventorySnapshot(session.duel),handsBefore=handSnapshot(session.duel),next=structuredClone(session.duel);
   const sourceLocation=locateBackrow(next,plan.controllerTeam,plan.sourceUid);
   let status:Receipt['status'];
   if(activationNegated||effectNegated){
    if(sourceLocation){
     const source=removeBackrow(next,sourceLocation);
     pushToOwnerGrave(next,plan.sourceOwnerSeat,source);
    }
    status=activationNegated?'activation-negated':'effect-negated';
   }else if(plan.effect==='threatening-roar'){
    if(!next.attackLocks.some(lock=>lock.team===plan.opponentTeam&&lock.turn===plan.turn)){
     next.attackLocks;
    }
    status='attack-lock-created';
   }else{
    const pending=next.core.pending;
    if(next.core.turn!==plan.turn||next.core.phase!=='response'||pending.kind!=='attack'||
     pending.stage!=='declare'||pending.card!==plan.attackerUid){
     throw new Error('A declaração de ataque mudou antes da resolução; nenhum alvo substituto será escolhido.');
    }
    const attacker=next.core.players[plan.opponentTeam].monsters.find(card=>card.uid===plan.attackerUid);
    if(!attacker||!attacker.faceUp||attacker.position!=='atk')throw new Error('O atacante original deixou de ser válido.');
    pending.cancelled=true;
    if(sourceLocation){
     sourceLocation.card.faceUp=false;
     sourceLocation.card.setTurn=plan.turn;
    }
    status='attack-cancelled';
   }
   if(plan.effect==='threatening-roar'&&!activationNegated&&!effectNegated){
    if(!next.attackLocks.some(lock=>lock.team===plan.opponentTeam&&lock.turn===plan.turn)){
     next.attackLocks.push({team:plan.opponentTeam,turn:plan.turn,sourceUid:plan.sourceUid,activationId:plan.activationId});
    }
    if(sourceLocation){
     const source=removeBackrow(next,sourceLocation);
     pushToOwnerGrave(next,plan.sourceOwnerSeat,source);
    }
   }
   synchronizeCardLifetimes(next.core);
   assertBattlePhaseDenialRules(next);
   assertSameInventory(before,next);assertSameHands(handsBefore,next);
   const result:Receipt={activationId:plan.activationId,effect:plan.effect,status,sourceUid:plan.sourceUid,
    attackerUid:plan.attackerUid,turn:plan.turn,activationNegated,effectNegated,replayed:false};
   session.duel=next;session.attackLocks=next.attackLocks;
   session.receipts[input.activationId]=result;
   return {...result};
  },
  canDeclareAttack(session:BattlePhaseDenialSession,team:Team,turn:number):boolean{
   assertSession(session);assertTeam(team);
   if(!Number.isSafeInteger(turn))throw new Error('Turno inválido.');
   return !session.attackLocks.some(lock=>lock.team===team&&lock.turn===turn);
  }
 };
}
