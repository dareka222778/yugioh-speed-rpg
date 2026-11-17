"""Import factual card metadata; excludes copyrighted flavour/effect text and code.
Source: DawnbrandBots/yaml-yugi aggregate, retrieved from its own publication.
Run with an existing aggregate path, or download once with no argument.
"""
import json,sys,urllib.request,hashlib,datetime
from pathlib import Path
source='https://dawnbrandbots.github.io/yaml-yugi/cards.json'
raw=Path(sys.argv[1]).read_bytes() if len(sys.argv)>1 else urllib.request.urlopen(source,timeout=60).read()
by={c['name']['en']:c for c in json.loads(raw)}
groups={
 'warrior':['Celtic Guardian','Axe Raider','Battle Warrior','Masaki the Legendary Swordsman','Doron','Swordsman of Landstar','Battle Ox','Ansatsu'],
 'spellcaster':['Ancient Elf','Mystical Elf','Rogue Doll','Neo the Magic Swordsman','Sorcerer of the Doomed','LaMoon','Lady of Faith','Illusionist Faceless Mage'],
 'dragon':['Baby Dragon','Petit Dragon','Winged Dragon, Guardian of the Fortress #1','Lesser Dragon','Crawling Dragon','Curse of Dragon','Koumori Dragon','One-Eyed Shield Dragon']}
shared=['Red Medicine','Fissure','Reinforcements','Castle Walls']
summary={'Red Medicine':'Recuperação de pontos de vida.','Fissure':'Remoção de monstro do adversário.','Reinforcements':'Reforço temporário de ataque.','Castle Walls':'Reforço temporário de defesa.'}
cards=[]
for name in sum(groups.values(),[])+shared+['Sogen','Polymerization','Flame Swordsman','Flame Manipulator','Blue-Eyes White Dragon','Dark Magician','Red-Eyes Black Dragon']:
 c=by[name]
 if name not in shared+['Sogen','Polymerization','Flame Swordsman']: assert c['monster_type_line'].endswith('/ Normal'),name
 cards.append(dict(id=str(c['password']).zfill(8),konamiId=c['konami_id'],name=c['name']['pt'] or name,englishName=name,kind=c['card_type'].lower(),race=(c.get('monster_type_line') or '').split(' / ')[0] or None,attribute=c.get('attribute'),level=c.get('level'),atk=c.get('atk'),defense=c.get('def'),summary=summary.get(name,'Monstro Normal: sem efeito.'),source=f"https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid={c['konami_id']}&request_locale=pt"))
for c in cards:
 if c['kind']=='monster': c['monsterType']='fusion' if c['englishName']=='Flame Swordsman' else 'normal'
 if c['englishName']=='Dark Magician':c['id']='46986414'
 if c['englishName'] in ['Blue-Eyes White Dragon','Dark Magician','Red-Eyes Black Dragon']:c['summary']='Monstro Normal: sem efeito. Exige 2 tributos na Invocação-Normal.'
 if c['englishName']=='Sogen':c.update(field=True,summary='Magia de Campo: Guerreiros e Bestas-Guerreiras ganham 200 ATK/DEF.')
 if c['englishName']=='Polymerization':c.update(id='24094653',summary='Fusão de monstros usando materiais da mão ou do campo.')
 if c['englishName']=='Flame Swordsman':c.update(fusion=['34460851','44287299'],summary='Fusão: Manipulador de Chamas + Masaki, o Espadachim Lendário.')
lookup={c['englishName']:c['id'] for c in cards}
decks={k:[{'id':lookup[n],'quantity':2} for n in names]+[{'id':lookup[n],'quantity':1} for n in shared] for k,names in groups.items()}
header="""// Factual metadata imported by scripts/import_catalog.py. See CARD_SOURCES.md.
export type Card = { id:string; konamiId:number; name:string; englishName:string; kind:'monster'|'spell'|'trap'; race:string|null; attribute:string|null; level:number|null; atk:number|null; defense:number|null; summary:string; source:string; monsterType?:'normal'|'effect'|'fusion'; field?:boolean; fusion?:string[] };
export type StarterItem = { id:string; quantity:number };
"""
Path('src/cardCatalog.ts').write_text(header+'export const cards: Card[] = '+json.dumps(cards,ensure_ascii=False,indent=2)+';\nexport const starterContents: Record<string, StarterItem[]> = '+json.dumps(decks,indent=2)+';\n',encoding='utf8')
Path('CARD_SOURCES.md').write_text(f'''# Card metadata sources

Imported factual metadata (names, identifiers, type, level, ATK and DEF) from the YAML Yugi project's own aggregate: {source}

Retrieved: {datetime.datetime.now(datetime.timezone.utc).date()}. Aggregate SHA-256: `{hashlib.sha256(raw).hexdigest()}`.

Each catalog entry includes a Konami database link for checking the corresponding card. No upstream program code, card flavour text or effect text was copied. Short functional category labels are original summaries, not executable rules. Card names and artwork belong to their respective rights holders. This is an unofficial fan project.

The catalog is bundled locally, so commands do not query the API. Optional card images use YGOPRODeck CDN and are cached locally on first use; unavailable images never prevent text consultation. No card image is required for starter delivery or collection.

Starter sets v1 contain 20 cards each: two copies of eight Normal Monsters and one copy of each of four shared Spell/Trap cards. These are a small classic-themed prototype selection, not a claim to include every card shown in the first anime or to certify official Speed Duel legality. No duels or card effects are implemented in Phase 2.

Regenerate with `python scripts/import_catalog.py /path/to/cards.json`. Only the selected factual fields enter the project; the complete upstream aggregate is not bundled.
''',encoding='utf8')
print({'cards':len(cards),'starter_totals':{k:sum(x['quantity'] for x in v) for k,v in decks.items()}})
