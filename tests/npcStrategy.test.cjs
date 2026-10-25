const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'npc-strategy-'));process.env.DATABASE_PATH=path.join(tmp,'game.sqlite');
const e=require('../dist/duelEngine'),{chooseNPC}=require('../dist/duelStore'),{npcs}=require('../dist/npcContent'),{getPlayableCard:get}=require('../dist/effectRegistry');
const mon=(uid,id,extra={})=>({uid,id,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...extra});
function game(){const s=e.createDuel([{id:'a',name:'A',cards:npcs[0].cards,extra:npcs[0].extra},{id:'b',name:'B',cards:npcs[1].cards}],()=>.5);s.turn=3;s.players[0].hand=[];s.players[1].hand=[];return s;}
test('NPC sets a weak monster against a public 2500 ATK threat instead of exposing it in Attack',()=>{
 const s=game();s.players[0].hand=[{uid:'weak',id:'55444629'}];s.players[1].monsters=[mon('threat','46986414')];assert.equal(chooseNPC(s,'a').position,'set');
});
test('NPC respects unknown face-down walls without reading their identity',()=>{
 const s=game();s.players[0].hand=[{uid:'weak',id:'55444629'}];s.players[1].monsters=[mon('hidden','89631139',{faceUp:false,position:'def'})];
 assert.equal(chooseNPC(s,'a').position,'set');
 s.players[0].hand=[];s.phase='battle';s.players[0].monsters=[mon('attacker','55444629')];
 assert.equal(chooseNPC(s,'a').kind,'end');
 s.players[0].monsters=[mon('attacker','48305365')];
 assert.equal(chooseNPC(s,'a').kind,'attack');
 const other=structuredClone(s);other.players[1].monsters[0].id='91152256';
 assert.deepEqual(chooseNPC(other,'a'),chooseNPC(s,'a'));
});
test('NPC keeps a strong board instead of tributing two superior monsters for a weaker boss',()=>{
 const s=game();s.players[0].hand=[{uid:'boss',id:'74677422'}];s.players[0].monsters=[mon('one','89631139'),mon('two','46986414')];assert.notEqual(chooseNPC(s,'a').kind,'summon');
});
test('NPC spends Tributes to answer a public boss instead of adding another weak defender',()=>{
 const s=game();s.players[0].hand=[{uid:'blue',id:'89631139'},{uid:'small',id:'67724379'}];s.players[0].monsters=[mon('one','91152256'),mon('two','26202165')];s.players[1].monsters=[mon('enemy-blue','89631139')];const action=chooseNPC(s,'a');assert.equal(action.kind,'summon');assert.equal(action.card,'blue');assert.equal(action.position,'atk');
});
test('NPC includes resolved field bonuses in the summon decision',()=>{
 const s=game();s.players[0].hand=[{uid:'warrior',id:'48305365'}];s.players[1].monsters=[mon('threat','97590747')];assert.equal(chooseNPC(s,'a').position,'set');s.players[0].field={uid:'sogen',id:'86318356',faceUp:true,resolved:true,setTurn:0};assert.equal(chooseNPC(s,'a').position,'atk');
});
test('NPC chooses lethal attack and refuses an uncovered losing attack',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[mon('small','91152256'),mon('large','89631139')];s.players[1].lp=2800;assert.equal(chooseNPC(s,'a').card,'large');s.players[1].monsters=[mon('wall','46986414')];s.players[0].monsters=[mon('small','91152256')];assert.equal(chooseNPC(s,'a').kind,'end');
});
test('changing hidden identities and rival deck order cannot change the chosen action',()=>{
 const s=game();s.phase='battle';s.players[0].monsters=[mon('ours','48305365')];s.players[1].monsters=[mon('hidden','15025844',{faceUp:false,position:'def'})];const expected=chooseNPC(s,'a');const other=structuredClone(s);other.players[1].monsters[0].id='91152256';other.players[1].deck.reverse();other.players[1].hand=[{uid:'hidden-hand',id:'12580477'}];assert.deepEqual(chooseNPC(other,'a'),expected);
});
test('all redesigned NPC decks have 30 cards, capped copies and a manageable tribute curve',()=>{
 for(const npc of npcs){e.validateDuelCards(npc.cards);assert.equal(npc.cards.length,30);assert.ok(npc.cards.filter(id=>get(id).kind==='monster').length>=14);assert.ok(npc.cards.filter(id=>(get(id).level??0)>=5).length<=4);assert.equal(npc.reward.cards.length,0);}
});
after(()=>{require('../dist/database').db.close();fs.rmSync(tmp,{recursive:true,force:true});});
