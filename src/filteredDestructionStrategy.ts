import {createRequire} from 'node:module';
import {isAbsolute} from 'node:path';
const loadStrategy=createRequire(typeof __filename==='string'&&isAbsolute(__filename)?__filename:process.cwd()+'/src/filteredDestructionStrategy.ts');
/** Evaluate only the public, currently affected group using the saved v8 catalog.
 * This is a tactical heuristic, never an extra legality restriction. */
import {atk,def,type DuelState} from './duelEngine';
import type {Effect} from './effectDefinitions';
import {getCatalogData} from './catalogArchive';
export function filteredDestructionUtility(s:DuelState,actor:number,e:Extract<Effect,{kind:'destroyFiltered'}>):number{
 if(!['engine-v8','engine-v9'].includes(s.resolverVersion??'')||!s.catalogRevision||![0,1].includes(actor))return 0;
 const state=s;
 const prefix=s.resolverVersion==='engine-v9'?'./':'./resolvers/v8/';
 const {runCatalog}=loadStrategy(prefix+'catalogRuntime') as typeof import('./catalogRuntime');
 const {getDestructionModel}=loadStrategy(prefix+'effectModels') as typeof import('./effectModels');
 const {destructionTargets}=loadStrategy(prefix+'effectOperations') as typeof import('./effectOperations');
 const {canAffectMonster}=loadStrategy(prefix+'continuousEffects') as typeof import('./continuousEffects');
 // Use the runtime and selectors belonging to the saved resolver version.
 return runCatalog(s.catalogRevision,getCatalogData(s.catalogRevision,s.resolverVersion as 'engine-v8'|'engine-v9') as unknown as Parameters<typeof runCatalog>[1],()=>{
  const targets=new Set(destructionTargets(state,actor,getDestructionModel(e)!));let score=0;
  for(let side=0;side<2;side++)for(const m of s.players[side].monsters){
   if(!m.faceUp||!targets.has(m.uid)||!canAffectMonster(state,m.uid,'spell'))continue;
   const value=100+Math.max(atk(m,s),def(m,s));score+=(side===actor?-1:1)*value;
  }
  return score;
 });
}
