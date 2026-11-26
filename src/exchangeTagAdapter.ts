import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const EXCHANGE_ID='05556668';
type Team=0|1;
type SourceLocation='hand'|'backrow';

export type ExchangeTagDuel=TagDuel&{
  exchangeActivationIds?:string[];
  exchangePending?:ExchangePlan[];
  exchangeResolvedIds?:string[];
};
export type ExchangeEvent={
  activationId:string;
  actorSeat:number;
  targetSeat:number;
  sourceUid:string;
};
export type ExchangePlan=ExchangeEvent&{
  actorTeam:Team;
  sourceOwnerSeat:number;
  sourceLocation:SourceLocation;
  sourceSetTurn:number|null;
  turn:number;
  actorHandCommitment?:string;
  targetHandCommitment?:string;
  revealed:boolean;
};
export type ExchangeActivation={status:'activated';state:ExchangeTagDuel;plan:ExchangePlan};
export type PrivateExchangeCard={uid:string;id:string;ownerSeat:number};
export type PrivateExchangeReceipt={
  activationId:string;
  actorSeat:number;
  targetSeat:number;
  actorHand:PrivateExchangeCard[];
  targetHand:PrivateExchangeCard[];
};
export type ExchangeReveal={
  status:'revealed';
  state:ExchangeTagDuel;
  plan:ExchangePlan;
  /** Transient, non-enumerable and visible only to the two physical participants. */
  privateReceipt?:PrivateExchangeReceipt;
};
export type ExchangeResolution={
  status:'resolved'|'negated'|'duplicate';
  state:ExchangeTagDuel;
  activationId:string;
  privateReceipt?:PrivateExchangeReceipt;
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
function assertClassicShape(duel:ExchangeTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:ExchangeTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:ExchangeTagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:ExchangeTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Exchange alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('Exchange alterou a identidade física: '+uid);
  }
}
function assertHandsEqual(expected:string[],duel:ExchangeTagDuel):void{
  if(JSON.stringify([...expected].sort())!==JSON.stringify(handSnapshot(duel))){
    throw new Error('Exchange alterou o conjunto global de cartas nas mãos.');
  }
}
function assertPhysicalRules(duel:ExchangeTagDuel):void{
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
function physicalHolder(duel:ExchangeTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão física do participante não está disponível.');
  return held;
}
function locateSource(
  duel:ExchangeTagDuel,actorSeat:number,sourceUid:string
):{location:SourceLocation;ownerSeat:number;setTurn:number|null}{
  const team=(actorSeat%2) as Team,holder=physicalHolder(duel,actorSeat);
  const hand=holder.hand.find(card=>card.uid===sourceUid&&card.id===EXCHANGE_ID);
  const field=duel.core.players[team].backrow.find(card=>card.uid===sourceUid&&card.id===EXCHANGE_ID);
  const opposingField=duel.core.players[1-team].backrow.find(card=>card.uid===sourceUid&&card.id===EXCHANGE_ID);
  if(opposingField)throw new Error('Exchange preparada está na Zona de Magias/Armadilhas adversária.');
  if(hand&&field)throw new Error('Exchange aparece em duas zonas.');
  if(hand)return {location:'hand',ownerSeat:physicalSeat(sourceUid),setTurn:null};
  if(field){
    if(field.faceUp)throw new Error('Exchange já está com a face para cima.');
    return {location:'backrow',ownerSeat:physicalSeat(sourceUid),setTurn:Number.isInteger(field.setTurn)?field.setTurn:null};
  }
  throw new Error('Exchange não está na mão física ativa nem na backrow compartilhada da equipe.');
}
function handCommitment(activationId:string,seat:number,cards:readonly {uid:string;id:string}[]):string{
  const zero=String.fromCharCode(0);
  const material=['exchange-v1',activationId,String(seat),...cards.map(card=>card.uid+':'+card.id).sort()].join(zero);
  return createHash('sha256').update(material).digest('hex');
}
function samePlan(a:ExchangePlan,b:ExchangePlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&
    a.targetSeat===b.targetSeat&&a.sourceUid===b.sourceUid&&
    a.actorTeam===b.actorTeam&&a.sourceOwnerSeat===b.sourceOwnerSeat&&
    a.sourceLocation===b.sourceLocation&&a.sourceSetTurn===b.sourceSetTurn&&
    a.turn===b.turn&&a.actorHandCommitment===b.actorHandCommitment&&
    a.targetHandCommitment===b.targetHandCommitment&&a.revealed===b.revealed;
}
function assertPlanBase(input:ExchangeTagDuel,plan:ExchangePlan):void{
  if(!plan||!validActivationId(plan.activationId)||!Number.isInteger(plan.actorSeat)||
    plan.actorSeat<0||plan.actorSeat>3||!Number.isInteger(plan.targetSeat)||
    plan.targetSeat<0||plan.targetSeat>3||!validTeam(plan.actorTeam)||
    plan.actorTeam!==plan.actorSeat%2||plan.targetSeat%2===plan.actorTeam||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||
    (plan.sourceLocation!=='hand'&&plan.sourceLocation!=='backrow')||
    !(plan.sourceSetTurn===null||Number.isInteger(plan.sourceSetTurn))||
    !Number.isInteger(plan.turn)||plan.turn!==input.core.turn||
    typeof plan.revealed!=='boolean'||
    !(plan.actorHandCommitment===undefined||/^[a-f0-9]{64}$/.test(plan.actorHandCommitment))||
    !(plan.targetHandCommitment===undefined||/^[a-f0-9]{64}$/.test(plan.targetHandCommitment))||
    input.active[plan.actorTeam]!==plan.actorSeat||input.core.current!==plan.actorTeam||
    !(input.exchangeActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de Exchange obsoleto ou inválido.');
  }
}
function attachPrivateReceipt<T extends {privateReceipt?:PrivateExchangeReceipt}>(
  result:Omit<T,'privateReceipt'>,receipt?:PrivateExchangeReceipt
):T{
  const output=result as T;
  if(receipt)Object.defineProperty(output,'privateReceipt',{
    value:Object.freeze({
      ...receipt,
      actorHand:receipt.actorHand.map(card=>Object.freeze({...card})),
      targetHand:receipt.targetHand.map(card=>Object.freeze({...card}))
    }),
    enumerable:false,configurable:false,writable:false
  });
  return output;
}
function privateReceiptForSeats(
  result:ExchangeReveal|ExchangeResolution,viewerSeat:number
):PrivateExchangeReceipt|undefined{
  const receipt=result?.privateReceipt;
  if(!receipt||!Number.isInteger(viewerSeat)||
    (viewerSeat!==receipt.actorSeat&&viewerSeat!==receipt.targetSeat))return undefined;
  return {
    ...receipt,
    actorHand:receipt.actorHand.map(card=>({...card})),
    targetHand:receipt.targetHand.map(card=>({...card}))
  };
}
function receiptForHands(
  duel:ExchangeTagDuel,activationId:string,actorSeat:number,targetSeat:number
):PrivateExchangeReceipt{
  const cards=(seat:number)=>physicalHolder(duel,seat).hand.map(card=>({
    uid:card.uid,id:card.id,ownerSeat:physicalSeat(card.uid)
  }));
  return {activationId,actorSeat,targetSeat,actorHand:cards(actorSeat),targetHand:cards(targetSeat)};
}
function sendSourceToOriginalOwnerGrave(duel:ExchangeTagDuel,plan:ExchangePlan):void{
  const ownerTeam=(plan.sourceOwnerSeat%2) as Team;
  const field=duel.core.players[plan.actorTeam].backrow;
  const index=field.findIndex(card=>card.uid===plan.sourceUid);
  if(index>=0){
    const [source]=field.splice(index,1);
    duel.core.players[ownerTeam].grave.push(source);
    return;
  }
  if(duel.core.players[ownerTeam].grave.some(card=>card.uid===plan.sourceUid))return;
  if(duel.core.players[1-ownerTeam].grave.some(card=>card.uid===plan.sourceUid)){
    throw new Error('Exchange foi enviada ao Cemitério da equipe que não é proprietária.');
  }
  throw new Error('Exchange não está no campo controlado nem no Cemitério do proprietário original.');
}

/** Activate from the active physical hand or the team's shared face-down Spell/Trap Zone. */
export function activateExchange(
  input:ExchangeTagDuel,event:ExchangeEvent
):ExchangeActivation{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||typeof event.sourceUid!=='string'||
    !Number.isInteger(event.actorSeat)||event.actorSeat<0||event.actorSeat>3||
    !Number.isInteger(event.targetSeat)||event.targetSeat<0||event.targetSeat>3){
    throw new Error('Evento de Exchange inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(event.targetSeat%2===actorTeam)throw new Error('Exchange exige um assento físico da equipe adversária.');
  if(input.core.current!==actorTeam||input.active[actorTeam]!==event.actorSeat||
    input.core.phase!=='main'||input.core.pending.kind!=='none'||
    input.core.chain.length!==0||input.core.choice||input.core.turnEnding){
    throw new Error('Exchange exige prioridade aberta na Main Phase da equipe ativa.');
  }
  if((input.exchangeActivationIds??[]).includes(event.activationId)){
    throw new Error('Esta ativação de Exchange já foi registrada.');
  }
  const source=locateSource(input,event.actorSeat,event.sourceUid);
  if(source.location==='hand'&&input.core.players[actorTeam].backrow.length>=3){
    throw new Error('Não há Zona de Magias/Armadilhas livre para ativar Exchange.');
  }
  const actor=physicalHolder(input,event.actorSeat),target=physicalHolder(input,event.targetSeat);
  const actorHandAfterActivation=source.location==='hand'?
    actor.hand.filter(card=>card.uid!==event.sourceUid):actor.hand;
  if(actorHandAfterActivation.length===0||target.hand.length===0){
    throw new Error('Exchange exige ao menos uma carta na mão de cada participante após a ativação.');
  }
  const plan:ExchangePlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,sourceLocation:source.location,
    sourceSetTurn:source.setTurn,turn:input.core.turn,revealed:false
  });
  const next=structuredClone(input) as ExchangeTagDuel;
  next.exchangeActivationIds=[...(next.exchangeActivationIds??[]),event.activationId];
  next.exchangePending=[...(next.exchangePending??[]),plan];
  if(source.location==='hand'){
    const holder=physicalHolder(next,event.actorSeat);
    const index=holder.hand.findIndex(card=>card.uid===event.sourceUid&&card.id===EXCHANGE_ID);
    if(index<0)throw new Error('Exchange saiu da mão durante a ativação.');
    const [card]=holder.hand.splice(index,1);
    next.core.players[actorTeam].backrow.push({...card,faceUp:true,setTurn:next.core.turn});
  }else{
    const card=next.core.players[actorTeam].backrow.find(item=>item.uid===event.sourceUid);
    if(!card)throw new Error('Exchange saiu da Zona de Magias/Armadilhas durante a ativação.');
    card.faceUp=true;
  }
  assertPhysicalRules(next);
  return {status:'activated',state:next,plan};
}

/** Reveal both physical hands only to the activating seat and the chosen opposing seat. */
export function revealExchangeHands(
  input:ExchangeTagDuel,plan:ExchangePlan
):ExchangeReveal{
  assertPhysicalRules(input);
  assertPlanBase(input,plan);
  if(plan.revealed||plan.actorHandCommitment||plan.targetHandCommitment){
    throw new Error('Exchange já revelou as mãos.');
  }
  const stored=(input.exchangePending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan)){
    throw new Error('Plano de Exchange não corresponde ao registro imutável da ativação.');
  }
  const actor=physicalHolder(input,plan.actorSeat),target=physicalHolder(input,plan.targetSeat);
  if(actor.hand.length===0||target.hand.length===0){
    throw new Error('Exchange exige mãos não vazias para a revelação bilateral.');
  }
  const receipt=receiptForHands(input,plan.activationId,plan.actorSeat,plan.targetSeat);
  const updated:ExchangePlan=Object.freeze({
    ...plan,
    actorHandCommitment:handCommitment(plan.activationId,plan.actorSeat,actor.hand),
    targetHandCommitment:handCommitment(plan.activationId,plan.targetSeat,target.hand),
    revealed:true
  });
  const next=structuredClone(input) as ExchangeTagDuel;
  next.exchangePending=(next.exchangePending??[]).map(item=>
    item.activationId===plan.activationId?updated:item
  );
  return attachPrivateReceipt({status:'revealed',state:next,plan:updated},receipt);
}

/** Each participant chooses one card from the other hand; the physical cards change hands, not owners. */
export function resolveExchange(
  input:ExchangeTagDuel,plan:ExchangePlan,actorTakesUid:string|undefined,
  targetTakesUid:string|undefined,effectNegated=false
):ExchangeResolution{
  assertPhysicalRules(input);
  assertPlanBase(input,plan);
  if(typeof effectNegated!=='boolean')throw new Error('Estado de negação de Exchange inválido.');
  const resolved=input.exchangeResolvedIds??[];
  if(resolved.includes(plan.activationId)){
    return attachPrivateReceipt({status:'duplicate',state:input,activationId:plan.activationId});
  }
  const stored=(input.exchangePending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan)){
    throw new Error('Plano de Exchange não corresponde ao registro imutável da ativação.');
  }
  const before=inventorySnapshot(input),hands=handSnapshot(input),logBefore=JSON.stringify(input.core.log);
  const next=structuredClone(input) as ExchangeTagDuel;
  let receipt:PrivateExchangeReceipt|undefined;
  if(effectNegated){
    if(plan.revealed||plan.actorHandCommitment||plan.targetHandCommitment||
      actorTakesUid!==undefined||targetTakesUid!==undefined){
      throw new Error('Uma ativação negada de Exchange não pode revelar nem receber escolhas.');
    }
  }else{
    if(!plan.revealed||!plan.actorHandCommitment||!plan.targetHandCommitment||
      typeof actorTakesUid!=='string'||typeof targetTakesUid!=='string'||
      actorTakesUid===targetTakesUid){
      throw new Error('Exchange exige duas escolhas válidas após a revelação.');
    }
    const actor=physicalHolder(next,plan.actorSeat),target=physicalHolder(next,plan.targetSeat);
    if(handCommitment(plan.activationId,plan.actorSeat,actor.hand)!==plan.actorHandCommitment||
      handCommitment(plan.activationId,plan.targetSeat,target.hand)!==plan.targetHandCommitment){
      throw new Error('As mãos mudaram após a revelação privada de Exchange.');
    }
    const actorChoiceIndex=target.hand.findIndex(card=>card.uid===actorTakesUid);
    const targetChoiceIndex=actor.hand.findIndex(card=>card.uid===targetTakesUid);
    if(actorChoiceIndex<0||targetChoiceIndex<0){
      throw new Error('Cada participante deve escolher exatamente uma carta da mão do outro.');
    }
    receipt=receiptForHands(next,plan.activationId,plan.actorSeat,plan.targetSeat);
    const [toActor]=target.hand.splice(actorChoiceIndex,1);
    const [toTarget]=actor.hand.splice(targetChoiceIndex,1);
    actor.hand.push(toActor);
    target.hand.push(toTarget);
  }
  sendSourceToOriginalOwnerGrave(next,plan);
  next.exchangePending=(next.exchangePending??[]).filter(item=>item.activationId!==plan.activationId);
  next.exchangeResolvedIds=[...resolved,plan.activationId];
  assertSameInventory(before,next);
  assertHandsEqual(hands,next);
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore){
    throw new Error('Exchange publicou identidades privadas no log do duelo.');
  }
  return attachPrivateReceipt({
    status:effectNegated?'negated':'resolved',state:next,activationId:plan.activationId
  },receipt);
}

/** The activating physical seat and the chosen opposing seat are the only authorized viewers. */
export function privateExchangeReceiptForSeat(
  result:ExchangeReveal|ExchangeResolution,viewerSeat:number
):PrivateExchangeReceipt|undefined{
  return privateReceiptForSeats(result,viewerSeat);
}
