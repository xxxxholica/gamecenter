// 各ゲームの最初の import。ゲームのコードが乱数・時計・タイマーを使い始める前に、記録(または再生)の差し替えを入れる。
// その前に、本番のドメインでは開発用の URL パラメータを消す(記録するかどうかも ?bench・?preview で決まるため)。
import { stripDevParamsOnProduction } from './devParams';
import { installReplayCapture } from './arcadeReplay';

stripDevParamsOnProduction();
installReplayCapture();
