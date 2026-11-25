import { createHash } from 'node:crypto';
import type { CardRef } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { assertTagInventoryUnchanged, tagInventorySignature, tagPhysicalSeat, tagPrivateDeckForSeat, tagPrivateHandForSeat } from './tagPrivateHand';

export const PAINFUL_CHOICE_ID = '74191942';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;
export type PainfulChoicePlan = { eventId:string; sourceUid:string; sourceId:string; ownerSeat:Seat; ownerTeam:Team; opponentSeat:Seat; opponentTeam:Team; turn:number };
export type PainfulChoiceSelection = { eventId:string; selectionId:string; ownerSeat:Seat; chooserSeat:Seat; selectedUids:string[] };
export type PainfulChoiceReveal = { privateToSeat:Seat; ownerSeat:Seat; chooserSeat:Seat; selectionId:string; cards:Array<{choiceIndex:number;id:string}> };
export type PainfulChoicePrepared = { selection:PainfulChoiceSelection; reveal:PainfulChoiceReveal };
export type PainfulChoiceResolution = { state:TagDuel; chosenUid:string|null; chosenId:string|null; discardedUids:string[]; discardedIds:string[]; chooserSeat:Seat; negated:boolean };
type ReceiptState = TagDuel & { painfulChoiceResolvedEvents?:string[] };

function isTeam(value:unknown):value is Team{return value===0||value===1;}
function isSeat(value:unknown):value is Seat{return Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;}
function isSpellCardId(id:string):boolean{if(id===PAINFUL_CHOICE_ID)return true;const c=getDuelCard(id);return c?.kind==='spell'&&c.field!==true;}
function makeSelectionId(eventId:string,uids:string[]):string{return createHash('sha256').update(eventId+':'+uids.join('|')).digest('hex');}

export function assertPainfulChoiceRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('Painful Choice exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('Perfil de regras incompatível com o proprietário.');
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const ref of tagInventory(duel)){
  if(ref.entityKind==='token')continue;
  const seat=tagPhysicalSeat(ref.uid);
  if(seat===null)throw new Error('UID sem proprietário físico m0–m3.');
  const metadata=getDuelCard(ref.id);
  if(!metadata)throw new Error('Carta sem metadados habilitados no estado de teste.');
  if(metadata.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal físico fora do limite 20–30.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excede cinco cartas.');
 }
 for(const team of duel.core.players){
  if(team.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu três Zonas de Monstros.');
  if(team.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu três Zonas de Magias/Armadilhas.');
  // A Field Zone é independente das três Zonas de S/T.
 }
}
function activeMainHandSource(duel:TagDuel,sourceUid:string,cardId:string):{team:Team;seat:Seat;opponentTeam:Team;opponentSeat:Seat}|null{
 const core=duel.core;
 if(core.phase!=='main'||core.pending.kind!=='none'||core.chain.length!==0||core.turnEnding||core.handFlow||core.choice||core.damageStep===true||typeof sourceUid!=='string'||!sourceUid)return null;
 const team=core.current as Team,seat=duel.cursor as Seat;
 if(!isTeam(team)||!isSeat(seat)||seat%2!==team||duel.active[team]!==seat||duel.members[seat]?.team!==team)return null;
 const opponentTeam=(1-team) as Team,opponentSeat=duel.active[opponentTeam];
 if(!isSeat(opponentSeat)||duel.members[opponentSeat]?.team!==opponentTeam)return null;
 const source=tagPrivateHandForSeat(duel,seat).find(card=>card.uid===sourceUid&&card.id===cardId&&card.entityKind!=='token');
 if(!source||tagPhysicalSeat(source.uid)!==seat||!isSpellCardId(cardId)||tagPrivateDeckForSeat(duel,seat).length<5)return null;
 return {team,seat,opponentTeam,opponentSeat};
}
function validPlan(duel:TagDuel,plan:PainfulChoicePlan,cardId:string):boolean{
 if(!plan||typeof plan.eventId!=='string'||!plan.eventId.trim()||plan.sourceId!==cardId||!Number.isSafeInteger(plan.turn)||plan.turn!==duel.core.turn||
  !isTeam(plan.ownerTeam)||!isSeat(plan.ownerSeat)||plan.ownerTeam!==plan.ownerSeat%2||tagPhysicalSeat(plan.sourceUid)!==plan.ownerSeat||
  !isTeam(plan.opponentTeam)||plan.opponentTeam!==1-plan.ownerTeam||!isSeat(plan.opponentSeat)||plan.opponentSeat%2!==plan.opponentTeam||
  duel.active[plan.ownerTeam]!==plan.ownerSeat||duel.active[plan.opponentTeam]!==plan.opponentSeat)return false;
 return plan.eventId==='painful-choice:'+plan.turn+':'+plan.sourceUid+':'+plan.opponentSeat;
}
function sourceInGrave(duel:TagDuel,plan:PainfulChoicePlan,cardId:string):boolean{
 return duel.core.players[plan.ownerTeam].grave.some(card=>card.uid===plan.sourceUid&&card.id===cardId&&card.entityKind!=='token'&&tagPhysicalSeat(card.uid)===plan.ownerSeat);
}

export function activatePainfulChoice(input:TagDuel,sourceUid:string,options:{cardId?:string}={}):{state:TagDuel;plan:PainfulChoicePlan}|null{
 assertPainfulChoiceRules(input);
 const cardId=options.cardId??PAINFUL_CHOICE_ID,active=activeMainHandSource(input,sourceUid,cardId);
 if(!active)return null;
 const before=tagInventorySignature(input),next=structuredClone(input),hand=tagPrivateHandForSeat(next,active.seat);
 const index=hand.findIndex(card=>card.uid===sourceUid&&card.id===cardId);
 if(index<0)return null;
 const [spell]=hand.splice(index,1);
 next.core.players[active.team].grave.push(spell);
 const plan:PainfulChoicePlan={eventId:'painful-choice:'+next.core.turn+':'+sourceUid+':'+active.opponentSeat,sourceUid,sourceId:cardId,ownerSeat:active.seat,ownerTeam:active.team,opponentSeat:active.opponentSeat,opponentTeam:active.opponentTeam,turn:next.core.turn};
 assertPainfulChoiceRules(next);assertTagInventoryUnchanged(before,next);assertTagDuel(next);
 return {state:next,plan};
}

/** Keep selection server-side. Only five card IDs and choice indexes are sent privately to the active opponent. */
export function inspectPainfulChoiceCandidates(input:TagDuel,plan:PainfulChoicePlan,selectedDeckUids:string[],options:{cardId?:string}={}):PainfulChoicePrepared|null{
 assertPainfulChoiceRules(input);
 const cardId=options.cardId??PAINFUL_CHOICE_ID,receipts=(input as ReceiptState).painfulChoiceResolvedEvents??[];
 if(!validPlan(input,plan,cardId)||!sourceInGrave(input,plan,cardId)||!Array.isArray(receipts)||receipts.includes(plan.eventId))return null;
 if(!Array.isArray(selectedDeckUids)||selectedDeckUids.length!==5||selectedDeckUids.some(uid=>typeof uid!=='string'||!uid)||new Set(selectedDeckUids).size!==5)return null;
 const deck=tagPrivateDeckForSeat(input,plan.ownerSeat);
 const cards=selectedDeckUids.map(uid=>deck.find(card=>card.uid===uid&&card.entityKind!=='token'&&tagPhysicalSeat(card.uid)===plan.ownerSeat));
 if(cards.some(card=>!card))return null;
 const id=makeSelectionId(plan.eventId,selectedDeckUids);
 return {
  selection:{eventId:plan.eventId,selectionId:id,ownerSeat:plan.ownerSeat,chooserSeat:plan.opponentSeat,selectedUids:[...selectedDeckUids]},
  reveal:{privateToSeat:plan.opponentSeat,ownerSeat:plan.ownerSeat,chooserSeat:plan.opponentSeat,selectionId:id,cards:cards.map((card,choiceIndex)=>({choiceIndex,id:card!.id}))}
 };
}

export function resolvePainfulChoice(
 input:TagDuel,plan:PainfulChoicePlan,selection:PainfulChoiceSelection|null,choiceIndex:number|null,
 options:{chooserSeat?:Seat;negated?:boolean;cardId?:string}={}
):PainfulChoiceResolution|null{
 assertPainfulChoiceRules(input);
 const cardId=options.cardId??PAINFUL_CHOICE_ID,receipts=(input as ReceiptState).painfulChoiceResolvedEvents??[];
 if(!validPlan(input,plan,cardId)||!sourceInGrave(input,plan,cardId)||!Array.isArray(receipts)||receipts.includes(plan.eventId))return null;
 const negated=options.negated===true;
 let selectedCards:CardRef[]=[];
 if(negated){if(selection!==null||choiceIndex!==null)return null;}
 else{
  if(!selection||options.chooserSeat!==plan.opponentSeat||selection.eventId!==plan.eventId||selection.ownerSeat!==plan.ownerSeat||selection.chooserSeat!==plan.opponentSeat||
   !Array.isArray(selection.selectedUids)||selection.selectedUids.length!==5||new Set(selection.selectedUids).size!==5||
   selection.selectionId!==makeSelectionId(plan.eventId,selection.selectedUids)||!Number.isInteger(choiceIndex)||choiceIndex!<0||choiceIndex!>4)return null;
  const deck=tagPrivateDeckForSeat(input,plan.ownerSeat);
  const found=selection.selectedUids.map(uid=>deck.find(card=>card.uid===uid&&card.entityKind!=='token'&&tagPhysicalSeat(card.uid)===plan.ownerSeat));
  if(found.some(card=>!card))return null;
  selectedCards=found as CardRef[];
 }
 const before=tagInventorySignature(input),next=structuredClone(input);
 let chosenUid:string|null=null,chosenId:string|null=null;
 const discardedUids:string[]=[],discardedIds:string[]=[];
 if(!negated){
  const deck=tagPrivateDeckForSeat(next,plan.ownerSeat),chosen=selectedCards[choiceIndex!],removed:CardRef[]=[];
  for(const uid of selection!.selectedUids){const index=deck.findIndex(card=>card.uid===uid);if(index<0)return null;removed.push(deck.splice(index,1)[0]);}
  const selected=removed.find(card=>card.uid===chosen.uid);
  if(!selected)return null;
  tagPrivateHandForSeat(next,plan.ownerSeat).push(selected);
  const discarded=removed.filter(card=>card.uid!==selected.uid);
  next.core.players[plan.ownerTeam].grave.push(...discarded);
  chosenUid=selected.uid;chosenId=selected.id;
  discardedUids.push(...discarded.map(card=>card.uid));discardedIds.push(...discarded.map(card=>card.id));
 }
 const nextReceipts=(next as ReceiptState).painfulChoiceResolvedEvents??[];
 (next as ReceiptState).painfulChoiceResolvedEvents=[...nextReceipts,plan.eventId].slice(-256);
 assertPainfulChoiceRules(next);assertTagInventoryUnchanged(before,next);assertTagDuel(next);
 return {state:next,chosenUid,chosenId,discardedUids,discardedIds,chooserSeat:plan.opponentSeat,negated};
}
