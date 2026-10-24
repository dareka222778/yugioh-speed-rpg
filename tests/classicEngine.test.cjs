const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'classic-engine-'));process.env.DATABASE_PATH=path.join(temporary,'game.sqlite');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry'),a=require('../dist/classicDecks'),catalog=require('../dist/cardCatalog'),{chooseNPC}=require('../dist/duelStore');
const basic=catalog.starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
function game(){const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.999999);s.turn=3;return s;}
const ref=(id,uid='c-'+id)=>({id,uid});
const monster=(id,uid='m-'+id,owner)=>({...ref(id,uid),owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
function hand(s,id){const c=ref(id);s.players[0].hand=[c];return c.uid;}
function use(s,actor,kind,predicate=()=>true){const action=e.legalActions(s,actor).find(a=>a.kind===kind&&predicate(a));assert.ok(action,`Missing ${kind}: ${JSON.stringify(e.legalActions(s,actor))}`);return e.step(s,actor,action);}
function passes(s){let n=0;while(s.phase==='response'){s=use(s,s.players[e.decisionPlayer(s)].id,'pass');assert.ok(n++<15);}return s;}
function spell(s,id,predicate=()=>true){hand(s,id);return passes(use(s,'a','spell',predicate));}
function setTrap(s,index,id){s.players[index].backrow.push({...ref(id),faceUp:false,setTurn:1});}
function all(s){return s.players.flatMap(p=>[...p.hand,...p.deck,...p.monsters,...p.backrow,...p.grave,...p.extra??[],...p.field?[p.field]:[],...p.banished??[]]);}

test('coverage distinguishes all classical normal monsters, explicit effects and unsupported cards',()=>{
 const coverage=r.classicCoverage();assert.equal(coverage.length,123);assert.ok(coverage.filter(c=>c.enabled).length>=88);assert.equal(e.IMPLEMENTED_DUEL_CARDS.length,r.enabledCardIds.length);
 for(const c of a.archiveCards.values())if(c.kind==='Monster'&&c.type.includes('Normal'))assert.ok(r.getEffect(c.id)?.kind==='normal',c.name);
 assert.equal(r.getEffect('71625222'),undefined);assert.throws(()=>e.validateDuelCards([...basic.slice(1),'71625222']),/implementada/);
 for(const id of e.IMPLEMENTED_DUEL_CARDS)assert.ok(r.engineCard(id)&&r.getEffect(id));
});
test('every newly supported Normal monster uses its own printed stats and correct tribute requirement',()=>{
 for(const c of r.engineCatalog.filter(c=>r.getEffect(c.id)?.kind==='normal')){
  let s=game();hand(s,c.id);s.players[0].monsters=[monster('91152256','t1'),monster('91152256','t2')];
  const n=c.level>=7?2:c.level>=5?1:0,act=e.legalActions(s,'a').find(x=>x.kind==='summon'&&x.position==='atk');assert.equal(act.tributes.length,n);s=passes(e.step(s,'a',act));const m=s.players[0].monsters.find(m=>m.id===c.id&&m.uid==='c-'+c.id);assert.equal(e.atk(m,s),c.atk);assert.equal(e.def(m,s),c.defense);
 }
});
test('Dian Keto heals 1000, Red Medicine heals 500, and neither accidentally resolves as Fissure',()=>{
 for(const [id,gain]of [['84257639',1000],['38199696',500]]){let s=game();s.players[1].monsters=[monster('91152256')];s=spell(s,id);assert.equal(s.players[0].lp,4000+gain);assert.equal(s.players[1].monsters.length,1);assert.equal(s.players[0].grave.at(-1).id,id);}
});
test('Ookazi deals 800 only to the opponent and ends the game at zero LP',()=>{
 let s=game();s.players[1].lp=700;s=spell(s,'19523799');assert.equal(s.players[1].lp,0);assert.equal(s.players[0].lp,4000);assert.equal(s.winner,'a');
});
test('Dark Hole destroys face-up and facedown monsters on both sides and leaves no duplicate UID',()=>{
 let s=game();s.players[0].monsters=[monster('91152256','own')];s.players[1].monsters=[{...monster('15025844','other'),faceUp:false}];s=spell(s,'53129443');assert.equal(s.players[0].monsters.length+s.players[1].monsters.length,0);assert.ok(s.players[0].grave.some(c=>c.uid==='own'));assert.ok(s.players[1].grave.some(c=>c.uid==='other'));assert.equal(new Set(all(s).map(c=>c.uid)).size,all(s).length);
});
test('Card Destruction excludes its activating card and draws each discarded hand size',()=>{
 let s=game();s.players[0].hand=[ref('72892473','cast'),ref('91152256','old-a')];s.players[1].hand=[ref('91152256','old-b'),ref('15025844','old-c')];const first=s.players[0].deck[0].uid;s=passes(use(s,'a','spell'));assert.deepEqual(s.players[0].hand.map(c=>c.uid),[first]);assert.equal(s.players[1].hand.length,2);assert.ok(s.players[0].grave.some(c=>c.uid==='cast'));assert.ok(s.players[1].grave.some(c=>c.uid==='old-c'));
});
test('Card Destruction checks both mandatory draws simultaneously, including a draw-game',()=>{
 let s=game();s.players[0].hand=[ref('72892473'),ref('91152256','old-a')];s.players[1].hand=[ref('91152256','old-b')];s.players.forEach(p=>p.deck=[]);s=passes(use(s,'a','spell'));assert.equal(s.phase,'finished');assert.equal(s.winner,null);
 s=game();s.players[0].hand=[ref('72892473'),ref('91152256','old-a')];s.players[1].hand=[ref('91152256','old-b')];s.players[1].deck=[];s=passes(use(s,'a','spell'));assert.equal(s.winner,'a');
});
test('equip cards validate race or attribute and may equip either side without changing ownership',()=>{
 for(const [id,eligible,ineligible,boost,defboost] of [['37120512','46986414','91152256',400,-200],['91595718','15025844','91152256',300,300],['04614116','41392891','91152256',300,300],['98374133','91152256','46986414',400,-200],['01435851','88819587','91152256',300,300]]){
  let s=game();hand(s,id);s.players[1].monsters=[monster(eligible,'valid'),monster(ineligible,'invalid')];const acts=e.legalActions(s,'a').filter(a=>a.kind==='spell');assert.ok(acts.some(a=>a.target==='valid'));assert.ok(!acts.some(a=>a.target==='invalid'));const before=s.players[1].monsters[0];const atk=e.atk(before,s),def=e.def(before,s);s=passes(use(s,'a','spell',a=>a.target==='valid'));assert.equal(e.atk(s.players[1].monsters[0],s),atk+boost);assert.equal(e.def(s.players[1].monsters[0],s),def+defboost);assert.equal(s.players[0].backrow[0].equippedTo,'valid');
 }
});
test('destroying an equipped monster also sends its equipment to the equipment owner graveyard',()=>{
 let s=game();s.players[1].monsters=[monster('88819587','dragon')];s=spell(s,'01435851');s=spell(s,'53129443');assert.ok(s.players[0].grave.some(c=>c.id==='01435851'));assert.equal(s.players[0].backrow.length,0);assert.ok(s.players[1].grave.some(c=>c.uid==='dragon'));
});
test('an equip target disappearing in the response chain makes the equipment fail, not retarget',()=>{
 let s=game();s.players[1].monsters=[monster('88819587','dragon')];setTrap(s,1,'12607053');hand(s,'01435851');s=use(s,'a','spell');s.players[1].grave.push(...s.players[1].monsters);s.players[1].monsters=[];s=passes(s);assert.equal(s.players[0].backrow.length,0);assert.ok(s.players[0].grave.some(c=>c.id==='01435851'));
});
test('Monster Reborn revives from either grave in ATK or DEF and returns a destroyed stolen monster to its owner',()=>{
 for(const position of ['atk','def']){let s=game();s.players[1].grave=[ref('88819587','dead')];s=spell(s,'83764718',a=>a.target==='dead'&&a.position===position);assert.equal(s.players[0].monsters[0].position,position);assert.equal(s.players[0].monsters[0].owner,1);assert.equal(s.players[1].grave.length,0);s=spell(s,'53129443');assert.ok(s.players[1].grave.some(c=>c.uid==='dead'));assert.ok(!s.players[0].grave.some(c=>c.uid==='dead'));}
});
test('Monster Reborn cannot revive an improperly summoned Fusion or overfill monster zones',()=>{
 let s=game();hand(s,'83764718');s.players[0].grave=[ref('45231177','bad'),{...ref('45231177','good'),properlySummoned:true}];assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.target==='bad'));assert.ok(e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.target==='good'));s.players[0].monsters=[1,2,3].map(i=>monster('91152256','full'+i));assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='spell'));
});
test('Change of Heart retains original owner and returns control during the End Phase',()=>{
 let s=game();s.players[1].monsters=[monster('88819587','taken')];s=spell(s,'04031928');assert.equal(s.players[0].monsters[0].owner,1);s=passes(use(s,'a','end'));assert.equal(s.players[0].monsters.length,0);assert.equal(s.players[1].monsters[0].uid,'taken');assert.equal(s.players[1].monsters[0].returnTo,undefined);
});
test('a controlled monster used as tribute goes to its original owner grave instead of returning',()=>{
 let s=game();s.players[1].monsters=[monster('88819587','taken')];s=spell(s,'04031928');hand(s,'28279543');s=passes(use(s,'a','summon',a=>a.position==='atk'));assert.ok(s.players[1].grave.some(c=>c.uid==='taken'));assert.equal(s.players[0].monsters[0].id,'28279543');
});
test('De-Spell action labels do not leak a rival set card and reveal its identity only on resolution',()=>{
 for(const id of ['17814387','84257639']){let s=game();s.players[1].backrow=[{...ref(id,'secret'),faceUp:false,setTurn:3}];hand(s,'19159413');const act=e.legalActions(s,'a').find(a=>a.kind==='spell'&&a.target==='secret');assert.ok(act);const label=e.actionLabel(s,'a',act);assert.match(label,/virada para baixo/);assert.ok(!label.includes(require('../dist/collection').getCard(id).name));s=passes(e.step(s,'a',act));assert.equal(s.players[1].backrow.length,id==='17814387'?1:0);assert.ok(s.log.some(l=>l.includes('revelou')));}
});
test('Remove Trap targets only face-up Traps, and Block Attack targets only enemy attack-position monsters',()=>{
 let s=game();hand(s,'51482758');s.players[1].backrow=[{...ref('17814387','set'),faceUp:false,setTurn:1},{...ref('44209392','up'),faceUp:true,setTurn:1}];assert.deepEqual(e.legalActions(s,'a').filter(a=>a.kind==='spell').map(a=>a.target),['up']);s=passes(use(s,'a','spell'));assert.equal(s.players[1].backrow.length,1);
 s=game();s.players[1].monsters=[monster('91152256','attack'),{...monster('15025844','def'),position:'def',faceUp:false}];s=spell(s,'25880422');assert.equal(s.players[1].monsters[0].position,'def');assert.equal(s.players[1].monsters[1].faceUp,false);
});
test('Giant Trunade returns other spells, traps and field cards but not itself',()=>{
 let s=game();s.players[0].backrow=[{...ref('17814387','trap'),faceUp:false,setTurn:1}];s.players[1].field={...ref('50913601','field'),faceUp:true,setTurn:1,resolved:true};s=spell(s,'42703248');assert.ok(s.players[0].hand.some(c=>c.uid==='trap'));assert.ok(s.players[1].hand.some(c=>c.uid==='field'));assert.equal(s.players[1].field,null);assert.ok(!s.players[0].hand.some(c=>c.id==='42703248'));assert.equal(s.players[0].grave.at(-1).id,'42703248');
});
test('Mountain, Yami and Sogen affect their exact races on both sides and ignore set fields',()=>{
 let s=game();const m=monster('88819587');s.players[0].monsters=[m];s.players[1].field={...ref('50913601'),faceUp:true,setTurn:1,resolved:true};assert.equal(e.atk(m,s),1400);s.players[1].field.faceUp=false;assert.equal(e.atk(m,s),1200);s.players[1].field={...ref('59197169'),faceUp:true,setTurn:1,resolved:true};const mage=monster('15025844');assert.equal(e.atk(mage,s),1000);const supportedFairy=r.engineCatalog.find(c=>c.race==='Fairy');assert.ok(supportedFairy);assert.equal(e.atk(monster(supportedFairy.id),s),Math.max(0,supportedFairy.atk-200));
});
test('Shield & Sword changes printed stats, leaves additive equipment buffs in place, and expires',()=>{
 let s=game();s.players[0].monsters=[monster('88819587','dragon')];s=spell(s,'01435851');s=spell(s,'52097679');assert.equal(e.atk(s.players[0].monsters[0],s),1000);assert.equal(e.def(s.players[0].monsters[0],s),1500);s=passes(use(s,'a','end'));assert.equal(e.atk(s.players[0].monsters[0],s),1500);assert.equal(e.def(s.players[0].monsters[0],s),1000);
});
test('Trap Hole responds to the actual opponent summon, not setting, special summons or unrelated actions',()=>{
 let s=game();setTrap(s,1,'04206964');hand(s,'91152256');s=use(s,'a','summon',a=>a.position==='atk');assert.equal(s.phase,'response');assert.ok(e.legalActions(s,'b').some(a=>a.kind==='trap'));s=passes(use(s,'b','trap'));assert.equal(s.players[0].monsters.length,0);
 s=game();setTrap(s,1,'04206964');hand(s,'91152256');s=passes(use(s,'a','summon',a=>a.position==='set'));assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='trap'));
 s=game();setTrap(s,1,'04206964');s.players[0].grave=[ref('91152256','dead')];s=spell(s,'83764718');assert.equal(s.players[0].monsters.length,1);assert.equal(s.players[1].backrow[0].faceUp,false);
});
test('Waboku prevents battle damage and battle destruction, but not effect damage or effect destruction',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[monster('48305365','attacker')];s.players[1].monsters=[monster('03573512','defender')];setTrap(s,1,'12607053');s=use(s,'a','attack');s=use(s,'b','trap');s=passes(s);assert.equal(s.players[1].lp,4000);assert.equal(s.players[1].monsters.length,1);
 s.phase='main';s=spell(s,'19523799');assert.equal(s.players[1].lp,3200);s=spell(s,'53129443');assert.equal(s.players[1].monsters.length,0);
});
test('non-damage-step Traps are not offered after a facedown monster has already been revealed for damage',()=>{
 let s=game();s.phase='response';s.pending={kind:'attack',actor:0,card:'a',target:'b',stage:'damage'};s.priority=1;setTrap(s,1,'12607053');setTrap(s,1,'24068492');s.players[0].monsters=[monster('91152256','a')];assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='trap'));
});
test('Just Desserts counts both face-up and facedown opposing monsters and never damages its controller',()=>{
 let s=game();setTrap(s,0,'24068492');s.players[1].monsters=[monster('91152256','m1'),{...monster('15025844','m2'),faceUp:false}];s=passes(use(s,'a','trap'));assert.equal(s.players[1].lp,3000);assert.equal(s.players[0].lp,4000);
});
test('new target actions are immutable, reject forged targets and survive JSON save/restore',()=>{
 let s=game();s.players[1].grave=[ref('88819587','revive')];hand(s,'83764718');const before=JSON.stringify(s),act=e.legalActions(s,'a').find(a=>a.kind==='spell');assert.throws(()=>e.step(s,'a',{...act,target:'forged'}),/inválida/);const first=e.step(s,'a',act),second=e.step(JSON.parse(before),'a',act);assert.deepEqual(first,second);assert.equal(JSON.stringify(s),before);
});
test('100 mixed 30-card complete duels terminate without duplicate/lost cards or invalid automatic choices',()=>{
 const pool=r.engineCatalog.filter(c=>!c.fusion).map(c=>c.id);
 for(let seed=1;seed<=100;seed++){
  let v=seed;const rng=()=>((v=(v*1664525+1013904223)>>>0)/2**32),make=()=>{const ids=[];while(ids.length<30){const id=pool[Math.floor(rng()*pool.length)];if(ids.filter(c=>c===id).length<3)ids.push(id);}return ids;};
  let s=e.createDuel([{id:'a',name:'A',cards:make()},{id:'b',name:'B',cards:make()}],rng),n=0;
  while(s.phase!=='finished'){const actor=s.players[e.decisionPlayer(s)].id,actions=e.legalActions(s,actor);assert.ok(actions.length);const choice=rng()<.3?actions[Math.floor(rng()*actions.length)]:chooseNPC(s,actor);assert.ok(choice);s=e.step(s,actor,choice);const refs=all(s);assert.equal(refs.length,60);assert.equal(new Set(refs.map(c=>c.uid)).size,60);assert.ok(++n<4000,`seed ${seed} did not terminate`);}
 }
});

test('new effects persist through the real SQLite store and a fresh Node process without granting inventory',()=>{
 const db=require('../dist/database'),store=require('../dist/duelStore');let s=game();s.players[1].grave=[ref('88819587','stored-grave')];hand(s,'83764718');
 db.db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('classic-store','g','c','playing',0,Date.now(),JSON.stringify(s));
 const before=db.db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n;
 const index=e.legalActions(s,'a').findIndex(a=>a.kind==='spell'&&a.target==='stored-grave'&&a.position==='def');const out=store.performDuelAction('classic-store','a','g',0,index);assert.equal(out.revision,1);assert.equal(out.state.players[0].monsters[0].owner,1);
 const script="const store=require('./dist/duelStore'),db=require('./dist/database');const s=store.getDuel('classic-store').state;console.log(JSON.stringify(s));db.db.close();";
 const reopened=JSON.parse(require('node:child_process').execFileSync(process.execPath,['-e',script],{cwd:process.cwd(),encoding:'utf8'}));assert.deepEqual(reopened,out.state);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n,before);
 assert.throws(()=>store.performDuelAction('classic-store','a','g',0,index),/antigo/);
});
test('30-card cap and copy limits still apply to the expanded card set',()=>{
 const normals=r.engineCatalog.filter(c=>r.getEffect(c.id)?.kind==='normal').slice(0,31).map(c=>c.id);
 e.validateDuelCards(normals.slice(0,30));assert.throws(()=>e.validateDuelCards(normals),/20 a 30/);assert.throws(()=>e.validateDuelCards([...normals.slice(0,16),...Array(4).fill('83764718')]),/3 cópias/);
});
test('a temporary-control monster is destroyed to its owner grave if its return side has no space',()=>{
 let s=game();s.players[1].monsters=[monster('88819587','taken')];s=spell(s,'04031928');s.players[1].monsters=[1,2,3].map(i=>monster('91152256','filled'+i));s=passes(use(s,'a','end'));assert.equal(s.players[0].monsters.length,0);assert.ok(s.players[1].grave.some(c=>c.uid==='taken'));assert.equal(s.players[1].monsters.length,3);
});
test('Waboku protection expires at turn change and never prevents deck-out',()=>{
 let s=game();setTrap(s,0,'12607053');s=passes(use(s,'a','trap'));assert.equal(s.players[0].battleProtectedUntil,3);s=passes(use(s,'a','end'));assert.equal(s.turn,4);assert.notEqual(s.players[0].battleProtectedUntil,s.turn);
 s.players[0].deck=[];s=passes(use(s,'b','end'));assert.equal(s.winner,'b');assert.match(s.reason,/comprar/);
});

test('NPC uses new defensive and summon-response effects without knowing opponent hidden cards',()=>{
 let s=game();setTrap(s,1,'04206964');hand(s,'91152256');s=use(s,'a','summon',a=>a.position==='atk');assert.equal(chooseNPC(s,'b').kind,'trap');
 s=game();s.phase='battle';s.players[0].monsters=[monster('48305365','attack')];setTrap(s,1,'12607053');s=use(s,'a','attack');assert.equal(chooseNPC(s,'b').kind,'trap');
 s=game();hand(s,'04031928');s.players[1].monsters=[{...monster('88819587','hidden'),faceUp:false}];s.players[1].hand=[ref('91152256','unknown')];const before=chooseNPC(s,'a');s.players[1].monsters[0].id='89631139';s.players[1].hand[0].id='46986414';assert.deepEqual(chooseNPC(s,'a'),before);
});

test('the readiness gate refuses to label a partial classical engine complete',()=>{
 const out=require('node:child_process').spawnSync(process.execPath,['scripts/classic-engine-coverage.cjs','--require-complete'],{encoding:'utf8'});assert.equal(out.status,1);const report=JSON.parse(out.stdout);assert.equal(report.complete,false);assert.equal(report.total,123);assert.equal(report.enabled,r.classicCoverage().filter(c=>c.enabled).length);assert.equal(report.blocked+r.classicCoverage().filter(c=>c.status==='enabled').length+report.incompatible,report.total);assert.equal(report.incompatible,1);
});


test('NPC sets its FLIP monsters and aims destruction at enemy threats, never at itself',()=>{
 let s=game();s.current=1;s.players[1].hand=[{uid:'npc-flip',id:'54652250'}];
 const opening=chooseNPC(s,'b');assert.equal(opening.kind,'summon');assert.equal(opening.position,'set');assert.equal(opening.card,'npc-flip');
 s=game();s.current=0;s.phase='choice';s.players[0].monsters=[monster('91152256','enemy')];
 s.players[1].monsters=[monster('54652250','self',1)];
 s.pending={kind:'monsterEffect',actor:1,card:'self',id:'54652250'};
 s.choice={actor:1,source:'monsterTarget',targets:['self','enemy']};
 const choice=chooseNPC(s,'b');assert.equal(choice.kind,'choose');assert.equal(choice.target,'enemy');
});


test('NPC recognizes lethal ignition burn and selects the cheaper Tribute',()=>{
 const s=game();s.current=1;s.players[1].hand=[];
 s.players[1].monsters=[monster('11384280','cannon',1),monster('91152256','fodder',1)];
 s.players[0].lp=500;
 const chosen=chooseNPC(s,'b');
 assert.equal(chosen.kind,'monsterEffect');assert.equal(chosen.card,'cannon');assert.deepEqual(chosen.tributes,['fodder']);
});


test('NPC selects Magic Jammer to stop an enemy Spell with its cheapest discard',()=>{
 let s=game();
 s.players[0].hand=[ref('19523799','burn')];
 s.players[1].hand=[ref('48305365','expensive'),ref('91152256','cheap')];
 s.players[1].backrow=[{id:'77414722',uid:'jam',faceUp:false,setTurn:1}];
 s=use(s,'a','spell',a=>a.card==='burn');
 assert.equal(s.phase,'response');
 const decision=chooseNPC(s,'b');
 assert.equal(decision.kind,'trap');assert.equal(decision.card,'jam');
 assert.deepEqual(decision.discards,['cheap']);
});
test('NPC pays Seven Tools to negate the rival Trap, not its own Trap',()=>{
 let s=game();s.phase='response';s.priority=1;
 s.pending={kind:'none'};s.chain=[{actor:0,card:'boost',id:'17814387',target:'own'}];
 s.players[1].backrow=[{id:'03819470',uid:'seven',faceUp:false,setTurn:1}];
 let a=chooseNPC(s,'b');assert.equal(a.kind,'trap');assert.equal(a.card,'seven');assert.equal(a.target,'boost');
 s.chain[0].actor=1;
 a=chooseNPC(s,'b');assert.equal(a.kind,'pass');
});

after(()=>{require('../dist/database').db.close();fs.rmSync(temporary,{recursive:true,force:true});});
