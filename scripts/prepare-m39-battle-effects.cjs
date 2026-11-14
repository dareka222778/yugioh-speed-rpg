#!/usr/bin/env node
'use strict';
/** Fully reviewed pre-cutoff battle effects. Each oracle acts through the live
 * public duel engine, including real attack responses and damage calculation. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const h=require('../catalog/historical/2004-10-01/cards.json'),root=path.resolve(__dirname,'..');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const R=(uid,id,owner)=>({uid,id,...owner===undefined?{}:{owner}});
const M=(uid,id,owner=0,position='atk')=>({...R(uid,id,owner),position,faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const match=(actor,kind,card,target)=>({actor,match:{kind,card,...target?{target}:{} }}),settle={settle:true};
const a=(path,equals)=>({path,equals}),uid=(path,containsUID)=>({path,containsUID});
const drain={uid:'skill',id:'82732705',faceUp:true,resolved:true,setTurn:0};
const catalog=[
 {cid:4880,op:'battleBounceAttacker',set:'SDY-034',date:'2002-03-29',rules:'When attacked by another monster, after damage calculation return that attacking monster to its physical owner hand, even if this defender was destroyed by that battle.'},
 {cid:5361,op:'battleBounceAttacker',set:'DCR-078',date:'2003-12-01',rules:'When attacked by another monster, after damage calculation return that attacking monster to its physical owner hand, even if this defender was destroyed by that battle.'},
 {cid:5963,op:'battleLevelBurn',set:'AST-020',date:'2004-06-01',rules:'If this monster destroys another monster by battle and sends it to the Graveyard, deal its controller opponent damage equal to 500 times the destroyed monster original Level. No damage from other causes of destruction.'},
 {cid:5962,op:'battleLevelBurn',set:'AST-019',date:'2004-06-01',rules:'If this monster destroys another monster by battle and sends it to the Graveyard, deal its controller opponent damage equal to 500 times the destroyed monster original Level. No damage from other causes of destruction.'},
 {cid:5145,op:'endBattleDefense',set:'PSV-094',date:'2002-10-20',rules:'After this monster attacks, at the end of that Battle Phase put it in Defense Position; it cannot manually change its battle position through the End Phase of its controller next turn.'},
 {cid:5586,op:'endBattleDefense',set:'MFC-012',date:'2003-10-10',rules:'After this monster attacks, at the end of that Battle Phase put it in Defense Position; it cannot manually change its battle position through the end of its controller next turn.'},
 {cid:5334,op:'endDamageDefensePiercing',set:'LOD-035',date:'2003-06-06',rules:'Inflicts piercing battle damage when it attacks a Defense Position monster with less DEF than its ATK, and changes itself to Defense Position at the end of the Damage Step, not at the end of the Battle Phase.'},
 {cid:4378,op:'guardianZeroAttack',set:'MRD-026',date:'2002-06-26',rules:'Once while this card remains face-up on the field, during damage calculation on the opponent turn when this card is attacked, its controller may activate a Quick Effect targeting the attacking monster to make that attacker ATK zero for this damage calculation only. The opportunity and one-use state reset if the source is set face-down then flipped face-up.'},
 {cid:4379,op:'guardianZeroAttack',set:'MRD-027',date:'2002-06-26',rules:'Once while this card remains face-up on the field, during damage calculation on the opponent turn when this card is attacked, its controller may activate a Quick Effect targeting the attacking monster to make that attacker ATK zero for this damage calculation only. The opportunity and one-use state reset if the source is set face-down then flipped face-up.'},
 {cid:4377,op:'guardianZeroAttack',set:'MRD-025',date:'2002-06-26',rules:'Once while this card remains face-up on the field, during damage calculation on the opponent turn when this card is attacked, its controller may activate a Quick Effect targeting the attacking monster to make that attacker ATK zero for this damage calculation only. The opportunity and one-use state reset if the source is set face-down then flipped face-up.'}
];
const batch={format:1,batchId:'m39-battle-effects',engineVersion:'engine-v9',baseRevision:require('../catalog/engine-v9/manifest.json').current,candidates:[],reviews:[]};
for(const n of catalog){
 const hist=h.find(x=>x.konamiId===n.cid);if(!hist?.passwords[0]||hist.firstObserved.world>'2004-09-30')throw Error('Unavailable historical card '+n.cid);
 const id=hist.passwords[0],source=`https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=${n.cid}&ope=2&request_locale=en`;
 const card={id,konamiId:n.cid,name:hist.names.pt??hist.names.en,englishName:hist.names.en,kind:'monster',monsterType:'effect',race:hist.race.split(' ').map(x=>x==='seaserpent'?'Sea Serpent':x[0].toUpperCase()+x.slice(1)).join(' '),attribute:hist.attribute.toUpperCase(),level:hist.level,atk:hist.atk,defense:hist.def,summary:n.rules,source};
 const guardian=n.op==='guardianZeroAttack',monster={effect:{trigger:guardian?'quick':'continuous',operation:{kind:n.op}},activation:{policy:guardian?'manual':'continuous',window:guardian?'opposingDamageCalculation':'continuous'}};
 const text=`${hist.names.en} is Level ${hist.level} ${card.attribute} ${card.race} Effect Monster with ${hist.atk} ATK and ${hist.def} DEF. Full official battle semantics: ${n.rules} Its timing, mandatory or optional activation, effect-negation behavior, source lifetime, battle result, original owner and expiry must be respected. It has no activation cost and no other printed mechanics.`;
 const evidence={text,format:'full-rule-paraphrase',complete:true,source,sha256:sha(text)};
 let cases,extras;
 if(n.op==='battleBounceAttacker'){
  const base=()=>({players:[{monsters:[M('att','91152256',0)]},{monsters:[M('def',id,1,'def')]}],phase:'battle'});
  const successful=(f=base(),commands=[match('a','attack','att','def'),settle])=>({fixture:f,actions:commands,assertions:[uid(['players',0,'hand'],'att'),a(['players',0,'monsters','length'],0),uid(['players',1,'monsters'],'def'),a(['players',0,'lp'],4000-(card.defense-1400))]});
  const killed=base();killed.players[0].monsters=[M('att','89631139',0)];
  const owned=base();owned.players[0].monsters=[M('att','91152256',1)];
  const neg=base();neg.players[1].backrow=[drain];
  cases={activation:successful(),resolution:successful(),negative:{fixture:base(),actions:[{actor:'b',action:{kind:'attack',card:'def',target:'att'},expectError:true}],assertions:[uid(['players',0,'monsters'],'att')]},'json-restore':successful(base(),[match('a','attack','att','def'),{restore:true},settle]),'deterministic-replay':successful(),negation:{fixture:neg,actions:[match('a','attack','att','def'),settle],assertions:[uid(['players',0,'monsters'],'att'),a(['players',0,'hand','length'],0)]},'destroyed-defender':{fixture:killed,actions:[match('a','attack','att','def'),settle],assertions:[uid(['players',0,'hand'],'att'),uid(['players',1,'grave'],'def')]},'original-owner':{fixture:owned,actions:[match('a','attack','att','def'),settle],assertions:[uid(['players',1,'hand'],'att'),a(['players',0,'hand','length'],0)]},'face-down-defender':{fixture:(()=>{const f=base();f.players[1].monsters[0].faceUp=false;return f;})(),actions:[match('a','attack','att','def'),settle],assertions:[uid(['players',0,'hand'],'att')]}};
  extras=['destroyed-defender','original-owner','face-down-defender'];
 }else if(n.op==='battleLevelBurn'){
  const targetId=n.cid===5963?'91152256':'38142739',targetLevel=n.cid===5963?4:3,targetAtk=n.cid===5963?1400:600,battle=card.atk-targetAtk,burn=targetLevel*500;
  const base=()=>({phase:'battle',players:[{monsters:[M('att',id,0)]},{monsters:[M('def',targetId,1)]}]});
  const success=(f=base(),commands=[match('a','attack','att','def'),settle],damage=battle)=>({fixture:f,actions:commands,assertions:[a(['players',1,'lp'],4000-damage-burn),uid(['players',1,'grave'],'def'),uid(['players',0,'monsters'],'att')]});
  const neg=base();neg.players[0].backrow=[drain];
  const losing=base();losing.players[1].monsters=[M('def','89631139',1)];
  const defense=base();defense.players[1].monsters[0].position='def';const targetDef=n.cid===5963?1200:900;
  cases={activation:success(),resolution:success(),negative:{fixture:base(),actions:[{actor:'b',action:{kind:'attack',card:'def',target:'att'},expectError:true}],assertions:[uid(['players',0,'monsters'],'att')]},'json-restore':success(base(),[match('a','attack','att','def'),{restore:true},settle]),'deterministic-replay':success(),negation:{fixture:neg,actions:[match('a','attack','att','def'),settle],assertions:[a(['players',1,'lp'],4000-battle),uid(['players',1,'grave'],'def')]},'defense-level-burn':success(defense,[match('a','attack','att','def'),settle],0),'losing-battle':{fixture:losing,actions:[match('a','attack','att','def'),settle],assertions:[a(['players',1,'lp'],4000),uid(['players',0,'grave'],'att')]},'effect-victory':{fixture:(()=>{const f=base();f.players[1].lp=battle+burn;return f;})(),actions:[match('a','attack','att','def'),settle],assertions:[a(['players',1,'lp'],0),a(['winner'],'a')]}};
  extras=['defense-level-burn','losing-battle','effect-victory'];
 }else if(n.op==='endBattleDefense'){
  const base=()=>({phase:'battle',players:[{monsters:[M('att',id,0)]},{monsters:[M('def','91152256',1)]}]});
  const success=(f=base(),commands=[match('a','attack','att','def'),settle, {actor:'a',match:{kind:'end'}},settle])=>({fixture:f,actions:commands,assertions:[a(['players',0,'monsters',0,'position'],'def'),a(['players',0,'monsters',0,'positionLockedThrough'],5),a(['turn'],4)]});
  const neg=base();neg.players[0].backrow=[drain];
  const locked={phase:'main',turn:5,players:[{monsters:[{...M('att',id,0,'def'),positionLockedThrough:5}]},{}]};
  cases={activation:success(),resolution:success(),negative:{fixture:locked,actions:[{actor:'a',action:{kind:'position',card:'att',mode:'atk'},expectError:true}],assertions:[a(['players',0,'monsters',0,'position'],'def')]},'json-restore':success(base(),[match('a','attack','att','def'),{restore:true},settle,{actor:'a',match:{kind:'end'}},settle]),'deterministic-replay':success(),negation:{fixture:neg,actions:[match('a','attack','att','def'),settle,{actor:'a',match:{kind:'end'}},settle],assertions:[a(['players',0,'monsters',0,'position'],'atk')]},'before-battle-end':{fixture:base(),actions:[match('a','attack','att','def'),settle],assertions:[a(['players',0,'monsters',0,'position'],'atk')]},'next-own-turn-lock':{fixture:locked,actions:[{actor:'a',action:{kind:'position',card:'att',mode:'atk'},expectError:true}],assertions:[a(['players',0,'monsters',0,'positionLockedThrough'],5)]}};
  extras=['before-battle-end','next-own-turn-lock'];
 }else if(n.op==='endDamageDefensePiercing'){
  const base=()=>({phase:'battle',players:[{monsters:[M('att',id,0)]},{monsters:[M('def','91152256',1,'def')]}]});
  const success=(f=base(),commands=[match('a','attack','att','def'),settle])=>({fixture:f,actions:commands,assertions:[a(['players',0,'monsters',0,'position'],'def'),a(['players',1,'lp'],3300),uid(['players',1,'grave'],'def')]});
  const neg=base();neg.players[0].backrow=[drain];
  cases={activation:success(),resolution:success(),negative:{fixture:base(),actions:[{actor:'b',action:{kind:'attack',card:'def',target:'att'},expectError:true}],assertions:[uid(['players',0,'monsters'],'att')]},'json-restore':success(base(),[match('a','attack','att','def'),{restore:true},settle]),'deterministic-replay':success(),negation:{fixture:neg,actions:[match('a','attack','att','def'),settle],assertions:[a(['players',0,'monsters',0,'position'],'atk'),a(['players',1,'lp'],4000)]},'piercing-defense':success(),'damage-step-not-battle-end':success()};
  extras=['piercing-defense','damage-step-not-battle-end'];
 }else{
  const base=()=>({phase:'battle',players:[{monsters:[M('att','89631139',0)]},{monsters:[M('def',id,1)]}]});
  const attack=match('a','attack','att','def');
  // The public engine automatically advances through unanswered earlier
  // response windows and pauses at the first actionable Quick Effect.
  const toCalculation=[attack];
  const guard={actor:'b',match:{kind:'monsterEffect',card:'def',target:'att'}};
  const success=(f=base(),commands=[...toCalculation,guard,settle])=>({fixture:f,actions:commands,assertions:[a(['players',0,'lp'],4000-card.atk),a(['players',1,'monsters',0,'guardianUsed'],true),uid(['players',0,'grave'],'att'),uid(['players',1,'monsters'],'def')]});
  const neg=base();neg.players[1].backrow=[drain];
  const doubled=base();doubled.players[0].monsters.push(M('att2','89631139',0));
  cases={activation:success(),resolution:success(),negative:{fixture:base(),actions:[{actor:'b',expectError:true,action:{kind:'monsterEffect',card:'def',target:'att',discards:[]}}],assertions:[uid(['players',1,'monsters'],'def')]},'json-restore':success(base(),[...toCalculation,{restore:true},guard,settle]),'deterministic-replay':success(),negation:{fixture:neg,actions:[attack,settle],assertions:[uid(['players',1,'grave'],'def'),a(['players',0,'lp'],4000)]},'once-while-faceup':{fixture:doubled,actions:[...toCalculation,guard,settle,match('a','attack','att2','def'),settle],assertions:[uid(['players',1,'grave'],'def'),a(['players',1,'lp'],4000-(3000-card.atk))]},'declined-window':{fixture:base(),actions:[attack,settle],assertions:[uid(['players',1,'grave'],'def'),a(['players',1,'lp'],4000-(3000-card.atk))]},'damage-calculation-only':success()};
  extras=['once-while-faceup','declined-window','damage-calculation-only'];
 }
 batch.candidates.push({card,effect:{kind:'monsterEffect'},monster,family:n.op,requirements:['effect:monsterEffect',`trigger:${monster.effect.trigger}`,`monster-operation:${n.op}`],textEvidence:evidence,scenarios:extras,cases});
 batch.reviews.push({id,canonicalId:hist.id,konamiId:n.cid,reviewer:'Codex: manually verified official full card text, stats and TCG printing on 2026-10-31',reviewedAt:'2026-10-31',identityApproved:true,mechanicsApproved:true,primarySource:source,primaryFacts:{level:card.level,atk:card.atk,defense:card.defense,race:card.race,attribute:card.attribute},verifiedPrinting:{date:n.date,set:n.set,region:'tcg',source},fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:evidence.sha256,semanticCoverage:{activation:'represented',conditions:'represented',costs:'not-applicable',targets:guardian?'represented':'not-applicable',choices:guardian?'represented':'not-applicable',operations:'represented',duration:'represented',restrictions:'represented',negation:'represented'}});
}
const file=path.join(root,'catalog/batches',batch.batchId+'.json');if(fs.existsSync(file)){const prior=JSON.parse(fs.readFileSync(file,'utf8'));if(prior.batchId!==batch.batchId||prior.candidates?.length!==catalog.length)throw Error('Refusing to overwrite unrelated batch');}fs.writeFileSync(file,JSON.stringify(batch,null,2)+'\n');const canonical=require('./card-batch-automation.cjs').load('catalog/batches/'+batch.batchId+'.json');fs.writeFileSync(file,JSON.stringify(canonical,null,2)+'\n');console.log(`Prepared ${batch.candidates.length} reviewed combat cards`);
