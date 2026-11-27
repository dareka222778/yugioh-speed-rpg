import type {Backrow,CardRef,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {bindTarget,targetBindingValid,synchronizeCardLifetimes,type TargetBinding} from './cardLifetime';
import {sendMonsterToGrave} from './monsterExit';

export const BAZOO_THE_SOUL_EATER_ID='40133511';
export const BAZOO_THE_SOUL_EATER_KONAMI_CID=5250;
export const SKULL_LAIR_ID='06733059';
export const SKULL_LAIR_KONAMI_CID=5264;
export type BanishCostTeam=0|1;
export type BanishCostSeat=0|1|2|3;
export type BanishCostEffect='bazoo'|'skull-lair';
export type BanishCostLookup=(id:string)=>{kind:'monster'|'trap';effect:BanishCostEffect}|undefined;
export type BazooPlan={activationId:string;sourceUid:string;sourceTeam:BanishCostTeam;sourceSeat:BanishCostSeat;sourceBinding:TargetBinding;turn:number;banishedUids:string[];atkGain:number;expiresAfterTurn:number};
export type SkullLairPlan={activationId:string;sourceUid:string;sourceTeam:BanishCostTeam;sourceSeat:BanishCostSeat;sourceBinding:TargetBinding;turn:number;banishedUids:string[];requiredLevel:number};
export type BazooActivationReceipt={activationId:string;sourceUid:string;banishedUids:string[];atkGain:number;expiresAfterTurn:number;replayed:boolean};
export type SkullLairActivationReceipt={activationId:string;sourceUid:string;banishedUids:string[];requiredLevel:number;replayed:boolean};
export type BazooResolution={activationId:string;sourceUid:string;atkGain:number;expiresAfterTurn:number;status:'boosted'|'effect-negated'|'source-left-field';replayed:boolean};
export type SkullLairResolution={activationId:string;sourceUid:string;requiredLevel:number;targetUid?:string;status:'destroyed'|'source-left-field'|'activation-negated'|'effect-negated'|'no-eligible-target'|'target-required'|'target-not-eligible';replayed:boolean};
export type BazooBonus={sourceUid:string;sourceTeam:BanishCostTeam;sourceBinding:TargetBinding;amount:number;expiresAfterTurn:number};
export type GraveyardBanishCostSession={duel:TagDuel;bazooPending:Record<string,BazooPlan>;bazooResolved:Record<string,BazooResolution>;bazooActivations:Record<string,BazooActivationReceipt>;bazooUsedTurn:Record<string,number>;bazooBonuses:Record<string,BazooBonus>;skullPending:Record<string,SkullLairPlan>;skullResolved:Record<string,SkullLairResolution>;skullActivations:Record<string,SkullLairActivationReceipt>};

const isTeam=(v:unknown):v is BanishCostTeam=>v===0||v===1;
const isSeat=(v:unknown):v is BanishCostSeat=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=3;
function assertId(v:unknown,label:string,max=128):asserts v is string{
 if(typeof v!=='string'||!v.trim()||v.length>max||!/^[a-zA-Z0-9:_-]+$/.test(v))throw new Error(label+' inválido.');
}
function teamForSeat(seat:BanishCostSeat):BanishCostTeam{return (seat%2) as BanishCostTeam;}
function physicalSeat(uid:string):BanishCostSeat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as BanishCostSeat:null;
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
 if(after.size!==before.size)throw new Error('A resolução alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A resolução alterou a identidade física: '+uid);
}
export function assertGraveyardBanishCostRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
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
 // A mão pode exceder seis durante o turno; a checagem ocorre somente na End Phase.
}
function findMonster(duel:TagDuel,uid:string):{team:BanishCostTeam;monster:Monster}|undefined{
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(m=>m.uid===uid);if(monster)return {team,monster};}
 return undefined;
}
function findBackrow(duel:TagDuel,team:BanishCostTeam,uid:string):Backrow|undefined{return duel.core.players[team].backrow.find(card=>card.uid===uid);}
function sourceStillMonster(duel:TagDuel,uid:string,team:BanishCostTeam,binding:TargetBinding):boolean{
 const found=findMonster(duel,uid);
 return binding.zone==='monsters'&&targetBindingValid(duel.core,binding)&&!!found?.monster.faceUp&&found?.team===team;
}
function sourceStillBackrow(duel:TagDuel,plan:SkullLairPlan):boolean{
 const source=findBackrow(duel,plan.sourceTeam,plan.sourceUid);
 return plan.sourceBinding.zone==='backrow'&&targetBindingValid(duel.core,plan.sourceBinding)&&!!source?.faceUp&&source.resolved===true;
}
function assertBazooWindow(duel:TagDuel,team:BanishCostTeam,seat:BanishCostSeat):void{
 if(!isTeam(team)||!isSeat(seat)||duel.cursor!==seat||duel.active[team]!==seat||duel.core.current!==team||
  duel.core.phase!=='main'||duel.core.resume!=='main'||duel.core.pending.kind!=='none'||duel.core.chain.length!==0||duel.core.priority!==team){
  throw new Error('Bazoo só pode ativar na Main Phase do assento ativo.');
 }
}
function assertSkullLairWindow(duel:TagDuel,team:BanishCostTeam,seat:BanishCostSeat):void{
 if(!isTeam(team)||!isSeat(seat)||duel.active[team]!==seat)throw new Error('Assento ativo da equipe inválido.');
 if(duel.core.phase==='main'||duel.core.phase==='battle'){
  const resume=duel.core.phase==='battle'?'battle':'main';
  if(duel.cursor!==seat||duel.core.current!==team||duel.core.resume!==resume)throw new Error('Skull Lair não pertence à janela ativa.');
  return;
 }
 if(duel.core.phase==='response'&&duel.core.priority===team&&(duel.core.resume==='main'||duel.core.resume==='battle'))return;
 throw new Error('Skull Lair exige Main/Battle Phase própria ou janela de resposta.');
}
function payMonsterBanishCost(duel:TagDuel,team:BanishCostTeam,uids:readonly string[]):TagDuel{
 if(!Array.isArray(uids)||uids.length<1||uids.length>30||new Set(uids).size!==uids.length)throw new Error('Custo de banimento deve conter de 1 a 30 UIDs distintos.');
 const before=inventorySnapshot(duel),next=structuredClone(duel),player=next.core.players[team],selected:CardRef[]=[];
 for(const uid of uids){
  assertId(uid,'UID de custo');
  const card=player.grave.find(c=>c.uid===uid);
  if(!card||card.entityKind==='token'||getDuelCard(card.id)?.kind!=='monster')throw new Error('Custo inválido: somente monstros do Cemitério da equipe controladora.');
  selected.push(card);
 }
 const set=new Set(uids);player.grave=player.grave.filter(card=>!set.has(card.uid));player.banished??=[];player.banished.push(...selected);
 synchronizeCardLifetimes(next.core);assertTagDuel(next);assertSameInventory(before,next);return next;
}
function sameIds(a:readonly string[],b:readonly string[]):boolean{return JSON.stringify(a)===JSON.stringify(b);}
function assertSession(session:GraveyardBanishCostSession):void{
 if(!session||!session.duel||!session.bazooPending||!session.bazooResolved||!session.bazooActivations||
  !session.bazooUsedTurn||!session.bazooBonuses||!session.skullPending||!session.skullResolved||!session.skullActivations)throw new Error('Sessão M680 inválida.');
 assertTagDuel(session.duel);assertGraveyardBanishCostRules(session.duel);
}
export const defaultGraveyardBanishCostLookup:BanishCostLookup=(id)=>{
 if(id===BAZOO_THE_SOUL_EATER_ID)return {kind:'monster',effect:'bazoo'};
 if(id===SKULL_LAIR_ID)return {kind:'trap',effect:'skull-lair'};
 return undefined;
};

export function createGraveyardBanishCostAdapter(lookup:BanishCostLookup=defaultGraveyardBanishCostLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):GraveyardBanishCostSession{
  assertTagDuel(duel);assertGraveyardBanishCostRules(duel);
  return {duel:structuredClone(duel),bazooPending:{},bazooResolved:{},bazooActivations:{},bazooUsedTurn:{},bazooBonuses:{},skullPending:{},skullResolved:{},skullActivations:{}};
 }
 function activateBazoo(session:GraveyardBanishCostSession,activationId:string,sourceUid:string,activeSeat:BanishCostSeat,banishedUids:readonly string[]):BazooActivationReceipt{
  assertSession(session);assertId(activationId,'ID de ativação');assertId(sourceUid,'UID da fonte');
  const previous=session.bazooActivations[activationId];
  if(previous){
   if(previous.sourceUid!==sourceUid||!sameIds(previous.banishedUids,banishedUids))throw new Error('ID de ativação Bazoo reutilizado com fatos diferentes.');
   return {...previous,replayed:true};
  }
  const found=findMonster(session.duel,sourceUid);
  if(!found||!found.monster.faceUp||lookup(found.monster.id)?.kind!=='monster'||lookup(found.monster.id)?.effect!=='bazoo')throw new Error('Fonte Bazoo não está face-up no campo.');
  assertBazooWindow(session.duel,found.team,activeSeat);
  if(!Array.isArray(banishedUids)||banishedUids.length<1||banishedUids.length>3)throw new Error('Bazoo deve banir de 1 a 3 monstros.');
  const sourceSeat=physicalSeat(sourceUid);if(sourceSeat===null)throw new Error('Fonte Bazoo sem proprietário físico.');
  const binding=bindTarget(session.duel.core,sourceUid);if(!binding||binding.zone!=='monsters')throw new Error('Binding da fonte Bazoo ausente.');
  const useKey=sourceUid+'@'+binding.epoch;
  if(session.bazooUsedTurn[useKey]===session.duel.core.turn)throw new Error('Bazoo já ativou neste turno.');
  const turn=session.duel.core.turn,team=found.team,amount=banishedUids.length*300,expiresAfterTurn=turn+1;
  const next=payMonsterBanishCost(session.duel,team,banishedUids);session.duel=next;session.bazooUsedTurn[useKey]=turn;
  const plan:BazooPlan={activationId,sourceUid,sourceTeam:team,sourceSeat,sourceBinding:binding,turn,banishedUids:[...banishedUids],atkGain:amount,expiresAfterTurn};
  session.bazooPending[activationId]=plan;
  const receipt:BazooActivationReceipt={activationId,sourceUid,banishedUids:[...banishedUids],atkGain:amount,expiresAfterTurn,replayed:false};
  session.bazooActivations[activationId]=receipt;assertSession(session);return receipt;
 }
 function resolveBazoo(session:GraveyardBanishCostSession,activationId:string,options:{negated?:boolean}={}):BazooResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.bazooResolved[activationId];if(previous)return {...previous,replayed:true};
  const plan=session.bazooPending[activationId];if(!plan)throw new Error('Ativação Bazoo não encontrada.');
  let status:BazooResolution['status'];
  if(options.negated)status='effect-negated';
  else if(!sourceStillMonster(session.duel,plan.sourceUid,plan.sourceTeam,plan.sourceBinding))status='source-left-field';
  else{session.bazooBonuses[plan.sourceUid]={sourceUid:plan.sourceUid,sourceTeam:plan.sourceTeam,sourceBinding:plan.sourceBinding,amount:plan.atkGain,expiresAfterTurn:plan.expiresAfterTurn};status='boosted';}
  const result:BazooResolution={activationId,sourceUid:plan.sourceUid,atkGain:plan.atkGain,expiresAfterTurn:plan.expiresAfterTurn,status,replayed:false};
  delete session.bazooPending[activationId];session.bazooResolved[activationId]=result;assertSession(session);return result;
 }
 function bazooBonus(session:GraveyardBanishCostSession,uid:string):number{
  assertSession(session);const bonus=session.bazooBonuses[uid];if(!bonus)return 0;
  if(session.duel.core.turn>bonus.expiresAfterTurn||!sourceStillMonster(session.duel,bonus.sourceUid,bonus.sourceTeam,bonus.sourceBinding)){delete session.bazooBonuses[uid];return 0;}
  return bonus.amount;
 }
 function effectiveAtk(session:GraveyardBanishCostSession,uid:string):number|undefined{
  const found=findMonster(session.duel,uid);if(!found)return;
  return Math.max(0,(getDuelCard(found.monster.id)?.atk??0)+found.monster.atkBoost+bazooBonus(session,uid));
 }
 function expireBazooBonuses(session:GraveyardBanishCostSession,completedTurn:number,completedTeam:BanishCostTeam):string[]{
  assertSession(session);if(!Number.isSafeInteger(completedTurn)||completedTurn<1||!isTeam(completedTeam))throw new Error('Janela de expiração Bazoo inválida.');
  const expired:string[]=[];
  for(const [uid,bonus] of Object.entries(session.bazooBonuses)){
   if(completedTurn>=bonus.expiresAfterTurn&&completedTeam!==bonus.sourceTeam){delete session.bazooBonuses[uid];expired.push(uid);}
  }
  assertSession(session);return expired;
 }
 function activateSkullLair(session:GraveyardBanishCostSession,activationId:string,sourceUid:string,activeSeat:BanishCostSeat,banishedUids:readonly string[]):SkullLairActivationReceipt{
  assertSession(session);assertId(activationId,'ID de ativação');assertId(sourceUid,'UID da fonte');
  const previous=session.skullActivations[activationId];
  if(previous){
   if(previous.sourceUid!==sourceUid||!sameIds(previous.banishedUids,banishedUids))throw new Error('ID de ativação Skull Lair reutilizado com fatos diferentes.');
   return {...previous,replayed:true};
  }
  const sourceSeat=physicalSeat(sourceUid);if(sourceSeat===null)throw new Error('Fonte Skull Lair sem proprietário físico.');
  const team=teamForSeat(activeSeat),source=findBackrow(session.duel,team,sourceUid);
  if(!source||!source.faceUp||source.resolved!==true||source.setTurn>=session.duel.core.turn||
   lookup(source.id)?.kind!=='trap'||lookup(source.id)?.effect!=='skull-lair')throw new Error('Skull Lair precisa estar face-up e resolvida na Spell/Trap Zone.');
  assertSkullLairWindow(session.duel,team,activeSeat);
  if(!Array.isArray(banishedUids)||banishedUids.length<1||banishedUids.length>30)throw new Error('Skull Lair deve banir ao menos um monstro.');
  const binding=bindTarget(session.duel.core,sourceUid);if(!binding||binding.zone!=='backrow')throw new Error('Binding da fonte Skull Lair ausente.');
  const next=payMonsterBanishCost(session.duel,team,banishedUids);session.duel=next;
  const plan:SkullLairPlan={activationId,sourceUid,sourceTeam:team,sourceSeat,sourceBinding:binding,turn:session.duel.core.turn,banishedUids:[...banishedUids],requiredLevel:banishedUids.length};
  session.skullPending[activationId]=plan;
  const receipt:SkullLairActivationReceipt={activationId,sourceUid,banishedUids:[...banishedUids],requiredLevel:banishedUids.length,replayed:false};
  session.skullActivations[activationId]=receipt;assertSession(session);return receipt;
 }
 function resolveSkullLair(session:GraveyardBanishCostSession,activationId:string,targetUid?:string,options:{negatedActivation?:boolean;negatedEffect?:boolean}={}):SkullLairResolution{
  assertSession(session);assertId(activationId,'ID de ativação');
  const previous=session.skullResolved[activationId];if(previous)return {...previous,replayed:true};
  const plan=session.skullPending[activationId];if(!plan)throw new Error('Ativação Skull Lair não encontrada.');
  let status:SkullLairResolution['status'];
  if(options.negatedActivation)status='activation-negated';
  else if(options.negatedEffect)status='effect-negated';
  else if(!sourceStillBackrow(session.duel,plan))status='source-left-field';
  else{
   const eligible=session.duel.core.players.flatMap(player=>player.monsters.filter(monster=>monster.faceUp&&getDuelCard(monster.id)?.kind==='monster'&&getDuelCard(monster.id)?.level===plan.requiredLevel));
   if(!eligible.length)status='no-eligible-target';
   else if(!targetUid)return {activationId,sourceUid:plan.sourceUid,requiredLevel:plan.requiredLevel,status:'target-required',replayed:false};
   else{
    const chosen=eligible.find(monster=>monster.uid===targetUid);
    if(!chosen)return {activationId,sourceUid:plan.sourceUid,requiredLevel:plan.requiredLevel,targetUid,status:'target-not-eligible',replayed:false};
    const before=inventorySnapshot(session.duel),next=structuredClone(session.duel);
    if(!sendMonsterToGrave(next.core,targetUid,false,'destroy'))status='no-eligible-target';
    else{assertTagDuel(next);assertSameInventory(before,next);session.duel=next;status='destroyed';}
   }
  }
  const result:SkullLairResolution={activationId,sourceUid:plan.sourceUid,requiredLevel:plan.requiredLevel,...(targetUid?{targetUid}:{}),status,replayed:false};
  delete session.skullPending[activationId];session.skullResolved[activationId]=result;assertSession(session);return result;
 }
 return {createSession,activateBazoo,resolveBazoo,bazooBonus,effectiveAtk,expireBazooBonuses,activateSkullLair,resolveSkullLair};
}
