import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const THE_INEXPERIENCED_SPY_ID='81820689';
type Team=0|1;
type SpyLocation='hand'|'backrow';
export type SpyTagDuel=TagDuel&{inexperiencedSpyReceipts?:string[]};
export type SpyEvent={
  activationId:string;
  actorSeat:number;
  targetSeat:number;
  sourceUid:string;
};
export type SpyPlan=SpyEvent&{
  actorTeam:Team;
  sourceOwnerSeat:number;
  turn:number;
};
export type PrivateSpyReceipt={
  activationId:string;
  recipientSeat:number;
  targetSeat:number;
  cardUid:string;
  cardId:string;
};
export type SpyResolution={
  status:'resolved'|'negated'|'duplicate';
  state:SpyTagDuel;
  activationId:string;
  /** Non-enumerable: never appears in JSON logs or public result serialization. */
  privateReceipt?:PrivateSpyReceipt;
};
export type PrivateSpyReveal={
  activationId:string;
  recipientSeat:number;
  targetSeat:number;
  cardUid:string;
  cardId:string;
};

function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw new Error('UID físico 2v2 inválido: '+uid);
  return Number(match[1]);
}
function validTeam(team:unknown):team is Team{return team===0||team===1;}
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.trim().length>0&&value.length<=128;
}
function assertClassicShape(duel:SpyTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:SpyTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:SpyTagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:SpyTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('A espionagem alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('A espionagem alterou a identidade física: '+uid);
  }
}
function assertHandsChangedOnlyBySource(before:string[],duel:SpyTagDuel,sourceUid:string):void{
  const expected=before.filter(uid=>uid!==sourceUid);
  if(JSON.stringify(expected)!==JSON.stringify(handSnapshot(duel))){
    throw new Error('A espionagem alterou uma mão privada além da Magia ativada.');
  }
}
function assertPhysicalRules(duel:SpyTagDuel):void{
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
    if(!/^\d$/.test(seat)||Number(seat)>3)throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[]){
      extra.add(card.uid);
      extras[physicalSeat(card.uid)]++;
    }
  }
  const main=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // The Field Zone is independent from the three shared Spell/Trap Zones.
}
function physicalHolder(duel:SpyTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão física do participante não está disponível.');
  return held;
}
function locateSource(
  duel:SpyTagDuel,
  actorSeat:number,
  sourceUid:string
):{location:SpyLocation;ownerSeat:number}{
  const team=(actorSeat%2) as Team;
  const holder=physicalHolder(duel,actorSeat);
  const hand=holder.hand.find(card=>card.uid===sourceUid&&card.id===THE_INEXPERIENCED_SPY_ID);
  const field=duel.core.players[team].backrow.find(card=>
    card.uid===sourceUid&&card.id===THE_INEXPERIENCED_SPY_ID
  );
  if(hand&&field)throw new Error('The Inexperienced Spy aparece em duas zonas.');
  if(hand)return {location:'hand',ownerSeat:physicalSeat(sourceUid)};
  if(field){
    const ownerSeat=physicalSeat(sourceUid);
    if(ownerSeat%2!==team)throw new Error('A Magia preparada pertence à equipe adversária.');
    return {location:'backrow',ownerSeat};
  }
  throw new Error('The Inexperienced Spy não está na mão ativa nem na Zona de Magias/Armadilhas da equipe.');
}
function attachPrivateReceipt(
  result:Omit<SpyResolution,'privateReceipt'>,
  receipt?:PrivateSpyReceipt
):SpyResolution{
  const output=result as SpyResolution;
  if(receipt)Object.defineProperty(output,'privateReceipt',{
    value:Object.freeze(receipt),enumerable:false,configurable:false,writable:false
  });
  return output;
}

/** Plan in the active team's Main Phase; choose which opposing physical hand to inspect. */
export function planInexperiencedSpy(
  input:SpyTagDuel,
  event:SpyEvent
):SpyPlan{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||
    typeof event.sourceUid!=='string'||!Number.isInteger(event.actorSeat)||
    event.actorSeat<0||event.actorSeat>3||!Number.isInteger(event.targetSeat)||
    event.targetSeat<0||event.targetSeat>3){
    throw new Error('Evento de The Inexperienced Spy inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(event.targetSeat%2===actorTeam)throw new Error('A carta-alvo deve estar na mão de uma equipe adversária.');
  if(input.core.current!==actorTeam||input.active[actorTeam]!==event.actorSeat||
    input.core.phase!=='main'||input.core.pending.kind!=='none'||
    input.core.chain.length!==0||input.core.choice||input.core.turnEnding){
    throw new Error('The Inexperienced Spy só pode ser ativado na Main Phase da equipe ativa.');
  }
  if((input.inexperiencedSpyReceipts??[]).includes(event.activationId)){
    throw new Error('Esta ativação de The Inexperienced Spy já foi resolvida.');
  }
  const source=locateSource(input,event.actorSeat,event.sourceUid);
  if(source.ownerSeat%2!==actorTeam)throw new Error('A Magia ativada não pertence à equipe ativa.');
  const target=physicalHolder(input,event.targetSeat);
  if(target.hand.length===0)throw new Error('A mão física escolhida está vazia.');
  if(source.location==='hand'&&input.core.players[actorTeam].backrow.length>=3){
    throw new Error('Não há Zona de Magias/Armadilhas livre para ativar a Magia.');
  }
  return Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,turn:input.core.turn
  });
}

/**
 * Resolve once. The selected card stays in its owner's private hand. Its identity
 * is attached to a non-enumerable, transient receipt so JSON logs/public payloads
 * cannot accidentally disclose it to the partner or the opposing team.
 */
export function resolveInexperiencedSpy(
  input:SpyTagDuel,
  plan:SpyPlan,
  targetCardUid:string|undefined,
  effectNegated=false
):SpyResolution{
  assertPhysicalRules(input);
  if(!plan||!validActivationId(plan.activationId)||
    !Number.isInteger(plan.actorSeat)||plan.actorSeat<0||plan.actorSeat>3||
    !Number.isInteger(plan.targetSeat)||plan.targetSeat<0||plan.targetSeat>3||
    !validTeam(plan.actorTeam)||plan.actorTeam!==plan.actorSeat%2||
    plan.targetSeat%2===plan.actorTeam||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    plan.sourceOwnerSeat%2!==plan.actorTeam||
    plan.turn!==input.core.turn||input.core.current!==plan.actorTeam||
    input.active[plan.actorTeam]!==plan.actorSeat||typeof effectNegated!=='boolean'){
    throw new Error('Plano de The Inexperienced Spy obsoleto ou inválido.');
  }
  const receipts=input.inexperiencedSpyReceipts??[];
  if(receipts.includes(plan.activationId)){
    return attachPrivateReceipt({status:'duplicate',state:input,activationId:plan.activationId});
  }
  const before=inventorySnapshot(input),hands=handSnapshot(input),logBefore=JSON.stringify(input.core.log);
  const next=structuredClone(input) as SpyTagDuel;
  const actorHolder=physicalHolder(next,plan.actorSeat);
  const targetHolder=physicalHolder(next,plan.targetSeat);
  let targetCard: {uid:string;id:string}|undefined;
  if(!effectNegated){
    if(typeof targetCardUid!=='string'||physicalSeat(targetCardUid)!==plan.targetSeat){
      throw new Error('Escolha uma carta pertencente à mão física adversária selecionada.');
    }
    targetCard=targetHolder.hand.find(card=>card.uid===targetCardUid);
    if(!targetCard)throw new Error('A carta escolhida saiu da mão antes da resolução.');
  }
  const handIndex=actorHolder.hand.findIndex(card=>
    card.uid===plan.sourceUid&&card.id===THE_INEXPERIENCED_SPY_ID
  );
  const fieldIndex=next.core.players[plan.actorTeam].backrow.findIndex(card=>
    card.uid===plan.sourceUid&&card.id===THE_INEXPERIENCED_SPY_ID
  );
  if(handIndex>=0&&fieldIndex>=0)throw new Error('The Inexperienced Spy aparece em duas zonas.');
  let source;
  if(handIndex>=0)source=actorHolder.hand.splice(handIndex,1)[0];
  else if(fieldIndex>=0)source=next.core.players[plan.actorTeam].backrow.splice(fieldIndex,1)[0];
  else throw new Error('The Inexperienced Spy saiu da mão/campo antes da resolução.');
  next.core.players[plan.actorTeam].grave.push(source);
  next.inexperiencedSpyReceipts=[...receipts,plan.activationId];
  assertSameInventory(before,next);
  assertHandsChangedOnlyBySource(hands,next,plan.sourceUid);
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore)throw new Error('A identidade da carta foi publicada no log do duelo.');
  const result=attachPrivateReceipt({
    status:effectNegated?'negated':'resolved',
    state:next,
    activationId:plan.activationId
  },!effectNegated&&targetCard?{
    activationId:plan.activationId,
    recipientSeat:plan.actorSeat,
    targetSeat:plan.targetSeat,
    cardUid:targetCard.uid,
    cardId:targetCard.id
  }:undefined);
  return result;
}

/** Only the exact activating seat receives the card identity; its partner gets nothing. */
export function privateSpyRevealForSeat(
  resolution:SpyResolution,
  viewerSeat:number
):PrivateSpyReveal|undefined{
  const receipt=resolution?.privateReceipt;
  if(!receipt||!Number.isInteger(viewerSeat)||viewerSeat!==receipt.recipientSeat)return undefined;
  return {
    activationId:receipt.activationId,
    recipientSeat:receipt.recipientSeat,
    targetSeat:receipt.targetSeat,
    cardUid:receipt.cardUid,
    cardId:receipt.cardId
  };
}
