import {historicalNormalBatch} from './historicalNormalBatch';
import {getPlayableCard} from './effectRegistry';
const unreleased=new Set(historicalNormalBatch.map(c=>c.id));
export function cardDistributionAllowed(id:string):boolean{return !!getPlayableCard(id)&&!unreleased.has(id);}
