import type {DuelState} from './duelEngine';
import {getMonsterEffect} from './monsterEffects';
import {bindTarget,targetBindingValid,type TargetBinding} from './cardLifetime';
export type StandbySource={id:string;binding:TargetBinding};
export type MonsterStandby={turn:number;used:StandbySource[]};
export function matchesStandbySource(s:DuelState,x:StandbySource){
 const b=x.binding,rule=getMonsterEffect(x.id)?.standby;
 if(!rule||rule.zone!==b.zone||!targetBindingValid(s,b))return false;
 if(b.zone==='grave')return s.players.some(p=>p.grave.some(c=>c.uid===b.uid&&c.id===x.id));
 const m=s.players.flatMap(p=>p.monsters).find(c=>c.uid===b.uid&&c.id===x.id);
 return !!m?.faceUp&&(!rule.position||m.position===rule.position);
}
export function standbySources(s:DuelState){
 const p=s.players[s.current],available:StandbySource[]=[];
 for(const zone of ['monsters','grave'] as const)for(const c of p[zone]){
  const effect=getMonsterEffect(c.id);
  if(effect?.trigger!=='ownStandby'||effect.standby?.zone!==zone||s.blockedEffectNames?.[s.current]?.[c.id]===s.turn)continue;
  const binding=bindTarget(s,c.uid);if(!binding)continue;
  if(s.monsterStandby?.used.some(x=>x.binding.uid===c.uid&&x.binding.epoch===binding.epoch))continue;
  if(matchesStandbySource(s,{id:c.id,binding}))available.push({id:c.id,binding});
 }
 return available;
}
export function verifyStandby(s:DuelState){
 const f=s.monsterStandby,p=s.pending,order=s.choice?.source==='standbyMonsterOrder';
 function fail():never{throw Error('Continuação de Espera de monstro inválida.');}
 if(!f){if(order||p.kind==='standbyMonster')fail();return;}
 if(f.turn!==s.turn||!Array.isArray(f.used)||f.used.length>256||s.phase==='finished')fail();
 const keys=new Set<string>();
 for(const x of f.used){const b=x?.binding;if(!b||typeof b.uid!=='string'||!Number.isSafeInteger(b.epoch)||b.epoch<0||getMonsterEffect(x.id)?.standby?.zone!==b.zone)fail();const key=JSON.stringify([b.uid,b.epoch]);if(keys.has(key))fail();keys.add(key);}
 if(p.kind==='standbyMonster'&&(p.actor!==s.current||!f.used.some(x=>x.id===p.id&&x.binding.uid===p.card&&x.binding.zone===p.binding?.zone&&x.binding.epoch===p.binding?.epoch&&p.binding.uid===p.card)))fail();
 if(order&&(s.phase!=='choice'||s.choice!.actor!==s.current||p.kind!=='none'||JSON.stringify(s.choice!.targets)!==JSON.stringify(standbySources(s).map(x=>x.binding.uid))))fail();
}
