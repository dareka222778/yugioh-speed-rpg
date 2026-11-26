import type {DuelState,Monster,Backrow} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {rulesFor} from './rulesProfile';
import {canAffectMonster} from './continuousEffects';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {removeToken} from './tokens';

export const AXE_OF_DESPAIR_ID='40619825';
export const BLACK_PENDANT_ID='65169794';
export type EquipStatEffect='axe-of-despair'|'black-pendant';
type Team=0|1;
type Seat=0|1|2|3;
type CardKind='monster'|'spell'|'trap';
export type EquipStatCardInfo={kind:CardKind;name?:string};
export type EquipStatLookup=(id:string)=>EquipStatCardInfo|undefined;
export type EquipStatAction={
 kind:'equip';card:string;target:string;effect:EquipStatEffect;sourceLocation:'hand'|'backrow'
};
type Rule={atk:number;def:number};
const RULES:Record<EquipStatEffect,Rule>={
 'axe-of-despair':{atk:1000,def:0},
 'black-pendant':{atk:500,def:0}
};
type PendingEquip={
 activationId:string;effect:EquipStatEffect;sourceUid:string;sourceId:string;
 sourceOwnerSeat:Seat;controllerTeam:Team;controllerSeat:Seat;turn:number;
 targetUid:string;targetBinding:TargetBinding;atk:number;def:number
};
type ActiveEquip=PendingEquip&{appliedAtk:number;appliedDef:number};
type SentEquip={
 activationId:string;effect:EquipStatEffect;sourceUid:string;sourceId:string;
 sourceOwnerSeat:Seat;ownerTeam:Team
};
export type EquipStatSession={
 duel:TagDuel;pending:Record<string,PendingEquip>;active:Record<string,ActiveEquip>;
 sent:Record<string,SentEquip>;resolved:string[];triggered:string[]
};
export type EquipStatResolution={
 activationId:string;effect:EquipStatEffect;negated:boolean;applied:boolean;sourceSentToGrave:boolean
};
export type EquipStatRelease={
 activationId:string;equipSentToGrave:boolean;removedAtk:number;removedDef:number;triggerQueued:boolean
};
export type AxeGraveTriggerResult={
 activationId:string;status:'returned-to-deck'|'declined'|'duplicate';tributeUid?:string
};
export type BlackPendantTriggerResult={
 activationId:string;status:'resolved'|'duplicate';applied:boolean;damage:number;winner:Team|null
};

function isTeam(value:unknown):value is Team{return value===0||value===1;}
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function findMonster(core:DuelState,uid:string):{team:Team;monster:Monster}|undefined{
 for(const team of [0,1] as const){
  const monster=core.players[team].monsters.find(card=>card.uid===uid);
  if(monster)return {team,monster};
 }
}
function findBackrow(core:DuelState,uid:string):{team:Team;card:Backrow}|undefined{
 for(const team of [0,1] as const){
  const card=core.players[team].backrow.find(item=>item.uid===uid);
  if(card)return {team,card};
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(item=>item.entityKind!=='token')){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  if(physicalSeat(card.uid)===null)throw new Error('UID sem proprietário físico m0–m3.');
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id){
  throw new Error('A operação alterou a identidade física: '+uid);
 }
}
export function assertPhysicalExtraDeckCounts(extraCounts:readonly number[],maximum=5):void{
 if(!Array.isArray(extraCounts)||extraCounts.length!==4||!Number.isSafeInteger(maximum)||maximum<0||
  extraCounts.some(count=>!Number.isSafeInteger(count)||count<0)){
  throw new Error('Contagem do Deck Adicional inválida.');
 }
 if(extraCounts.some(count=>count>maximum))throw new Error('Deck Adicional físico excede cinco cartas.');
}
/** Enforces the owner's 2v2 rules; hand overflow is checked only by End Phase. */
export function assertEquipStatRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('Equip Stats exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Perfil de regras incompatível com o proprietário.');
 }
 const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
 for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
 for(const [seat,held] of Object.entries(duel.reserves)){
  if(!/^[0-3]$/.test(seat))throw new Error('Assento físico de reserva inválido.');
  for(const card of held.extra??[])extraUids.add(card.uid);
 }
 for(const card of tagInventory(duel).filter(item=>item.entityKind!=='token')){
  const seat=physicalSeat(card.uid);
  if(seat===null)throw new Error('UID sem proprietário físico m0–m3.');
  if(extraUids.has(card.uid))extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++)if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax){
  throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
 }
 assertPhysicalExtraDeckCounts(extra,rules.extraDeckMax);
 for(const player of duel.core.players){
  if(player.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu as três Monster Zones.');
  if(player.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu as três Spell/Trap Zones.');
  // The Field Zone remains independent from the three shared Spell/Trap Zones.
 }
}
function sourceIdFor(effect:EquipStatEffect,override?:string):string{
 return override??(effect==='axe-of-despair'?AXE_OF_DESPAIR_ID:BLACK_PENDANT_ID);
}
function mainPhaseTeam(duel:TagDuel):Team|null{
 const core=duel.core,team=core.current;
 if(!isTeam(team)||core.phase!=='main'||core.pending.kind!=='none'||core.chain.length!==0||
  core.turnEnding||core.choice||core.priority!==team)return null;
 return team;
}
function locateSource(
 duel:TagDuel,team:Team,uid:string,cardId:string,lookup:EquipStatLookup
):{location:'hand'|'backrow';ownerSeat:Seat}|undefined{
 const ownerSeat=physicalSeat(uid);
 if(ownerSeat===null||ownerSeat%2!==team||lookup(cardId)?.kind!=='spell')return;
 const hand=duel.core.players[team].hand.find(card=>card.uid===uid&&card.id===cardId);
 if(hand&&ownerSeat===duel.active[team])return {location:'hand',ownerSeat};
 const field=duel.core.players[team].backrow.find(card=>card.uid===uid&&card.id===cardId);
 if(field&&!field.faceUp&&field.setTurn<duel.core.turn)return {location:'backrow',ownerSeat};
}
function sourceCandidates(
 duel:TagDuel,team:Team,cardId:string,lookup:EquipStatLookup
):Array<{uid:string;location:'hand'|'backrow'}>{
 const out:Array<{uid:string;location:'hand'|'backrow'}>=[];
 for(const card of duel.core.players[team].hand){
  if(locateSource(duel,team,card.uid,cardId,lookup)?.location==='hand')out.push({uid:card.uid,location:'hand'});
 }
 for(const card of duel.core.players[team].backrow){
  if(locateSource(duel,team,card.uid,cardId,lookup)?.location==='backrow')out.push({uid:card.uid,location:'backrow'});
 }
 return out;
}
function activationIdValid(input:EquipStatSession,id:string):boolean{
 return typeof id==='string'&&!!id.trim()&&id.length<=128&&!input.pending[id]&&
  !input.active[id]&&!input.sent[id]&&!input.resolved.includes(id);
}
function moveSpellTrapToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
 const location=findBackrow(core,uid),ownerSeat=physicalSeat(uid);
 if(!location||location.team!==controller||ownerSeat===null)return false;
 core.players[controller].backrow=core.players[controller].backrow.filter(card=>card.uid!==uid);
 core.players[ownerSeat%2].grave.push({
  uid:location.card.uid,id:location.card.id,
  ...(location.card.properlySummoned?{properlySummoned:true}:{})
 });
 synchronizeCardLifetimes(core);
 return true;
}
function moveMonsterToPhysicalOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
 const found=findMonster(core,uid);
 if(!found||found.team!==controller)return false;
 if(found.monster.entityKind==='token'){
  const removed=removeToken(core,uid,'return');
  synchronizeCardLifetimes(core);
  return removed;
 }
 const ownerSeat=physicalSeat(uid);
 if(ownerSeat===null)return false;
 core.players[controller].monsters=core.players[controller].monsters.filter(card=>card.uid!==uid);
 core.players[ownerSeat%2].grave.push({
  uid:found.monster.uid,id:found.monster.id,
  ...(found.monster.properlySummoned?{properlySummoned:true}:{})
 });
 synchronizeCardLifetimes(core);
 return true;
}
function putEquipOnField(
 core:DuelState,team:Team,sourceUid:string,sourceId:string,targetUid:string,location:'hand'|'backrow'
):void{
 if(location==='hand'){
  const hand=core.players[team].hand,index=hand.findIndex(card=>card.uid===sourceUid&&card.id===sourceId);
  if(index<0)throw new Error('O Equip deixou a mão antes da ativação.');
  const [card]=hand.splice(index,1);
  core.players[team].backrow.push({
   ...card,faceUp:true,setTurn:core.turn,resolved:false,equippedTo:targetUid
  });
 }else{
  const card=core.players[team].backrow.find(item=>item.uid===sourceUid&&item.id===sourceId);
  if(!card||card.faceUp||card.setTurn>=core.turn)throw new Error('O Equip preparado não está disponível.');
  card.faceUp=true;card.resolved=false;card.equippedTo=targetUid;
 }
 core.chain.push({actor:team,card:sourceUid,id:sourceId,target:targetUid});
 core.phase='response';core.resume='main';core.pending={kind:'none'};
 core.priority=1-team;core.passes=0;
 synchronizeCardLifetimes(core);
}
function queueSent(next:EquipStatSession,activation:PendingEquip):void{
 next.sent[activation.activationId]={
  activationId:activation.activationId,effect:activation.effect,sourceUid:activation.sourceUid,
  sourceId:activation.sourceId,sourceOwnerSeat:activation.sourceOwnerSeat,
  ownerTeam:(activation.sourceOwnerSeat%2) as Team
 };
}
function physicalDeck(duel:TagDuel,seat:Seat){
 const team=(seat%2) as Team;
 if(duel.active[team]===seat)return duel.core.players[team].deck;
 const held=duel.reserves[String(seat)];
 if(!held)throw new Error('Deck físico do proprietário indisponível.');
 return held.deck;
}
function sourceInOwnerGrave(duel:TagDuel,entry:SentEquip):number{
 return duel.core.players[entry.ownerTeam].grave.findIndex(card=>
  card.uid===entry.sourceUid&&card.id===entry.sourceId);
}
function finishSession(next:EquipStatSession,before:Map<string,string>):void{
 synchronizeCardLifetimes(next.duel.core);
 assertSameInventory(before,next.duel);
 assertEquipStatRules(next.duel);
}
function actionsFor(
 duel:TagDuel,lookup:EquipStatLookup,effect:EquipStatEffect,options:{cardId?:string}={}
):EquipStatAction[]{
 assertEquipStatRules(duel);
 const team=mainPhaseTeam(duel);
 if(team===null)return [];
 const cardId=sourceIdFor(effect,options.cardId);
 if(lookup(cardId)?.kind!=='spell')return [];
 const sources=sourceCandidates(duel,team,cardId,lookup).filter(source=>
  source.location==='backrow'||duel.core.players[team].backrow.length<3);
 const targets=duel.core.players.flatMap(player=>player.monsters).filter(monster=>
  monster.faceUp&&lookup(monster.id)?.kind==='monster'&&canAffectMonster(duel.core,monster.uid,'spell'));
 return sources.flatMap(source=>targets.map(target=>({
  kind:'equip' as const,card:source.uid,target:target.uid,effect,sourceLocation:source.location
 })));
}
export function axeOfDespairActions(
 duel:TagDuel,lookup:EquipStatLookup,options:{cardId?:string}={}
):EquipStatAction[]{return actionsFor(duel,lookup,'axe-of-despair',options);}
export function blackPendantActions(
 duel:TagDuel,lookup:EquipStatLookup,options:{cardId?:string}={}
):EquipStatAction[]{return actionsFor(duel,lookup,'black-pendant',options);}
export function createEquipStatSession(duel:TagDuel):EquipStatSession{
 assertEquipStatRules(duel);
 return {duel:structuredClone(duel),pending:{},active:{},sent:{},resolved:[],triggered:[]};
}
function activate(
 input:EquipStatSession,sourceUid:string,activationId:string,lookup:EquipStatLookup,
 effect:EquipStatEffect,options:{cardId?:string;targetUid:string}
):EquipStatSession{
 if(!activationIdValid(input,activationId))throw new Error('ID de ativação ausente ou duplicado.');
 assertEquipStatRules(input.duel);
 const team=mainPhaseTeam(input.duel);
 if(team===null)throw new Error('Equip Spell só pode ser ativado na Main Phase da equipe.');
 const cardId=sourceIdFor(effect,options.cardId);
 const legal=actionsFor(input.duel,lookup,effect,{cardId});
 const action=legal.find(item=>item.card===sourceUid&&item.target===options.targetUid);
 if(!action)throw new Error('Equip Spell sem alvo legal ou fonte fora da zona física permitida.');
 const source=locateSource(input.duel,team,sourceUid,cardId,lookup);
 const target=findMonster(input.duel.core,options.targetUid);
 const targetBinding=bindTarget(input.duel.core,options.targetUid);
 if(!source||!target||!targetBinding||targetBinding.zone!=='monsters'){
  throw new Error('O Equip ou o monstro-alvo saiu da zona esperada.');
 }
 const before=inventorySnapshot(input.duel),next=structuredClone(input);
 putEquipOnField(next.duel.core,team,sourceUid,cardId,options.targetUid,source.location);
 next.pending[activationId]={
  activationId,effect,sourceUid,sourceId:cardId,sourceOwnerSeat:source.ownerSeat,
  controllerTeam:team,controllerSeat:next.duel.active[team] as Seat,turn:next.duel.core.turn,
  targetUid:options.targetUid,targetBinding,atk:RULES[effect].atk,def:RULES[effect].def
 };
 finishSession(next,before);
 return next;
}
export function activateAxeOfDespair(
 input:EquipStatSession,sourceUid:string,activationId:string,lookup:EquipStatLookup,
 options:{cardId?:string;targetUid:string}
):EquipStatSession{return activate(input,sourceUid,activationId,lookup,'axe-of-despair',options);}
export function activateBlackPendant(
 input:EquipStatSession,sourceUid:string,activationId:string,lookup:EquipStatLookup,
 options:{cardId?:string;targetUid:string}
):EquipStatSession{return activate(input,sourceUid,activationId,lookup,'black-pendant',options);}
export function resolveEquipStat(
 input:EquipStatSession,activationId:string,options:{sourceActivationNegated?:boolean}={}
):{session:EquipStatSession;result:EquipStatResolution}{
 const activation=input.pending[activationId];
 if(!activation||input.resolved.includes(activationId))throw new Error('Ativação de Equip Stats ausente ou já resolvida.');
 assertEquipStatRules(input.duel);
 const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 const ownIndex=core.chain.findIndex(link=>link.actor===activation.controllerTeam&&
  link.card===activation.sourceUid&&link.id===activation.sourceId);
 if(ownIndex!==core.chain.length-1)throw new Error('Equip Spell só pode resolver no topo da corrente.');
 const own=core.chain.pop();
 if(!own)throw new Error('Link do Equip ausente.');
 const negated=options.sourceActivationNegated===true||own.negated===true;
 const source=findBackrow(core,activation.sourceUid);
 const target=findMonster(core,activation.targetUid);
 let applied=false,sourceSentToGrave=false;
 if(!negated&&source?.team===activation.controllerTeam&&source.card.faceUp&&
  source.card.id===activation.sourceId&&source.card.equippedTo===activation.targetUid&&
  target&&target.monster.faceUp&&targetBindingValid(core,activation.targetBinding)&&
  canAffectMonster(core,activation.targetUid,'spell')){
  if(!Number.isSafeInteger(target.monster.atkBoost+activation.atk)||
   !Number.isSafeInteger(target.monster.defBoost+activation.def)){
   throw new Error('Modificador de ATK/DEF excede o limite seguro.');
  }
  target.monster.atkBoost+=activation.atk;
  target.monster.defBoost+=activation.def;
  source.card.resolved=true;
  next.active[activationId]={...activation,appliedAtk:activation.atk,appliedDef:activation.def};
  applied=true;
 }else{
  sourceSentToGrave=moveSpellTrapToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
  if(sourceSentToGrave)queueSent(next,activation);
 }
 delete next.pending[activationId];
 next.resolved.push(activationId);next.resolved=next.resolved.slice(-256);
 if(core.chain.length===0){core.phase='main';core.resume='main';core.priority=activation.controllerTeam;core.passes=0;}
 finishSession(next,before);
 return {session:next,result:{activationId,effect:activation.effect,negated,applied,sourceSentToGrave}};
}
export function releaseEquipStat(
 input:EquipStatSession,activationId:string
):{session:EquipStatSession;result:EquipStatRelease}{
 const active=input.active[activationId];
 if(!active)throw new Error('Equip ativo ausente ou já liberado.');
 assertEquipStatRules(input.duel);
 const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 const target=findMonster(core,active.targetUid);
 let removedAtk=0,removedDef=0;
 if(target&&targetBindingValid(core,active.targetBinding)){
  if(!Number.isSafeInteger(target.monster.atkBoost-active.appliedAtk)||
   !Number.isSafeInteger(target.monster.defBoost-active.appliedDef)){
   throw new Error('Remoção do modificador ATK/DEF inválida.');
  }
  target.monster.atkBoost-=active.appliedAtk;
  target.monster.defBoost-=active.appliedDef;
  removedAtk=active.appliedAtk;removedDef=active.appliedDef;
 }
 const equipSentToGrave=moveSpellTrapToOwnerGrave(core,active.controllerTeam,active.sourceUid);
 const sentEntry:SentEquip={
  activationId,effect:active.effect,sourceUid:active.sourceUid,sourceId:active.sourceId,
  sourceOwnerSeat:active.sourceOwnerSeat,ownerTeam:(active.sourceOwnerSeat%2) as Team
 };
 if(!equipSentToGrave&&sourceInOwnerGrave(next.duel,sentEntry)<0){
  throw new Error('Equip não está no campo nem no Cemitério do proprietário.');
 }
 next.sent[activationId]=sentEntry;
 delete next.active[activationId];
 finishSession(next,before);
 return {session:next,result:{activationId,equipSentToGrave,removedAtk,removedDef,triggerQueued:true}};
}
export function resolveAxeOfDespairGraveTrigger(
 input:EquipStatSession,activationId:string,tributeUid?:string
):{session:EquipStatSession;result:AxeGraveTriggerResult}{
 const entry=input.sent[activationId];
 if(!entry||entry.effect!=='axe-of-despair')throw new Error('Gatilho de Axe of Despair ausente.');
 if(input.triggered.includes(activationId)){
  return {session:input,result:{activationId,status:'duplicate'}};
 }
 assertEquipStatRules(input.duel);
 const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 const sourceIndex=sourceInOwnerGrave(next.duel,entry);
 if(sourceIndex<0)throw new Error('Axe of Despair não está no Cemitério do proprietário.');
 if(tributeUid===undefined){
  next.triggered.push(activationId);next.triggered=next.triggered.slice(-256);
  finishSession(next,before);
  return {session:next,result:{activationId,status:'declined'}};
 }
 if(!moveMonsterToPhysicalOwnerGrave(core,entry.ownerTeam,tributeUid)){
  throw new Error('Axe of Despair exige Tributo de um monstro controlado pela equipe proprietária.');
 }
 const grave=core.players[entry.ownerTeam].grave;
 const index=grave.findIndex(card=>card.uid===entry.sourceUid&&card.id===entry.sourceId);
 if(index<0)throw new Error('Axe of Despair deixou o Cemitério antes da resolução.');
 const [source]=grave.splice(index,1);
 physicalDeck(next.duel,entry.sourceOwnerSeat).unshift(source);
 next.triggered.push(activationId);next.triggered=next.triggered.slice(-256);
 finishSession(next,before);
 return {session:next,result:{activationId,status:'returned-to-deck',tributeUid}};
}
export function resolveBlackPendantGraveTrigger(
 input:EquipStatSession,activationId:string
):{session:EquipStatSession;result:BlackPendantTriggerResult}{
 const entry=input.sent[activationId];
 if(!entry||entry.effect!=='black-pendant')throw new Error('Gatilho de Black Pendant ausente.');
 if(input.triggered.includes(activationId)){
  return {session:input,result:{activationId,status:'duplicate',applied:false,damage:0,winner:null}};
 }
 assertEquipStatRules(input.duel);
 const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
 if(sourceInOwnerGrave(next.duel,entry)<0)throw new Error('Black Pendant não está no Cemitério do proprietário.');
 const opponent=(1-entry.ownerTeam) as Team,lp=core.players[opponent].lp;
 if(!Number.isSafeInteger(lp)||lp<0)throw new Error('LP adversário inválido.');
 const damage=Math.min(500,lp);
 core.players[opponent].lp=lp-damage;
 let winner:Team|null=null;
 if(core.players[opponent].lp===0){
  core.winner=core.players[entry.ownerTeam].id;
  core.reason='Black Pendant reduziu os LP da equipe adversária a zero.';
  core.phase='finished';winner=entry.ownerTeam;
 }
 core.log.push('Black Pendant: '+damage+' de dano à equipe adversária.');
 next.triggered.push(activationId);next.triggered=next.triggered.slice(-256);
 finishSession(next,before);
 return {session:next,result:{activationId,status:'resolved',applied:true,damage,winner}};
}
