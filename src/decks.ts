import {getPlayableCard} from './effectRegistry';
import {rulesCardName} from './cardIdentity';
import {RULES_PROFILE} from './rulesProfile';
import {db,getPlayer,getCollection,grantStarterCards} from './database';
import {getCard} from './collection';
import {starterContents} from './cardCatalog';
import {isStarterDeck} from './starterDecks';
export const DECK_RULES={min:RULES_PROFILE.mainDeckMin,max:RULES_PROFILE.mainDeckMax,copies:RULES_PROFILE.copiesPerCard,slots:3} as const;
export type DeckItem={card_key:string;quantity:number};
export type Deck={discord_id:string;slot:number;name:string;revision:number;active:number;items:DeckItem[];errors:string[];total:number;extraTotal:number};
// Additive tables only: collection quantities and player data are never moved or consumed.
db.exec(`CREATE TABLE IF NOT EXISTS decks (
 discord_id TEXT NOT NULL REFERENCES players(discord_id) ON DELETE CASCADE,
 slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),name TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 PRIMARY KEY(discord_id,slot));
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_deck ON decks(discord_id) WHERE active=1;
 CREATE TABLE IF NOT EXISTS deck_cards (
 discord_id TEXT NOT NULL,slot INTEGER NOT NULL,card_key TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 3),
 PRIMARY KEY(discord_id,slot,card_key),FOREIGN KEY(discord_id,slot) REFERENCES decks(discord_id,slot) ON DELETE CASCADE);`);
function slotCheck(slot:number){if(!Number.isInteger(slot)||slot<1||slot>3)throw new Error('Escolha um espaço de 1 a 3.');}
export function validateDeck(items:DeckItem[],owned:DeckItem[]) {
 const errors:string[]=[];const total=items.filter(c=>!getCard(c.card_key)?.fusion).reduce((sum,c)=>sum+c.quantity,0);const seen=new Set<string>();const extraTotal=items.filter(c=>getCard(c.card_key)?.fusion).reduce((n,c)=>n+c.quantity,0);if(extraTotal>RULES_PROFILE.extraDeckMax)errors.push(`Deck Adicional: máximo de ${RULES_PROFILE.extraDeckMax} cartas.`);
 if(total<RULES_PROFILE.mainDeckMin||total>RULES_PROFILE.mainDeckMax)errors.push(`Use 20 a 30 cartas (atual: ${total}).`);
 for(const item of items){
  const card=getCard(item.card_key);const have=owned.find(c=>c.card_key===item.card_key)?.quantity??0;
  if(!card||!getPlayableCard(item.card_key))errors.push(`Carta fora do catálogo: ${item.card_key}.`);
  if(seen.has(item.card_key))errors.push(`Carta repetida em registros separados: ${item.card_key}.`);seen.add(item.card_key);
  if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>RULES_PROFILE.copiesPerCard)errors.push(`Máximo de 3 cópias por carta: ${card?.name??item.card_key}.`);
  if(item.quantity>have)errors.push(`Você possui apenas ${have} cópia(s) de ${card?.name??item.card_key}.`);
 }
 const byRulesName=new Map<string,number>();
 for(const item of items){const c=getCard(item.card_key);if(!c||!Number.isInteger(item.quantity)||item.quantity<1)continue;const name=rulesCardName(c);byRulesName.set(name,(byRulesName.get(name)??0)+item.quantity);}
 for(const [name,amount]of byRulesName)if(amount>RULES_PROFILE.copiesPerCard)errors.push(`Máximo de 3 cópias somando cartas tratadas como ${name}.`);
 return {total,extraTotal,errors};
}
function rawDeck(owner:string,slot:number):Deck {
 const row=db.prepare('SELECT * FROM decks WHERE discord_id=? AND slot=?').get(owner,slot) as Omit<Deck,'items'|'errors'|'total'|'extraTotal'>|undefined;
 if(!row)throw new Error('Deck não encontrado. Abra /deck ver.');
 const items=db.prepare('SELECT card_key,quantity FROM deck_cards WHERE discord_id=? AND slot=? ORDER BY card_key').all(owner,slot) as DeckItem[];
 return {...row,items,...validateDeck(items,getCollection(owner))};
}
function seed(owner:string,slot:number){
 const player=getPlayer(owner)!;if(!player.starter_deck||!isStarterDeck(player.starter_deck))throw new Error('Escolha seu conjunto inicial com /start.');
 const items=starterContents[player.starter_deck].map(c=>({card_key:c.id,quantity:c.quantity}));
 const validation=validateDeck(items,getCollection(owner));if(validation.errors.length)throw new Error(validation.errors.join('\n'));
 const put=db.prepare('INSERT INTO deck_cards(discord_id,slot,card_key,quantity) VALUES(?,?,?,?)');
 for(const c of items)put.run(owner,slot,c.card_key,c.quantity);
 db.prepare('UPDATE decks SET revision=revision+1 WHERE discord_id=? AND slot=?').run(owner,slot);
}
export const openDeck=db.transaction((owner:string,slot=1):Deck=>{
 slotCheck(slot);if(!getPlayer(owner))throw new Error('Crie seu duelista com /start.');grantStarterCards(owner);
 const first=!db.prepare('SELECT 1 FROM decks WHERE discord_id=? LIMIT 1').get(owner);
 if(first){db.prepare('INSERT INTO decks(discord_id,slot,name) VALUES(?,1,?)').run(owner,'Meu primeiro deck');
  const player=getPlayer(owner)!;if(player.starter_deck&&isStarterDeck(player.starter_deck))seed(owner,1);
 }
 db.prepare('INSERT OR IGNORE INTO decks(discord_id,slot,name) VALUES(?,?,?)').run(owner,slot,`Deck ${slot}`);
 let deck=rawDeck(owner,slot);
 if(deck.active&&deck.errors.length){db.prepare('UPDATE decks SET active=0,revision=revision+1 WHERE discord_id=? AND slot=?').run(owner,slot);deck=rawDeck(owner,slot);}
 return deck;
});
function revisionCheck(deck:Deck,expected?:number){if(expected!==undefined&&expected!==deck.revision)throw new Error('Esse painel ficou antigo. Clique em Atualizar antes de editar.');}
export const changeDeck=db.transaction((owner:string,slot:number,cardId:string,delta:number,expected?:number):Deck=>{
 const deck=openDeck(owner,slot);revisionCheck(deck,expected);
 if(!getPlayableCard(cardId))throw new Error('Escolha uma carta do catálogo.');
 if(!Number.isInteger(delta)||delta===0||Math.abs(delta)>3)throw new Error('Altere de 1 a 3 cópias por vez.');
 const quantity=(deck.items.find(c=>c.card_key===cardId)?.quantity??0)+delta;
 if(quantity<0)throw new Error('Não há essa quantidade no deck.');
 if(quantity>3)throw new Error('Máximo de 3 cópias da mesma carta.');
 if(quantity>(getCollection(owner).find(c=>c.card_key===cardId)?.quantity??0))throw new Error('Você não possui cópias suficientes dessa carta.');
 if(delta>0&&(getCard(cardId)?.fusion?deck.extraTotal+delta>RULES_PROFILE.extraDeckMax:deck.total+delta>RULES_PROFILE.mainDeckMax))throw new Error(getCard(cardId)?.fusion?`Deck Adicional: máximo de ${RULES_PROFILE.extraDeckMax} cartas.`:'O deck pode ter no máximo 30 cartas.');
 if(quantity===0)db.prepare('DELETE FROM deck_cards WHERE discord_id=? AND slot=? AND card_key=?').run(owner,slot,cardId);
 else db.prepare('INSERT INTO deck_cards VALUES(?,?,?,?) ON CONFLICT(discord_id,slot,card_key) DO UPDATE SET quantity=excluded.quantity').run(owner,slot,cardId,quantity);
 const valid=rawDeck(owner,slot).errors.length===0;
 db.prepare('UPDATE decks SET revision=revision+1,active=CASE WHEN ? THEN active ELSE 0 END WHERE discord_id=? AND slot=?').run(Number(valid),owner,slot);
 return rawDeck(owner,slot);
});
export const renameDeck=db.transaction((owner:string,slot:number,name:string,expected?:number):Deck=>{
 const deck=openDeck(owner,slot);revisionCheck(deck,expected);const clean=name.trim();
 if(!clean||clean.length>32)throw new Error('Use um nome de 1 a 32 caracteres.');
 db.prepare('UPDATE decks SET name=?,revision=revision+1 WHERE discord_id=? AND slot=?').run(clean,owner,slot);return rawDeck(owner,slot);
});
export const activateDeck=db.transaction((owner:string,slot:number,expected?:number):Deck=>{
 const deck=openDeck(owner,slot);revisionCheck(deck,expected);if(deck.errors.length)throw new Error(`Deck inválido:\n${deck.errors.join('\n')}`);
 db.prepare('UPDATE decks SET active=0,revision=revision+1 WHERE discord_id=? AND active=1 AND slot<>?').run(owner,slot);
 db.prepare('UPDATE decks SET active=1,revision=revision+1 WHERE discord_id=? AND slot=?').run(owner,slot);return rawDeck(owner,slot);
});
export const fillInitialDeck=db.transaction((owner:string,slot:number,expected?:number):Deck=>{
 const deck=openDeck(owner,slot);revisionCheck(deck,expected);if(deck.total||deck.extraTotal)throw new Error('O espaço precisa estar vazio para copiar o conjunto inicial. Nenhuma carta foi substituída.');
 seed(owner,slot);return rawDeck(owner,slot);
});
