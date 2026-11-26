import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {tagInventory} from './tagDuel';

export const PAINFUL_CHOICE_ID='74191942';
type Team=0|1;
type SourceLocation='hand'|'backrow';
export type PainfulChoiceTagDuel=TagDuel&{
  painfulChoiceActivationIds?:string[];
  painfulChoicePending?:PainfulChoicePlan[];
  painfulChoiceResolvedIds?:string[];
};
export type PainfulChoiceEvent={
  activationId:string;actorSeat:number;targetSeat:number;sourceUid:string;
};
export type PainfulChoicePlan=PainfulChoiceEvent&{
  actorTeam:Team;sourceOwnerSeat:number;sourceLocation:SourceLocation;
  sourceSetTurn:number|null;deckCountAtActivation:number;turn:number;
  selectionCommitment?:string;revealed:boolean;
};
export type PainfulChoiceActivation={status:'activated';state:PainfulChoiceTagDuel;plan:PainfulChoicePlan};
export type PrivatePainfulChoiceCard={uid:string;id:string;ownerSeat:number};
export type PrivatePainfulChoiceReceipt={
  activationId:string;actorSeat:number;targetSeat:number;cards:PrivatePainfulChoiceCard[];
};
export type PainfulChoiceReveal={
  status:'revealed';state:PainfulChoiceTagDuel;plan:PainfulChoicePlan;
  privateReceipt?:PrivatePainfulChoiceReceipt;
};
export type PainfulChoiceResolution={
  status:'resolved'|'negated'|'duplicate';state:PainfulChoiceTagDuel;activationId:string;
  privateReceipt?:PrivatePainfulChoiceReceipt;
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
function assertClassicShape(duel:PainfulChoiceTagDuel):void{
  if(!duel||duel.mode!=='tag-classic'||!duel.core||
    !Array.isArray(duel.core.players)||duel.core.players.length!==2||
    !Array.isArray(duel.active)||duel.active.length!==2||
    !Array.isArray(duel.members)||duel.members.length!==4||
    !Array.isArray(duel.core.chain)||!duel.reserves){
    throw new Error('Estado TagDuel clássico inválido.');
  }
}
function inventorySnapshot(duel:PainfulChoiceTagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    physicalSeat(card.uid);
    result.set(card.uid,card.id);
  }
  return result;
}
function handSnapshot(duel:PainfulChoiceTagDuel):string[]{
  const result:string[]=[];
  for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:PainfulChoiceTagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('Painful Choice alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id){
    throw new Error('Painful Choice alterou a identidade física: '+uid);
  }
}
function assertPhysicalRules(duel:PainfulChoiceTagDuel):void{
  assertClassicShape(duel);
  const all=inventorySnapshot(duel),extra=new Set<string>(),extras=[0,0,0,0];
  for(const player of duel.core.players){
    if(player.monsters.length>3)throw new Error('A equipe excedeu as três Monster Zones.');
    if(player.backrow.length>3)throw new Error('A equipe excedeu as três Spell/Trap Zones.');
    for(const card of player.extra??[]){extra.add(card.uid);extras[physicalSeat(card.uid)]++;}
  }
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^\d$/.test(seat)||Number(seat)>3)throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[]){extra.add(card.uid);extras[physicalSeat(card.uid)]++;}
  }
  const main=[0,0,0,0];
  for(const uid of all.keys())if(!extra.has(uid))main[physicalSeat(uid)]++;
  for(let seat=0;seat<4;seat++){
    if(main[seat]<20||main[seat]>30)throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    if(extras[seat]>5)throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
  }
  // The Field Zone is independent from the three shared Spell/Trap Zones.
}
function physicalHolder(duel:PainfulChoiceTagDuel,seat:number){
  const team=(seat%2) as Team;
  const held=duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];
  if(!held)throw new Error('A mão/Deck físico do participante não está disponível.');
  return held;
}
function locateSource(
  duel:PainfulChoiceTagDuel,actorSeat:number,sourceUid:string
):{location:SourceLocation;ownerSeat:number;setTurn:number|null}{
  const team=(actorSeat%2) as Team,holder=physicalHolder(duel,actorSeat);
  const hand=holder.hand.find(card=>card.uid===sourceUid&&card.id===PAINFUL_CHOICE_ID);
  const field=duel.core.players[team].backrow.find(card=>card.uid===sourceUid&&card.id===PAINFUL_CHOICE_ID);
  const opposingField=duel.core.players[1-team].backrow.find(card=>card.uid===sourceUid&&card.id===PAINFUL_CHOICE_ID);
  if(opposingField)throw new Error('Painful Choice preparada pertence à equipe adversária.');
  if(hand&&field)throw new Error('Painful Choice aparece em duas zonas.');
  if(hand)return {location:'hand',ownerSeat:physicalSeat(sourceUid),setTurn:null};
  if(field){
    const ownerSeat=physicalSeat(sourceUid);
    if(ownerSeat%2!==team)throw new Error('Painful Choice preparada pertence à equipe adversária.');
    if(field.faceUp)throw new Error('Painful Choice já está com a face para cima.');
    return {location:'backrow',ownerSeat,setTurn:Number.isInteger(field.setTurn)?field.setTurn:null};
  }
  throw new Error('Painful Choice não está na mão ativa nem baixada na Zona de Magias/Armadilhas da equipe.');
}
function commitment(uids:string[]):string{
  return createHash('sha256').update([...uids].sort().join('\u0000')).digest('hex');
}
function samePlan(a:PainfulChoicePlan,b:PainfulChoicePlan):boolean{
  return a.activationId===b.activationId&&a.actorSeat===b.actorSeat&&
    a.targetSeat===b.targetSeat&&a.sourceUid===b.sourceUid&&
    a.actorTeam===b.actorTeam&&a.sourceOwnerSeat===b.sourceOwnerSeat&&
    a.sourceLocation===b.sourceLocation&&a.sourceSetTurn===b.sourceSetTurn&&
    a.deckCountAtActivation===b.deckCountAtActivation&&a.turn===b.turn&&
    a.selectionCommitment===b.selectionCommitment&&a.revealed===b.revealed;
}
function assertPlanBase(input:PainfulChoiceTagDuel,plan:PainfulChoicePlan):void{
  if(!plan||!validActivationId(plan.activationId)||!Number.isInteger(plan.actorSeat)||
    plan.actorSeat<0||plan.actorSeat>3||!Number.isInteger(plan.targetSeat)||
    plan.targetSeat<0||plan.targetSeat>3||!validTeam(plan.actorTeam)||
    plan.actorTeam!==plan.actorSeat%2||plan.targetSeat%2===plan.actorTeam||
    plan.sourceOwnerSeat!==physicalSeat(plan.sourceUid)||plan.sourceOwnerSeat%2!==plan.actorTeam||
    (plan.sourceLocation!=='hand'&&plan.sourceLocation!=='backrow')||
    (plan.sourceLocation==='hand'&&plan.sourceOwnerSeat!==plan.actorSeat)||
    !(plan.sourceSetTurn===null||Number.isInteger(plan.sourceSetTurn))||
    !Number.isInteger(plan.deckCountAtActivation)||plan.deckCountAtActivation<5||
    plan.turn!==input.core.turn||input.active[plan.actorTeam]!==plan.actorSeat||
    input.core.current!==plan.actorTeam||!(input.painfulChoiceActivationIds??[]).includes(plan.activationId)){
    throw new Error('Plano de Painful Choice obsoleto ou inválido.');
  }
}
function attachPrivateReceipt<T extends {privateReceipt?:PrivatePainfulChoiceReceipt}>(
  result:Omit<T,'privateReceipt'>,receipt?:PrivatePainfulChoiceReceipt
):T{
  const output=result as T;
  if(receipt)Object.defineProperty(output,'privateReceipt',{
    value:Object.freeze({...receipt,cards:receipt.cards.map(card=>Object.freeze({...card}))}),
    enumerable:false,configurable:false,writable:false
  });
  return output;
}
function privateReceiptForSeats(
  result:PainfulChoiceReveal|PainfulChoiceResolution,viewerSeat:number
):PrivatePainfulChoiceReceipt|undefined{
  const receipt=result?.privateReceipt;
  if(!receipt||!Number.isInteger(viewerSeat)||
    (viewerSeat!==receipt.actorSeat&&viewerSeat!==receipt.targetSeat))return undefined;
  return {...receipt,cards:receipt.cards.map(card=>({...card}))};
}
function sendSourceToGrave(duel:PainfulChoiceTagDuel,plan:PainfulChoicePlan):void{
  const index=duel.core.players[plan.actorTeam].backrow.findIndex(card=>card.uid===plan.sourceUid);
  if(index>=0){
    const [source]=duel.core.players[plan.actorTeam].backrow.splice(index,1);
    duel.core.players[plan.actorTeam].grave.push(source);
  }else if(!duel.core.players[plan.actorTeam].grave.some(card=>card.uid===plan.sourceUid)){
    throw new Error('Painful Choice não está no campo nem no Cemitério após a ativação.');
  }
}

/** Activate the Normal Spell and choose one opposing physical seat to make the selection. */
export function activatePainfulChoice(
  input:PainfulChoiceTagDuel,event:PainfulChoiceEvent
):PainfulChoiceActivation{
  assertPhysicalRules(input);
  if(!event||!validActivationId(event.activationId)||typeof event.sourceUid!=='string'||
    !Number.isInteger(event.actorSeat)||event.actorSeat<0||event.actorSeat>3||
    !Number.isInteger(event.targetSeat)||event.targetSeat<0||event.targetSeat>3){
    throw new Error('Evento de Painful Choice inválido.');
  }
  const actorTeam=(event.actorSeat%2) as Team;
  if(event.targetSeat%2===actorTeam)throw new Error('O seletor deve pertencer à equipe adversária.');
  if(input.core.current!==actorTeam||input.active[actorTeam]!==event.actorSeat||
    input.core.phase!=='main'||input.core.pending.kind!=='none'||
    input.core.chain.length!==0||input.core.choice||input.core.turnEnding){
    throw new Error('Painful Choice exige prioridade aberta na Main Phase da equipe ativa.');
  }
  if((input.painfulChoiceActivationIds??[]).includes(event.activationId)){
    throw new Error('Esta ativação de Painful Choice já foi registrada.');
  }
  const source=locateSource(input,event.actorSeat,event.sourceUid);
  if(source.ownerSeat%2!==actorTeam||(source.location==='hand'&&source.ownerSeat!==event.actorSeat)){
    throw new Error('A Magia ativada não pertence à equipe/assento permitido.');
  }
  if(source.location==='hand'&&input.core.players[actorTeam].backrow.length>=3){
    throw new Error('Não há Zona de Magias/Armadilhas livre para ativar a Magia.');
  }
  const actor=physicalHolder(input,event.actorSeat);
  if(actor.deck.length<5)throw new Error('Painful Choice exige pelo menos cinco cartas no Deck para ativar.');
  const plan:PainfulChoicePlan=Object.freeze({
    ...event,actorTeam,sourceOwnerSeat:source.ownerSeat,sourceLocation:source.location,
    sourceSetTurn:source.setTurn,deckCountAtActivation:actor.deck.length,
    turn:input.core.turn,revealed:false
  });
  const next=structuredClone(input) as PainfulChoiceTagDuel;
  next.painfulChoiceActivationIds=[...(next.painfulChoiceActivationIds??[]),event.activationId];
  next.painfulChoicePending=[...(next.painfulChoicePending??[]),plan];
  if(source.location==='hand'){
    const holder=physicalHolder(next,event.actorSeat);
    const index=holder.hand.findIndex(card=>card.uid===event.sourceUid&&card.id===PAINFUL_CHOICE_ID);
    if(index<0)throw new Error('Painful Choice saiu da mão durante a ativação.');
    const [card]=holder.hand.splice(index,1);
    next.core.players[actorTeam].backrow.push({...card,faceUp:true,setTurn:next.core.turn});
  }else{
    const card=next.core.players[actorTeam].backrow.find(item=>item.uid===event.sourceUid);
    if(!card)throw new Error('Painful Choice saiu da Zona de Magias/Armadilhas durante a ativação.');
    card.faceUp=true;
  }
  assertPhysicalRules(next);
  return {status:'activated',state:next,plan};
}

/** Reveal exactly five cards from the actor's Deck only to the actor and chosen opposing seat. */
export function revealPainfulChoice(
  input:PainfulChoiceTagDuel,plan:PainfulChoicePlan,selectedUids:string[]
):PainfulChoiceReveal{
  assertPhysicalRules(input);
  assertPlanBase(input,plan);
  if(plan.revealed||plan.selectionCommitment)throw new Error('Painful Choice já revelou uma seleção.');
  const stored=(input.painfulChoicePending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan))throw new Error('Plano de Painful Choice não corresponde ao registro imutável da ativação.');
  if(!Array.isArray(selectedUids)||selectedUids.length!==5||
    new Set(selectedUids).size!==5||selectedUids.some(uid=>typeof uid!=='string')){
    throw new Error('Painful Choice exige exatamente cinco cartas distintas do Deck.');
  }
  const actor=physicalHolder(input,plan.actorSeat);
  const cards=selectedUids.map(uid=>actor.deck.find(card=>card.uid===uid));
  if(cards.some(card=>!card))throw new Error('As cinco cartas reveladas devem permanecer no Deck físico do jogador ativo.');
  const receipt:PrivatePainfulChoiceReceipt={
    activationId:plan.activationId,actorSeat:plan.actorSeat,targetSeat:plan.targetSeat,
    cards:cards.map(card=>({uid:card!.uid,id:card!.id,ownerSeat:physicalSeat(card!.uid)}))
  };
  const updated: PainfulChoicePlan=Object.freeze({...plan,selectionCommitment:commitment(selectedUids),revealed:true});
  const next=structuredClone(input) as PainfulChoiceTagDuel;
  next.painfulChoicePending=(next.painfulChoicePending??[]).map(item=>
    item.activationId===plan.activationId?updated:item
  );
  return attachPrivateReceipt({status:'revealed',state:next,plan:updated},receipt);
}

/** The selected opponent chooses one revealed card; four go to the team's shared Graveyard. */
export function resolvePainfulChoice(
  input:PainfulChoiceTagDuel,plan:PainfulChoicePlan,selectedUids:string[]|undefined,
  chosenUid:string|undefined,effectNegated=false
):PainfulChoiceResolution{
  assertPhysicalRules(input);
  assertPlanBase(input,plan);
  if(typeof effectNegated!=='boolean')throw new Error('Estado de negação de Painful Choice inválido.');
  const resolved=input.painfulChoiceResolvedIds??[];
  if(resolved.includes(plan.activationId)){
    return attachPrivateReceipt({status:'duplicate',state:input,activationId:plan.activationId});
  }
  const stored=(input.painfulChoicePending??[]).find(item=>item.activationId===plan.activationId);
  if(!stored||!samePlan(stored,plan))throw new Error('Plano de Painful Choice não corresponde ao registro imutável da ativação.');
  const before=inventorySnapshot(input),hands=handSnapshot(input),logBefore=JSON.stringify(input.core.log);
  const next=structuredClone(input) as PainfulChoiceTagDuel;
  let receipt:PrivatePainfulChoiceReceipt|undefined;
  if(effectNegated){
    if(plan.revealed||plan.selectionCommitment||selectedUids!==undefined||chosenUid!==undefined){
      throw new Error('Uma ativação negada de Painful Choice não pode revelar nem receber escolhas.');
    }
  }else{
    if(!plan.revealed||typeof plan.selectionCommitment!=='string'||
      !Array.isArray(selectedUids)||selectedUids.length!==5||new Set(selectedUids).size!==5||
      selectedUids.some(uid=>typeof uid!=='string')||commitment(selectedUids)!==plan.selectionCommitment||
      typeof chosenUid!=='string'||!selectedUids.includes(chosenUid)){
      throw new Error('A escolha do oponente não corresponde às cinco cartas reveladas.');
    }
    const actor=physicalHolder(next,plan.actorSeat);
    const selected=selectedUids.map(uid=>actor.deck.find(card=>card.uid===uid));
    if(selected.some(card=>!card))throw new Error('Uma das cinco cartas saiu do Deck antes da escolha do oponente.');
    const chosen=selected.find(card=>card!.uid===chosenUid)!;
    const rest=selected.filter(card=>card!.uid!==chosenUid) as NonNullable<typeof selected[number]>[];
    const selectedSet=new Set(selectedUids);
    actor.deck=actor.deck.filter(card=>!selectedSet.has(card.uid));
    actor.hand.push(chosen);
    next.core.players[plan.actorTeam].grave.push(...rest);
    receipt={
      activationId:plan.activationId,actorSeat:plan.actorSeat,targetSeat:plan.targetSeat,
      cards:selected.map(card=>({uid:card!.uid,id:card!.id,ownerSeat:physicalSeat(card!.uid)}))
    };
  }
  sendSourceToGrave(next,plan);
  next.painfulChoicePending=(next.painfulChoicePending??[]).filter(item=>item.activationId!==plan.activationId);
  next.painfulChoiceResolvedIds=[...resolved,plan.activationId];
  assertSameInventory(before,next);
  const expectedHands=effectNegated?hands:[...hands,chosenUid!].sort();
  if(JSON.stringify(expectedHands)!==JSON.stringify(handSnapshot(next))){
    throw new Error('Painful Choice alterou uma mão física além da carta escolhida.');
  }
  assertPhysicalRules(next);
  if(JSON.stringify(next.core.log)!==logBefore){
    throw new Error('Painful Choice publicou as cinco cartas privadas no log do duelo.');
  }
  return attachPrivateReceipt({
    status:effectNegated?'negated':'resolved',state:next,activationId:plan.activationId
  },receipt);
}

/** Only the activating physical seat and the selected opposing seat see the five revealed cards. */
export function privatePainfulChoiceRevealForSeat(
  result:PainfulChoiceReveal|PainfulChoiceResolution,viewerSeat:number
):PrivatePainfulChoiceReceipt|undefined{
  return privateReceiptForSeats(result,viewerSeat);
}
