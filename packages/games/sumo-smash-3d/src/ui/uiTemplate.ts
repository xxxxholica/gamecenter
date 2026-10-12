// 剛体大相撲のUIの HTML(UIManager が #game-ui-layer の中身にする)。
// UIManager.ts から、文字列をそのまま移した(内容は変えていない)。
import { buttonIconHtml } from '../../../../shared/arcadeGuide';
import { UI_CSS } from './uiStyles';

/**
 * 技名を1文字ずつ縦に積む。writing-mode の縦書きはフォントによって字送りがずれるため使わず、
 * 「ー」だけは回して縦棒にする。
 */
export function verticalText(text: string): string {
  const chars = [...text].map((c) => `<span class="skill-char${c === 'ー' ? ' skill-choon' : ''}">${c}</span>`);
  return `<span class="skill-text">${chars.join('')}</span>`;
}

export function uiLayerHtml(): string {
  return `
      <style>${UI_CSS}</style>

      <!-- ===== 遊び方モーダル ===== -->
      <div id="how-to-play-modal">
        <div class="guide-modal-content">
          <div class="guide-title">遊 び 方</div>
          <table class="guide-table">
            <thead>
              <tr>
                <th>技</th>
                <th>操作</th>
                <th>説明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>移動</strong></td>
                <td><span class="guide-key-tag">レバー</span> / <span class="guide-key-tag">WASD</span></td>
                <td>カメラの向きで8方向に動く。</td>
              </tr>
              <tr>
                <td><strong>張り手</strong></td>
                <td><span class="guide-key-tag">A / Xボタン</span> / <span class="guide-key-tag">J</span> を<strong>ちょん押し</strong></td>
                <td>連打できる小さな突き。タメている相手を止める。当てるほど吹き飛ばしが強くなり(外してもたまった分は消えない)、満タンで次の1発が強い。</td>
              </tr>
              <tr>
                <td><strong>ぶちかまし</strong></td>
                <td><span class="guide-key-tag">A / Xボタン</span> / <span class="guide-key-tag">J</span> を<strong>長押し</strong></td>
                <td>タメて、離すと突進。長いほど遠くへ飛ぶ。つかみを弾く。</td>
              </tr>
              <tr>
                <td><strong>つかみ</strong></td>
                <td><span class="guide-key-tag">B / Yボタン</span> / <span class="guide-key-tag">K</span></td>
                <td>近くの相手を投げる。張り手では止まらない。外すと隙が大きい。</td>
              </tr>
              <tr>
                <td><strong>勝負</strong></td>
                <td>-</td>
                <td>当たるほど吹き飛びやすい。土俵の外に出たら負け。二本先取。</td>
              </tr>
              <tr>
                <td><strong>反撃</strong></td>
                <td>ボタン連打</td>
                <td>連続で殴られたら、連打で押し返せる。</td>
              </tr>
            </tbody>
          </table>
          <button class="guide-close-btn" id="guide-close-btn">閉じる</button>
        </div>
      </div>

      <!-- ===== 試合決着リザルト画面 ===== -->
      <div id="match-result-modal">
        <div class="result-modal-content">
          <h2 class="result-title" id="result-winner-title">勝利</h2>
          <div class="result-list" id="result-list"></div>

          <div class="result-buttons" id="result-menu">
            <button id="result-btn-rematch">再挑戦</button>
            <button id="result-btn-title">タイトルに戻る</button>
            <button id="result-btn-exit">ゲームを終了</button>
          </div>
        </div>
      </div>

      <!-- ===== バトル中HUD ===== -->
      <div id="battle-hud">
        <div class="hud-top">
          <!-- プレイヤー1（東方 蒼天龍） -->
          <div class="fighter-card p1-card">
            <div class="fighter-header">
              <span class="player-badge p1-badge">1P</span>
              <span class="fighter-name p1-color">東方 蒼天龍</span>
            </div>

            <!-- 主役：ダメージ蓄積率（吹き飛び率） -->
            <div class="knockback-wrap">
              <div class="damage-number-box">
                <span class="knockback-value" id="p1-knockback">0</span>
                <span class="knockback-unit">%</span>
              </div>
            </div>

            <!-- 技: 回復に合わせて枠が満ちる -->
            <div class="skill-stack">
              <div class="skill-box ready" id="p1-harite-box">
                <div class="skill-fill"></div>
                <div class="charge-fill" id="p1-harite-bar"></div>
                <div class="skill-label">${buttonIconHtml([0], 'Space')}${verticalText('張り手')}</div>
                <div class="skill-hint">連打</div>
              </div>
              <div class="skill-box ready" id="p1-buchi-cd">
                <div class="skill-fill" id="p1-buchi-fill"></div>
                <div class="charge-fill" id="p1-charge-bar"></div>
                <div class="skill-label">${buttonIconHtml([0], 'Space')}${verticalText('ぶちかまし')}</div>
                <div class="skill-hint">長押し</div>
              </div>
              <div class="skill-box grab ready" id="p1-grab-cd">
                <div class="skill-fill" id="p1-grab-fill"></div>
                <div class="skill-label">${buttonIconHtml([1], 'K')}${verticalText('つかみ')}</div>
              </div>
            </div>

            <div class="badge-status-wrap">
              <span class="armor-badge" id="p1-armor-badge">突進中</span>
            </div>
          </div>


          <!-- プレイヤー2 / CPU（西方 紅炎山） -->
          <!-- 中央: 両者の星取り(白い丸=勝ち、薄い輪=これから) -->
          <div class="hud-center-marks">
            <div class="stars-container" id="p1-stars"></div>
            <span class="marks-divider"></span>
            <div class="stars-container" id="p2-stars"></div>
          </div>

          <div class="fighter-card p2-card">
            <div class="fighter-header">
              <span class="fighter-name p2-color">西方 紅炎山</span>
              <span class="player-badge p2-badge" id="p2-badge-tag">2P</span>
            </div>

            <!-- 主役：ダメージ蓄積率（吹き飛び率） -->
            <div class="knockback-wrap">
              <div class="damage-number-box">
                <span class="knockback-value" id="p2-knockback">0</span>
                <span class="knockback-unit">%</span>
              </div>
            </div>

            <!-- 技: 回復に合わせて枠が満ちる -->
            <div class="skill-stack">
              <div class="skill-box p2-side ready" id="p2-harite-box">
                <div class="skill-fill"></div>
                <div class="charge-fill" id="p2-harite-bar"></div>
                <div class="skill-label">${buttonIconHtml([0], ',')}${verticalText('張り手')}</div>
                <div class="skill-hint">連打</div>
              </div>
              <div class="skill-box p2-side ready" id="p2-buchi-cd">
                <div class="skill-fill" id="p2-buchi-fill"></div>
                <div class="charge-fill" id="p2-charge-bar"></div>
                <div class="skill-label">${buttonIconHtml([0], ',')}${verticalText('ぶちかまし')}</div>
                <div class="skill-hint">長押し</div>
              </div>
              <div class="skill-box p2-side grab ready" id="p2-grab-cd">
                <div class="skill-fill" id="p2-grab-fill"></div>
                <div class="skill-label">${buttonIconHtml([1], '.')}${verticalText('つかみ')}</div>
              </div>
            </div>

            <div class="badge-status-wrap">
              <span class="armor-badge" id="p2-armor-badge">突進中</span>
            </div>
          </div>
          <div class="multi-row" id="multi-row"></div>
        </div>

        <!-- 中央コール（はっけよい、のこった、勝負あり） -->
        <div class="center-announcement" id="center-announcement">
          <div class="banner-main" id="banner-main">はっけよい</div>
          <div class="banner-sub" id="banner-sub"></div>
        </div>

      </div>
    `;
}
