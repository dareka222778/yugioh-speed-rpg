/** Evaluate only the public, currently affected group using the saved v8 catalog.
 * This is a tactical heuristic, never an extra legality restriction. */
import {atk,def,type DuelState} from './duelEngine';
import type {Effect} from './effectDefinitions';
import {getCatalogData} from './catalogArchive';
import {runCatalog} from './resolvers/v8/catalogRuntime';
import {getDestructionModel} from './resolvers/v8/effectModels';
import {destructionTargets} from './resolvers/v8/effectOperations';
import {canAffectMonster} from './resolvers/v8/continuousEffects';
import type {DuelState as V8State} from './resolvers/v8/duelEngineCurrent';
export function filteredDestructionUtility(s:DuelState,actor:number,e:Extract<Effect,{kind:'destroyFiltered'}>):number{
 if(s.resolverVersion!=='engine-v8'||!s.catalogRevision||![0,1].includes(actor))return 0;
 const state=s as V8State;
 // This branch explicitly loads an immutable engine-v8 snapshot, not the
 // expanded current-catalog schema used by newer effects.
 return runCatalog(s.catalogRevision,getCatalogData(s.catalogRevision,'engine-v8') as unknown as Parameters<typeof runCatalog>[1],()=>{
  const targets=new Set(destructionTargets(state,actor,getDestructionModel(e)!));let score=0;
  for(let side=0;side<2;side++)for(const m of s.players[side].monsters){
   if(!m.faceUp||!targets.has(m.uid)||!canAffectMonster(state,m.uid,'spell'))continue;
   const value=100+Math.max(atk(m,s),def(m,s));score+=(side===actor?-1:1)*value;
  }
  return score;
 });
}
