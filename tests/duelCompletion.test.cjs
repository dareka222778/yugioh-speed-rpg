const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'duel-completion-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const e=require('../dist/duelEngine'),{assertDuelState}=require('../dist/duelIntegrity');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id='91152256')=>({uid,id});
const monster=(uid,id='91152256',owner=0,props={})=>({...ref(uid,id),owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...props});
const back=(uid,id)=>({...ref(uid,id),setTurn:1,faceUp:false});
const restore=s=>JSON.parse(JSON.stringify(s));
function game(){const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;}
function use(s,who,kind,pred=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&pred(a));assert.ok(a,`${who} lacks ${kind} in ${s.phase}: ${JSON.stringify(s.choice)}`);return e.step(restore(s),who,a);}
function pass(s){let budget=30;while(s.phase==='response'){assert.ok(budget-->0);s=use(s,s.players[e.decisionPlayer(s)].id,'pass');}return s;}
function massDestruction(){let s=game();s.players[0].monsters=[monster('sangan','26202165'),monster('witch','78010363')];s.players[0].hand=[ref('darkhole','53129443')];s.players[0].deck=[ref('celtic'),ref('battleox','48305365')];return use(s,'a','spell');}

test('simultaneous mandatory searches form one ordered chain, resolved LIFO with persisted choices',()=>{
 let s=massDestruction();assert.equal(s.choice.source,'triggerOrder');assert.deepEqual(s.choice.targets,['sangan','witch']);
 assert.deepEqual(e.legalActions(s,'b'),[]);assert.throws(()=>e.step(s,'b',{kind:'choose',target:'witch'}),/inválida/);
 s=use(s,'a','choose',a=>a.target==='witch'); // Witch CL1, Sangan CL2
 assert.equal(s.choice.source,'monsterSearch');assert.equal(s.pending.id,'26202165');assert.equal(s.chain.length,1);assert.equal(s.chain[0].id,'78010363');assert.equal(s.chainRoot.kind,'none');
 s=use(s,'a','choose',a=>a.target==='celtic');
 assert.equal(s.choice.source,'monsterSearch');assert.equal(s.pending.id,'78010363');assert.deepEqual(s.choice.targets,['battleox']);assert.equal(s.chain.length,0);
 s=use(s,'a','choose');assert.equal(s.phase,'main');assert.equal(s.chainRoot,undefined);assert.equal(s.players[0].hand.length,2);assert.equal(s.players[0].deck.length,0);
});
test('reversing simultaneous effect order changes the first resolving search',()=>{
 let s=massDestruction();s=use(s,'a','choose',a=>a.target==='sangan');assert.equal(s.pending.id,'78010363');assert.deepEqual(new Set(s.choice.targets),new Set(['celtic','battleox']));
 s=use(s,'a','choose',a=>a.target==='battleox');assert.equal(s.pending.id,'26202165');s=use(s,'a','choose');assert.equal(s.phase,'main');
});
test('turn-player mandatory links precede opponent links regardless of original zone traversal',()=>{
 let s=game();s.current=1;s.priority=1;s.players[0].monsters=[monster('s0','26202165')];s.players[1].monsters=[monster('s1','26202165',1)];s.players[1].hand=[ref('hole','53129443')];
 s.players[0].deck=[ref('d0')];s.players[1].deck=[ref('d1')];s=use(s,'b','spell');
 assert.equal(s.choice.actor,0);assert.equal(s.pending.card,'s0');assert.equal(s.chain[0].card,'s1');s=use(s,'a','choose');assert.equal(s.choice.actor,1);s=use(s,'b','choose');assert.equal(s.phase,'main');assert.equal(s.current,1);
});
test('fast responses cannot interrupt between simultaneous trigger ordering and activation targets',()=>{
 let s=game();s.players[0].monsters=[monster('puppet','54098121'),monster('bug','54652250',0,{faceUp:false,position:'def'})];s.players[1].monsters=[monster('victim')];s.players[1].backrow=[back('torrential','53582587')];
 s=use(s,'a','position',a=>a.card==='bug');assert.equal(s.choice.source,'triggerOrder');assert.equal(e.legalActions(s,'b').length,0);
 s=use(s,'a','choose',a=>a.target==='bug');assert.equal(s.choice.source,'triggerTarget');assert.equal(e.legalActions(s,'b').length,0);
 s=use(s,'a','choose',a=>a.target==='victim');assert.equal(s.phase,'response');assert.equal(s.chain.length,2);assert.equal(s.chain[0].target,'victim');
 s=pass(use(s,'b','trap'));assert.equal(s.players[0].lp,4500);assert.equal(s.players[0].monsters.length,0);assert.equal(s.players[1].monsters.length,0);assert.equal(s.phase,'main');
});
test('FLIP draw belongs to the summon chain, and activates before Torrential destroys the source',()=>{
 let s=game();s.players[0].monsters=[monster('angel','60694662',0,{faceUp:false,position:'def'})];s.players[1].backrow=[back('torrent','53582587')];const count=s.players[0].hand.length;
 s=use(s,'a','position');assert.equal(s.chain[0].id,'60694662');s=pass(use(s,'b','trap'));assert.equal(s.players[0].hand.length,count+1);assert.equal(s.players[0].monsters.length,0);assert.equal(s.phase,'main');
});
test('same-name once-per-turn duplicate triggers activate only one copy',()=>{
 let s=massDestruction();s.players[0].grave.find(c=>c.uid==='witch').id='26202165';s.triggerBuild.events.find(c=>c.card==='witch').id='26202165';
 s=use(s,'a','choose',a=>a.target==='sangan');assert.equal(s.chain.length,0);assert.equal(s.pending.id,'26202165');s=use(s,'a','choose');assert.equal(s.phase,'main');assert.equal(s.players[0].hand.length,1);
});
test('no new response window is opened between the searches of one resolving chain',()=>{
 let s=massDestruction();s.players[1].backrow=[back('reinforce','17814387')];s.players[1].monsters=[monster('rival','91152256',1)];
 s=use(s,'a','choose',a=>a.target==='witch');assert.equal(s.phase,'response');assert.equal(s.chain.length,2);
 s=pass(s);assert.equal(s.choice.source,'monsterSearch');s=use(s,'a','choose',a=>a.target==='celtic');assert.equal(s.phase,'choice');assert.equal(s.pending.id,'78010363');assert.deepEqual(e.legalActions(s,'b'),[]);
 s=use(s,'a','choose');assert.equal(s.phase,'main');assert.equal(s.players[1].backrow[0].faceUp,false);
});
function declaration(){let s=game();s.phase='battle';s.players[0].monsters=[monster('attacker')];s.players[1].monsters=[monster('original','15025844',1)];s.players[1].backrow=[back('hold','17814387')];return use(s,'a','attack');}
function changeDefender(s,mode){const p=s.players[1];if(mode!=='add'){const m=p.monsters.shift();p.grave.push(ref(m.uid,m.id));}if(mode!=='remove')p.monsters.push(monster('new','15025844',1));return s;}
test('a changed defending field produces an explicit replay before entering damage',()=>{
 let s=changeDefender(declaration(),'replace');s=pass(s);assert.equal(s.choice.source,'attackReplay');assert.deepEqual(s.choice.targets,['new','__cancel__']);assert.equal(s.choice.actor,0);
 assert.match(e.actionLabel(s,'a',{kind:'choose',target:'new'}),/Continuar: atacar/);s=use(s,'a','choose',a=>a.target==='new');s=pass(s);assert.equal(s.phase,'battle');assert.equal(s.players[1].lp,3400);assert.equal(s.players[0].monsters[0].attacked,3);
});
test('replay can become a direct attack, conserving the physical removed defender',()=>{
 let s=pass(changeDefender(declaration(),'remove'));assert.deepEqual(s.choice.targets,['__direct__','__cancel__']);s=use(s,'a','choose',a=>a.target==='__direct__');s=pass(s);assert.equal(s.players[1].lp,2600);assert.ok(s.players[1].grave.some(c=>c.uid==='original'));
});
test('cancelling a replay consumes the attack and forbids another manual position change',()=>{
 let s=pass(changeDefender(declaration(),'add'));s=use(s,'a','choose',a=>a.target==='__cancel__');assert.equal(s.phase,'battle');assert.equal(s.players[0].lp,4000);assert.equal(s.players[1].lp,4000);assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='attack'));assert.match(s.log.at(-1),/cancelado/);
});
test('a replay is not a new attack declaration and cannot reopen Mirror Force',()=>{
 let s=pass(changeDefender(declaration(),'replace'));s.players[1].backrow=[back('mirror','44095762')];s=use(s,'a','choose',a=>a.target==='new');assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='trap'&&a.card==='mirror'));assert.equal(s.players[1].backrow[0].faceUp,false);
});
test('Book of Moon on a defender does not change the defending roster or force a replay',()=>{
 let s=declaration();s.players[1].backrow.push(back('book','14087893'));s=use(s,'b','spell',a=>a.card==='book'&&a.target==='original');s=pass(s);assert.notEqual(s.choice?.source,'attackReplay');assert.equal(s.phase,'battle');
});
test('removing the attacker cancels the attack before considering a replay',()=>{
 let s=changeDefender(declaration(),'replace');s.players[0].grave.push(ref('attacker'));s.players[0].monsters=[];s=pass(s);assert.equal(s.phase,'battle');assert.notEqual(s.choice?.source,'attackReplay');assert.equal(s.players[1].lp,4000);
});
test('timeout during simultaneous ordering and replay assigns W.O. to the actual decision player',()=>{
 for(const s of [massDestruction(),pass(changeDefender(declaration(),'remove'))]){const actor=e.decisionPlayer(s);const out=e.timeoutDuel(restore(s));assert.equal(out.winner,s.players[1-actor].id);assert.equal(out.phase,'finished');assert.deepEqual(e.legalActions(out,s.players[actor].id),[]);}
});
test('new serialized state fields reject malformed builders and defending rosters',()=>{
 for(const build of [{events:5},{events:[{actor:3,card:'x',id:'26202165'}]},{events:[],selected:{actor:1,card:'x',id:'missing'}}]){const s=game();s.triggerBuild=build;assert.throws(()=>assertDuelState(s),/Estado do duelo inválido/);}
 const s=declaration();s.pending.defenders=['same','same'];assert.throws(()=>assertDuelState(s),/Estado do duelo inválido/);
});
test('both battle recruiters form one optional chain in turn-player then opponent order',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[monster('t0','83011277')];s.players[1].monsters=[monster('t1','83011277',1)];s.players[0].deck=[ref('d0','11384280')];s.players[1].deck=[ref('d1','11384280')];
 s=use(s,'a','attack');assert.equal(s.choice.source,'triggerOptional');assert.equal(s.choice.actor,0);
 s=use(s,'a','choose',a=>a.target==='t0');assert.equal(s.choice.source,'triggerOptional');assert.equal(s.choice.actor,1);assert.equal(s.chain[0].card,'t0');
 s=use(s,'b','choose',a=>a.target==='t1');assert.equal(s.choice.source,'monsterRecruit');assert.equal(s.choice.actor,1);assert.equal(s.chain.length,1);assert.deepEqual(s.choice.targets,['d1']);
 s=use(s,'b','choose');assert.equal(s.choice.source,'monsterRecruit');assert.equal(s.choice.actor,0);assert.ok(s.players[1].monsters.some(m=>m.uid==='d1'));assert.ok(!s.players[0].monsters.length);
 s=use(s,'a','choose');assert.equal(s.phase,'battle');assert.equal(s.damageStep,undefined);assert.ok(s.players[0].monsters.some(m=>m.uid==='d0'));assert.equal(s.chainRoot,undefined);
});
test('mandatory search precedes an optional recruiter activation and resolves after it',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[monster('sangan','26202165',0,{atkBoost:400})];s.players[1].monsters=[monster('tomato','83011277',1)];s.players[0].deck=[ref('search')];s.players[1].deck=[ref('recruit','11384280')];
 s=use(s,'a','attack');assert.equal(s.choice.source,'triggerOptional');assert.equal(s.chain[0].card,'sangan');s=use(s,'b','choose',a=>a.target==='tomato');assert.equal(s.choice.source,'monsterRecruit');s=use(s,'b','choose');assert.equal(s.choice.source,'monsterSearch');s=use(s,'a','choose');assert.equal(s.phase,'battle');assert.ok(s.players[0].hand.some(c=>c.uid==='search'));
});
test('declining one optional trigger preserves the other player activation',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[monster('t0','83011277')];s.players[1].monsters=[monster('t1','83011277',1)];s.players[0].deck=[ref('d0','11384280')];s.players[1].deck=[ref('d1','11384280')];
 s=use(s,'a','attack');s=use(s,'a','choose',a=>a.target==='__skip__');assert.equal(s.choice.actor,1);assert.equal(s.chain.length,0);s=use(s,'b','choose',a=>a.target==='t1');s=use(s,'b','choose');assert.equal(s.phase,'battle');assert.equal(s.players[0].monsters.length,0);assert.ok(s.players[0].deck.some(c=>c.uid==='d0'));
});
test('Damage Step trigger windows prohibit Book of Moon, Torrential and generic ATK traps',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[monster('attacker','48305365')];s.players[1].monsters=[monster('tomato','83011277',1)];s.players[1].deck=[ref('recruit','11384280')];s.players[0].backrow=[back('book','14087893'),back('torrent','53582587'),back('boost','17814387')];
 // Pass legal declaration and pre-calculation windows; the recruiter remains in Damage Step.
 s=pass(use(s,'a','attack'));assert.equal(s.choice.source,'triggerOptional');assert.equal(s.damageStep,true);s=use(s,'b','choose',a=>a.target==='tomato');assert.equal(s.choice.source,'monsterRecruit');assert.equal(s.damageStep,true);
 s=use(s,'b','choose');assert.equal(s.phase,'battle');assert.equal(s.damageStep,undefined);assert.ok(s.players[0].backrow.every(c=>!c.faceUp));assert.ok(e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='book'));
});

test('SQLite restart preserves trigger ordering, suspended chain and replay decisions with stale-action rejection',()=>{
 const db=require('../dist/database').db,store=require('../dist/duelStore'),child=require('node:child_process');
 let order=massDestruction();let suspended=use(order,'a','choose',a=>a.target==='witch');let replay=pass(changeDefender(declaration(),'remove'));
 for(const [i,state]of [order,suspended,replay].entries()){
  const id='completion-'+i;db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run(id,'g','c','playing',0,Date.now(),JSON.stringify(state));
  const script="const db=require('./dist/database'),store=require('./dist/duelStore');console.log(JSON.stringify(store.getDuel(process.argv[1]).state));db.db.close();";
  const loaded=JSON.parse(child.execFileSync(process.execPath,['-e',script,id],{encoding:'utf8'}));assert.deepEqual(loaded,restore(state));
  const who=state.players[e.decisionPlayer(state)].id,actions=e.legalActions(state,who);const target=i===0?'witch':i===1?'celtic':'__cancel__';const ix=actions.findIndex(a=>a.kind==='choose'&&a.target===target);assert.ok(ix>=0);
  const expected=e.step(state,who,actions[ix]);const actual=store.performDuelAction(id,who,'g',0,ix);assert.deepEqual(restore(actual.state),restore(expected));assert.throws(()=>store.performDuelAction(id,who,'g',0,ix),/antigo/);
 }
});
require('node:test').after(()=>{require('../dist/database').db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('Tribute Summon merges grave costs and summon watchers before any fast response',()=>{
 let s=game();s.players[0].monsters=[monster('sangan','26202165'),monster('puppet','54098121')];s.players[0].hand=[ref('summon','46986414')];s.players[0].deck=[ref('search')];s.players[1].backrow=[back('torrent','53582587')];
 // Dark Magician needs two Tributes; retain a watcher on the opposite side.
 s.players[1].monsters=[monster('other-puppet','54098121',1)];s=use(s,'a','summon',a=>a.position==='atk');
 assert.equal(s.phase,'response');assert.deepEqual(s.chain.map(x=>x.id),['26202165','54098121']);assert.equal(s.graveTriggers.length,0);
 s=pass(use(s,'b','trap'));assert.equal(s.players[1].lp,4500);assert.equal(s.choice.source,'monsterSearch');s=use(s,'a','choose');assert.equal(s.phase,'main');assert.equal(s.players[0].hand[0].uid,'search');
});
test('Tribute Set activates the grave trigger before generic fast responses',()=>{
 let s=game();s.players[0].monsters=[monster('sangan','26202165'),monster('other')];s.players[0].hand=[ref('summon','46986414')];s.players[0].deck=[ref('search')];s.players[1].backrow=[back('boost','17814387')];s.players[1].monsters=[monster('rival','91152256',1)];
 s=use(s,'a','summon',a=>a.position==='set');assert.equal(s.phase,'response');assert.equal(s.chain[0].id,'26202165');s=pass(s);assert.equal(s.choice.source,'monsterSearch');s=use(s,'a','choose');assert.equal(s.phase,'main');assert.equal(s.players[0].monsters[0].faceUp,false);
});
