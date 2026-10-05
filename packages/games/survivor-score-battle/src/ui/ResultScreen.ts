import { ContenderState, InputState } from '../types';
import { Player } from '../entities/Player';
import { SoundManager } from '../audio/SoundManager';

export class ResultScreen {
  public selectedOption: 'PLAY_AGAIN' | 'TITLE' = 'PLAY_AGAIN';
  private animTimer: number = 0;

  public update(input: InputState, soundManager: SoundManager): 'PLAY_AGAIN' | 'TITLE' | null {
    this.animTimer += 0.016;

    if (input.leftTap || input.rightTap || input.upTap || input.downTap) {
      this.selectedOption = this.selectedOption === 'PLAY_AGAIN' ? 'TITLE' : 'PLAY_AGAIN';
      soundManager.sfx.playMenuSelect();
    }

    if (input.confirm) {
      soundManager.sfx.playMenuConfirm();
      return this.selectedOption;
    }

    return null;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player,
    finalStandings: ContenderState[],
    gameTime: number
  ) {
    ctx.save();

    // Dark Background
    ctx.fillStyle = '#040711';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const isWinner = player.rank === 1;

    // 1. Header: VICTORY!! or GAME OVER
    const headerY = height * 0.12;
    ctx.font = '900 68px Impact, sans-serif';
    if (isWinner) {
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 35;
      ctx.fillText('🏆 VICTORY!! #1 CHAMPION 🏆', width / 2, headerY);
    } else {
      ctx.fillStyle = '#ff2255';
      ctx.shadowColor = '#ff2255';
      ctx.shadowBlur = 25;
      ctx.fillText('GAME OVER - FINAL RESULT', width / 2, headerY);
    }
    ctx.shadowBlur = 0;

    // 2. Left Panel: Player Highlights & Stats
    const leftX = width * 0.28;
    const leftW = 460;
    const leftH = 500;
    const panelY = height * 0.52;

    ctx.fillStyle = 'rgba(8, 16, 32, 0.9)';
    ctx.strokeStyle = isWinner ? '#ffd700' : '#00f0ff';
    ctx.lineWidth = 3;
    if (isWinner) {
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 15;
    }
    ctx.fillRect(leftX - leftW / 2, panelY - leftH / 2, leftW, leftH);
    ctx.strokeRect(leftX - leftW / 2, panelY - leftH / 2, leftW, leftH);
    ctx.shadowBlur = 0;

    // Player Avatar / Tag
    ctx.font = '900 48px Impact, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('YOU', leftX, panelY - 180);

    // Rank Badge
    ctx.font = '900 76px Impact, sans-serif';
    ctx.fillStyle = isWinner ? '#ffd700' : '#00f0ff';
    ctx.fillText(`#${player.rank}`, leftX, panelY - 110);

    // Final Score
    ctx.font = '900 40px Impact, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${player.score.toLocaleString()} PTS`, leftX, panelY - 40);

    // Stat Breakdown
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    const survivalTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const statRows = [
      { label: 'TOTAL KILLS', val: player.kills.toLocaleString() },
      { label: 'MAX COMBO', val: `×${player.maxCombo}` },
      { label: 'LEVEL REACHED', val: `LV. ${player.level}` },
      { label: 'SWORDS ACCUMULATED', val: `🗡️ ${player.swordSystem.swordCount}` },
      { label: 'SURVIVAL TIME', val: survivalTime },
    ];

    const statsStartY = panelY + 25;
    for (let i = 0; i < statRows.length; i++) {
      const y = statsStartY + i * 40;
      ctx.textAlign = 'left';
      ctx.font = '700 19px sans-serif';
      ctx.fillStyle = '#8899aa';
      ctx.fillText(statRows[i].label, leftX - leftW / 2 + 35, y);

      ctx.textAlign = 'right';
      ctx.font = '900 21px Impact, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(statRows[i].val, leftX + leftW / 2 - 35, y);
    }

    // 3. Right Panel: Final Tournament Standings (All 8 Contenders)
    const rightX = width * 0.72;
    const rightW = 570;
    const rightH = 500;

    ctx.fillStyle = 'rgba(8, 16, 32, 0.9)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.fillRect(rightX - rightW / 2, panelY - rightH / 2, rightW, rightH);
    ctx.strokeRect(rightX - rightW / 2, panelY - rightH / 2, rightW, rightH);

    ctx.textAlign = 'center';
    ctx.font = '900 26px Impact, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('🏆 TOURNAMENT FINAL STANDINGS', rightX, panelY - rightH / 2 + 35);

    const rowH = 46;
    const tableStartY = panelY - rightH / 2 + 75;

    for (let i = 0; i < finalStandings.length; i++) {
      const c = finalStandings[i];
      const y = tableStartY + i * rowH;
      const isYou = c.isPlayer;
      const isAlive = c.alive;

      if (isYou) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.fillRect(rightX - rightW / 2 + 15, y - 8, rightW - 30, rowH - 6);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeRect(rightX - rightW / 2 + 15, y - 8, rightW - 30, rowH - 6);
      } else if (!isAlive) {
        ctx.fillStyle = 'rgba(255, 34, 85, 0.12)';
        ctx.fillRect(rightX - rightW / 2 + 15, y - 8, rightW - 30, rowH - 6);
      }

      // Rank
      ctx.textAlign = 'left';
      ctx.font = '900 22px Impact, sans-serif';
      ctx.fillStyle = !isAlive ? '#666677' : i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#8899aa';
      ctx.fillText(`#${i + 1}`, rightX - rightW / 2 + 25, y + 14);

      // Name & Archetype
      ctx.fillStyle = !isAlive ? '#884455' : isYou ? '#ffd700' : c.color;
      const displayName = !isAlive ? `💀 ${c.name}` : c.name;
      ctx.fillText(displayName, rightX - rightW / 2 + 75, y + 14);

      // Swords count
      ctx.font = '900 17px Impact, sans-serif';
      ctx.fillStyle = !isAlive ? '#555566' : '#ffd700';
      ctx.fillText(`🗡️${c.swordCount || 0}`, rightX + 60, y + 14);

      // Level
      ctx.font = '700 16px sans-serif';
      ctx.fillStyle = !isAlive ? '#555566' : '#8899aa';
      ctx.fillText(`LV.${c.level}`, rightX + 130, y + 14);

      // Score
      ctx.textAlign = 'right';
      ctx.font = '900 22px Impact, sans-serif';
      ctx.fillStyle = !isAlive ? '#778899' : '#ffffff';
      ctx.fillText(`${c.score.toLocaleString()} PTS`, rightX + rightW / 2 - 25, y + 14);
    }

    // 4. Action Buttons (Bottom Center)
    const btnY = height - 70;
    const btnW = 280;
    const btnH = 55;

    // PLAY AGAIN BUTTON
    const playAgainX = width / 2 - 160;
    const isPlaySelected = this.selectedOption === 'PLAY_AGAIN';
    ctx.fillStyle = isPlaySelected ? 'rgba(0, 255, 136, 0.3)' : 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = isPlaySelected ? '#00ff88' : '#334455';
    ctx.lineWidth = isPlaySelected ? 4 : 2;
    if (isPlaySelected) {
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 20;
    }
    ctx.fillRect(playAgainX - btnW / 2, btnY - btnH / 2, btnW, btnH);
    ctx.strokeRect(playAgainX - btnW / 2, btnY - btnH / 2, btnW, btnH);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center';
    ctx.font = '900 24px Impact, sans-serif';
    ctx.fillStyle = isPlaySelected ? '#ffffff' : '#8899aa';
    ctx.fillText('▶ PLAY AGAIN', playAgainX, btnY);

    // TITLE SCREEN BUTTON
    const titleBtnX = width / 2 + 160;
    const isTitleSelected = this.selectedOption === 'TITLE';
    ctx.fillStyle = isTitleSelected ? 'rgba(0, 240, 255, 0.3)' : 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = isTitleSelected ? '#00f0ff' : '#334455';
    ctx.lineWidth = isTitleSelected ? 4 : 2;
    if (isTitleSelected) {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 20;
    }
    ctx.fillRect(titleBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH);
    ctx.strokeRect(titleBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH);
    ctx.shadowBlur = 0;

    ctx.font = '900 24px Impact, sans-serif';
    ctx.fillStyle = isTitleSelected ? '#ffffff' : '#8899aa';
    ctx.fillText('⌂ TITLE MENU', titleBtnX, btnY);

    ctx.restore();
  }
}
