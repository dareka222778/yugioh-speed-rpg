const fs=require('node:fs'),os=require('node:os'),path=require('node:path');process.env.DATABASE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tag-classic-tests-')),'game.sqlite');
const {test}=require('node:test'),assert=require('node:assert/strict'),t=require('../dist/tagDuel'),e=require('../dist/duelEngine'),{npcs}=require('../dist/npcContent');
const normal=t.tagNormalCardIds.slice(0,10).flatMap(id=>[id,id]);
function game(first=0){const s=t.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:normal})),{seed:'classic',classic:true,first});s.core.rulesVersion='speed-rpg-v2';return s;}
const ref=(seat,name,id)=>({uid:`m${seat}:${name}`,id}),mon=(seat,name,id)=>({...ref(seat,name,id),owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0}),back=(seat,name,id)=>({...ref(seat,name,id),setTurn:0,faceUp:false});
function act(s,kind,filter=()=>true){const owner=t.tagDecisionMember(s).id,a=t.tagActions(s,owner).find(a=>a.kind===kind&&filter(a));assert.ok(a,`${owner} needs ${kind} in ${s.core.phase}`);return t.stepTagDuel(s,owner,a);}
function passes(s){for(let n=0;n<20&&s.core.phase==='response';n++)s=act(s,'pass');return s;}
test('all four classic starting seats rotate hands/decks/extras only after actual end-turn resolution',()=>{
 for(let first=0;first<4;first++){let s=game(first);for(let n=0;n<5;n++){assert.equal(t.tagDecisionMember(s).id,'p'+((first+n)%4));s=passes(act(s,'end'));}t.assertTagDuel(JSON.parse(JSON.stringify(s)));}
});
test('end-turn response uses the outgoing representative and cannot draw from the old partner deck',()=>{
 let s=passes(act(game(),'end'));s.core.turn=3;s.core.players[0].backrow=[back(0,'book','14087893')];s.core.players[1].monsters=[mon(1,'target','91152256')];const incoming=s.reserves[2].deck[0].uid;
 s=act(s,'end');assert.equal(s.core.phase,'response');assert.equal(s.cursor,1);assert.equal(t.tagDecisionMember(s).id,'p0');s=act(s,'spell',a=>a.card==='m0:book');s=passes(s);assert.equal(s.cursor,2);assert.equal(t.tagDecisionMember(s).id,'p2');assert.ok(t.tagMemberHand(s,'p2').some(c=>c.uid===incoming));assert.ok(s.core.players[0].grave.some(c=>c.uid==='m0:book'));assert.equal(s.core.players[1].monsters[0].faceUp,false);
});
test('bounce goes to original inactive member, whose excess discard persists and restores the acting representative',()=>{
 let s=passes(act(game(2),'end'));s.core.turn=4;s.core.players[1].hand=[ref(3,'bounce','42703248')];s.core.players[0].backrow=[back(0,'owned','44095762')];s.reserves[0].hand.push(...s.reserves[0].deck.splice(0,3));const previous=t.tagMemberHand(s,'p0').length;assert.equal(previous,7);
 s=act(s,'spell',a=>a.card==='m3:bounce');s=passes(s);assert.equal(s.core.phase,'discard');assert.equal(t.tagDecisionMember(s).id,'p0');assert.equal(t.tagMemberHand(s,'p0').length,8);assert.ok(t.tagMemberHand(s,'p0').some(c=>c.uid==='m0:owned'));assert.ok(!t.tagMemberHand(s,'p2').some(c=>c.uid==='m0:owned'));
 s=JSON.parse(JSON.stringify(s));s=act(s,'discard');assert.equal(s.core.phase,'main');assert.equal(t.tagDecisionMember(s).id,'p3');assert.equal(s.active[0],2);assert.equal(t.tagMemberHand(s,'p0').length,7);t.assertTagDuel(s);
});
test('costs/counter-traps use the responding member hand and shared LP; a partner card set earlier can respond',()=>{
 let s=game();s.core.turn=3;s.core.players[0].hand=[ref(0,'burn','19523799')];s.core.players[1].hand=[ref(1,'cost','91152256'),ref(1,'keep','48305365')];s.core.players[1].backrow=[back(3,'jam','77414722')];
 s=act(s,'spell');assert.equal(t.tagDecisionMember(s).id,'p1');s=act(s,'trap');s=passes(s);assert.equal(s.core.players[1].lp,4000);assert.deepEqual(t.tagMemberHand(s,'p1').map(c=>c.uid),['m1:keep']);assert.ok(s.core.players[1].grave.some(c=>c.uid==='m3:jam'));assert.equal(t.tagMemberHand(s,'p3').length,4);
});
test('fusion uses the acting member Extra Deck and shared field materials without consuming their ally extra',()=>{
 let s=game(2);s.core.turn=3;s.core.players[0].hand=[ref(2,'poly','24094653'),ref(2,'mat1','34460851'),ref(2,'mat2','44287299')];s.core.players[0].extra=[ref(2,'flame','45231177')];s.reserves[0].extra=[ref(0,'other','45231177')];s=act(s,'fusion');s=passes(s);assert.ok(s.core.players[0].monsters.some(c=>c.uid==='m2:flame'));assert.ok(s.reserves[0].extra.some(c=>c.uid==='m0:other'));s=passes(act(s,'end'));s=passes(act(s,'end'));assert.equal(s.cursor,0);assert.ok(s.core.players[0].extra.some(c=>c.uid==='m0:other'));
});
test('all 741 supported definitions are admitted as appropriate main/Extra data while unknown cards are rejected',()=>{
 const {enabledCardIds,getPlayableCard}=require('../dist/effectRegistry');assert.equal(enabledCardIds.length,741);for(const id of enabledCardIds){const c=getPlayableCard(id),players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:c.fusion?normal:[id,...normal.slice(1)],extra:c.fusion?[id]:[]}));const s=t.createTagDuel(players,{classic:true,seed:id});assert.ok(t.tagInventory(s).some(c=>c.id===id));}assert.throws(()=>t.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:['missing',...normal.slice(1)]})),{classic:true}));
});
test('Hane-Hane returns a partners Fusion to their own Extra Deck, never the acting members',()=>{
 let s=passes(act(game(2),'end'));s.core.turn=4;s.core.players[1].monsters=[{...mon(3,'hane','07089711'),faceUp:false,position:'def'}];s.core.players[0].monsters=[{...mon(0,'flame','45231177'),properlySummoned:true}];s=act(s,'position',a=>a.mode==='flip');assert.equal(s.core.phase,'choice');s=act(s,'choose',a=>a.target==='m0:flame');s=passes(s);assert.ok(s.reserves[0].extra.some(c=>c.uid==='m0:flame'));assert.ok(!s.core.players[0].extra.some(c=>c.uid==='m0:flame'));t.assertTagDuel(s);
});
test('inactive source grave trigger searches the acting representatives own deck under shared-field rules',()=>{
 let s=game(2);s.core.turn=4;s.core.players[0].monsters=[mon(2,'cannon','11384280'),mon(0,'sangan','26202165')];s.core.players[0].deck=[ref(2,'search','91152256')];const allyBefore=t.tagMemberHand(s,'p0').map(c=>c.uid);s=act(s,'monsterEffect',a=>a.tributes?.[0]==='m0:sangan');assert.equal(s.core.phase,'choice');assert.equal(t.tagDecisionMember(s).id,'p2');s=act(s,'choose',a=>a.target==='m2:search');assert.ok(t.tagMemberHand(s,'p2').some(c=>c.uid==='m2:search'));assert.deepEqual(t.tagMemberHand(s,'p0').map(c=>c.uid),allyBefore);
});
test('one return effect resolves all four hands first, then each owner discards once, including after JSON restores',()=>{
 let s=game();s.core.turn=3;for(let seat=0;seat<4;seat++){const p=seat<2?s.core.players[seat]:s.reserves[seat];p.hand.push(...p.deck.splice(0,3));assert.equal(p.hand.length,7);}s.core.players[0].backrow=[back(0,'trunade','42703248'),back(0,'own','12580477'),back(2,'ally','53129443')];s.core.players[1].backrow=[back(1,'own','55144522'),back(3,'ally','19523799')];s=act(s,'spell',a=>a.card==='m0:trunade');const order=[];while(s.core.phase==='discard'){s=JSON.parse(JSON.stringify(s));order.push(t.tagDecisionMember(s).id);s=act(s,'discard');}assert.deepEqual(order,['p0','p1','p2','p3']);for(const p of s.members)assert.equal(t.tagMemberHand(s,p.id).length,7);assert.deepEqual(s.active,[0,1]);assert.equal(t.tagDecisionMember(s).id,'p0');assert.equal(s.core.phase,'main');
});
test('simultaneous mandatory draw failure is an actual draw and cannot be announced as a team victory',()=>{
 let s=game();s.core.turn=3;s.core.players[0].deck=[];s.core.players[1].deck=[];s.core.players[0].hand=[ref(0,'destruction','72892473'),ref(0,'other','91152256')];s.core.players[1].hand=[ref(1,'other','91152256')];s=act(s,'spell',a=>a.card==='m0:destruction');assert.equal(s.core.phase,'finished');assert.equal(s.core.winner,null);const ui=require('../dist/tagUI');const payload=ui.tagPublicMessage({id:'example',guild:'g',channel:'c',message:null,revision:0,updated:0,status:'finished',rules:'classic-loan',members:s.members.map(p=>({...p,accepted:true})),state:s});assert.match(JSON.stringify(payload),/Empate/);assert.ok(!JSON.stringify(payload).includes('Vermelha venceu'));
});
