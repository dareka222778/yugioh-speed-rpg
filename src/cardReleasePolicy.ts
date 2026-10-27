import {mechanicalBatch5} from './mechanicalBatch5';
import {historicalNormalBatch4} from './historicalNormalBatch4';
import {historicalNormalBatch} from './historicalNormalBatch';
import {getPlayableCard} from './effectRegistry';
const unreleased=new Set([...historicalNormalBatch,...historicalNormalBatch4,...mechanicalBatch5].map(c=>c.id));
export function cardDistributionAllowed(id:string):boolean{return !!getPlayableCard(id)&&!unreleased.has(id);}
