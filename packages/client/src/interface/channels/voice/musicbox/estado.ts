/**
 * Estado do MusicBox no cliente.
 *
 * O formato aqui e de proposito o mesmo que o servidor vai publicar mais
 * tarde. Enquanto a rota nao existe, a fila e manipulada localmente; quando
 * existir, as acoes viram comandos e os eventos do WebSocket passam a
 * escrever neste mesmo store. A tela nao muda.
 */
import { createStore, produce } from "solid-js/store";

/** De onde o audio sai. Hoje so ha uma; o campo existe para nao doer depois. */
export type Fonte = "youtube";

export type Faixa = {
  /** Identificador na fonte, nao no Stoat */
  id: string;
  fonte: Fonte;
  titulo: string;
  autor: string;
  /** Em segundos. Zero quando a fonte nao informa (transmissoes ao vivo). */
  duracao: number;
  capa?: string;
  /** Endereco original; e o que o agente usa para achar o audio de novo */
  pagina: string;
  /** Quem pediu, para a fila poder dizer de quem e cada faixa */
  pedidoPor?: string;
};

export type Repeticao = "nao" | "uma" | "todas";

export type EstadoMusicBox = {
  tocando: boolean;
  atual?: Faixa;
  /** Posicao dentro da faixa atual, em segundos */
  posicao: number;
  fila: Faixa[];
  /** 0 a 1 */
  volume: number;
  repetir: Repeticao;
  aleatorio: boolean;
};

const [estado, setEstado] = createStore<EstadoMusicBox>({
  tocando: false,
  posicao: 0,
  fila: [],
  volume: 0.8,
  repetir: "nao",
  aleatorio: false,
});

export { estado };

/**
 * Segundos para `m:ss`, ou `h:mm:ss` quando passa da hora.
 *
 * Zero vira `0:00`. Para DURACAO zero significa outra coisa — a fonte nao
 * sabe quanto dura, que e o caso de transmissao ao vivo — e quem trata disso
 * e `duracaoOuAoVivo`.
 */
export function duracaoLegivel(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";

  const s = Math.floor(segundos % 60);
  const m = Math.floor((segundos / 60) % 60);
  const h = Math.floor(segundos / 3600);

  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Duracao de uma faixa; zero quer dizer que a fonte nao informou. */
export function duracaoOuAoVivo(segundos: number): string {
  return segundos > 0 ? duracaoLegivel(segundos) : "ao vivo";
}

/** Quanto falta para a fila acabar, contando a faixa atual. */
export function duracaoDaFila(): number {
  const restante = estado.atual
    ? Math.max(0, estado.atual.duracao - estado.posicao)
    : 0;

  return estado.fila.reduce((total, faixa) => total + faixa.duracao, restante);
}

export const acoes = {
  tocarOuPausar() {
    setEstado("tocando", (t) => !t);
  },


  /**
   * Pula para a proxima.
   *
   * Com repeticao "uma", pular e um pedido explicito da pessoa e ganha da
   * repeticao: repetir a mesma faixa quando alguem apertou "proxima" seria
   * ignorar o comando.
   */
  proxima() {
    setEstado(
      produce((e) => {
        if (!e.fila.length) {
          e.atual = undefined;
          e.tocando = false;
          e.posicao = 0;
          return;
        }

        const indice = e.aleatorio
          ? Math.floor(Math.random() * e.fila.length)
          : 0;

        const [proxima] = e.fila.splice(indice, 1);

        if (e.repetir === "todas" && e.atual) e.fila.push(e.atual);

        e.atual = proxima;
        e.posicao = 0;
      }),
    );
  },

  /**
   * Volta ao inicio da faixa; so pula para a anterior se ja passou pouco
   * tempo. E o que todo player faz, e evita perder a faixa por engano.
   */
  anterior() {
    setEstado("posicao", 0);
  },

  adicionar(faixa: Faixa) {
    setEstado(
      produce((e) => {
        // Sem faixa tocando, o que entra vira a atual em vez de esperar numa
        // fila que ninguem vai puxar.
        if (!e.atual) {
          e.atual = faixa;
          e.posicao = 0;
          e.tocando = true;
        } else {
          e.fila.push(faixa);
        }
      }),
    );
  },

  remover(indice: number) {
    setEstado(
      produce((e) => {
        e.fila.splice(indice, 1);
      }),
    );
  },

  /** Move uma faixa na fila, para reordenar arrastando. */
  mover(de: number, para: number) {
    setEstado(
      produce((e) => {
        if (de === para) return;
        const [faixa] = e.fila.splice(de, 1);
        e.fila.splice(para, 0, faixa);
      }),
    );
  },

  /** Puxa uma faixa da fila para tocar agora, sem esperar a vez. */
  tocarAgora(indice: number) {
    setEstado(
      produce((e) => {
        const [faixa] = e.fila.splice(indice, 1);
        if (e.atual) e.fila.unshift(e.atual);
        e.atual = faixa;
        e.posicao = 0;
        e.tocando = true;
      }),
    );
  },

  limparFila() {
    setEstado("fila", []);
  },

  definirPosicao(segundos: number) {
    setEstado("posicao", Math.max(0, segundos));
  },

  definirVolume(v: number) {
    setEstado("volume", Math.min(1, Math.max(0, v)));
  },

  alternarRepeticao() {
    setEstado("repetir", (r) =>
      r === "nao" ? "todas" : r === "todas" ? "uma" : "nao",
    );
  },

  alternarAleatorio() {
    setEstado("aleatorio", (a) => !a);
  },
};
