import {createHash} from 'node:crypto';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {monsterEffectsNegated} from './continuousEffects';

export const RAGING_FLAME_SPRITE_ID='90810762';
export const RAGING_FLAME_SPRITE_KONAMI_CID=6189;

export type RagingFlameSpriteTeam=0|1;
export type RagingFlameSpriteSeat=0|1|2|3;
type Monster=TagDuel['core']['players'][number]['monsters'][number];

export type RagingFlameSpriteLookups=Readonly<{
 ragingFlameSprite:(id:string)=>boolean;
}>;

export function createExactRagingFlameSpriteLookups():RagingFlameSpriteLookups{
 return {ragingFlameSprite:id=>id===RAGING_FLAME_SPRITE_ID};
}

export type RagingFlameSpriteDirectDamageEvent=Readonly<{
 kind:'raging-flame-sprite-direct-damage';
 eventId:string;
 sequence:number;
 turn:number;
 actorSeat:RagingFlameSpriteSeat;
 sourceUid:string;
 sourceBinding:TargetBinding;
 directAttack:boolean;
 targetUid:string|null;
 battleDamage:number;
 opponentLpBefore:number;
 opponentLpAfter:number;
 negatedSourceUids?:readonly string[];
}>;

export type RagingFlameSpriteProcessed=Readonly<{
 eventId:string;
 fingerprint:string;
 sequence:number;
 turn:number;
 sourceUid:string;
 sourceEpoch:number;
 status:'applied'|'no-trigger'|'effect-negated';
}>;

export type RagingFlameSpriteLedger=Readonly<{
 version:1;
 lastSequence:number;
 processed:readonly RagingFlameSpriteProcessed[];
}>;

export type RagingFlameSpriteResolution=Readonly<{
 status:'applied'|'no-trigger'|'effect-negated'|'duplicate';
 state:TagDuel;
 ledger:RagingFlameSpriteLedger;
 atkBoostBefore:number|null;
 atkBoostAfter:number|null;
}>;

const isSeat=(value:unknown):value is RagingFlameSpriteSeat=>
 Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;

function assertText(value:unknown,label:string):asserts value is string{
 if(typeof value!=='string'||!value.trim()||value.length>256)throw new Error(label+' inválido.');
}

function physicalSeat(uid:string):RagingFlameSpriteSeat|null{
 const match=/^m([0-3]):(.+)$/.exec(uid);
 return match?Number(match[1]) as RagingFlameSpriteSeat:null;
}

function ownerOfUid(state:TagDuel,uid:string):RagingFlameSpriteSeat{
 const seat=physicalSeat(uid);
 if(seat===null||state.members[seat]?.team!==seat%2)throw new Error('UID físico sem proprietário de assento verificável.');
 return seat;
}

function assertClassicShape(state:TagDuel):void{
 if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
  !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
  !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation){
  throw new Error('Raging Flame Sprite exige TagDuel clássico 2v2.');
 }
 assertTagDuel(state);
 if(state.core.teamRotation.cursor!==state.cursor||
  state.core.teamRotation.active[0]!==state.active[0]||
  state.core.teamRotation.active[1]!==state.active[1]||
  state.core.current!==state.cursor%2||
  state.active[state.cursor%2]!==state.cursor&&!(state.core.teamRotation.overflowReturn?.seat===state.cursor&&state.core.teamRotation.overflowReturn.team===state.cursor%2)){
  throw new Error('Rotação física do TagDuel inconsistente.');
 }
}

export function assertRagingFlameSpriteRules(state:TagDuel):void{
 assertClassicShape(state);
 const rules=rulesFor(state.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const player of state.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones compartilhadas.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones compartilhadas.');
  // A Field Zone é separada e não consome uma das três Spell/Trap Zones.
 }
 for(const card of tagInventory(state).filter(card=>card.entityKind!=='token')){
  const seat=ownerOfUid(state,card.uid);
  const info=getDuelCard(card.id);
  if(!info)throw new Error('Carta física sem metadata habilitado.');
  if(info.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax){
   throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  }
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // Não impomos tamanho de mão durante a resolução: o limite 6 só é verificado na End Phase.
}

function assertLookups(lookups:RagingFlameSpriteLookups):void{
 if(!lookups||typeof lookups.ragingFlameSprite!=='function')throw new Error('Lookup de Raging Flame Sprite inválido.');
}

function findMonster(state:TagDuel,uid:string,lookup:(id:string)=>boolean):{team:RagingFlameSpriteTeam;card:Monster}|null{
 const found:{team:RagingFlameSpriteTeam;card:Monster}[]=[];
 for(const team of [0,1] as const){
  for(const card of state.core.players[team].monsters){
   if(card.uid===uid&&lookup(card.id))found.push({team,card});
  }
 }
 if(found.length>1)throw new Error('UID duplicado de Raging Flame Sprite no campo.');
 return found[0]??null;
}

export function canRagingFlameSpriteAttackDirectly(
 state:TagDuel,sourceUid:string,lookups:RagingFlameSpriteLookups
):boolean{
 assertRagingFlameSpriteRules(state);assertLookups(lookups);assertText(sourceUid,'UID de Raging Flame Sprite');
 const source=findMonster(state,sourceUid,lookups.ragingFlameSprite);
 if(!source||!source.card.faceUp||source.card.position!=='atk')return false;
 ownerOfUid(state,sourceUid);
 synchronizeCardLifetimes(state.core);
 return !monsterEffectsNegated(state.core,sourceUid);
}

/** Capture the object identity at attack declaration; the post-damage event must reuse it. */
export function bindRagingFlameSpriteDirectAttack(
 state:TagDuel,sourceUid:string,lookups:RagingFlameSpriteLookups
):TargetBinding|null{
 if(!canRagingFlameSpriteAttackDirectly(state,sourceUid,lookups))return null;
 const binding=bindTarget(state.core,sourceUid);
 return binding?.zone==='monsters'?binding:null;
}

export function createRagingFlameSpriteLedger():RagingFlameSpriteLedger{
 return {version:1,lastSequence:0,processed:[]};
}

function assertLedger(ledger:RagingFlameSpriteLedger):void{
 if(!ledger||ledger.version!==1||!Number.isSafeInteger(ledger.lastSequence)||ledger.lastSequence<0||
  !Array.isArray(ledger.processed)||ledger.processed.length>4096)throw new Error('Ledger Raging Flame Sprite inválido.');
 const ids=new Set<string>(),sequences=new Set<number>();
 for(const item of ledger.processed){
  if(!item||typeof item.eventId!=='string'||!item.eventId||ids.has(item.eventId)||
   !/^[a-f0-9]{64}$/.test(item.fingerprint)||!Number.isSafeInteger(item.sequence)||item.sequence<1||
   item.sequence>ledger.lastSequence||sequences.has(item.sequence)||!Number.isSafeInteger(item.turn)||item.turn<1||
   typeof item.sourceUid!=='string'||!item.sourceUid||!Number.isSafeInteger(item.sourceEpoch)||item.sourceEpoch<0||
   !['applied','no-trigger','effect-negated'].includes(item.status)){
   throw new Error('Registro processado de Raging Flame Sprite inválido.');
  }
  ids.add(item.eventId);sequences.add(item.sequence);
 }
}

function assertEvent(state:TagDuel,event:RagingFlameSpriteDirectDamageEvent):void{
 if(event?.kind!=='raging-flame-sprite-direct-damage')throw new Error('Tipo de evento Raging Flame Sprite inválido.');
 assertText(event.eventId,'ID do evento Raging Flame Sprite');
 assertText(event.sourceUid,'UID da fonte Raging Flame Sprite');
 if(!Number.isSafeInteger(event.sequence)||event.sequence<1||!Number.isSafeInteger(event.turn)||event.turn!==state.core.turn||
  !isSeat(event.actorSeat)||event.actorSeat!==state.cursor||state.active[event.actorSeat%2]!==event.actorSeat||
  typeof event.directAttack!=='boolean'||!(event.targetUid===null||typeof event.targetUid==='string')||event.directAttack&&event.targetUid!==null||
  !Number.isSafeInteger(event.battleDamage)||event.battleDamage<0||
  !Number.isSafeInteger(event.opponentLpBefore)||event.opponentLpBefore<0||
  !Number.isSafeInteger(event.opponentLpAfter)||event.opponentLpAfter<0||
  !event.sourceBinding||event.sourceBinding.uid!==event.sourceUid||event.sourceBinding.zone!=='monsters'||
  !Number.isSafeInteger(event.sourceBinding.epoch)||event.sourceBinding.epoch<0){
  throw new Error('Assento, turno, LP, dano ou binding do evento Raging Flame Sprite inválido.');
 }
 if(event.negatedSourceUids!==undefined&&(!Array.isArray(event.negatedSourceUids)||
  event.negatedSourceUids.some(uid=>typeof uid!=='string'||!uid.trim())||
  new Set(event.negatedSourceUids).size!==event.negatedSourceUids.length)){
  throw new Error('Lista de fontes negadas inválida.');
 }
}

function eventFingerprint(event:RagingFlameSpriteDirectDamageEvent):string{
 const canonical=[
  event.kind,event.eventId,event.sequence,event.turn,event.actorSeat,event.sourceUid,
  event.sourceBinding.uid,event.sourceBinding.zone,event.sourceBinding.epoch,
  event.directAttack,event.targetUid,event.battleDamage,event.opponentLpBefore,event.opponentLpAfter,
  [...(event.negatedSourceUids??[])].sort()
 ];
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function appendProcessed(
 ledger:RagingFlameSpriteLedger,event:RagingFlameSpriteDirectDamageEvent,fingerprint:string,
 sourceEpoch:number,status:RagingFlameSpriteProcessed['status']
):RagingFlameSpriteLedger{
 if(ledger.processed.length>=4096)throw new Error('Ledger Raging Flame Sprite atingiu o limite de eventos.');
 return {
  version:1,lastSequence:event.sequence,
  processed:[...ledger.processed,{eventId:event.eventId,fingerprint,sequence:event.sequence,turn:event.turn,
   sourceUid:event.sourceUid,sourceEpoch,status}]
 };
}

/**
 * The direct-damage event is already applied by the duel engine. This adapter
 * never changes LP or card inventory; it only adds the continuous +1000 ATK
 * modifier after a successful direct attack that dealt positive battle damage.
 */
export function applyRagingFlameSpriteDirectDamage(
 state:TagDuel,ledger:RagingFlameSpriteLedger,event:RagingFlameSpriteDirectDamageEvent,
 lookups:RagingFlameSpriteLookups
):RagingFlameSpriteResolution{
 assertRagingFlameSpriteRules(state);assertLedger(ledger);assertEvent(state,event);assertLookups(lookups);
 const fingerprint=eventFingerprint(event);
 const prior=ledger.processed.find(item=>item.eventId===event.eventId);
 if(prior){
  if(prior.fingerprint!==fingerprint)throw new Error('Replay divergente de evento Raging Flame Sprite.');
  return {status:'duplicate',state:structuredClone(state),ledger,atkBoostBefore:null,atkBoostAfter:null};
 }
 if(event.sequence<=ledger.lastSequence)throw new Error('Sequência de evento Raging Flame Sprite fora de ordem.');

 const next=structuredClone(state);
 synchronizeCardLifetimes(next.core);
 const source=findMonster(next,event.sourceUid,lookups.ragingFlameSprite);
 const sourceEpoch=event.sourceBinding.epoch;
 let status:RagingFlameSpriteProcessed['status']='no-trigger';
 let atkBoostBefore:number|null=null,atkBoostAfter:number|null=null;

 if(event.directAttack&&event.targetUid===null){
  const opponentTeam=(1-(event.actorSeat%2)) as RagingFlameSpriteTeam;
  if(event.opponentLpBefore-event.opponentLpAfter!==event.battleDamage||
   next.core.players[opponentTeam].lp!==event.opponentLpAfter){
   throw new Error('Delta de LP não corresponde ao dano direto já aplicado pelo engine.');
  }
  if(event.battleDamage>0&&source&&source.team===event.actorSeat%2&&source.card.faceUp&&
   source.card.position==='atk'&&targetBindingValid(next.core,event.sourceBinding)){
   if(event.negatedSourceUids?.includes(event.sourceUid)||monsterEffectsNegated(next.core,event.sourceUid)){
    status='effect-negated';
   }else{
    const current=source.card.atkBoost;
    if(!Number.isSafeInteger(current)||!Number.isSafeInteger(current+1000)){
     throw new Error('Modificador de ATK de Raging Flame Sprite excedeu o intervalo seguro.');
    }
    atkBoostBefore=current;source.card.atkBoost=current+1000;atkBoostAfter=source.card.atkBoost;
    status='applied';
   }
  }
 }
 const nextLedger=appendProcessed(ledger,event,fingerprint,sourceEpoch,status);
 assertRagingFlameSpriteRules(next);
 const inventoryBefore=tagInventory(state).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort();
 const inventoryAfter=tagInventory(next).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort();
 if(JSON.stringify(inventoryBefore)!==JSON.stringify(inventoryAfter)){
  throw new Error('O efeito Raging Flame Sprite alterou o inventário físico.');
 }
 return {status,state:next,ledger:nextLedger,atkBoostBefore,atkBoostAfter};
}
