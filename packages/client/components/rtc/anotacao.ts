import { Accessor, Setter, createSignal } from "solid-js";

import { Room, RoomEvent } from "livekit-client";

import {
  ESMAECER_MS,
  SEGURAR_MS,
  corDoUsuario,
  opacidadePelaIdade,
} from "./traco";

/**
 * Anotacao (laser) sobre compartilhamento de tela.
 *
 * Quem assiste desenha sobre o <video>; o traco chega a todos na sala e, para
 * quem compartilha, a uma sobreposicao transparente na tela real (so no app
 * desktop, Windows).
 *
 * ## Por que o data channel do LiveKit
 *
 * Um traco produz dezenas de mensagens por segundo. Os outros dois caminhos do
 * STOAT nao servem:
 *
 * - REST: o bucket `channels` do delta permite 15 requisicoes por 10 s (1,5/s),
 *   e o balde e compartilhado com ack e fetch do mesmo canal -- desenhar
 *   deixaria o resto do canal em 429.
 * - WebSocket do bonfire: sao 4 saltos (cliente -> bonfire -> Redis -> bonfire
 *   -> clientes) e o fan-out vai para quem esta inscrito no *canal*, nao para
 *   quem esta *na chamada*.
 *
 * O data channel e 1 salto, e o publico e exatamente a sala. O modo `lossy`
 * (datagrama) e o certo: retransmitir um ponto velho de laser e pior do que
 * perde-lo.
 *
 * ## Permissao
 *
 * O grant `can_publish_data` do token e `true`, mas
 * `sync_user_voice_permissions` (crates/core/database/src/voice/mod.rs:564)
 * o reescreve em runtime como `can_publish_data: can_speak`. Ou seja: **quem
 * nao pode falar no canal nao consegue anotar**. Isso e proposital e nao um
 * efeito colateral -- anotar na tela dos outros e participacao ativa, do mesmo
 * nivel de falar. Como a publicacao falha em silencio nesse caso, a UI precisa
 * esconder o botao para quem nao tem `Speak`.
 */

/** Topico dos datagramas de anotacao no data channel */
const TOPICO = "stoat.laser";

/** Quantos pontos, no maximo, cabem num lote antes de forcar o envio */
const MAX_PONTOS_POR_LOTE = 32;

/** De quanto em quanto tempo um traco parado deixa de ser considerado vivo */
const LIMITE_TOTAL_MS = SEGURAR_MS + ESMAECER_MS;

/**
 * Um lote de pontos de um traco.
 *
 * `pts` vem achatado (`[u0,v0,u1,v1,...]`) e **normalizado em 0..1** sobre o
 * quadro de video. Nada de pixel na rede: assim resolucao, camada de simulcast,
 * tamanho da janela de quem assiste e DPI do Windows deixam de importar.
 */
type Lote = {
  /** Tipo da mensagem */
  t: "traco";
  /** Identificador do traco, unico por autor */
  id: string;
  /** Cor escolhida por quem desenha */
  cor: string;
  /** Ordem do lote dentro do traco; lote atrasado e descartado */
  seq: number;
  /** Coordenadas achatadas, 0..1 */
  pts: number[];
};

/** Aviso de que quem compartilha liberou (ou revogou) as anotacoes */
type AvisoLiberacao = {
  /** Tipo da mensagem */
  t: "liberar";
  /** Estado novo */
  ligado: boolean;
};

type Mensagem = Lote | AvisoLiberacao;

/** Um traco vivo, do ponto de vista de quem desenha ou de quem recebe */
export type Traco = {
  /** Identificador do traco */
  id: string;
  /** Identidade LiveKit de quem desenhou */
  autor: string;
  /** Nome legivel de quem desenhou, se conhecido */
  nome: string;
  /** Cor do traco */
  cor: string;
  /** Coordenadas achatadas em 0..1 */
  pts: number[];
  /** Momento de criacao, em ms do relogio local */
  nascidoEm: number;
  /** Ultimo `seq` aceito; serve para descartar lote fora de ordem */
  ultimoSeq: number;
};

/**
 * Estado das anotacoes de uma sala.
 *
 * Uma instancia por chamada, criada no `connect` e destruida no `disconnect`.
 * Quando ninguem ligou a feature, esta classe nao registra listener nenhum e
 * nao consome nada -- e o requisito de "custo zero quando desligado".
 */
export class Anotacao {
  #room: Room;
  #tracos = new Map<string, Traco>();
  #proximoSeq = 0;
  #tracoAtual?: Traco;
  #pendentes: number[] = [];

  /** Identidades que liberaram anotacao no proprio compartilhamento */
  liberadoPor: Accessor<string[]>;
  #setLiberadoPor: Setter<string[]>;

  /** Muda a cada alteracao na lista de tracos; serve para acordar o desenho */
  tique: Accessor<number>;
  #setTique: Setter<number>;

  /** Chamado quando um traco chega ou cresce -- usado para espelhar no desktop */
  aoMudar?: (tracos: Traco[]) => void;

  /** Resolve o nome legivel de uma identidade */
  nomeDe: (identidade: string) => string;

  /**
   * @param room sala do LiveKit ja conectada
   * @param nomeDe funcao que traduz identidade em nome de exibicao
   */
  constructor(room: Room, nomeDe: (identidade: string) => string) {
    this.#room = room;
    this.nomeDe = nomeDe;

    const [liberadoPor, setLiberadoPor] = createSignal<string[]>([]);
    this.liberadoPor = liberadoPor;
    this.#setLiberadoPor = setLiberadoPor;

    const [tique, setTique] = createSignal(0);
    this.tique = tique;
    this.#setTique = setTique;

    room.on(RoomEvent.DataReceived, this.#aoReceber);
    room.on(RoomEvent.ParticipantDisconnected, this.#aoSairParticipante);
  }

  /** Solta os listeners da sala */
  destruir() {
    this.#room.off(RoomEvent.DataReceived, this.#aoReceber);
    this.#room.off(RoomEvent.ParticipantDisconnected, this.#aoSairParticipante);
    this.#tracos.clear();
    this.#setLiberadoPor([]);
  }

  /**
   * Anuncia que este usuario liberou (ou revogou) anotacao na propria tela.
   *
   * @param ligado estado novo
   */
  anunciarLiberacao(ligado: boolean) {
    this.#publicar({ t: "liberar", ligado });
  }

  /**
   * Um participante entrou depois; reanuncia o estado para ele.
   *
   * Sem isto quem chega no meio nunca descobre que pode desenhar, porque o
   * aviso e um datagrama pontual e nao um estado persistido.
   *
   * @param ligado estado atual
   */
  reanunciar(ligado: boolean) {
    if (ligado) this.#publicar({ t: "liberar", ligado: true });
  }

  /** Lista dos tracos ainda visiveis, ja podando os que morreram */
  vivos(): Traco[] {
    const agora = Date.now();
    let mudou = false;
    for (const [id, t] of this.#tracos) {
      if (agora - t.nascidoEm > LIMITE_TOTAL_MS) {
        this.#tracos.delete(id);
        mudou = true;
      }
    }
    if (mudou) this.#setTique((n) => n + 1);
    return [...this.#tracos.values()];
  }

  /**
   * Opacidade de um traco agora.
   *
   * @param t traco
   * @returns opacidade entre 0 e 1
   */
  opacidade(t: Traco): number {
    return opacidadePelaIdade(Date.now() - t.nascidoEm);
  }

  // ----- lado de quem desenha -----

  /**
   * Comeca um traco novo.
   *
   * @param u coordenada horizontal normalizada
   * @param v coordenada vertical normalizada
   */
  comecar(u: number, v: number) {
    const identidade = this.#room.localParticipant.identity;
    this.#tracoAtual = {
      id: `${identidade}:${Date.now().toString(36)}:${this.#proximoSeq++}`,
      autor: identidade,
      nome: this.nomeDe(identidade),
      cor: corDoUsuario(identidade),
      pts: [u, v],
      nascidoEm: Date.now(),
      ultimoSeq: 0,
    };
    this.#pendentes = [u, v];
    // Eco local: quem desenha ve na hora, sem esperar a volta pela rede.
    this.#tracos.set(this.#tracoAtual.id, this.#tracoAtual);
    this.#setTique((n) => n + 1);
  }

  /**
   * Acrescenta pontos ao traco em andamento.
   *
   * @param pontos coordenadas achatadas ja normalizadas
   */
  continuar(pontos: number[]) {
    const atual = this.#tracoAtual;
    if (!atual || pontos.length === 0) return;
    atual.pts.push(...pontos);
    this.#pendentes.push(...pontos);
    // O traco em andamento nao pode envelhecer enquanto a pessoa desenha.
    atual.nascidoEm = Date.now();
    this.#setTique((n) => n + 1);
    if (this.#pendentes.length >= MAX_PONTOS_POR_LOTE * 2) this.enviarLote();
  }

  /** Fecha o traco em andamento e manda o que sobrou */
  terminar() {
    this.enviarLote();
    this.#tracoAtual = undefined;
    this.#pendentes = [];
  }

  /**
   * Manda os pontos acumulados desde o ultimo envio.
   *
   * Chamado uma vez por quadro por quem desenha, e nao a cada `pointermove`:
   * um mouse de 1000 Hz geraria 1000 datagramas por segundo sem nenhum ganho
   * visual.
   */
  enviarLote() {
    const atual = this.#tracoAtual;
    if (!atual || this.#pendentes.length === 0) return;
    atual.ultimoSeq += 1;
    this.#publicar({
      t: "traco",
      id: atual.id,
      cor: atual.cor,
      seq: atual.ultimoSeq,
      pts: this.#pendentes,
    });
    this.#pendentes = [];
  }

  // ----- interno -----

  /**
   * Publica uma mensagem no data channel.
   *
   * @param msg mensagem
   */
  #publicar(msg: Mensagem) {
    const dados = new TextEncoder().encode(JSON.stringify(msg));
    // `reliable: false` = datagrama. Ver o cabecalho do arquivo.
    this.#room.localParticipant
      .publishData(dados, { reliable: false, topic: TOPICO })
      .catch(() => {
        // Falha de publicacao aqui e quase sempre permissao (`can_speak`).
        // Nao ha o que fazer em runtime e um toast por ponto seria pior do
        // que o silencio; a UI ja esconde o botao nesse caso.
      });
  }

  /**
   * Recebe um datagrama da sala.
   */
  #aoReceber = (
    dados: Uint8Array,
    participante?: { identity: string },
    _kind?: unknown,
    topico?: string,
  ) => {
    if (topico !== TOPICO) return;
    const identidade = participante?.identity;
    if (!identidade) return;
    // O proprio eco nao interessa: ja desenhamos localmente em `comecar`.
    if (identidade === this.#room.localParticipant.identity) return;

    let msg: Mensagem;
    try {
      msg = JSON.parse(new TextDecoder().decode(dados)) as Mensagem;
    } catch {
      return;
    }

    if (msg.t === "liberar") {
      this.#setLiberadoPor((lista) => {
        const tem = lista.includes(identidade);
        if (msg.ligado && !tem) return [...lista, identidade];
        if (!msg.ligado && tem) return lista.filter((x) => x !== identidade);
        return lista;
      });
      return;
    }

    if (msg.t !== "traco" || !Array.isArray(msg.pts)) return;

    const existente = this.#tracos.get(msg.id);
    if (existente) {
      // Datagrama pode chegar fora de ordem. Lote atrasado e descartado --
      // o buraco resultante some na suavizacao do traco.
      if (msg.seq <= existente.ultimoSeq) return;
      existente.ultimoSeq = msg.seq;
      existente.pts.push(...msg.pts);
      existente.nascidoEm = Date.now();
    } else {
      this.#tracos.set(msg.id, {
        id: msg.id,
        autor: identidade,
        nome: this.nomeDe(identidade),
        cor: msg.cor || corDoUsuario(identidade),
        pts: [...msg.pts],
        nascidoEm: Date.now(),
        ultimoSeq: msg.seq,
      });
    }

    this.#setTique((n) => n + 1);
    this.aoMudar?.([...this.#tracos.values()]);
  };

  /**
   * Limpa o que sobrou de quem saiu da sala.
   */
  #aoSairParticipante = (participante: { identity: string }) => {
    let mudou = false;
    for (const [id, t] of this.#tracos) {
      if (t.autor === participante.identity) {
        this.#tracos.delete(id);
        mudou = true;
      }
    }
    this.#setLiberadoPor((lista) =>
      lista.filter((x) => x !== participante.identity),
    );
    if (mudou) this.#setTique((n) => n + 1);
  };
}

/**
 * Converte um evento de ponteiro sobre um <video> em coordenada 0..1.
 *
 * A conta desconta a tarja do `object-fit: contain`: o conteudo do video quase
 * nunca preenche a caixa do elemento, e ignorar isso desloca todo o traco.
 *
 * `videoWidth`/`videoHeight` sao lidos a cada chamada de proposito. O LiveKit
 * troca a camada de simulcast em tempo real; um valor cacheado no mount
 * desalinha em silencio quando a resolucao muda.
 *
 * @param video elemento de video
 * @param clientX posicao horizontal do ponteiro
 * @param clientY posicao vertical do ponteiro
 * @returns par `[u, v]` em 0..1, ou `undefined` se o ponto caiu na tarja
 */
export function normalizarSobreVideo(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number,
): [number, number] | undefined {
  const lw = video.videoWidth;
  const lh = video.videoHeight;
  if (!lw || !lh) return undefined;

  const r = video.getBoundingClientRect();
  if (!r.width || !r.height) return undefined;

  const escala = Math.min(r.width / lw, r.height / lh);
  const larguraC = lw * escala;
  const alturaC = lh * escala;
  const margemX = (r.width - larguraC) / 2;
  const margemY = (r.height - alturaC) / 2;

  const u = (clientX - r.left - margemX) / larguraC;
  const v = (clientY - r.top - margemY) / alturaC;

  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;
  return [u, v];
}

/**
 * Converte 0..1 de volta para pixel dentro da caixa de um <video>.
 *
 * Inverso exato de `normalizarSobreVideo`, usado para desenhar o traco
 * recebido no canvas que fica por cima do elemento.
 *
 * @param video elemento de video
 * @param pts coordenadas achatadas em 0..1
 * @returns coordenadas achatadas em pixels relativos a caixa do elemento
 */
export function paraPixelsDoVideo(
  video: HTMLVideoElement,
  pts: number[],
): number[] {
  const lw = video.videoWidth;
  const lh = video.videoHeight;
  const r = video.getBoundingClientRect();
  if (!lw || !lh || !r.width || !r.height) return [];

  const escala = Math.min(r.width / lw, r.height / lh);
  const larguraC = lw * escala;
  const alturaC = lh * escala;
  const margemX = (r.width - larguraC) / 2;
  const margemY = (r.height - alturaC) / 2;

  const saida = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    saida[i] = margemX + pts[i] * larguraC;
    saida[i + 1] = margemY + pts[i + 1] * alturaC;
  }
  return saida;
}
