import {getCard} from './collection';
import {getEffect,equipEligible,isQuickPlaySpell} from './effectRegistry';
import type {Action,Backrow,CardRef,DuelState,Monster,Pending} from './duelEngine';
export type EffectServices={destroy:(s:DuelState,uid:string)=>void;note:(s:DuelState,line:string)=>void;finish:(s:DuelState,winner:number|null,reason:string)=>void;checkLP:(s:DuelState)=>void;onSpecialSummon?:(s:DuelState,actor:number,uid:string,id:string)=>void};
export function spellActions(s:DuelState,index:number,c:CardRef):Action[]{
 const e=getEffect(c.id),p=s.players[index],op=s.players[1-index];if(!e)return [];
 // Quick-Play cards Set during this turn cannot be activated until a later turn.
 if(isQuickPlaySpell(c.id)&&p.backrow.some(b=>b.uid===c.uid&&b.setTurn===s.turn))return [];
 const targeted=(ids:string[])=>ids.map(target=>({kind:'spell',card:c.uid,target}) as Action);
 switch(e.kind){
  case 'equip':return targeted(s.players.flatMap(p=>p.monsters.filter(m=>m.faceUp&&equipEligible(e,getCard(m.id)!)).map(m=>m.uid)));
  case 'monsterReborn':return p.monsters.length>=3?[]:s.players.flatMap(p=>p.grave.filter(m=>getCard(m.id)?.kind==='monster'&&(!getCard(m.id)?.fusion||m.properlySummoned)).flatMap(m=>(['atk','def'] as const).map(position=>({kind:'spell',card:c.uid,target:m.uid,position}))));
  case 'changeHeart':return p.monsters.length<3?targeted(op.monsters.map(m=>m.uid)):[];
  case 'blockAttack':return targeted(op.monsters.filter(m=>m.faceUp&&m.position==='atk').map(m=>m.uid));
  // A facedown target's identity must never determine the action menu.
  case 'deSpell':return targeted(s.players.flatMap(p=>[...p.backrow,...p.field?[p.field]:[]].filter(t=>t.uid!==c.uid&&(!t.faceUp||getCard(t.id)?.kind==='spell')).map(t=>t.uid)));
  case 'mysticalSpaceTyphoon':return targeted(s.players.flatMap(p=>[...p.backrow,...p.field?[p.field]:[]].filter(t=>t.uid!==c.uid).map(t=>t.uid)));
  case 'bookOfMoon':return targeted(s.players.flatMap(p=>p.monsters.filter(m=>m.faceUp).map(m=>m.uid)));
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
export function persistentModifier(m:Monster,s:DuelState,stat:'atk'|'def'){
 if(!m.faceUp)return 0;const info=getCard(m.id)!;let value=0;
 for(const p of s.players){
  if(p.field?.faceUp&&p.field.resolved!==false){const e=getEffect(p.field.id);if(e?.kind==='field'){if(e.races.includes(info.race??''))value+=e[stat];if(e.penaltyRaces?.includes(info.race??''))value-=e[stat];}}
  for(const b of p.backrow)if(b.faceUp&&b.resolved&&b.equippedTo===m.uid){const e=getEffect(b.id);if(e?.kind==='equip'&&equipEligible(e,info))value+=e[stat];}
 }
 return value;
}
export function discardBackrow(s:DuelState,uid:string){
 for(const p of s.players){const b=p.backrow.find(b=>b.uid===uid);if(b){p.backrow=p.backrow.filter(b=>b.uid!==uid);p.grave.push({id:b.id,uid:b.uid});return;}if(p.field?.uid===uid){p.grave.push({id:p.field.id,uid:p.field.uid});p.field=null;return;}}
}
export function cleanEquips(s:DuelState){
 for(const p of s.players)for(const b of [...p.backrow])if(b.equippedTo){const target=s.players.flatMap(p=>p.monsters).find(m=>m.uid===b.equippedTo);const e=getEffect(b.id);if(!target?.faceUp||e?.kind!=='equip'||!equipEligible(e,getCard(target.id)!))discardBackrow(s,b.uid);}
}
/** Being set by an effect clears temporary stat/soft-use modifiers, but does
 * not spend the player's manual position change or erase summon/attack history.
 * Ownership, scheduled return of control and proper Fusion status persist. */
export function turnMonsterFaceDown(m:Monster):void{
 m.faceUp=false;m.position='def';m.atkBoost=0;m.defBoost=0;
 delete m.swappedUntil;delete m.effectUsedTurn;
}
export function resolveClassicSpell(s:DuelState,a:Extract<Pending,{kind:'spell'}>,service:EffectServices):boolean{
 const e=getEffect(a.id),p=s.players[a.actor],op=s.players[1-a.actor];if(!e)return false;
 const found=s.players.flatMap((p,index)=>p.monsters.map(m=>({p,m,index}))).find(t=>t.m.uid===a.target);
 switch(e.kind){
  case 'heal':p.lp+=e.amount;service.note(s,`${p.name} recuperou ${e.amount} PV.`);return true;
  case 'burn':op.lp=Math.max(0,op.lp-e.amount);service.note(s,`${op.name} recebeu ${e.amount} de dano.`);service.checkLP(s);return true;
  case 'darkHole':for(const m of s.players.flatMap(p=>[...p.monsters]))service.destroy(s,m.uid);service.note(s,'Buraco Negro destruiu os monstros do campo.');return true;
  case 'raigeki':
   for(const m of [...op.monsters])service.destroy(s,m.uid);
   service.note(s,'Raigeki destruiu os monstros do adversário.');return true;
  case 'potOfGreed':
   if(p.deck.length<2){service.finish(s,1-a.actor,'não conseguiu comprar 2 cartas');return true;}
   p.hand.push(...p.deck.splice(0,2));
   service.note(s,`${p.name} comprou 2 cartas com Pote da Ganância.`);return true;
  case 'cardDestruction':{
   const need=s.players.map(p=>p.hand.length),failed=s.players.map((p,i)=>p.deck.length<need[i]);
   for(const [i,p]of s.players.entries()){p.grave.push(...p.hand);p.hand=p.deck.splice(0,need[i]);}
   service.note(s,'Destruição de Cards: as duas mãos foram descartadas e recompradas.');
   if(failed[0]&&failed[1])service.finish(s,null,'ambos não conseguiram comprar as cartas');else if(failed.some(Boolean))service.finish(s,failed[0]?1:0,'não conseguiu comprar uma carta');return true;
  }
  case 'mysticalSpaceTyphoon':if(a.target&&s.players.some(p=>p.backrow.some(b=>b.uid===a.target)||p.field?.uid===a.target)){discardBackrow(s,a.target);service.note(s,'Tufão Espacial Místico destruiu a Magia/Armadilha escolhida.');}return true;
  case 'bookOfMoon':
   if(found?.m.faceUp){turnMonsterFaceDown(found.m);service.note(s,`Livro da Lua colocou ${getCard(found.m.id)!.name} em Defesa com a face para baixo.`);}
   return true;
  case 'giantTrunade':for(const p of s.players){p.hand.push(...p.backrow.map(b=>({id:b.id,uid:b.uid})));p.backrow=[];if(p.field){p.hand.push({id:p.field.id,uid:p.field.uid});p.field=null;}}service.note(s,'Retorno Gigante devolveu as Magias e Armadilhas às mãos.');return true;
  case 'shieldSword':for(const p of s.players)for(const m of p.monsters)if(m.faceUp)m.swappedUntil=m.swappedUntil===s.turn?undefined:s.turn;service.note(s,'ATK e DEF originais dos monstros revelados foram trocados até o fim do turno.');return true;
  case 'blockAttack':if(found&&found.index!==a.actor&&found.m.faceUp)found.m.position='def';return true;
  case 'monsterReborn':{
   if(p.monsters.length>=3)return true;
   for(const [index,owner]of s.players.entries()){const c=owner.grave.find(c=>c.uid===a.target);if(c&&getCard(c.id)?.kind==='monster'&&(!getCard(c.id)?.fusion||c.properlySummoned)){owner.grave=owner.grave.filter(ref=>ref.uid!==a.target);p.monsters.push({...c,owner:index,position:a.position??'atk',faceUp:true,entered:s.turn,changed:s.turn,attacked:0,atkBoost:0,defBoost:0});service.note(s,`${p.name} reviveu ${getCard(c.id)!.name}.`);service.onSpecialSummon?.(s,a.actor,c.uid,c.id);break;}}
   return true;
  }
  case 'changeHeart':if(found&&found.index!==a.actor&&p.monsters.length<3){found.p.monsters=found.p.monsters.filter(m=>m.uid!==found.m.uid);found.m.owner??=found.index;found.m.returnTo=found.index;found.m.returnTurn=s.turn;p.monsters.push(found.m);service.note(s,`${p.name} ganhou o controle temporário de um monstro.`);}return true;
  case 'deSpell':case 'removeTrap':{
   const b=s.players.flatMap(p=>[...p.backrow,...p.field?[p.field]:[]]).find(b=>b.uid===a.target);if(b&&e.kind==='deSpell'&&!b.faceUp)service.note(s,`Des-Magia revelou ${getCard(b.id)!.name}.`);if(b&&getCard(b.id)?.kind===(e.kind==='deSpell'?'spell':'trap')&&(e.kind==='deSpell'||b.faceUp))discardBackrow(s,b.uid);return true;
  }
  case 'equip':{
   const b=p.backrow.find(b=>b.uid===a.card);if(b){if(found?.m.faceUp&&equipEligible(e,getCard(found.m.id)!)){b.equippedTo=found.m.uid;b.resolved=true;service.note(s,`${getCard(b.id)!.name} foi equipado a ${getCard(found.m.id)!.name}.`);}else discardBackrow(s,b.uid);}return true;
  }
  default:return false;
 }
}
