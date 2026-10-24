/** Audited, declarative classic monster effects.
 * Each registered effect must have a matching card in effectRegistry.ts.
 * Effects with targets choose them on activation, before the response window.
 */
export type MonsterTrigger='ignition'|'flip'|'onSummon'|'onDestroy';
export type MonsterCost={kind:'lp';amount:number}|{kind:'discard';count:number};
export type MonsterOperation=
 |{kind:'heal'|'burn';amount:number}
 |{kind:'draw';count:number}
 |{kind:'destroy'|'bounce';target:'opponentMonster'|'anyMonster'}
 |{kind:'recover';cardKind:'spell'|'trap'};
export type MonsterEffect={trigger:MonsterTrigger;oncePerTurn?:boolean;cost?:MonsterCost;operation:MonsterOperation};
export type MonsterEffectContext={lp:number;handSize:number;deckSize:number;usedThisTurn:boolean};

export function canActivateMonsterEffect(effect:MonsterEffect,ctx:MonsterEffectContext):boolean{
 if(effect.oncePerTurn&&ctx.usedThisTurn)return false;
 if(effect.cost?.kind==='lp'&&ctx.lp<=effect.cost.amount)return false;
 if(effect.cost?.kind==='discard'&&ctx.handSize<effect.cost.count)return false;
 // Voluntary draw effects need available cards. Mandatory FLIP draws are
 // handled by the duel engine and can lose by deck-out on resolution.
 if(effect.operation.kind==='draw'&&ctx.deckSize<effect.operation.count)return false;
 return true;
}
export function payMonsterEffectCost(effect:MonsterEffect,ctx:MonsterEffectContext):{lpPaid:number;cardsDiscarded:number}{
 if(!canActivateMonsterEffect(effect,ctx))throw new Error('Monster effect activation conditions not met.');
 return {lpPaid:effect.cost?.kind==='lp'?effect.cost.amount:0,cardsDiscarded:effect.cost?.kind==='discard'?effect.cost.count:0};
}
export function monsterEffectOperation(effect:MonsterEffect):MonsterOperation{return effect.operation;}

/** Official card texts: Konami card database (CIDs 4507, 4547, 4434, 4108, 4546). */
const monsterEffects:Readonly<Record<string,MonsterEffect>>=Object.freeze({
 '54652250':{trigger:'flip',operation:{kind:'destroy',target:'anyMonster'}}, // Man-Eater Bug
 '07089711':{trigger:'flip',operation:{kind:'bounce',target:'anyMonster'}}, // Hane-Hane
 '31560081':{trigger:'flip',operation:{kind:'recover',cardKind:'spell'}}, // Magician of Faith
 '28933734':{trigger:'flip',operation:{kind:'recover',cardKind:'trap'}}, // Mask of Darkness
 '60694662':{trigger:'flip',operation:{kind:'draw',count:1}} // Skelengel
});
export function getMonsterEffect(cardId:string):MonsterEffect|undefined{return monsterEffects[cardId];}

/** Validate a selected monster instance against the offered legal target UIDs. */
export function monsterDestructionTarget(effect:MonsterEffect,eligibleMonsterUids:readonly string[],targetUid:string):string{
 if(effect.operation.kind!=='destroy')throw new Error('Effect does not destroy an opponent monster.');
 if(!targetUid||!eligibleMonsterUids.includes(targetUid))throw new Error('Invalid opponent monster target.');
 return targetUid;
}
