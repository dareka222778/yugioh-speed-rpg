import {currentCatalog} from './catalogContext';
import {getTokenMetadata} from './tokens';
import {presentedCard} from './cardPresentation';
// Admission is separate from factual registration and executable definitions.
import type {Card} from './cardCatalog';
import {cardMetadata} from './cardMetadata';
import {effectDefinitions,type Effect} from './effectDefinitions';
import {getMonsterDefinition} from './monsterEffects';
import {getEffectModel} from './effectModels';
import {buildCardRegistry} from './cardRegistry';
import {cardCertifications} from './cardCertifications';
import {namedCard} from './cardIdentity';
export type {Effect} from './effectDefinitions';
export const engineCatalog:readonly Card[]=cardMetadata;
const registry=buildCardRegistry(cardMetadata,effectDefinitions,cardCertifications,{monster:getMonsterDefinition,model:getEffectModel});
const enabled=new Set(registry.enabled);
export function getEffect(id:string):Effect|undefined{return (currentCatalog()?.effects??registry.effects).get(id);}
export function getCardStatus(id:string){return (currentCatalog()?.statuses??registry.statuses).get(id);}
export function engineCard(id:string){return (currentCatalog()?.metadata??registry.metadata).get(id);}
export function getPlayableCard(id:string){const c=currentCatalog();return (c?c.statuses.get(id)?.stage==='certified':enabled.has(id))?engineCard(id):undefined;}
export const enabledCardIds:readonly string[]=registry.enabled;
export function getEnabledCardIds():readonly string[]{return currentCatalog()?.enabled??enabledCardIds;}
export function isQuickPlaySpell(id:string):boolean{
 const e=getEffect(id);return engineCard(id)?.kind==='spell'&&!!e&&getEffectModel(e.kind)?.activation.speed===2;
}
export function equipEligible(effect:Extract<Effect,{kind:'equip'}>,monster:Card){return (!effect.races||effect.races.includes(monster.race??''))&&(!effect.attribute||effect.attribute===monster.attribute)&&(!effect.names||effect.names.some(n=>namedCard(monster,n)))&&(!effect.monsterType||effect.monsterType===monster.monsterType)&&(!effect.maxLevel||!!monster.level&&monster.level<=effect.maxLevel);}

/** Duel-only metadata never admits a token to decks, certificates or inventory. */
export function getDuelCard(id:string){const card=getPlayableCard(id)??getTokenMetadata(id);return card?presentedCard(card):undefined;}
