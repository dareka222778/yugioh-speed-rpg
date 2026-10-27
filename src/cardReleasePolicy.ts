import {historicalNormalBatch} from './historicalNormalBatch';
const unreleased=new Set(historicalNormalBatch.map(c=>c.id));
export function cardDistributionAllowed(id:string):boolean{return !unreleased.has(id);}
