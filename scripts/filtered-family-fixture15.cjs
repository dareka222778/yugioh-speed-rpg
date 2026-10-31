/** Virtual stress-test deck only. Never writes collections, inventory or release policy. */
function filteredFamilyDeck(){const r=require('../dist/effectRegistry'),{mechanicalBatch15}=require('../dist/mechanicalBatch15'),races=['Fiend','Machine','Fish','Rock','Warrior','Insect','Spellcaster'];
 const chosen=races.map(race=>r.engineCatalog.filter(c=>c.monsterType==='normal'&&c.race===race&&c.level<=4).sort((a,b)=>b.atk-a.atk||a.id.localeCompare(b.id))[0].id);
 for(const c of r.engineCatalog)if(chosen.length<11&&c.monsterType==='normal'&&c.level<=4&&!chosen.includes(c.id))chosen.push(c.id);
 if(chosen.length!==11)throw Error('Certified family fixture incomplete');return [...mechanicalBatch15.map(c=>c.id),'56747793',...chosen];
}
module.exports={filteredFamilyDeck};
