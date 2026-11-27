import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import {getDuelCard} from './effectRegistry';
import {bindTarget,targetBindingValid,type TargetBinding} from './cardLifetime';
import {monsterEffectsNegated} from './continuousEffects';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import type {CardRef,Monster} from './duelEngine';

export type WarriorSupportEffect='marauding-captain'|'command-knight';
export type WarriorSupportCard={id:string;name:string;kind:'monster';race:'Warrior';level:number;atk:number;defense:number;effect:WarriorSupportEffect};
export type WarriorSupportLookup=(id:string)=>WarriorSupportCard|undefined;
type CardInfo={kind?:string;race?:string;level?:number;atk?:number;defense?:number;fusion?:boolean;monsterType?:string;name?:string};
type Held={deck:CardRef[];hand:CardRef[];extra?:CardRef[]};
export type MaraudingCaptainPlan={
 activationId:string;sourceUid:string;sourceOwnerSeat:number;controllerTeam:0|1;
 sourceBinding:TargetBinding;targetUid:string;targetId:string;targetBinding:TargetBinding;turn:number
};
export type MaraudingCaptainResult={activationId:string;status:'summoned'|'source-lost'|'source-negated'|'no-target'|'field-full';summonedUid?:string;turn:number};
export type WarriorSupportSession={
 duel:TagDuel;lookup:WarriorSupportLookup;pending:MaraudingCaptainPlan|null;
 resolved:Record<string,MaraudingCaptainResult>
};

const cardDefinitions:Record<string,WarriorSupportCard>={
 '02460565':{id:'02460565',name:'Marauding Captain',kind:'monster',race:'Warrior',level:3,atk:1200,defense:400,effect:'marauding-captain'},
 '10375182':{id:'10375182',name:'Command Knight',kind:'monster',race:'Warrior',level:4,atk:1200,defense:1900,effect:'command-knight'}
};
export function defaultWarriorSupportLookup(id:string):WarriorSupportCard|undefined{return cardDefinitions[id];}
function cardInfo(id:string,lookup:WarriorSupportLookup):CardInfo|undefined{return lookup(id)??getDuelCard(id) as CardInfo|undefined;}
function effectOf(id:string,lookup:WarriorSupportLookup):WarriorSupportEffect|undefined{return lookup(id)?.effect;}
function isWarrior(id:string,lookup:WarriorSupportLookup):boolean{return cardInfo(id,lookup)?.race==='Warrior';}
function physicalSeat(uid:string):number{const match=/^m([0-3]):/.exec(uid);if(!match)throw Error('UID físico 2v2 inválido.');return Number(match[1]);}
function holder(duel:TagDuel,seat:number):Held{
 if(!Number.isInteger(seat)||seat<0||seat>3)throw Error('Assento físico inválido.');
 const team=seat%2;
 if(duel.active[team]===seat)return duel.core.players[team];
 const reserve=duel.reserves[seat];
 if(!reserve)throw Error('Mão física não encontrada.');
 return reserve;
}
function findMonster(duel:TagDuel,uid:string):{team:0|1;monster:Monster}|undefined{
 for(let team=0;team<2;team++){const monster=duel.core.players[team].monsters.find(m=>m.uid===uid);if(monster)return {team:team as 0|1,monster};}
 return undefined;
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{return new Map(tagInventory(duel).map(card=>[card.uid,card.id]));}
function assertInventoryUnchanged(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size||[...before].some(([uid,id])=>after.get(uid)!==id))throw Error('A adaptação alterou ou concedeu inventário.');
}
function handSnapshot(duel:TagDuel):Record<number,string[]>{
 const result:Record<number,string[]>={};
 for(let seat=0;seat<4;seat++)result[seat]=holder(duel,seat).hand.map(card=>card.uid).sort();
 return result;
}
function assertOnlyTargetLeftHand(before:Record<number,string[]>,duel:TagDuel,seat:number,targetUid:string):void{
 for(let physical=0;physical<4;physical++){
  const expected=physical===seat?before[physical].filter(uid=>uid!==targetUid):before[physical];
  const actual=holder(duel,physical).hand.map(card=>card.uid).sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('A resolução alterou uma mão física não autorizada.');
 }
}
export function assertWarriorSupportRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw Error('A adaptação exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.id!==RULES_PROFILE.id||rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.extraDeckMax!==5||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.handLimit!==6||rules.handCheck!=='end')throw Error('Perfil clássico do proprietário divergente.');
 if(duel.core.players.some(player=>player.monsters.length>3||player.backrow.length>3))throw Error('Limite de zonas 3+3 excedido.');
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const ref of tagInventory(duel)){
  if(ref.entityKind==='token')continue;
  const seat=physicalSeat(ref.uid),card=getDuelCard(ref.id);
  if(!card)throw Error('Carta fora do catálogo habilitado.');
  if(card.kind==='monster'&&card.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++)if(main[seat]<20||main[seat]>30||extra[seat]>5)throw Error('Deck físico fora dos limites 20–30 / Extra 5.');
}
function assertSession(session:WarriorSupportSession):void{
 if(!session||typeof session!=='object'||!session.duel||typeof session.lookup!=='function'||!session.resolved||typeof session.resolved!=='object'||Array.isArray(session.resolved))throw Error('Sessão Warrior Support inválida.');
 assertWarriorSupportRules(session.duel);
 if(session.pending&&(!session.pending.activationId||!session.pending.sourceUid||!session.pending.targetUid||!session.pending.sourceBinding||!session.pending.targetBinding))throw Error('Plano de recrutamento inválido.');
}
export function createWarriorSupportSession(input:TagDuel,lookup:WarriorSupportLookup=defaultWarriorSupportLookup):WarriorSupportSession{
 assertWarriorSupportRules(input);
 const session:WarriorSupportSession={duel:structuredClone(input),lookup,pending:null,resolved:{}};
 assertSession(session);return session;
}

/** Captures the physical seat's private hand and both card epochs at activation time. */
export function prepareMaraudingCaptain(session:WarriorSupportSession,actorSeat:number,sourceUid:string,targetUid:string,activationId:string):MaraudingCaptainPlan{
 assertSession(session);
 if(session.pending)throw Error('Já existe uma ativação de Marauding Captain pendente.');
 if(!/^[a-zA-Z0-9:_-]{1,80}$/.test(activationId)||session.resolved[activationId])throw Error('Identificador de ativação inválido ou repetido.');
 if(!Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3||physicalSeat(sourceUid)!==actorSeat)throw Error('Assento físico não corresponde ao invocador.');
 const team=actorSeat%2 as 0|1,duel=session.duel,core=duel.core;
 if(duel.active[team]!==actorSeat||duel.cursor!==actorSeat||core.current!==team)throw Error('Somente o assento ativo pode resolver o gatilho.');
 const source=findMonster(duel,sourceUid);
 if(!source||source.team!==team||!source.monster.faceUp||effectOf(source.monster.id,session.lookup)!=='marauding-captain'||source.monster.lastSummonedTurn!==core.turn)throw Error('Marauding Captain não foi Invocado-Normalmente neste turno.');
 if(core.pending.kind!=='summon'||core.pending.actor!==team||core.pending.card!==sourceUid||core.pending.triggersQueued!==true)throw Error('Gatilho não corresponde à Invocação-Normal.');
 const target=holder(duel,actorSeat).hand.find(card=>card.uid===targetUid);
 const targetInfo=target?getDuelCard(target.id):undefined;
 if(!target||!targetInfo||targetInfo.kind!=='monster'||targetInfo.fusion||targetInfo.monsterType==='ritual'||!Number.isInteger(targetInfo.level)||targetInfo.level!>4)throw Error('O alvo deve ser um monstro de Nível 4 ou menor na mão física do invocador.');
 const sourceBinding=bindTarget(core,sourceUid),targetBinding=bindTarget(core,targetUid);
 if(!sourceBinding||!targetBinding)throw Error('Não foi possível vincular as identidades físicas.');
 const plan:MaraudingCaptainPlan={activationId,sourceUid,sourceOwnerSeat:actorSeat,controllerTeam:team,sourceBinding,targetUid,targetId:target.id,targetBinding,turn:core.turn};
 session.pending=plan;assertSession(session);return structuredClone(plan);
}

/** Resolves once; a moved target is never replaced by a new card from the hand. */
export function resolveMaraudingCaptain(session:WarriorSupportSession,activationId:string):MaraudingCaptainResult{
 assertSession(session);
 const cached=session.resolved[activationId];if(cached)return structuredClone(cached);
 const plan=session.pending;if(!plan||plan.activationId!==activationId)throw Error('Ativação de Marauding Captain não encontrada.');
 const beforeInventory=inventorySnapshot(session.duel),beforeHands=handSnapshot(session.duel),working=structuredClone(session.duel);
 let status:MaraudingCaptainResult['status']='no-target',summonedUid:string|undefined;
 const source=findMonster(working,plan.sourceUid);
 if(!source||!targetBindingValid(working.core,plan.sourceBinding))status='source-lost';
 else if(!source.monster.faceUp||monsterEffectsNegated(working.core,plan.sourceUid))status='source-negated';
 else{
  const hand=holder(working,plan.sourceOwnerSeat).hand,target=hand.find(card=>card.uid===plan.targetUid);
  const info=target?getDuelCard(target.id):undefined;
  if(!target||target.id!==plan.targetId||!targetBindingValid(working.core,plan.targetBinding)||!info||info.kind!=='monster'||info.fusion||info.monsterType==='ritual'||!Number.isInteger(info.level)||info.level!>4)status='no-target';
  else if(working.core.players[plan.controllerTeam].monsters.length>=rulesFor(working.core).monsterZones)status='field-full';
  else{
   const [ref]=hand.splice(hand.findIndex(card=>card.uid===plan.targetUid),1);
   const monster:Monster={...ref,position:'atk',faceUp:true,entered:working.core.turn,lastSummonedTurn:working.core.turn,changed:working.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:plan.controllerTeam};
   working.core.players[plan.controllerTeam].monsters.push(monster);summonedUid=monster.uid;status='summoned';
  }
 }
 session.duel=working;session.pending=null;
 const result:MaraudingCaptainResult={activationId,status,...summonedUid?{summonedUid}:{},turn:plan.turn};
 session.resolved[activationId]=result;
 assertSession(session);assertInventoryUnchanged(beforeInventory,session.duel);
 if(status==='summoned')assertOnlyTargetLeftHand(beforeHands,session.duel,plan.sourceOwnerSeat,plan.targetUid);
 else if(JSON.stringify(beforeHands)!==JSON.stringify(handSnapshot(session.duel)))throw Error('Uma resolução sem Invocação-Especial alterou mãos.');
 return structuredClone(result);
}

/** This is a card-specific permission, not a replacement for the engine's full attack legality check. */
export function warriorSupportAllowsAttackTarget(duel:TagDuel,attackerTeam:number,targetUid:string,lookup:WarriorSupportLookup=defaultWarriorSupportLookup):boolean{
 assertWarriorSupportRules(duel);
 if(attackerTeam!==0&&attackerTeam!==1)throw Error('Equipe atacante inválida.');
 const target=findMonster(duel,targetUid);if(!target)return false;if(target.team===attackerTeam)return true;
 const targetInfo=cardInfo(target.monster.id,lookup);
 if(targetInfo?.race==='Warrior'){
  for(const source of duel.core.players[target.team].monsters){
   if(source.uid!==targetUid&&source.faceUp&&effectOf(source.id,lookup)==='marauding-captain'&&!monsterEffectsNegated(duel.core,source.uid))return false;
  }
 }
 if(effectOf(target.monster.id,lookup)==='command-knight'&&target.monster.faceUp&&!monsterEffectsNegated(duel.core,targetUid)){
  if(duel.core.players[target.team].monsters.some(monster=>monster.uid!==targetUid))return false;
 }
 return true;
}

/** One active Command Knight contributes +400 ATK to each face-up Warrior on its team. */
export function warriorSupportAtkBonus(duel:TagDuel,monsterUid:string,lookup:WarriorSupportLookup=defaultWarriorSupportLookup):number{
 assertWarriorSupportRules(duel);
 const target=findMonster(duel,monsterUid);if(!target||!target.monster.faceUp||!isWarrior(target.monster.id,lookup))return 0;
 return duel.core.players[target.team].monsters.filter(source=>source.faceUp&&effectOf(source.id,lookup)==='command-knight'&&!monsterEffectsNegated(duel.core,source.uid)).length*400;
}
