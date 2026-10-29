import {positionTargets,executePositionChange} from './positionOperations';
import {ritualCandidates} from './ritualSummon';
import {continuousModifier,canAffectMonster,addTemporaryModifier} from './continuousEffects';
import {RULES_PROFILE} from './rulesProfile';
import {getDuelCard as getCard} from './effectRegistry';
import {getEffect,equipEligible,isQuickPlaySpell} from './effectRegistry';
import type {Action,Backrow,CardRef,DuelState,Monster,Pending} from './duelEngine';
import {resolveSpellException} from './spellExceptions';
import {canStartEconomicOperations,executeEconomicOperations} from './economicOperations';
import {searchZoneTargets} from './searchZoneRules';
import {shuffleDuel} from './duelRandom';
import {economicOperations} from './effectModels';
import {getDestructionModel} from './effectModels';
import {executeDestruction,destructionTargets} from './effectOperations';
import {specialSummonFromPile} from './monsterEntry';
export type EffectServices={destroy:(s:DuelState,uid:string)=>void;attack:(m:Monster,s:DuelState)=>number;note:(s:DuelState,line:string)=>void;finish:(s:DuelState,winner:number|null,reason:string)=>void;checkLP:(s:DuelState)=>void;onSpecialSummon?:(s:DuelState,actor:number,uid:string,id:string)=>void};
export function spellActions(s:DuelState,index:number,c:CardRef):Action[]{
 const e=getEffect(c.id),p=s.players[index],op=s.players[1-index];if(!e)return [];
 // Quick-Play cards Set during this turn cannot be activated until a later turn.
 if(isQuickPlaySpell(c.id)&&p.backrow.some(b=>b.uid===c.uid&&b.setTurn===s.turn))return [];
 if(e.kind==='choiceSequence')return e.choices.flatMap((choice,n)=>canStartEconomicOperations(s,index,choice.operations)?[{kind:'spell' as const,card:c.uid,target:`__choice_${n}__`}]:[]);
 if(e.kind==='searchZone')return searchZoneTargets(s,index,e.rule,getCard).map(m=>({kind:'spell',card:c.uid,target:m.uid}));
 if(e.kind==='positionChange')return e.rule.scope==='selected'?positionTargets(s,index,e.rule).map(m=>({kind:'spell',card:c.uid,target:m.uid})):positionTargets(s,index,e.rule).length?[{kind:'spell',card:c.uid}]:[];
 if(e.kind==='sequence')return canStartEconomicOperations(s,index,e.operations)?[{kind:'spell',card:c.uid}]:[];
 const targeted=(ids:string[])=>ids.map(target=>({kind:'spell',card:c.uid,target}) as Action);
 switch(e.kind){
  case 'ritualSummon':return ritualCandidates(s,index,e.ritual).length?[{kind:'spell',card:c.uid}]:[];
  case 'destroyFiltered':return destructionTargets(s,index,getDestructionModel(e)!).length?[{kind:'spell',card:c.uid}]:[];
  case 'continuous':return p.lp>(e.lpCost??0)?[{kind:'spell',card:c.uid}]:[];
  case 'temporaryModifier':return targeted(s.players.flatMap(p=>p.monsters.filter(m=>m.faceUp).map(m=>m.uid)));
  case 'destroySpellTraps':return s.players.some((player,side)=>(e.scope==='all'||side!==index)&&(player.backrow.some(b=>b.uid!==c.uid)||!!player.field))?[{kind:'spell',card:c.uid}]:[];
  case 'equip':return targeted(s.players.flatMap(p=>p.monsters.filter(m=>m.faceUp&&equipEligible(e,getCard(m.id)!)).map(m=>m.uid)));
  case 'monsterReborn':return p.monsters.length>=RULES_PROFILE.monsterZones?[]:s.players.flatMap(p=>p.grave.filter(m=>getCard(m.id)?.kind==='monster'&&(!(getCard(m.id)?.fusion||getCard(m.id)?.monsterType==='ritual')||m.properlySummoned)).flatMap(m=>(['atk','def'] as const).map(position=>({kind:'spell',card:c.uid,target:m.uid,position}))));
  case 'changeHeart':return p.monsters.length<RULES_PROFILE.monsterZones?targeted(op.monsters.map(m=>m.uid)):[];
  case 'blockAttack':return targeted(op.monsters.filter(m=>m.faceUp&&m.position==='atk').map(m=>m.uid));
  // A facedown target's identity must never determine the action menu.
  case 'deSpell':return targeted(s.players.flatMap(p=>[...p.backrow,...p.field?[p.field]:[]].filter(t=>t.uid!==c.uid&&(!t.faceUp||getCard(t.id)?.kind==='spell')).map(t=>t.uid)));
  case 'mysticalSpaceTyphoon':return targeted(s.players.flatMap(p=>[...p.backrow,...p.field?[p.field]:[]].filter(t=>t.uid!==c.uid).map(t=>t.uid)));
  case 'bookOfMoon':return targeted(s.players.flatMap(p=>p.monsters.filter(m=>m.faceUp&&!m.entityKind).map(m=>m.uid)));
  case 'removeTrap':return targeted(s.players.flatMap(p=>p.backrow.filter(t=>t.uid!==c.uid&&t.faceUp&&getCard(t.id)?.kind==='trap').map(t=>t.uid)));
  case 'darkHole':return s.players.some(p=>p.monsters.length)?[{kind:'spell',card:c.uid}]:[];
  case 'raigeki':return op.monsters.length?[{kind:'spell',card:c.uid}]:[];
  case 'potOfGreed':return p.deck.length>=2?[{kind:'spell',card:c.uid}]:[];
  case 'cardDestruction':return p.hand.some(h=>h.uid!==c.uid)||op.hand.length?[{kind:'spell',card:c.uid}]:[];
  case 'giantTrunade':return s.players.some(p=>p.field||p.backrow.some(b=>b.uid!==c.uid))?[{kind:'spell',card:c.uid}]:[];
  case 'shieldSword':return s.players.some(p=>p.monsters.some(m=>m.faceUp))?[{kind:'spell',card:c.uid}]:[];
  case 'heal':case 'burn':return [{kind:'spell',card:c.uid}];
  case 'fissure':return op.monsters.some(m=>m.faceUp)?[{kind:'spell',card:c.uid}]:[];
  default:return [];
 }
}
export function persistentModifier(m:Monster,s:DuelState,stat:'atk'|'def'){return continuousModifier(s,m,stat);}
export function discardBackrow(s:DuelState,uid:string){
 for(const p of s.players){const b=p.backrow.find(b=>b.uid===uid);if(b){p.backrow=p.backrow.filter(b=>b.uid!==uid);p.grave.push({id:b.id,uid:b.uid});return;}if(p.field?.uid===uid){p.grave.push({id:p.field.id,uid:p.field.uid});p.field=null;return;}}
}
/** Snapshot the entire group before zone/equipment cleanup. A resolving Normal Spell is already consumed. */
export function destroySpellTrapGroup(s:DuelState,actor:number,scope:'all'|'opponent',source:string):number{
 const targets=s.players.flatMap((p,index)=>scope==='opponent'&&index===actor?[]:[...p.backrow.map(b=>b.uid),...p.field?[p.field.uid]:[]]).filter(uid=>uid!==source);
 for(const uid of targets)discardBackrow(s,uid);return targets.length;
}
export function cleanEquips(s:DuelState){
 for(const p of s.players)for(const b of [...p.backrow])if(b.equippedTo){const target=s.players.flatMap(p=>p.monsters).find(m=>m.uid===b.equippedTo);const e=getEffect(b.id);if(!target?.faceUp||e?.kind!=='equip'||!equipEligible(e,getCard(target.id)!))discardBackrow(s,b.uid);}
}
/** Being set by an effect clears temporary stat/soft-use modifiers, but does
 * not spend the player's manual position change or erase summon/attack history.
 * Ownership, scheduled return of control and proper Fusion status persist. */
export function turnMonsterFaceDown(m:Monster):void{
 if(m.entityKind==='token')throw new Error('Fichas não podem ficar com a face para baixo.');
 m.faceUp=false;m.position='def';m.atkBoost=0;m.defBoost=0;
 delete m.swappedUntil;delete m.effectUsedTurn;
}
export function resolveClassicSpell(s:DuelState,a:Extract<Pending,{kind:'spell'}>,service:EffectServices):boolean{
 const e=getEffect(a.id),p=s.players[a.actor],op=s.players[1-a.actor];if(!e)return false;
 if(e.kind==='positionChange'){executePositionChange(s,a.actor,e.rule,'spell',a.target,turnMonsterFaceDown);service.note(s,'Mudança de posição resolvida.');return true;}
 if(e.kind==='searchZone'){
  const selected=searchZoneTargets(s,a.actor,e.rule,getCard).find(m=>m.uid===a.target);
  if(selected){const pool=p.deck.some(m=>m.uid===selected.uid)?p.deck:p.grave;const i=pool.findIndex(m=>m.uid===selected.uid);
   if(i>=0){const [found]=pool.splice(i,1);p.hand.push(found);if(pool===p.deck)shuffleDuel(p.deck,s);service.note(s,`${getCard(a.id)!.name}: carta elegível adicionada à mão.`);}
  }else service.note(s,`${getCard(a.id)!.name}: o alvo deixou de estar elegível.`);
  return true;
 }
 if(e.kind==='choiceSequence'){
  const match=/^__choice_(\d+)__$/.exec(a.target??'');
  const selected=match?e.choices[Number(match[1])]:undefined;
  if(!selected)throw new Error('Escolha econômica inválida.');
  executeEconomicOperations(s,a.actor,selected.operations,{...service,cardAttribute:id=>getCard(id)?.attribute??undefined});
  service.note(s,`Efeito de ${getCard(a.id)!.name} resolvido conforme a escolha anunciada.`);
  return true;
 }
 const found=s.players.flatMap((p,index)=>p.monsters.map(m=>({p,m,index}))).find(t=>t.m.uid===a.target);
 const destruction=getDestructionModel(e);
 if(destruction){
  executeDestruction(s,a.actor,destruction,a.target,{...service,kind:'spell'});
  service.note(s,e.kind==='destroyFiltered'?'A destruição filtrada foi resolvida.':e.kind==='darkHole'?'Buraco Negro destruiu os monstros do campo.':'Raigeki destruiu os monstros do adversário.');return true;
 }
 if(resolveSpellException(s,a,service))return true;
 const operations=economicOperations(e);
 if(operations){
  const completed=executeEconomicOperations(s,a.actor,operations,{...service,cardAttribute:id=>getCard(id)?.attribute??undefined});
  if(e.kind==='heal')service.note(s,`${p.name} recuperou ${e.amount} PV.`);
  else if(e.kind==='burn')service.note(s,`${op.name} recebeu ${e.amount} de dano.`);
  else if(e.kind==='potOfGreed'&&completed)service.note(s,`${p.name} comprou 2 cartas com Pote da Ganância.`);
  else if(e.kind==='sequence'&&completed)service.note(s,'Efeito de compra/PV resolvido.');
  return true;
 }

 switch(e.kind){
  case 'continuous':{const source=p.backrow.find(b=>b.uid===a.card);if(source?.faceUp)source.resolved=true;return true;}
  case 'temporaryModifier':if(found&&canAffectMonster(s,found.m.uid,'spell'))addTemporaryModifier(s,found.m.uid,e.atk,e.def);return true;
  case 'destroySpellTraps':destroySpellTrapGroup(s,a.actor,e.scope,a.card);service.note(s,'O grupo de Magias/Armadilhas foi destruído.');return true;
  case 'mysticalSpaceTyphoon':
   if(a.target&&s.players.some(p=>p.backrow.some(b=>b.uid===a.target)||p.field?.uid===a.target)){
    discardBackrow(s,a.target);service.note(s,'Tufão Espacial Místico destruiu a Magia/Armadilha escolhida, sem negar sua ativação.');
   }else service.note(s,'Tufão Espacial Místico: o alvo já saiu do campo; nenhuma carta foi destruída por este efeito.');
   return true;
  case 'bookOfMoon':
   if(found?.m.faceUp&&!found.m.entityKind&&canAffectMonster(s,found.m.uid,'spell')){turnMonsterFaceDown(found.m);service.note(s,`Livro da Lua colocou ${getCard(found.m.id)!.name} em Defesa com a face para baixo.`);}
   return true;
  case 'giantTrunade':for(const p of s.players){p.hand.push(...p.backrow.map(b=>({id:b.id,uid:b.uid})));p.backrow=[];if(p.field){p.hand.push({id:p.field.id,uid:p.field.uid});p.field=null;}}service.note(s,'Retorno Gigante devolveu as Magias e Armadilhas às mãos.');return true;
  case 'blockAttack':if(found&&found.index!==a.actor&&found.m.faceUp&&canAffectMonster(s,found.m.uid,'spell'))found.m.position='def';return true;
  case 'monsterReborn':{
   for(const [index]of s.players.entries()){
    const revived=specialSummonFromPile(s,a.actor,index,'grave',a.target??'',a.position??'atk');
    if(revived){service.note(s,`${p.name} reviveu ${getCard(revived.id)!.name}.`);service.onSpecialSummon?.(s,a.actor,revived.uid,revived.id);break;}
   }
   return true;
  }
  case 'changeHeart':if(found&&found.index!==a.actor&&p.monsters.length<RULES_PROFILE.monsterZones&&canAffectMonster(s,found.m.uid,'spell')){found.p.monsters=found.p.monsters.filter(m=>m.uid!==found.m.uid);found.m.owner??=found.index;found.m.returnTo=found.index;found.m.returnTurn=s.turn;p.monsters.push(found.m);service.note(s,`${p.name} ganhou o controle temporário de um monstro.`);}return true;
  case 'deSpell':case 'removeTrap':{
   const b=s.players.flatMap(p=>[...p.backrow,...p.field?[p.field]:[]]).find(b=>b.uid===a.target);if(b&&e.kind==='deSpell'&&!b.faceUp)service.note(s,`Des-Magia revelou ${getCard(b.id)!.name}.`);if(b&&getCard(b.id)?.kind===(e.kind==='deSpell'?'spell':'trap')&&(e.kind==='deSpell'||b.faceUp))discardBackrow(s,b.uid);return true;
  }
  case 'equip':{
   const b=p.backrow.find(b=>b.uid===a.card);if(b){if(found?.m.faceUp&&equipEligible(e,getCard(found.m.id)!)){b.equippedTo=found.m.uid;b.resolved=true;service.note(s,`${getCard(b.id)!.name} foi equipado a ${getCard(found.m.id)!.name}.`);}else discardBackrow(s,b.uid);}return true;
  }
  default:return false;
 }
}
