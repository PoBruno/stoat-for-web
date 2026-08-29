import { createSignal } from "solid-js";

import type { TrackReferenceOrPlaceholder } from "solid-livekit-components";

/**
 * Janelas destacadas — uma por tela compartilhada.
 *
 * COMO A JANELA FILHA RECEBE O VIDEO
 *
 * Por referencia viva, nao por rede. `window.open()` de mesma origem devolve
 * um handle cujo heap e o MESMO: um `MediaStream` passado por ali e a mesma
 * instancia dos dois lados. Medido em `.e2e-popout-mecanismo.mjs`: duas
 * janelas decodificando 640x480 a partir de um unico stream.
 *
 * O caminho obvio -- a janela nova entrar na sala do LiveKit sozinha -- foi
 * rejeitado por tres motivos independentes, todos verificaveis:
 *
 *   1. o servidor passaria a ver DOIS participantes (voce duplicado na lista)
 *   2. a banda de descida dobraria por janela
 *   3. `raise_if_in_voice` (voice_join.rs:96) RECUSA a segunda entrada
 *
 * ⚠️ `noopener` nao pode ser usado ao abrir. Os 12 `window.open` que ja
 * existem no repo passam `noopener` -- e ele anula justamente o `opener` de
 * que este mecanismo depende.
 */

/** Streams entregues as janelas filhas, por sid da faixa. */
const streams = new Map<string, MediaStream>();

/** Handles das janelas abertas, por sid da faixa. */
const janelas = new Map<string, Window>();

const [abertos, setAbertos] = createSignal<string[]>([]);

/** Sids das telas atualmente destacadas. Reativo. */
export const popoutsAbertos = abertos;

/** Se esta faixa ja tem janela destacada. */
export function temPopout(sid: string) {
  return abertos().includes(sid);
}

/**
 * Se da para abrir uma janela destacada neste ambiente.
 *
 * Tres casos, e o terceiro e o que obriga esta funcao a existir:
 *
 * 1. **Navegador** (`window.native` ausente) -> pode. `window.open` funciona.
 * 2. **App desktop novo** -> pode. Ele libera a rota `/popout` no
 *    `setWindowOpenHandler` e expoe `popoutAlwaysOnTop` na ponte.
 * 3. **App desktop ANTIGO** -> NAO pode. O handler dele nega tudo e manda
 *    qualquer `http:` para `shell.openExternal`: clicar no botao abriria o
 *    navegador padrao do sistema, fora do Stoat e sem sessao. Pior que nao
 *    ter o botao.
 *
 * A presenca de `popoutAlwaysOnTop` e o que separa (2) de (3) -- por isso ela
 * e exposta na ponte mesmo sendo usada so dentro da janela filha.
 */
export function popoutDisponivel() {
  if (typeof window === "undefined" || typeof window.open !== "function") {
    return false;
  }
  // Fora do Electron nao ha `native`, e o navegador abre normalmente.
  if (!window.native) return true;
  return typeof window.native.popoutAlwaysOnTop === "function";
}

function sincronizar() {
  setAbertos([...janelas.keys()]);
}

/**
 * Instala a ponte que a janela filha usa para buscar seu stream.
 *
 * A filha PUXA (`opener.__stoatPopout.pegar(sid)`) em vez de o pai EMPURRAR.
 * Assim, se a janela recarregar, ela se reconecta sozinha em vez de virar
 * tela preta.
 */
function instalarPonte() {
  const w = window as unknown as {
    __stoatPopout?: {
      pegar: (sid: string) => MediaStream | undefined;
      encerrar: (sid: string) => void;
    };
  };
  if (w.__stoatPopout) return;

  w.__stoatPopout = {
    pegar: (sid) => streams.get(sid),
    // A filha avisa quando o usuario a fecha na mao, para o botao do tile
    // voltar ao normal sem depender de polling.
    encerrar: (sid) => {
      janelas.delete(sid);
      streams.delete(sid);
      sincronizar();
    },
  };
}

/** Extrai o `MediaStream` de uma referencia de faixa do LiveKit. */
function streamDaFaixa(faixa: TrackReferenceOrPlaceholder) {
  const mst = faixa.publication?.track?.mediaStreamTrack;
  return mst ? new MediaStream([mst]) : undefined;
}

/**
 * Abre (ou foca) a janela destacada de uma tela.
 *
 * @param faixa Faixa de screenshare
 * @param titulo Nome de quem compartilha, para o titulo da janela
 */
export function abrirPopout(
  faixa: TrackReferenceOrPlaceholder,
  titulo: string,
) {
  const sid = faixa.publication?.trackSid;
  if (!sid) return;

  // Ja aberta: foca em vez de abrir uma segunda da mesma tela.
  const existente = janelas.get(sid);
  if (existente && !existente.closed) {
    existente.focus();
    return;
  }

  const stream = streamDaFaixa(faixa);
  if (!stream) return;

  instalarPonte();
  streams.set(sid, stream);

  const url = `${import.meta.env.BASE_URL}popout?sid=${encodeURIComponent(sid)}&titulo=${encodeURIComponent(titulo)}`;
  const janela = window.open(
    url,
    `stoat-popout-${sid}`,
    "width=960,height=560,resizable=yes",
  );

  if (!janela) {
    // Bloqueado (pop-up blocker, ou o handler do Electron negando).
    streams.delete(sid);
    return;
  }

  janelas.set(sid, janela);
  sincronizar();

  // Rede de seguranca: se a filha for fechada sem avisar (crash, kill), o
  // `encerrar` nao chega e o botao ficaria preso em "fechar".
  const vigia = setInterval(() => {
    if (janela.closed) {
      clearInterval(vigia);
      janelas.delete(sid);
      streams.delete(sid);
      sincronizar();
    }
  }, 1000);
}

/** Fecha a janela destacada de uma tela. */
export function fecharPopout(sid: string) {
  const janela = janelas.get(sid);
  if (janela && !janela.closed) janela.close();
  janelas.delete(sid);
  streams.delete(sid);
  sincronizar();
}

/**
 * Fecha todas as janelas destacadas.
 *
 * Chamado ao sair da chamada: sem isto as janelas ficariam abertas mostrando
 * um quadro congelado de uma call que nao existe mais.
 */
export function fecharTodosPopouts() {
  for (const sid of [...janelas.keys()]) fecharPopout(sid);
}

/**
 * Fecha as janelas cujas faixas sumiram.
 *
 * Acontece quando quem compartilhava parou. Sem isto a janela fica com o
 * ultimo quadro parado, sem dizer que acabou.
 */
export function podarPopouts(faixasVivas: TrackReferenceOrPlaceholder[]) {
  const vivos = new Set(
    faixasVivas.map((f) => f.publication?.trackSid).filter(Boolean) as string[],
  );
  for (const sid of [...janelas.keys()]) {
    if (!vivos.has(sid)) fecharPopout(sid);
  }
}
