const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kuriboh-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const e=require('../dist/duelEngine'),registry=require('../dist/effectRegistry'),db=require('../dist/database'),store=require('../dist/duelStore'),{starterContents}=require('../dist/cardCatalog');
const main=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const m=(uid,id='48305365',owner=0)=>({...ref(uid,id),owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
function game(){const s=e.createDuel([{id:'a',name:'A',cards:main},{id:'b',name:'B',cards:main}],()=>.5);s.turn=3;s.phase='battle';s.players[0].monsters=[m('attacker')];s.players[1].hand=[ref('kuriboh','40640057')];return s;}
function use(s,who,kind,filter=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&filter(a));assert.ok(a,`Missing ${kind} for ${who}: ${s.phase}`);return e.step(s,who,a);}
function pass(s){let n=0;while(s.phase==='response'){s=use(s,s.players[e.decisionPlayer(s)].id,'pass');assert.ok(++n<30);}return s;}
test('Kuriboh has verified real metadata and an explicit self-discard Quick Effect',()=>{
 const c=registry.engineCard('40640057');assert.equal(c.name,'Kuriboh');assert.equal(registry.getEffect(c.id).kind,'monsterEffect');assert.equal(require('../dist/collection').getCard(c.id).id,c.id);assert.ok(registry.enabledCardIds.includes(c.id));assert.equal(c.konamiId,4064);assert.equal(c.level,1);assert.equal(c.atk,300);assert.equal(c.defense,200);assert.deepEqual(require('../dist/monsterEffects').getMonsterEffect(c.id),{trigger:'quick',cost:{kind:'discard',count:1},operation:{kind:'battleShield'}});
});
test('Kuriboh opens only during damage calculation, pays its own discard and prevents direct battle damage',()=>{
 let s=game();assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='monsterEffect'));s=use(s,'a','attack');assert.equal(s.pending.stage,'calculation');assert.equal(s.priority,1);const a=e.legalActions(s,'b').find(a=>a.kind==='monsterEffect');assert.deepEqual(a.discards,['kuriboh']);assert.match(e.actionLabel(s,'b',a),/Descartar/);s=e.step(s,'b',a);assert.equal(s.players[1].hand.length,0);assert.ok(s.players[1].grave.some(c=>c.uid==='kuriboh'));assert.equal(s.players[1].lp,4000);assert.equal(s.phase,'battle');
});
test('Kuriboh does not prevent the battle destruction of a friendly monster',()=>{
 let s=game();s.players[1].monsters=[m('weak','03573512',1)];s=use(s,'a','attack');s=use(s,'b','monsterEffect');assert.equal(s.players[1].lp,4000);assert.equal(s.players[1].monsters.length,0);assert.ok(s.players[1].grave.some(c=>c.uid==='weak'));
});
test('Kuriboh protection is scoped to this battle, not a second attacking monster',()=>{
 let s=game();s.players[0].monsters.push(m('second'));s=use(s,'a','attack',a=>a.card==='attacker');s=use(s,'b','monsterEffect');s=pass(use(s,'a','attack',a=>a.card==='second'));assert.equal(s.players[1].lp,2300);
});
test('Kuriboh cannot activate from the field, during own attack, in the declaration window, or after Sangan name restriction',()=>{
 let s=game();s.phase='response';s.pending={kind:'attack',actor:0,card:'attacker',stage:'declare'};s.priority=1;assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='monsterEffect'));
 s.pending.stage='damage';assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='monsterEffect'));
 s.pending.stage='calculation';s.priority=0;s.players[0].hand=[ref('own-kuri','40640057')];assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='monsterEffect'));
 s.priority=1;s.players[1].hand=[];s.players[1].monsters=[m('field-kuri','40640057',1)];assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='monsterEffect'));
 s.players[1].hand=[ref('blocked','40640057')];s.blockedEffectNames=[{},{40640057:3}];assert.ok(!e.legalActions(s,'b').some(a=>a.kind==='monsterEffect'));
});
test('discard substitution and outsider activation are rejected without mutating the state',()=>{
 let s=game();s.players[1].hand.push(ref('other','91152256'));s=use(s,'a','attack');const a=e.legalActions(s,'b').find(a=>a.kind==='monsterEffect'),snapshot=JSON.stringify(s);assert.throws(()=>e.step(s,'b',{...a,discards:['other']}),/inválida/);assert.throws(()=>e.step(s,'outsider',a),/participa/);assert.equal(JSON.stringify(s),snapshot);
});
test('Magic Jammer and Seven Tools cannot negate a monster Quick Effect',()=>{
 let s=game();s.players[0].hand=[ref('jam-cost','91152256')];s.players[0].backrow=[{...ref('jam','77414722'),faceUp:false,setTurn:1},{...ref('seven','03819470'),faceUp:false,setTurn:1}];s=use(s,'a','attack');s=use(s,'b','monsterEffect');assert.equal(s.phase,'battle');assert.equal(s.players[0].hand.length,1);assert.ok(s.players[0].backrow.every(c=>!c.faceUp));assert.equal(s.players[0].lp,4000);
});
test('ordinary damage modifiers and Quick-Play Spells are not available during calculation itself',()=>{
 let s=game();s.players[1].backrow=[{...ref('boost','17814387'),faceUp:false,setTurn:1},{...ref('book','14087893'),faceUp:false,setTurn:1}];s.players[1].monsters=[m('defender','91152256',1)];s.phase='response';s.pending={kind:'attack',actor:0,card:'attacker',target:'defender',stage:'calculation'};s.priority=1;assert.deepEqual(new Set(e.legalActions(s,'b').map(a=>a.kind)),new Set(['monsterEffect','pass']));
});
test('passing Kuriboh response takes normal damage and keeps the card in hand',()=>{
 let s=game();s=use(s,'a','attack');s=pass(s);assert.equal(s.players[1].lp,2300);assert.equal(s.players[1].hand[0].uid,'kuriboh');
});
test('NPC uses Kuriboh for damage and saves it when the attack would cause none',()=>{
 let s=game();s=use(s,'a','attack');assert.equal(store.chooseNPC(s,'b').kind,'monsterEffect');
 s=game();s.players[1].monsters=[{...m('wall','15025844',1),position:'def'}];s=use(s,'a','attack');assert.equal(store.chooseNPC(s,'b').kind,'pass');
});
test('calculation response and self-discard survive a real SQLite save/reopen with stale-action protection',()=>{
 let s=game();s=use(s,'a','attack');db.db.prepare('INSERT INTO duels(id,guild_id,channel_id,status,revision,updated,state) VALUES(?,?,?,?,?,?,?)').run('kuri-save','g','c','playing',0,Date.now(),JSON.stringify(s));
 const ix=e.legalActions(s,'b').findIndex(a=>a.kind==='monsterEffect');const out=store.performDuelAction('kuri-save','b','g',0,ix);assert.equal(out.state.players[1].lp,4000);assert.ok(out.state.players[1].grave.some(c=>c.id==='40640057'));assert.throws(()=>store.performDuelAction('kuri-save','b','g',0,ix),/antigo/);
 const code="const db=require('./dist/database'),r=require('./dist/duelStore').getDuel('kuri-save');console.log(JSON.stringify(r.state));db.db.close();";const reopened=JSON.parse(require('node:child_process').execFileSync(process.execPath,['-e',code],{encoding:'utf8'}));assert.deepEqual(reopened,JSON.parse(JSON.stringify(out.state)));
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
