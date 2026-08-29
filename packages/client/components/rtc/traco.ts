/**
 * Renderizador de traco de laser.
 *
 * ESTE ARQUIVO E DUPLICADO DE PROPOSITO em for-desktop/src/traco.ts.
 *
 * Os dois lados precisam desenhar o traco identico -- quem assiste ve no canvas
 * sobre o <video>, quem compartilha ve na sobreposicao do Electron. Sao repos
 * separados, sem pacote compartilhado entre eles, e publicar um pacote npm so
 * para 70 linhas de canvas seria pior. Se mexer aqui, mexa la.
 *
 * Optei por escrever em vez de usar `perfect-freehand`: o lado do desktop e um
 * preload que monta o proprio DOM (sem bundler de renderer, ver
 * for-desktop/src/anotacao-preload.ts), entao uma dependencia ali exigiria
 * montar um pipeline de bundle que hoje nao existe. Suavizacao quadratica pelos
 * pontos medios resolve o caso de laser sem nada disso.
 */

/** Quanto tempo o traco fica opaco antes de comecar a sumir, em ms */
export const SEGURAR_MS = 1500;

/** Quanto tempo o traco leva para sumir depois de segurar, em ms */
export const ESMAECER_MS = 1000;

/** Espessura do traco em pixels de CSS */
export const ESPESSURA = 4;

/**
 * Opacidade de um traco pela idade.
 *
 * Fica em 1 durante `SEGURAR_MS`, depois cai linearmente ate 0 ao longo de
 * `ESMAECER_MS`. Devolve 0 quando o traco ja morreu -- quem chama usa isso
 * para podar a lista.
 *
 * @param idadeMs idade do traco em milissegundos
 * @returns opacidade entre 0 e 1
 */
export function opacidadePelaIdade(idadeMs: number): number {
  if (idadeMs <= SEGURAR_MS) return 1;
  const decorrido = idadeMs - SEGURAR_MS;
  if (decorrido >= ESMAECER_MS) return 0;
  return 1 - decorrido / ESMAECER_MS;
}

/**
 * Desenha um traco no contexto.
 *
 * Os pontos vem achatados (`[x0,y0,x1,y1,...]`) e ja em pixels do destino --
 * a conversao de 0..1 para pixel e responsabilidade de quem chama, porque os
 * dois lados tem origens diferentes (elemento de video la, tela inteira aqui).
 *
 * @param ctx contexto 2d
 * @param pontos coordenadas achatadas, em pixels
 * @param cor cor em qualquer notacao aceita pelo canvas
 * @param alfa opacidade de 0 a 1
 * @param espessura largura da linha em pixels
 */
export function desenharTraco(
  ctx: CanvasRenderingContext2D,
  pontos: number[],
  cor: string,
  alfa: number,
  espessura: number = ESPESSURA,
): void {
  const n = pontos.length >> 1;
  if (n === 0 || alfa <= 0) return;

  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = espessura;
  // O brilho e o que faz parecer laser em vez de caneta.
  ctx.shadowColor = cor;
  ctx.shadowBlur = espessura * 2.5;

  if (n === 1) {
    ctx.beginPath();
    ctx.arc(pontos[0], pontos[1], espessura / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pontos[0], pontos[1]);

  if (n === 2) {
    ctx.lineTo(pontos[2], pontos[3]);
  } else {
    // Curva quadratica com controle no ponto e fim no meio do segmento
    // seguinte. Passa perto de todos os pontos sem o overshoot que uma
    // Catmull-Rom produziria numa mudanca brusca de direcao -- e mudanca
    // brusca e exatamente o que um ponteiro faz.
    for (let i = 1; i < n - 1; i++) {
      const x = pontos[i * 2];
      const y = pontos[i * 2 + 1];
      const mx = (x + pontos[(i + 1) * 2]) / 2;
      const my = (y + pontos[(i + 1) * 2 + 1]) / 2;
      ctx.quadraticCurveTo(x, y, mx, my);
    }
    ctx.lineTo(pontos[(n - 1) * 2], pontos[(n - 1) * 2 + 1]);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Escreve o nome de quem desenhou junto ao inicio do traco.
 *
 * @param ctx contexto 2d
 * @param x posicao horizontal em pixels
 * @param y posicao vertical em pixels
 * @param nome texto
 * @param cor cor de fundo da etiqueta
 * @param alfa opacidade de 0 a 1
 */
export function desenharEtiqueta(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nome: string,
  cor: string,
  alfa: number,
): void {
  if (alfa <= 0 || !nome) return;

  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.font =
    "600 12px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";

  const largura = ctx.measureText(nome).width;
  const px = 6;
  const alturaCaixa = 18;
  const cx = x + 10;
  const cy = y - 14;

  ctx.fillStyle = cor;
  ctx.beginPath();
  // `roundRect` existe em todo navegador que roda este app e no Chromium do
  // Electron 43; o fallback e so para nao quebrar em ambiente de teste.
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(cx, cy - alturaCaixa / 2, largura + px * 2, alturaCaixa, 4);
  } else {
    ctx.rect(cx, cy - alturaCaixa / 2, largura + px * 2, alturaCaixa);
  }
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(nome, cx + px, cy);
  ctx.restore();
}

/**
 * Paleta de cores dos participantes.
 *
 * Escolhidas para se distinguirem entre si e sobre conteudo claro ou escuro.
 * Nao reaproveito a cor de cargo do usuario: ela pode ser indefinida e duas
 * pessoas do mesmo cargo teriam a mesma cor, que e justamente o que nao pode.
 */
export const PALETA = [
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#32ade6",
  "#af52de",
  "#ff2d55",
];

/**
 * Cor estavel para um usuario, derivada do id.
 *
 * Deterministica e sem coordenacao: os dois lados calculam a mesma cor sem
 * precisar trocar nada. A cor viaja no payload mesmo assim, porque quem
 * desenha pode ter escolhido outra.
 *
 * @param userId id do usuario
 * @returns cor da paleta
 */
export function corDoUsuario(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0;
  }
  return PALETA[Math.abs(h) % PALETA.length];
}
