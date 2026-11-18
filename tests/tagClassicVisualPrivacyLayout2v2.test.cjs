'use strict';
const {test:nodeTest}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');

const tag=require('../dist/tagDuel');
const {renderTag,tagImageLayout}=require('../dist/tagRenderer');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getCard}=require('../dist/collection');
const {rulesFor}=require('../dist/rulesProfile');
const trace=message=>fs.writeSync(2,'[M359] '+message+'\\n');
function debugTest(name,fn){return nodeTest(name,async(...args)=>{try{return await fn(...args);}catch(error){trace(name+' FAILED: '+(error&&error.stack||error));throw error;}});}
trace('module setup started');

const SAFE_NORMALS=[];
const seenNormalNames=new Set();
for(const id of [...new Set(tag.tagNormalCardIds)]){
  const card=getPlayableCard(id),name=getCard(id)?.name;
  if(card?.kind==='monster'&&card.monsterType==='normal'&&Number.isInteger(card.atk)&&Number.isInteger(card.defense)&&card.level<=4&&name&&!seenNormalNames.has(name)){
    SAFE_NORMALS.push(id);seenNormalNames.add(name);
  }
}
assert.ok(SAFE_NORMALS.length>=20,'M359 requires at least 20 distinct certified Normal Monster names');
assert.ok(SAFE_NORMALS.length>=20,'M359 requires twenty distinct certified Normal Monsters');
const DECK=SAFE_NORMALS.slice(0,20);
assert.equal(new Set(DECK).size,20);

const member=seat=>'m359-seat-'+seat;
function playersWith(){
  return [0,1,2,3].map(seat=>({
    id:member(seat),name:'M359 Seat '+seat,cards:[...DECK]
  }));
}
function createBase(){
  return tag.createTagDuel(playersWith(),{
    classic:true,first:0,seed:'m359-visual-privacy-layout'
  });
}
function takePhysicalCard(state,seat,id){
  const team=seat%2;
  const holder=state.active[team]===seat?state.core.players[team]:state.reserves[seat];
  for(const zone of ['deck','hand']){
    const index=holder[zone].findIndex(card=>card.id===id);
    if(index>=0)return holder[zone].splice(index,1)[0];
  }
  throw new Error('M359 fixture could not find physical card '+id+' at seat '+seat);
}
function createState(hiddenId,publicId){
  const state=createBase();
  const hidden=takePhysicalCard(state,2,hiddenId);
  hidden.faceUp=false;
  hidden.position='def';
  state.core.players[0].monsters.push(hidden);
  const publicCard=takePhysicalCard(state,0,publicId);
  publicCard.faceUp=true;
  publicCard.position='atk';
  state.core.players[0].monsters.push(publicCard);
  tag.assertTagDuel(state);
  return {state,hidden,publicCard};
}
async function render(state,viewer){
  trace('render start viewer='+(viewer??'public'));
  const calls=[];
  const image=await renderTag(state,viewer,async id=>{
    calls.push(id);
    return null;
  });
  trace('render complete viewer='+(viewer??'public')+' bytes='+image.length+' calls='+calls.length);
  return {image,calls};
}
function name(id){
  const card=getCard(id);
  assert.ok(card?.name,'M359 card identity must resolve: '+id);
  return card.name;
}

trace('before createBase');
const base=createBase();
trace('after createBase');
const hiddenCandidates=base.reserves[2].deck
  .map(card=>card.id)
  .filter((id,index,array)=>SAFE_NORMALS.includes(id)&&array.indexOf(id)===index)
  .slice(0,2);
trace('hidden candidate count='+hiddenCandidates.length+' ids='+hiddenCandidates.join(','));
assert.equal(hiddenCandidates.length,2,'M359 requires two distinct face-down candidates already in the same physical Deck');
assert.notEqual(name(hiddenCandidates[0]),name(hiddenCandidates[1]),
  'the visual privacy comparison requires distinguishable card identities');
const publicId=SAFE_NORMALS.find(id=>!hiddenCandidates.includes(id));
assert.ok(publicId,'M359 requires an independent face-up public card');

trace('before state A');
const A=createState(hiddenCandidates[0],publicId);
trace('after state A');
const B=createState(hiddenCandidates[1],publicId);
trace('after state B');
assert.equal(A.hidden.uid.split(':')[0], 'm2');
assert.equal(B.hidden.uid.split(':')[0], 'm2');
assert.equal(A.state.reserves[2].deck.length,B.state.reserves[2].deck.length,
  'both variants remove one card from the same physical Deck');
assert.equal(A.state.reserves[2].hand.length,B.state.reserves[2].hand.length,
  'the public comparison must not change the inactive partner hand count');

debugTest('M359 classic 2v2 playmat has stable public/private dimensions and preserves the 3+3 rules contract',async()=>{
  const layout=tagImageLayout(A.state);
  assert.deepEqual(layout,{width:1400,fieldHeight:1240,handHeight:340});
  const rules=rulesFor(A.state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  for(const team of A.state.core.players){
    assert.ok(team.monsters.length<=3);
    assert.ok(team.backrow.length<=3);
  }
  const publicView=await render(A.state,undefined);
  const privateView=await render(A.state,member(0));
  const publicMeta=await sharp(publicView.image).metadata();
  const privateMeta=await sharp(privateView.image).metadata();
  assert.equal(publicMeta.width,layout.width);
  assert.equal(publicMeta.height,layout.fieldHeight);
  assert.equal(privateMeta.width,layout.width);
  assert.equal(privateMeta.height,layout.fieldHeight+layout.handHeight);
  assert.ok(!publicView.calls.includes(A.hidden.id),
    'public renderer must not request art for a face-down card');
  assert.ok(privateView.calls.includes(A.hidden.id),
    'the private team renderer may request art for its own hidden field card');
});

debugTest('M359 changing a face-down card identity cannot change the public 2v2 playmat pixels',async()=>{
  const publicA=await render(A.state,undefined);
  const publicB=await render(B.state,undefined);
  assert.deepEqual(publicA.image,publicB.image,
    'public playmat must be pixel-identical when only a hidden card identity changes');
  assert.ok(!publicA.calls.includes(A.hidden.id));
  assert.ok(!publicA.calls.includes(B.hidden.id));
  assert.ok(!publicB.calls.includes(A.hidden.id));
  assert.ok(!publicB.calls.includes(B.hidden.id));
});

debugTest('M359 both physical allies can see their shared hidden field identity in their private visual playmat',async()=>{
  for(const seat of [0,2]){
    const viewA=await render(A.state,member(seat));
    const viewB=await render(B.state,member(seat));
    assert.notDeepEqual(viewA.image,viewB.image,
      'ally seat '+seat+' must receive a visual that reflects the shared face-down identity');
    assert.ok(viewA.calls.includes(A.hidden.id),
      'ally seat '+seat+' must render the hidden card owned by inactive partner seat 2');
    assert.ok(!viewA.calls.includes(B.hidden.id));
  }
});

debugTest('M359 neither opposing physical seat can infer a face-down identity from its private playmat',async()=>{
  for(const seat of [1,3]){
    const viewA=await render(A.state,member(seat));
    const viewB=await render(B.state,member(seat));
    assert.deepEqual(viewA.image,viewB.image,
      'opponent seat '+seat+' must see the same card back for both hidden identities');
    assert.ok(!viewA.calls.includes(A.hidden.id));
    assert.ok(!viewA.calls.includes(B.hidden.id));
    assert.ok(!viewB.calls.includes(A.hidden.id));
    assert.ok(!viewB.calls.includes(B.hidden.id));
  }
});
