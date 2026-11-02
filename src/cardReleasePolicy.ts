import {releasedCardIds} from './releasedCardIds';
import {getPlayableCard} from './effectRegistry';
export function cardDistributionAllowed(id:string):boolean{return !!getPlayableCard(id)&&releasedCardIds.has(id);}
