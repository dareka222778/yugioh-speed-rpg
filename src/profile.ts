import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { Player } from './database';
import { isStarterDeck, starterDecks } from './starterDecks';
import fs from 'node:fs';
import path from 'node:path';
import { renderCard } from './cardRenderer';

export const themes = { ametista: 0x9b59b6, ouro: 0xf1c40f, oceano: 0x3498db, rubi: 0xe74c3c, esmeralda: 0x2ecc71 } as const;
export function validateProfile(name: string, bio: string, theme: string) {
  if (!name.trim() || name.trim().length > 32) throw new Error('Use um nome de 1 a 32 caracteres.');
  if (bio.length > 240) throw new Error('A biografia pode ter até 240 caracteres.');
  if (!Object.hasOwn(themes, theme)) throw new Error('Escolha uma das cores disponíveis.');
  return { character_name: name.trim(), biography: bio.trim(), theme };
}
export const portraitsDir = path.join(path.dirname(process.env.DATABASE_PATH ?? './data/game.sqlite'), 'portraits');
export function portraitPath(id: string) {
  if (!/^\d{1,20}$/.test(id)) throw new Error('Identificador inválido.');
  return path.join(portraitsDir, `${id}.image`);
}
export async function profileMessage(player: Player, avatar: string, editable = true) {
  const deck = player.starter_deck && isStarterDeck(player.starter_deck) ? starterDecks[player.starter_deck] : null;
  const portrait = portraitPath(player.discord_id);
  let photo: Buffer | undefined;
  try { photo = await fs.promises.readFile(portrait); } catch { /* Default silhouette. */ }
  const bytes = await renderCard(player, photo);
  const filename = 'ficha-duelista.png';
  const files = [new AttachmentBuilder(bytes, { name: filename,
    description: `${player.character_name || player.username}. Nível ${player.duelist_level}. ${player.xp} XP. ${player.dp} DP. Estilo: ${deck?.name ?? 'Não escolhido'}. ${player.biography}`.slice(0,1024) })];
  const embed = new EmbedBuilder().setColor(themes[player.theme as keyof typeof themes] ?? themes.ametista)
    .setImage(`attachment://${filename}`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`profile:refresh:${player.discord_id}`).setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`profile:edit:${player.discord_id}`).setLabel('Personalizar').setEmoji('🎨').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`collection:page:${player.discord_id}:1`).setLabel('Coleção').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`deck:view:${player.discord_id}:1:0:1:`).setLabel('Decks').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`profile:help:${player.discord_id}`).setLabel('Ajuda').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], files, components: editable ? [row] : [], allowedMentions: { parse: [] as never[] } };
}
