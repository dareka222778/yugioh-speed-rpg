const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'expansion-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const db=require('../dist/database'),decks=require('../dist/decks'),store=require('../dist/duelStore'),engine=require('../dist/duelEngine'),ui=require('../dist/duelUI');const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));const tutorial=['24094653','34460851','44287299','86318356',...basic.slice(0,16)];
const game=()=>engine.createDuel([{id:'101',name:'A',cards:tutorial,extra:['45231177']},{id:'102',name:'B',cards:basic}],()=>.999999);
const use=(s,actor,kind,predicate=()=>true)=>{const action=engine.legalActions(s,actor).find(a=>a.kind===kind&&predicate(a));assert.ok(action,`no ${kind}`);return engine.step(s,actor,action);};
const m=(uid,id='91152256')=>({uid,id,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
function count(p){const all=[...p.deck,...p.hand,...p.monsters,...p.backrow,...p.grave,...p.extra??[],...p.banished??[],...p.field?[p.field]:[]];assert.equal(all.length,new Set(all.map(c=>c.uid)).size);return all.length;}
test('Field spell has a separate zone, affects both sides only when active, and replacement sends the previous field to grave',()=>{
 let s=game();s.players[0].monsters=[m('own')];s.players[1].monsters=[m('opponent'),m('mage','34460851')];s.players[0].backrow=[0,1,2].map(n=>({id:'17814387',uid:'trap'+n,faceUp:false,setTurn:1}));
 s=use(s,'101','field');assert.equal(s.players[0].backrow.length,3);assert.equal(engine.atk(s.players[0].monsters[0],s),1600);assert.equal(engine.def(s.players[1].monsters[0],s),1400);assert.equal(engine.atk(s.players[1].monsters[1],s),900);
 s.players[0].hand.push({uid:'field-2',id:'86318356'});s=use(s,'101','setField');assert.equal(s.players[0].field.faceUp,false);assert.equal(s.players[0].grave.at(-1).id,'86318356');assert.equal(engine.atk(s.players[0].monsters[0],s),1400);
 s=use(s,'101','field');assert.equal(engine.atk(s.players[0].monsters[0],s),1600);
});
test('Polymerization actually consumes the exact materials and Extra Deck card; special summon does not consume normal summon quota',()=>{
 let s=game();const initial=count(s.players[0]);s=use(s,'101','field');s=use(s,'101','fusion',a=>a.position==='atk');const p=s.players[0];assert.equal(p.monsters[0].id,'45231177');assert.equal(p.extra.length,0);assert.equal(p.summoned,false);assert.equal(engine.atk(p.monsters[0],s),2000);assert.equal(engine.def(p.monsters[0],s),1800);assert.deepEqual(new Set(p.grave.map(c=>c.id)),new Set(['24094653','34460851','44287299']));assert.equal(count(p),initial);
 let missing=game();missing.players[0].hand=missing.players[0].hand.filter(c=>c.id!=='34460851');assert.ok(!engine.legalActions(missing,'101').some(a=>a.kind==='fusion'));
 assert.throws(()=>engine.step(game(),'101',{kind:'fusion',card:'0-0',extra:'0-e0',materials:['0-2'],position:'atk'}),/inválida/);assert.throws(()=>engine.validateDuelCards(['45231177',...basic.slice(1)]),/Adicional/);
});
test('fusion materials on field free a monster zone, while a full field with materials only in hand cannot fuse',()=>{
 let s=game();s.players[0].monsters=[m('x'),m('y'),m('z')];assert.ok(!engine.legalActions(s,'101').some(a=>a.kind==='fusion'));
 const material=s.players[0].hand.find(c=>c.id==='34460851');s.players[0].hand=s.players[0].hand.filter(c=>c.uid!==material.uid);s.players[0].monsters[0]={...m(material.uid,material.id)};
 s=use(s,'101','fusion');assert.equal(s.players[0].monsters.length,3);assert.ok(s.players[0].grave.some(c=>c.uid===material.uid));
});
test('deck editor separates owned Fusion cards from the Main Deck and preserves inventory',()=>{
 db.createPlayer('101','A');db.chooseStarterDeck('101','warrior');decks.openDeck('101');db.db.prepare("INSERT INTO player_cards(discord_id,card_key,quantity) VALUES('101','45231177',2)").run();
 const d=decks.changeDeck('101',1,'45231177',1);assert.equal(d.total,20);assert.equal(d.extraTotal,1);assert.deepEqual(d.errors,[]);decks.activateDeck('101',1);
 const r=store.createTraining('101','g','c');assert.ok(r.state.players[0].extra.length===1);store.performDuelAction(r.id,'101','g',r.revision,{kind:'concede'});assert.equal(db.getCollection('101').find(c=>c.card_key==='45231177').quantity,2);
});
test('deadline awards W.O. at the exact boundary, no interaction is needed for sweep, old actions cannot execute, controls are removed',()=>{
 const r=store.createTraining('101','g','c');const deadline=r.updated+store.DECISION_TIMEOUT_MS;const loser=engine.decisionPlayer(r.state);assert.equal(store.getDuel(r.id,deadline-1).status,'playing');
 assert.equal(store.expireDueDuels(deadline).find(x=>x.id===r.id).status,'finished');const ended=store.getDuel(r.id);assert.equal(ended.state.winner,r.state.players[1-loser].id);assert.match(ended.state.reason,/W.O./);assert.equal(ui.duelPublicMessage(ended).components.length,0);assert.equal(ui.duelPrivateMessage(ended,'101').components.length,0);assert.deepEqual(engine.legalActions(ended.state,'101'),[]);assert.throws(()=>store.performDuelAction(r.id,'101','g',r.revision,0),/ativo/);assert.equal(store.currentDuel('101'),undefined);
 const response=game();response.phase='response';response.priority=1;assert.equal(engine.timeoutDuel(response).winner,'101');response.phase='choice';response.choice={actor:1,targets:[]};assert.equal(engine.timeoutDuel(response).winner,'101');
});
test('tutorial is playable without granting cards; cemetery and own Extra Deck can be inspected without leaking opponents extra',()=>{
 db.createPlayer('103','Tutorial');const inventory=db.getCollection('103');const r=store.createTraining('103','g','c',true);assert.ok(engine.legalActions(r.state,'103').some(a=>a.kind==='fusion'));assert.ok(engine.legalActions(r.state,'103').some(a=>a.kind==='field'));assert.deepEqual(db.getCollection('103'),inventory);
 const tutorialIds=new Set([...r.state.players[0].deck,...r.state.players[0].hand].map(c=>c.id));
 for(const id of ['54652250','07089711','31560081','28933734','60694662','11384280','26202165','78010363','77585513','54098121','77414722','03819470'])assert.ok(tutorialIds.has(id),`tutorial missing ${id}`);
 const mine=JSON.stringify(ui.duelZonesMessage(r,'103').embeds[0].toJSON());assert.match(mine,/Espadachim das Chamas/);const outsider=JSON.stringify(ui.duelZonesMessage(r,'stranger').embeds[0].toJSON());assert.ok(!outsider.includes('Espadachim das Chamas'));assert.ok(!JSON.stringify(ui.publicDuelData(r.state)).includes('45231177'));
});
test('deck exhaustion wins only when a required draw fails, not when the last card has just been drawn',()=>{
 let s=game();s.players[0].deck=[];assert.ok(engine.legalActions(s,'101').length);assert.notEqual(s.phase,'finished');s.players[1].deck=[];s=use(s,'101','end');assert.equal(s.winner,'101');assert.match(s.reason,/comprar/);
});
test('Trap Hole responds to a normal summon, but not a flip summon',()=>{
 let s=game();s.players[1].backrow=[{uid:'trap-hole',id:'04206964',faceUp:false,setTurn:0}];
 s.players[0].monsters=[{...m('flip-monster'),faceUp:false,position:'def'}];
 s=use(s,'101','position',a=>a.mode==='flip');
 assert.ok(!engine.legalActions(s,'102').some(a=>a.kind==='trap'&&a.card==='trap-hole'));
 let normal=game();normal.players[1].backrow=[{uid:'trap-hole',id:'04206964',faceUp:false,setTurn:0}];
 normal.players[0].hand.push({uid:'trap-target',id:'91152256'});
 normal=use(normal,'101','summon',a=>a.position==='atk'&&a.card==='trap-target');
 assert.ok(engine.legalActions(normal,'102').some(a=>a.kind==='trap'&&a.card==='trap-hole'));
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
