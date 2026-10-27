const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),child=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'classic-families-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry'),{starterContents}=require('../dist/cardCatalog'),{classicExpansionCards}=require('../dist/classicExpansion');
const {buildCardRegistry}=require('../dist/cardRegistry'),{economicOperationIssues}=require('../dist/economicOperations');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),seed='ca'.repeat(32);
const ref=(uid,id='91152256')=>({uid,id});
const m=(uid,id='91152256',owner=0,props={})=>({...ref(uid,id),owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...props});
const back=(uid,id)=>({...ref(uid,id),setTurn:1,faceUp:false});
const clone=s=>JSON.parse(JSON.stringify(s));
function game(){let s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:seed});s.turn=3;return s;}
function use(s,who,kind,filter=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&filter(a));assert.ok(a,`missing ${kind} for ${who} in ${s.phase} ${JSON.stringify(s.pending)}`);return e.step(clone(s),who,a);}
function pass(s){let n=0;while(s.phase==='response'){s=use(s,s.players[e.decisionPlayer(s)].id,'pass');assert.ok(++n<40);}return s;}
function spell(id,lp=[4000,4000]){let s=game();s.players[0].hand=[ref('spell',id)];s.players.forEach((p,i)=>p.lp=lp[i]);return pass(use(s,'a','spell'));}
function attack(id='62279055'){let s=game();s.phase='battle';s.players[0].monsters=[m('attacker')];s.players[1].backrow=[back('defense',id)];return use(s,'a','attack');}

test('nine classic-era additions have factual IDs, definitions, references and admission',()=>{
 assert.equal(classicExpansionCards.length,9);assert.equal(r.enabledCardIds.length,225);for(const c of classicExpansionCards){assert.ok(c.source.startsWith('https://www.db.yugioh-card.com/'));assert.ok(r.getPlayableCard(c.id));assert.equal(r.getCardStatus(c.id).stage,'certified');assert.equal(r.engineCard(c.id).name,c.name);}
});
for(const [id,delta]of [['76103675',-200],['46130346',-500]])test(`parameterized burn ${id} applies exactly its printed amount`,()=>{const s=spell(id);assert.equal(s.players[0].lp,4000);assert.equal(s.players[1].lp,4000+delta);assert.ok(s.players[0].grave.some(c=>c.id===id));});
for(const [id,amount]of [['20871001',400],['47852924',800]])test(`parameterized healing ${id} has no artificial 4000 LP cap`,()=>{const s=spell(id);assert.equal(s.players[0].lp,4000+amount);assert.equal(s.players[1].lp,4000);});
test('Tremendous Fire applies both damage values as one group, including draws and self-defeat',()=>{
 let s=spell('46918794');assert.equal(s.players[0].lp,3500);assert.equal(s.players[1].lp,3000);
 s=spell('46918794',[500,1000]);assert.equal(s.phase,'finished');assert.equal(s.winner,null);assert.deepEqual(s.players.map(p=>p.lp),[0,0]);
 s=spell('46918794',[500,2000]);assert.equal(s.winner,'b');assert.equal(s.players[1].lp,1000);
 s=spell('46918794',[501,1000]);assert.equal(s.winner,'a');assert.equal(s.players[0].lp,1);
});
test('Upstart draws the top physical card then grants LP to the opponent',()=>{
 let s=game();s.players[0].hand=[ref('upstart','70368879')];s.players[0].deck=[ref('top'),ref('bottom','48305365')];s=pass(use(s,'a','spell'));assert.deepEqual(s.players[0].hand,[ref('top')]);assert.deepEqual(s.players[0].deck,[ref('bottom','48305365')]);assert.equal(s.players[1].lp,5000);
});
test('draw cards cannot activate with insufficient deck, but lose if their draw becomes impossible in a chain',()=>{
 let s=game();s.players[0].hand=[ref('upstart','70368879')];s.players[0].deck=[];assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='spell'));
 s=game();s.players[0].hand=[ref('upstart','70368879')];s.players[0].deck=[ref('last')];s.players[0].backrow=[back('jar','83968380')];s=use(s,'a','spell');assert.equal(s.priority,0); // opponent auto-passed; own Jar can still be chained
 s=pass(use(s,'a','trap',a=>a.card==='jar'));assert.equal(s.phase,'finished');assert.equal(s.winner,'b');assert.equal(s.players[1].lp,4000);assert.ok(s.players[0].hand.some(c=>c.uid==='last'));
});
test('Jar draws from a previously set card, cannot activate fresh, during damage or under Jinzo',()=>{
 let s=game();s.players[0].backrow=[back('jar','83968380')];const n=s.players[0].hand.length;s=pass(use(s,'a','trap'));assert.equal(s.players[0].hand.length,n+1);
 for(const mode of ['fresh','jinzo','damage']){s=game();s.players[0].backrow=[back('jar','83968380')];if(mode==='fresh')s.players[0].backrow[0].setTurn=s.turn;if(mode==='jinzo')s.players[1].monsters=[m('jinzo','77585513',1)];if(mode==='damage'){s.phase='response';s.priority=0;s.damageStep=true;s.pending={kind:'attack',actor:1,card:'attacker',stage:'damage'};s.players[1].monsters=[m('attacker','91152256',1)];}assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='trap'&&a.card==='jar'),mode);}
});
test('MST destroying an activated Jar does not negate its already paid activation',()=>{
 let s=game();s.players[0].backrow=[back('jar','83968380')];s.players[1].backrow=[back('mst','05318639')];const before=s.players[0].hand.length;s=use(s,'a','trap');s=pass(use(s,'b','spell',a=>a.target==='jar'));assert.equal(s.players[0].hand.length,before+1);assert.ok(s.players[0].grave.some(c=>c.uid==='jar'));
});
test('Seven Tools negates Jar while Magic Jammer cannot, and activation costs stay paid',()=>{
 let s=game();s.players[0].backrow=[back('jar','83968380')];s.players[1].backrow=[back('tools','03819470'),back('jam','77414722')];s.players[1].hand=[ref('cost')];const before=s.players[0].hand.length;s=use(s,'a','trap');assert.ok(!e.legalActions(s,'b').some(a=>a.card==='jam'));s=pass(use(s,'b','trap',a=>a.card==='tools'));assert.equal(s.players[0].hand.length,before);assert.equal(s.players[1].lp,3000);
});
test('Magic Jammer negates Upstart including the dependent heal, keeping the discard cost',()=>{
 let s=game();s.players[0].hand=[ref('up','70368879')];s.players[1].hand=[ref('cost')];s.players[1].backrow=[back('jam','77414722')];s=use(s,'a','spell');s=pass(use(s,'b','trap'));assert.equal(s.players[1].lp,4000);assert.equal(s.players[0].hand.length,0);assert.ok(s.players[1].grave.some(c=>c.uid==='cost'));
});
test('Magic Cylinder negates one attack, inflicts effect damage and keeps the rest of the Battle Phase',()=>{
 let s=attack();s.players[0].monsters.push(m('second'));s.players[0].battleProtectedUntil=s.turn;s=pass(use(s,'b','trap'));assert.equal(s.players[0].lp,2600);assert.equal(s.players[1].lp,4000);assert.equal(s.phase,'battle');assert.equal(s.turn,3);assert.ok(e.legalActions(s,'a').some(a=>a.kind==='attack'&&a.card==='second'));assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='attack'&&a.card==='attacker'));
});
test('Cylinder uses current ATK at resolution, can win by effect damage and works at zero ATK',()=>{
 let s=attack();s.players[0].backrow=[back('boost','17814387')];s=use(s,'b','trap');s=pass(use(s,'a','trap',a=>a.target==='attacker'));assert.equal(s.players[0].lp,2100);
 s=attack();s.players[0].lp=1400;s=pass(use(s,'b','trap'));assert.equal(s.phase,'finished');assert.equal(s.winner,'b');assert.equal(e.legalActions(s,'a').length,0);
 s=attack();s.players[0].monsters[0].atkBoost=-1400;s=pass(use(s,'b','trap'));assert.equal(s.players[0].lp,4000);assert.equal(s.players[1].lp,4000);assert.equal(s.phase,'battle');
});
test('two Cylinders in one chain cannot negate the same attack twice or apply duplicate damage',()=>{
 let s=attack();s.players[1].backrow.push(back('second-cylinder','62279055'));s=use(s,'b','trap',a=>a.card==='defense');s=use(s,'b','trap',a=>a.card==='second-cylinder');s=pass(s);assert.equal(s.players[0].lp,2600);assert.equal(s.players[1].lp,4000);assert.equal(s.players[1].grave.filter(c=>c.id==='62279055').length,2);
});
test('Cylinder fails cleanly when a higher link destroys or turns down the attacker',()=>{
 let s=attack();s.players[0].backrow=[back('book','14087893')];s=use(s,'b','trap');s=pass(use(s,'a','spell',a=>a.target==='attacker'));assert.equal(s.players[0].lp,4000);assert.equal(s.players[1].lp,4000);assert.equal(s.phase,'battle');assert.equal(s.players[0].monsters[0].faceUp,false);
 s=attack();s.players[1].backrow.push(back('sakuretsu','56120475'));s=use(s,'b','trap',a=>a.card==='defense');s=use(s,'b','trap',a=>a.card==='sakuretsu');s=pass(s);assert.equal(s.players[0].lp,4000);assert.equal(s.players[0].monsters.length,0);
});
test('Negate Attack ends the Battle Phase and advances through End Phase in this no-Main-2 format',()=>{
 let s=attack('14315573');s.players[0].monsters.push(m('second'));s=pass(use(s,'b','trap'));assert.equal(s.turn,4);assert.equal(s.current,1);assert.equal(s.phase,'main');assert.deepEqual(s.players.map(p=>p.lp),[4000,4000]);assert.equal(s.players[0].monsters.length,2);
});
test('Negate Attack is Counter Speed 3: ordinary traps and Quick-Play spells cannot chain',()=>{
 let s=attack('14315573');s.players[0].backrow=[back('book','14087893'),back('jar','83968380'),back('tools','03819470')];s=use(s,'b','trap');assert.equal(s.pending.kind,'attack');const actions=e.legalActions(s,'a');assert.ok(actions.some(a=>a.kind==='trap'&&a.card==='tools'));assert.ok(!actions.some(a=>a.card==='book'||a.card==='jar'));s=pass(s);assert.equal(s.current,1);assert.equal(s.turn,4);assert.ok(s.players[0].backrow.every(c=>!c.faceUp));
});
test('Seven Tools may negate Negate Attack, preventing its phase ending and allowing battle damage',()=>{
 let s=attack('14315573');s.players[0].backrow=[back('tools','03819470')];s=use(s,'b','trap');assert.equal(s.phase,'response');assert.equal(s.priority,0);s=pass(use(s,'a','trap',a=>a.card==='tools'));assert.equal(s.turn,3);assert.equal(s.phase,'battle');assert.equal(s.players[1].lp,2600);assert.equal(s.players[0].lp,3000);
});
test('end-of-battle response persists and permits End Phase actions, without more attacks',()=>{
 let s=attack('14315573');s.players[0].backrow=[back('jar','83968380')];s=use(s,'b','trap');assert.equal(s.phase,'response');assert.equal(s.pending.kind,'end');assert.equal(s.turn,3);assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='attack'));s=pass(use(s,'a','trap'));assert.equal(s.turn,4);assert.equal(s.current,1);
});
test('new defenses require the opponent declaration and reject forged targets or wrong stages',()=>{
 for(const id of ['14315573','62279055']){
  let s=game();s.players[0].backrow=[back('defense',id)];assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='trap'));s=attack(id);const action=e.legalActions(s,'b').find(a=>a.kind==='trap');const snapshot=JSON.stringify(s);assert.throws(()=>e.step(s,'b',{...action,target:'forged'}),/inválida/);assert.equal(JSON.stringify(s),snapshot);s.pending.stage='damage';s.damageStep=true;assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='trap'));
 }
});
test('Jinzo blocks both new defenses and all new traps stay dead after a finished duel',()=>{
 for(const id of ['14315573','62279055']){let s=attack(id);s.players[0].monsters.push(m('jinzo','77585513'));assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='trap'));s=e.timeoutDuel(s);assert.deepEqual(e.legalActions(s,'b'),[]);}
});
test('NPC uses new draw/defense models, preserves privacy and avoids suicidal Tremendous Fire',()=>{
 const {chooseNPC}=require('../dist/duelStore');let s=attack();assert.equal(chooseNPC(s,'b').kind,'trap');s=game();s.players[0].backrow=[back('jar','83968380')];assert.equal(chooseNPC(s,'a').kind,'trap');
 s=game();s.players[0].lp=500;s.players[0].hand=[ref('fire','46918794')];assert.notEqual(chooseNPC(s,'a').kind,'spell');s.players[0].lp=501;assert.equal(chooseNPC(s,'a').kind,'spell');
 s=attack();const before=chooseNPC(s,'b');s.players[0].hand=[ref('unknown','46986414')];assert.deepEqual(chooseNPC(s,'b'),before);
});
test('pending attack-response chain survives SQLite and fresh-process restore with revision protection',()=>{
 const db=require('../dist/database').db,store=require('../dist/duelStore');let s=attack('14315573');s.players[0].backrow=[back('tools','03819470')];s=use(s,'b','trap');
 db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('new-defense','g','c','playing',0,Date.now(),JSON.stringify(s));
 const script="const db=require('./dist/database'),r=require('./dist/duelStore').getDuel('new-defense');console.log(JSON.stringify(r.state));db.db.close();";assert.deepEqual(JSON.parse(child.execFileSync(process.execPath,['-e',script],{encoding:'utf8'})),clone(s));
 const ix=e.legalActions(s,'a').findIndex(a=>a.kind==='trap'),out=store.performDuelAction('new-defense','a','g',0,ix);assert.equal(out.state.phase,'battle');assert.equal(out.state.turn,3);assert.throws(()=>store.performDuelAction('new-defense','a','g',0,ix),/antigo/);
});
test('bounded sequence definitions reject invalid operations, activation roles and unsafe amounts',()=>{
 for(const bad of [[],[{kind:'runCode',text:'anything'}],[{kind:'draw',count:-1}],[{kind:'damage',recipients:[{player:'self',amount:0}]}],[{kind:'gainLP',player:'other',amount:100}]])assert.ok(economicOperationIssues(bad).length);
 const card={...r.engineCard('70368879'),id:'00000099'};for(const definition of [{kind:'sequence',activation:{speed:3,window:'main',damage:'never'},operations:[{kind:'draw',count:1}]},{kind:'sequence',activation:{speed:1,window:'main',damage:'never'},operations:[{kind:'draw',count:Infinity}]}])assert.equal(buildCardRegistry([card],{[card.id]:definition},{}).statuses.get(card.id).stage,'registered');
});
after(()=>{require('../dist/database').db.close();fs.rmSync(temp,{recursive:true,force:true});});
test('NPC does not chain Jar when its own pending draw would then cause deck-out',()=>{
 let s=game();s.players[0].hand=[ref('up','70368879')];s.players[0].deck=[ref('last')];s.players[0].backrow=[back('jar','83968380')];s=use(s,'a','spell');assert.equal(e.decisionPlayer(s),0);assert.equal(require('../dist/duelStore').chooseNPC(s,'a').kind,'pass');
});
