import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from 'discord.js';
import type { Player } from './database';
import { isStarterDeck, starterDecks } from './starterDecks';
import fs from 'node:fs';
import path from 'node:path';

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
export function profileMessage(player: Player, avatar: string, editable = true) {
  const deck = player.starter_deck && isStarterDeck(player.starter_deck) ? starterDecks[player.starter_deck] : null;
  const embed = new EmbedBuilder()
    .setColor(themes[player.theme as keyof typeof themes] ?? themes.ametista)
    .setAuthor({ name: 'DUELIST ARCHIVE • SPEED RPG', iconURL: avatar })
    .setTitle(escapeMarkdown(player.character_name || player.username))
    .setDescription(player.biography ? escapeMarkdown(player.biography) : '*Toda lenda começa com uma primeira jogada.*')
    .setThumbnail(avatar)
    .addFields(
      { name: '✦ NÍVEL', value: String(player.duelist_level), inline: true },
      { name: '◆ PONTOS DE EXPERIÊNCIA', value: `${player.xp.toLocaleString('pt-BR')} XP`, inline: true },
      { name: '◈ CARTEIRA', value: `${player.dp.toLocaleString('pt-BR')} DP`, inline: true },
      { name: 'ESTILO INICIAL', value: deck ? `${deck.emoji} ${deck.name}` : 'Escolha com /start' }
    )
    .setFooter({ text: 'Speed RPG • Perfil de personagem • V0.2' });
  const files: AttachmentBuilder[] = [];
  const portrait = portraitPath(player.discord_id);
  if (fs.existsSync(portrait)) {
    const bytes = fs.readFileSync(portrait);
    const extension = bytes[0] === 255 ? 'jpg' : bytes.toString('ascii', 0, 4) === 'RIFF' ? 'webp' : 'png';
    const filename = `personagem.${extension}`;
    files.push(new AttachmentBuilder(bytes, { name: filename }));
    embed.setImage(`attachment://${filename}`);
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`profile:refresh:${player.discord_id}`).setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`profile:edit:${player.discord_id}`).setLabel('Personalizar').setEmoji('🎨').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`profile:help:${player.discord_id}`).setLabel('Ajuda').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], files, components: editable ? [row] : [], allowedMentions: { parse: [] as never[] } };
}
