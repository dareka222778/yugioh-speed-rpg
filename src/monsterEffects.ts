/** Declarative monster effect infrastructure.
 * Card-specific definitions are registered only after their rules are verified.
 * This module does not enable unsupported cards by itself.
 */
export type MonsterTrigger='ignition'|'flip'|'onSummon'|'onDestroy';
export type MonsterCost={kind:'lp';amount:number}|{kind:'discard';count:number};
export type MonsterOperation={kind:'heal'|'burn';amount:number}|{kind:'draw';count:number}|{kind:'destroy';target:'opponentMonster'};
export type MonsterEffect={trigger:MonsterTrigger;oncePerTurn?:boolean;cost?:MonsterCost;operation:MonsterOperation};
export type MonsterEffectContext={lp:number;handSize:number;deckSize:number;usedThisTurn:boolean};
export function canActivateMonsterEffect(effect:MonsterEffect,ctx:MonsterEffectContext):boolean{
 if(effect.oncePerTurn&&ctx.usedThisTurn)return false;
 if(effect.cost?.kind==='lp'&&ctx.lp<=effect.cost.amount)return false;
 if(effect.cost?.kind==='discard'&&ctx.handSize<effect.cost.count)return false;
 if(effect.operation.kind==='draw'&&ctx.deckSize<effect.operation.count)return false;
 return true;
}
export function payMonsterEffectCost(effect:MonsterEffect,ctx:MonsterEffectContext):{lpPaid:number;cardsDiscarded:number}{
 if(!canActivateMonsterEffect(effect,ctx))throw new Error('Monster effect activation conditions not met.');
 return {lpPaid:effect.cost?.kind==='lp'?effect.cost.amount:0,cardsDiscarded:effect.cost?.kind==='discard'?effect.cost.count:0};
}
export function monsterEffectOperation(effect:MonsterEffect):MonsterOperation{return effect.operation;}

/** Only explicitly registered and audited cards may expose monster effects. */
const monsterEffects:Readonly<Record<string,MonsterEffect>>=Object.freeze({});
export function getMonsterEffect(cardId:string):MonsterEffect|undefined{return monsterEffects[cardId];}

/** Resolve an opponent-monster target by unique instance ID, never by card ID.
 * The caller must apply the resulting removal to the authoritative duel state.
 */
export function monsterDestructionTarget(effect:MonsterEffect,opponentMonsterUids:readonly string[],targetUid:string):string{
 if(effect.operation.kind!=='destroy'||effect.operation.target!=='opponentMonster')throw new Error('Effect does not destroy an opponent monster.');
 if(!targetUid||!opponentMonsterUids.includes(targetUid))throw new Error('Invalid opponent monster target.');
 return targetUid;
}
