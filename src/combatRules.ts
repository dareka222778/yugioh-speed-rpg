/** Declarative combat vocabulary, separate from card identity and UI. */
export type CombatRule=
 |{kind:'direct'}
 |{kind:'piercing'}
 |{kind:'attacks';maximum:2}
 |{kind:'damage';mode:'zero'|'double';when:'battle'|'direct'|'defending'}
 |{kind:'indestructible';opponentAtkAtLeast?:number;equalAtk?:true}
 |{kind:'stat';when:'attacking'|'battling'|'defending';attribute?:string;race?:string;calculationOnly?:true;atk:number;def:number;halfDef?:true}
 |{kind:'attackLP';amount:number;playerRule?:true};
export function combatRuleIssues(value:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value))return ['invalid-combat-rule'];
 const r=value as CombatRule,k=Object.keys(r),keys=(allowed:string[])=>k.every(key=>allowed.includes(key));
 if(r.kind==='direct')return keys(['kind'])?[]:['invalid-direct-attack'];
 if(r.kind==='piercing')return keys(['kind'])?[]:['invalid-piercing-rule'];
 if(r.kind==='attacks')return keys(['kind','maximum'])&&r.maximum===2?[]:['invalid-attack-count'];
 if(r.kind==='damage')return keys(['kind','mode','when'])&&(r.mode==='zero'&&r.when==='battle'||r.mode==='double'&&['direct','defending'].includes(r.when))?[]:['invalid-battle-damage-rule'];
 if(r.kind==='indestructible')return keys(['kind','opponentAtkAtLeast','equalAtk'])&&(r.opponentAtkAtLeast===undefined||Number.isSafeInteger(r.opponentAtkAtLeast)&&r.opponentAtkAtLeast>=0)&&(r.equalAtk===undefined||r.equalAtk===true)?[]:['invalid-battle-protection'];
 if(r.kind==='attackLP')return keys(['kind','amount','playerRule'])&&Number.isSafeInteger(r.amount)&&r.amount>0&&(r.playerRule===undefined||r.playerRule===true)?[]:['invalid-attack-cost'];
 if(r.kind==='stat')return keys(['kind','when','attribute','race','calculationOnly','atk','def','halfDef'])&&['attacking','battling','defending'].includes(r.when)&&Number.isSafeInteger(r.atk)&&Number.isSafeInteger(r.def)&&(r.attribute===undefined||['DARK','LIGHT','EARTH','WIND','FIRE','WATER','DIVINE'].includes(r.attribute))&&(r.race===undefined||typeof r.race==='string'&&r.race.length>0)&&(r.calculationOnly===undefined||r.calculationOnly===true)&&(r.halfDef===undefined||r.halfDef===true)?[]:['invalid-battle-stat'];
 return ['unknown-combat-rule'];
}
export function combatRuleText(r:CombatRule):string{
 if(r.kind==='direct')return 'Pode atacar diretamente mesmo se o oponente controlar monstros.';
 if(r.kind==='piercing')return 'Causa dano de batalha perfurante ao atacar um monstro em Defesa.';
 if(r.kind==='attacks')return 'Pode declarar até dois ataques nesta Fase de Batalha; um ataque negado também consome uma declaração.';
 if(r.kind==='attackLP')return `Exige pagar ${r.amount} PV para declarar cada ataque.`;
 if(r.kind==='indestructible')return `Não é destruído em batalha${r.opponentAtkAtLeast!==undefined?` contra monstro de ATK ${r.opponentAtkAtLeast} ou maior`:r.equalAtk?' quando os dois monstros têm ATK igual':''}. O dano ainda é calculado.`;
 if(r.kind==='damage')return `${r.mode==='zero'?'Zera':'Dobra'} o dano de batalha ${r.when==='direct'?'de seu ataque direto':r.when==='defending'?'que o atacante adversário recebe ao atacá-lo':'recebido pelo seu controlador em uma batalha envolvendo este monstro'}.`;
 return `Durante ${r.calculationOnly?'o cálculo de dano':'a Etapa de Dano'}, ${r.when==='attacking'?'ao atacar':r.when==='defending'?'ao ser atacado':'ao batalhar'}${r.attribute?' contra '+r.attribute:r.race?' contra '+r.race:''}, aplique ${r.atk>=0?'+':''}${r.atk} ATK e ${r.def>=0?'+':''}${r.def} DEF${r.halfDef?' e reduza a DEF à metade':''}.`;
}
