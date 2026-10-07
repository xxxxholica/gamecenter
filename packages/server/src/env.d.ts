// shared/sumoSim はブラウザ(プレビュー用の ?noHud)とサーバーの両方で動く。サーバー(Node)には location が無いので、typeof で守って参照している。
declare const location: { search: string } | undefined;
