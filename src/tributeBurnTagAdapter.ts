import type {DuelState,Monster} from './duelEngine';
import {atk} from './duelEngine';
import {getPlayableCard} from './effectRegistry';
import {closeStandby} from './standbyFlow';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const MASS_DRIVER_ID='34906152';
export const CATAPULT_TURTLE_ID='95727991';
export const CATAPULT_TURTLE_ORIGINAL_ATK=1000;

type Team=0|1;
type BackrowCard=DuelState['players'][0]['backrow'][number];
type SourceLocation={team:Team;zone:'backrow'|'monsters';source:BackrowCard|Monster};

export type TributeBurnActivation={
  activationId:string;
  sourceUid:string;
  sourceId:string;
  sourcePhysicalOwnerSeat:number;
  controllerTeam:Team;
  sourceZone:'backrow'|'monsters';
  turn:number;
  tributeUid:string;
  tributeId:string;
  tributePhysicalOwnerSeat:number;
  tributeControllerTeam:Team;
  tributeAtk:number|null;
  damageAmount:number;
  sourceWasTributed:boolean;
};

export type TributeBurnSession={
  duel:TagDuel;
  pending:Record<string,TributeBurnActivation>;
  resolved:string[];
  usedCatapultTurn:Record<string,number>;
};

export type TributeBurnActivationResult={
  activationId:string;
  cardId:string;
  sourceUid:string;
  sourcePhysicalOwnerSeat:number;
  controllerTeam:Team;
  tributeUid:string;
  tributePhysicalOwnerSeat:number;
  tributeOwnerTeam:Team;
  tributeAtk:number|null;
  damageAmount:number;
  recipientTeam:Team;
  tributeSentToOwnerGrave:boolean;
  sourceWasTributed:boolean;
};

export type TributeBurnResolution={
  activationId:string;
  cardId:string;
  sourceUid:string;
  tributeUid:string;
  sourceActivationNegated:boolean;
  sourceStillOnFieldAtResolution:boolean;
  effectApplied:boolean;
  damageAmount:number;
  recipientTeam:Team;
  teamLifePoints:[number,number];
  gameFinished:boolean;
  winnerTeam:Team|null;
  tributeRemainsInOwnerGrave:boolean;
};

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}

function assertClassicShape(duel:TagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}

function inventorySnapshot(duel:TagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
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

function assertHandsUnchanged(before:string[],duel:TagDuel):void{
  if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel))){
    throw new Error('O tributo/dano alterou uma mão privada.');
  }
}

function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('O tributo/dano alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('O tributo/dano alterou a identidade física: '+uid);
  }
}

function assertPhysicalRules(duel:TagDuel):void{
  assertClassicShape(duel);
  const all=inventorySnapshot(duel),extra=new Set<string>(),extras=[0,0,0,0];
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^\d$/.test(seat)||Number(seat)>3||duel.active.includes(Number(seat))){
      throw new Error('Assento físico de reserva inválido.');
    }
    for(const card of held.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  const main=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(main[seat]<20||main[seat]>30){
      throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    }
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // Field Zone permanece separada das três Spell/Trap Zones.
}

function findMonster(core:DuelState,uid:string):{team:Team;monster:Monster}|undefined{
  for(const team of [0,1] as const){
    const monster=core.players[team].monsters.find(card=>card.uid===uid);
    if(monster)return {team,monster};
  }
  return undefined;
}

function locateSource(core:DuelState,uid:string):SourceLocation|undefined{
  for(const team of [0,1] as const){
    const spell=core.players[team].backrow.find(card=>card.uid===uid&&card.id===MASS_DRIVER_ID);
    if(spell)return {team,zone:'backrow',source:spell};
    const monster=core.players[team].monsters.find(card=>card.uid===uid&&card.id===CATAPULT_TURTLE_ID);
    if(monster)return {team,zone:'monsters',source:monster};
  }
  return undefined;
}

function assertSession(input:TributeBurnSession):void{
  assertPhysicalRules(input.duel);
  if(!input.pending||typeof input.pending!=='object'||!Array.isArray(input.resolved)||
    input.resolved.length>4096||new Set(input.resolved).size!==input.resolved.length||
    !input.usedCatapultTurn||typeof input.usedCatapultTurn!=='object'){
    throw new Error('Ledger de tributo/dano inválido.');
  }
  for(const [id,activation] of Object.entries(input.pending)){
    if(!id||!activation||activation.activationId!==id||
      ![MASS_DRIVER_ID,CATAPULT_TURTLE_ID].includes(activation.sourceId)||
      !Number.isSafeInteger(activation.turn)||activation.turn<1||
      ![0,1].includes(activation.controllerTeam)||
      !Number.isSafeInteger(activation.damageAmount)||activation.damageAmount<0){
      throw new Error('Ativação pendente de tributo/dano inválida.');
    }
    physicalSeat(activation.sourceUid);
    physicalSeat(activation.tributeUid);
  }
  for(const [uid,turn] of Object.entries(input.usedCatapultTurn)){
    physicalSeat(uid);
    if(!Number.isSafeInteger(turn)||turn<1)throw new Error('Limite por turno da Catapult Turtle inválido.');
  }
}

function currentOrOriginalAtk(monster:Monster,core:DuelState):number{
  const metadata=getPlayableCard(monster.id);
  const originalAtk=metadata?.kind==='monster'
    ? metadata.atk
    : monster.id===CATAPULT_TURTLE_ID?CATAPULT_TURTLE_ORIGINAL_ATK:undefined;
  if(!Number.isSafeInteger(originalAtk)||originalAtk===undefined||originalAtk<0){
    throw new Error('ATK original certificado ausente para o monstro tributado.');
  }
  const current=monster.faceUp
    ? metadata?.kind==='monster'?atk(monster,core):originalAtk+(monster.atkBoost??0)
    : originalAtk;
  if(!Number.isSafeInteger(current)||current<0){
    throw new Error('ATK no campo inválido para o cálculo do tributo.');
  }
  return current;
}

function moveTributeToOwnerGrave(core:DuelState,controllerTeam:Team,uid:string):Monster{
  const index=core.players[controllerTeam].monsters.findIndex(card=>card.uid===uid);
  if(index<0)throw new Error('O monstro tributado deixou a equipe controladora antes do pagamento.');
  const [monster]=core.players[controllerTeam].monsters.splice(index,1);
  const ownerTeam=(physicalSeat(uid)%2) as Team;
  if(core.players.some(player=>player.grave.some(card=>card.uid===uid))){
    throw new Error('O monstro tributado já está em um Cemitério.');
  }
  core.players[ownerTeam].grave.push({uid:monster.uid,id:monster.id});
  return monster;
}

function finishForLifePoints(core:DuelState,losingTeam:Team):Team|null{
  const draw=core.players.every(player=>player.lp<=0);
  const winnerTeam=draw?null:(1-losingTeam) as Team;
  delete core.movementSelection;
  delete core.afterEffectFlips;
  delete core.effectFlips;
  delete core.ritual;
  closeStandby(core);
  core.phase='finished';
  delete core.damageStep;
  delete core.triggerBuild;
  delete core.chainRoot;
  delete core.choice;
  delete core.handFlow;
  core.graveTriggers=[];
  core.summonTriggers=[];
  delete core.battleFlip;
  core.winner=winnerTeam===null?null:core.players[winnerTeam].id;
  core.reason='pontos de vida';
  core.log.push((winnerTeam===null?'Empate':core.players[winnerTeam].name+' venceu')+': pontos de vida.');
  return winnerTeam;
}

export function createTributeBurnSession(duel:TagDuel):TributeBurnSession{
  assertPhysicalRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:[],usedCatapultTurn:{}};
}

/** Activate either card and pay the Tribute immediately. The physical card is
 * sent to its owner's Graveyard even if the controller is the other team. */
export function activateTributeBurn(
  input:TributeBurnSession,
  sourceUid:string,
  tributeUid:string,
  activationId:string
):{session:TributeBurnSession;result:TributeBurnActivationResult}{
  assertSession(input);
  if(typeof activationId!=='string'||!/^[A-Za-z0-9:_-]{1,80}$/.test(activationId)||
    input.pending[activationId]||input.resolved.includes(activationId)){
    throw new Error('ID de ativação ausente ou duplicado.');
  }
  physicalSeat(sourceUid);
  physicalSeat(tributeUid);
  const location=locateSource(input.duel.core,sourceUid);
  if(!location)throw new Error('Mass Driver ou Catapult Turtle não está em sua zona de ativação.');
  const {team,zone,source}=location;
  if(input.duel.core.phase!=='main'||input.duel.core.current!==team||
    input.duel.core.pending.kind!=='none'||input.duel.core.chain.length||input.duel.core.damageStep){
    throw new Error('A ativação exige a Main Phase sem Chain pendente da equipe controladora.');
  }
  if(!source.faceUp||(zone==='backrow'&&(source as BackrowCard).resolved!==true)){
    throw new Error('A fonte de tributo/dano precisa estar face-up e resolvida.');
  }
  if(Object.values(input.pending).some(item=>item.sourceUid===sourceUid)){
    throw new Error('A mesma cópia já possui uma ativação pendente.');
  }
  const target=findMonster(input.duel.core,tributeUid);
  if(!target||target.team!==team)throw new Error('O monstro tributado precisa estar sob controle da equipe da fonte.');
  const sourceId=source.id;
  if(sourceId===CATAPULT_TURTLE_ID&&input.usedCatapultTurn[sourceUid]===input.duel.core.turn){
    throw new Error('Catapult Turtle já usou seu efeito neste turno.');
  }
  const tributeAtk=sourceId===CATAPULT_TURTLE_ID
    ? currentOrOriginalAtk(target.monster,input.duel.core)
    : null;
  const damageAmount=sourceId===MASS_DRIVER_ID?400:Math.floor((tributeAtk??0)/2);
  if(!Number.isSafeInteger(damageAmount)||damageAmount<0){
    throw new Error('Dano de tributo fora do intervalo de inteiros seguros.');
  }
  const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel);
  const next=structuredClone(input),nextSource=locateSource(next.duel.core,sourceUid);
  if(!nextSource)throw new Error('A fonte saiu do campo antes do pagamento do custo.');
  const moved=moveTributeToOwnerGrave(next.duel.core,team,tributeUid);
  if(sourceId===CATAPULT_TURTLE_ID){
    next.usedCatapultTurn[sourceUid]=next.duel.core.turn;
    if(sourceUid===tributeUid){
      // The soft once-per-turn restriction resets when this copy leaves the field.
      delete next.usedCatapultTurn[sourceUid];
    }
  }
  const activation:TributeBurnActivation={
    activationId,sourceUid,sourceId,sourcePhysicalOwnerSeat:physicalSeat(sourceUid),
    controllerTeam:team,sourceZone:zone,turn:next.duel.core.turn,
    tributeUid,tributeId:moved.id,tributePhysicalOwnerSeat:physicalSeat(tributeUid),
    tributeControllerTeam:team,tributeAtk,damageAmount,sourceWasTributed:sourceUid===tributeUid
  };
  next.pending[activationId]=activation;
  assertSameInventory(before,next.duel);
  assertHandsUnchanged(hands,next.duel);
  assertPhysicalRules(next.duel);
  return {session:next,result:{
    activationId,cardId:sourceId,sourceUid,sourcePhysicalOwnerSeat:activation.sourcePhysicalOwnerSeat,
    controllerTeam:team,tributeUid,tributePhysicalOwnerSeat:activation.tributePhysicalOwnerSeat,
    tributeOwnerTeam:(activation.tributePhysicalOwnerSeat%2) as Team,
    tributeAtk,damageAmount,recipientTeam:(1-team) as Team,
    tributeSentToOwnerGrave:true,sourceWasTributed:activation.sourceWasTributed
  }};
}

/** Called by the host when a Catapult Turtle leaves the field or is flipped
 * face-down. Its "once per turn" clause is per copy and resets on that event. */
export function resetCatapultSoftOncePerTurn(
  input:TributeBurnSession,
  sourceUid:string
):TributeBurnSession{
  assertSession(input);
  physicalSeat(sourceUid);
  const next=structuredClone(input);
  delete next.usedCatapultTurn[sourceUid];
  return next;
}

export function resolveTributeBurn(
  input:TributeBurnSession,
  activationId:string,
  options:{sourceActivationNegated?:boolean}={}
):{session:TributeBurnSession;result:TributeBurnResolution}{
  assertSession(input);
  const activation=input.pending[activationId];
  if(!activation||input.resolved.includes(activationId)){
    throw new Error('Ativação de tributo/dano ausente ou já resolvida.');
  }
  if(options.sourceActivationNegated!==undefined&&typeof options.sourceActivationNegated!=='boolean'){
    throw new Error('Estado de negação da ativação inválido.');
  }
  const before=inventorySnapshot(input.duel),hands=handSnapshot(input.duel);
  const next=structuredClone(input),core=next.duel.core;
  delete next.pending[activationId];
  next.resolved.push(activationId);
  const sourceStillOnFieldAtResolution=activation.sourceId===MASS_DRIVER_ID
    ? !!core.players[activation.controllerTeam].backrow.find(card=>
        card.uid===activation.sourceUid&&card.id===MASS_DRIVER_ID&&card.faceUp&&card.resolved===true)
    : !!findMonster(core,activation.sourceUid);
  const sourceActivationNegated=!!options.sourceActivationNegated;
  const effectApplied=!sourceActivationNegated&&
    (activation.sourceId!==MASS_DRIVER_ID||sourceStillOnFieldAtResolution);
  const damageAmount=effectApplied?activation.damageAmount:0;
  const recipientTeam=(1-activation.controllerTeam) as Team;
  const lpBefore=core.players[recipientTeam].lp;
  if(!Number.isSafeInteger(lpBefore)||lpBefore<0){
    throw new Error('LP da equipe adversária deve ser inteiro não negativo.');
  }
  const lpAfter=Math.max(0,lpBefore-damageAmount);
  core.players[recipientTeam].lp=lpAfter;
  let gameFinished=false,winnerTeam:Team|null=null;
  if(damageAmount>0&&lpAfter===0){
    winnerTeam=finishForLifePoints(core,recipientTeam);
    gameFinished=true;
  }
  const tributeRemainsInOwnerGrave=core.players[(physicalSeat(activation.tributeUid)%2) as Team]
    .grave.some(card=>card.uid===activation.tributeUid&&card.id===activation.tributeId);
  if(!tributeRemainsInOwnerGrave)throw new Error('O monstro tributado saiu do Cemitério do proprietário físico.');
  const teamLifePoints:[number,number]=[core.players[0].lp,core.players[1].lp];
  assertSameInventory(before,next.duel);
  assertHandsUnchanged(hands,next.duel);
  assertPhysicalRules(next.duel);
  return {session:next,result:{
    activationId,cardId:activation.sourceId,sourceUid:activation.sourceUid,
    tributeUid:activation.tributeUid,sourceActivationNegated,sourceStillOnFieldAtResolution,
    effectApplied,damageAmount,recipientTeam,teamLifePoints,gameFinished,winnerTeam,
    tributeRemainsInOwnerGrave
  }};
}
