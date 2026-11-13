const {test}=require('node:test'),assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry'),{starterContents}=require('../dist/cardCatalog'),{duelCards,assertDuelState}=require('../dist/duelIntegrity');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id='91152256')=>({uid,id}),mon=(uid,id='91152256',props={})=>({...ref(uid,id),owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...props}),back=(uid,id)=>({...ref(uid,id),setTurn:0,faceUp:false});
const clone=s=>JSON.parse(JSON.stringify(s));
function game(){const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;s.players.forEach(p=>p.hand=[]);return s;}
function use(s,who,kind,where=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&where(a));assert.ok(a,`${who}: ${kind} in ${s.phase}`);return e.step(clone(s),who,a);}
function pass(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30);s=use(s,s.players[e.decisionPlayer(s)].id,'pass');}return s;}
const equipment=[['37120512','46986414'],['91595718','15025844'],['04614116','41392891'],['98374133','91152256'],['01435851','88819587']];
for(const [id,target]of equipment){
 test(`${id} equip persists across JSON, adds its exact modifiers and loses only its own bonus when MST destroys it`,()=>{
  let s=game();s.players[0].hand=[ref('equip',id)];s.players[1].monsters=[mon('target',target,{owner:1})];const atk=e.atk(s.players[1].monsters[0],s),def=e.def(s.players[1].monsters[0],s),effect=r.getEffect(id);s=pass(use(s,'a','spell'));assert.equal(e.atk(s.players[1].monsters[0],s),Math.max(0,atk+effect.atk));assert.equal(e.def(s.players[1].monsters[0],s),Math.max(0,def+effect.def));s=clone(s);assert.equal(s.players[0].backrow[0].equippedTo,'target');assert.equal(s.players[0].backrow[0].resolved,true);
  s.players[0].hand=[ref('mst','05318639')];s=pass(use(s,'a','spell',a=>a.target==='equip'));assert.equal(e.atk(s.players[1].monsters[0],s),atk);assert.equal(e.def(s.players[1].monsters[0],s),def);assert.equal(s.players[1].monsters[0].owner,1);assert.equal(s.players[0].grave.filter(c=>c.uid==='equip').length,1);assert.ok(!s.players[1].grave.some(c=>c.uid==='equip'));
 });
 test(`${id} equip cannot attach after chained Book of Moon turns its original target face-down`,()=>{
  let s=game();s.players[0].hand=[ref('equip',id)];s.players[1].monsters=[mon('target',target,{owner:1})];s.players[1].backrow=[back('book','14087893')];s=use(s,'a','spell');s=use(s,'b','spell',a=>a.target==='target');s=pass(s);assert.equal(s.players[1].monsters[0].faceUp,false);assert.equal(s.players[0].backrow.length,0);assert.equal(s.players[0].grave.filter(c=>c.uid==='equip').length,1);assert.equal(s.players[1].grave.filter(c=>c.uid==='book').length,1);
 });
 test(`${id} equip destroyed before resolution grants no phantom bonus and cannot choose a replacement target`,()=>{
  let s=game();s.players[0].hand=[ref('equip',id)];s.players[1].monsters=[mon('target',target,{owner:1}),mon('other',target,{owner:1})];s.players[1].backrow=[back('mst','05318639')];const values=s.players[1].monsters.map(m=>[e.atk(m,s),e.def(m,s)]);s=use(s,'a','spell',a=>a.target==='target');s=use(s,'b','spell',a=>a.target==='equip');s=pass(s);assert.deepEqual(s.players[1].monsters.map(m=>[e.atk(m,s),e.def(m,s)]),values);assert.equal(s.players[0].grave.filter(c=>c.uid==='equip').length,1);assert.equal(s.phase,'main');
 });
}
const fields=[['86318356','91152256'],['50913601','88819587'],['59197169','15025844']];
for(const [id,target]of fields){
 test(`${id} field uses its separate zone, stacks both resolved fields and removes only the replaced field contribution`,()=>{
  let s=game();s.players[0].hand=[ref('own-field',id)];s.players[0].backrow=[back('one','17814387'),back('two','44209392'),back('three','12607053')];s.players[0].monsters=[mon('ours',target)];s.players[1].monsters=[mon('theirs',target,{owner:1})];s.players[1].field={...back('rival-field',id),faceUp:true,resolved:true};const base=r.getPlayableCard(target);s=pass(use(s,'a','field'));assert.equal(s.players[0].backrow.length,3);assert.equal(e.atk(s.players[0].monsters[0],s),base.atk+400);assert.equal(e.def(s.players[1].monsters[0],s),base.defense+400);
  s.players[0].hand=[ref('new-set-field',id)];s=pass(use(s,'a','setField'));assert.equal(s.players[0].field.faceUp,false);assert.equal(e.atk(s.players[0].monsters[0],s),base.atk+200);assert.equal(s.players[0].grave.filter(c=>c.uid==='own-field').length,1);assert.equal(s.players[1].field.uid,'rival-field');assert.equal(e.atk(clone(s).players[0].monsters[0],clone(s)),base.atk+200);
 });
 test(`${id} field destroyed in response never applies its continuous modifier or announces successful entry`,()=>{
  let s=game();s.players[0].hand=[ref('field',id)];s.players[0].monsters=[mon('target',target)];s.players[1].backrow=[back('mst','05318639')];const before=e.atk(s.players[0].monsters[0],s);s=use(s,'a','field');assert.equal(e.atk(s.players[0].monsters[0],s),before);s=use(s,'b','spell',a=>a.target==='field');s=pass(s);assert.equal(s.players[0].field,null);assert.equal(e.atk(s.players[0].monsters[0],s),before);assert.ok(!s.log.some(l=>l.includes('entrou em vigor')));assert.equal(s.players[0].grave.filter(c=>c.uid==='field').length,1);
 });
}
test('59197169 Yami penalizes revealed Fairies on both sides, ignores hidden cards and clamps at zero',()=>{
 const fairy=r.engineCatalog.find(c=>c.race==='Fairy'&&r.getPlayableCard(c.id));assert.ok(fairy);const s=game();s.players[0].field={...back('yami','59197169'),faceUp:true,resolved:true};s.players[0].monsters=[mon('ours',fairy.id)];s.players[1].monsters=[mon('theirs',fairy.id,{owner:1}),mon('hidden',fairy.id,{owner:1,faceUp:false,position:'def'})];for(const m of [s.players[0].monsters[0],s.players[1].monsters[0]]){assert.equal(e.atk(m,s),Math.max(0,fairy.atk-200));assert.equal(e.def(m,s),Math.max(0,fairy.defense-200));}assert.equal(e.def(s.players[1].monsters[1],s),fairy.defense);
});
test('72892473 Card Destruction can draw zero from an empty own deck and draws last enemy cards without immediate deck-out',()=>{
 let s=game();s.players[0].hand=[ref('destruction','72892473')];s.players[0].deck=[];s.players[1].hand=[ref('discard-a'),ref('discard-b','48305365')];s.players[1].deck=[ref('top'),ref('bottom','15025844')];const before=new Map(duelCards(s).map(c=>[c.uid,c.id]));s=pass(use(s,'a','spell'));assert.equal(s.phase,'main');assert.equal(s.winner,null);assert.equal(s.players[0].hand.length,0);assert.deepEqual(s.players[1].hand.map(c=>c.uid),['top','bottom']);assert.equal(s.players[1].deck.length,0);assert.equal(duelCards(s).length,before.size);for(const c of duelCards(s))assert.equal(before.get(c.uid),c.id);s=pass(use(s,'a','end'));assert.equal(s.phase,'finished');assert.equal(s.winner,'a');
});
test('72892473 Card Destruction counts hands after a chained Jar draw, including after a saved response',()=>{
 let s=game();s.players[0].hand=[ref('destruction','72892473')];s.players[0].deck=[ref('last')];s.players[1].hand=[ref('enemy-old')];s.players[1].deck=[ref('enemy-new')];s.players[0].backrow=[back('jar','83968380')];s=use(s,'a','spell');s=use(clone(s),'a','trap');s=pass(s);assert.equal(s.phase,'finished');assert.equal(s.winner,'b');assert.equal(s.players[0].hand.length,0);assert.equal(s.players[0].grave.filter(c=>c.uid==='last').length,1);assert.equal(s.players[0].grave.filter(c=>c.uid==='destruction').length,1);
});
test('52097679 Shield & Sword snapshots only revealed monsters, keeps additive modifiers and excludes later summons',()=>{
 let s=game();s.players[0].monsters=[mon('warrior'),mon('hidden','88819587',{faceUp:false,position:'def'})];s.players[0].hand=[ref('equip','98374133')];s=pass(use(s,'a','spell',a=>a.target==='warrior'));s.players[0].field={...back('sogen','86318356'),faceUp:true,resolved:true};s.players[0].monsters[0].atkBoost=500;s.players[0].monsters[0].defBoost=300;s.players[0].hand=[ref('swap','52097679'),ref('new-warrior')];s=pass(use(s,'a','spell',a=>a.card==='swap'));assert.equal(e.atk(s.players[0].monsters[0],s),2300);assert.equal(e.def(s.players[0].monsters[0],s),1700);assert.equal(s.players[0].monsters[1].swappedUntil,undefined);s=pass(use(s,'a','summon',a=>a.card==='new-warrior'&&a.position==='atk'));const newcomer=s.players[0].monsters.find(m=>m.uid==='new-warrior');assert.equal(e.atk(newcomer,s),1600);assert.equal(newcomer.swappedUntil,undefined);s=pass(use(s,'a','end'));assert.equal(e.atk(s.players[0].monsters[0],s),2000);assert.equal(e.def(s.players[0].monsters[0],s),1200);
});
test('persistent Spell metadata rejects malformed resolution flags and equip targets without migrating valid legacy states',()=>{
 for(const kind of ['backrow','field'])for(const value of ['true',1,{},null]){const s=game();const c={...back('persistent',kind==='field'?'86318356':'01435851'),resolved:value};if(kind==='field')s.players[0].field=c;else s.players[0].backrow=[c];assert.throws(()=>assertDuelState(s),/Estado do duelo inválido/);}
 for(const equippedTo of [1,{},'']){const s=game();s.players[0].backrow=[{...back('equip','01435851'),equippedTo}];assert.throws(()=>assertDuelState(s),/Estado do duelo inválido/);}
 const legacy=game();legacy.players[0].field={...back('field','86318356'),faceUp:true};legacy.rulesVersion='speed-rpg-v2';assert.doesNotThrow(()=>assertDuelState(legacy));
});
