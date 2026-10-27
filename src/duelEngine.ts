/** Stable entrypoint: saved games select immutable executable implementations. */
import * as current from './duelEngineCurrent';
import {getArchivedDefinitionResolver,resolverVersionFor} from './resolverArchive';
export type * from './duelEngineCurrent';
export {getArchivedDefinitionResolver} from './resolverArchive';
export const IMPLEMENTED_DUEL_CARDS=current.IMPLEMENTED_DUEL_CARDS;
export const createDuel=current.createDuel;
export const validateDuelCards=current.validateDuelCards;
const implementation=(s:{resolverVersion?:unknown}):typeof current=>resolverVersionFor(s)==='engine-v1'?getArchivedDefinitionResolver('engine-v1') as unknown as typeof current:current;
export function step(...args:Parameters<typeof current.step>):ReturnType<typeof current.step>{return implementation(args[0]).step(...args);}
export function legalActions(...args:Parameters<typeof current.legalActions>):ReturnType<typeof current.legalActions>{return implementation(args[0]).legalActions(...args);}
export function decisionPlayer(...args:Parameters<typeof current.decisionPlayer>):ReturnType<typeof current.decisionPlayer>{return implementation(args[0]).decisionPlayer(...args);}
export function timeoutDuel(...args:Parameters<typeof current.timeoutDuel>):ReturnType<typeof current.timeoutDuel>{return implementation(args[0]).timeoutDuel(...args);}
export function actionLabel(...args:Parameters<typeof current.actionLabel>):ReturnType<typeof current.actionLabel>{return implementation(args[0]).actionLabel(...args);}
export function atk(...args:Parameters<typeof current.atk>):number{return (args[1]?implementation(args[1]):current).atk(...args);}
export function def(...args:Parameters<typeof current.def>):number{return (args[1]?implementation(args[1]):current).def(...args);}
