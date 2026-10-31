import type {DuelState} from './duelEngine';
import {getMonsterEffect} from './monsterEffects';
import {cleanEquips} from './classicEffects';
import {synchronizeCardLifetimes} from './cardLifetime';
/** Shared physical exit: preserves original ownership, Fusion history and
 * existing grave-trigger policy. A control change never grants ownership. */
export function sendMonsterToGrave(s:DuelState,uid:string,byBattle=false):boolean{
 const controller=s.players.findIndex(p=>p.monsters.some(m=>m.uid===uid));if(controller<0)return false;
 synchronizeCardLifetimes(s);
 const p=s.players[controller],monster=p.monsters.find(m=>m.uid===uid)!,owner=monster.owner??controller;
 p.monsters=p.monsters.filter(m=>m.uid!==uid);
 s.players[owner].grave.push({uid:monster.uid,id:monster.id,...monster.properlySummoned?{properlySummoned:true}:{}});
 const effect=getMonsterEffect(monster.id);
 if(effect?.trigger==='onSentToGrave'||byBattle&&effect?.trigger==='onBattleDestroyed')(s.graveTriggers??=[]).push({actor:owner,card:monster.uid,id:monster.id});
 cleanEquips(s);synchronizeCardLifetimes(s);return true;
}
