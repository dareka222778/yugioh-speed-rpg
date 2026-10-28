import {fusionBatch8} from './fusionBatch8';
import {mechanicalBatch11} from './mechanicalBatch11';
import {historicalFusionBatch10} from './historicalFusionBatch10';
import {historicalNormalBatch9} from './historicalNormalBatch9';
import {mechanicalBatch8} from './mechanicalBatch8';
import {mechanicalBatch7} from './mechanicalBatch7';
import {mechanicalBatch5} from './mechanicalBatch5';
import {historicalNormalBatch4} from './historicalNormalBatch4';
import {historicalNormalBatch} from './historicalNormalBatch';
import {getPlayableCard} from './effectRegistry';
const unreleased=new Set([...historicalNormalBatch,...historicalNormalBatch4,...mechanicalBatch5,...mechanicalBatch7,...mechanicalBatch8,...fusionBatch8,...historicalNormalBatch9,...historicalFusionBatch10,...mechanicalBatch11].map(c=>c.id));
export function cardDistributionAllowed(id:string):boolean{return !!getPlayableCard(id)&&!unreleased.has(id);}
