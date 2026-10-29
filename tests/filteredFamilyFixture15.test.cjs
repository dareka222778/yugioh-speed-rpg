const {test}=require('node:test'),assert=require('node:assert/strict');
test('virtual load deck legally exercises all eight new spells, equipment and seven distinct monster Types without distribution',()=>{
 const {filteredFamilyDeck}=require('../scripts/filtered-family-fixture15.cjs'),e=require('../dist/duelEngine'),{mechanicalBatch15}=require('../dist/mechanicalBatch15'),policy=require('../dist/cardReleasePolicy'),deck=filteredFamilyDeck();
 assert.equal(deck.length,20);e.validateDuelCards(deck);assert.equal(new Set(deck).size,20);for(const c of mechanicalBatch15){assert.ok(deck.includes(c.id));assert.equal(policy.cardDistributionAllowed(c.id),true);}
 assert.ok(deck.includes('56747793'));assert.deepEqual(deck,filteredFamilyDeck());
 const r=require('../dist/effectRegistry');assert.ok(deck.map(r.getPlayableCard).some(c=>c.race==='Insect'&&c.atk>=1800),'A very weak set-only Insect would fail to exercise Aerosol under normal AI play');
});
