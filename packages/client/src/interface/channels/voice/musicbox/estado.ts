/**
 * Estado do MusicBox, vindo do servidor.
 *
 * Antes a fila vivia neste navegador. Isso quebrava o que a chamada tem de
 * mais básico: quem entrasse depois via uma fila vazia, duas pessoas viam
 * listas diferentes, e fechar a aba apagava o que os outros estavam ouvindo.
 * Agora o dono do estado é o canal, e esta tela só mostra e pede.
 */
import { createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

/** De onde o audio sai. Hoje so ha uma; o campo existe para nao doer depois. */
export type Fonte = "youtube";

/** Faixa no formato do servidor. */
export type Faixa = {
  id: string;
  provider: string;
  title: string;
  author: string | null;
  duration_s: number | null;
  cover_url: string | null;
  page_url: string;
};

export type Repeticao = "off" | "one" | "all";

export type EstadoMusicBox = {
  playing: boolean;
  current: Faixa | null;
  position_s: number;
  queue: Faixa[];
  repeat: Repeticao;
  shuffle: boolean;
  /**
   * Identidade do agente na sala de voz.
   *
   * E por ela que o volume da musica e ajustado: o audio chega como faixa de
   * um participante, e o volume por participante e indexado pela identidade.
   */
  bot_identity?: string;
};

export const ESTADO_VAZIO: EstadoMusicBox = {
  playing: false,
  current: null,
  position_s: 0,
  queue: [],
  repeat: "off",
  shuffle: false,
};

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

/** Duracao de uma faixa; nulo ou zero quer dizer que a fonte nao informou. */
export function duracaoOuAoVivo(segundos: number | null): string {
  return segundos && segundos > 0 ? duracaoLegivel(segundos) : "ao vivo";
}

/** Mesmo reconhecimento do agente (musicbox-agent/src/provedores.ts). */
const RE_LINK_YOUTUBE =
  /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i;

/** Teto de faixas por pedido; o servidor nao aceita mais que isso. */
export const TETO_DA_PLAYLIST = 200;

/** Teto do Mix no agente: ele e infinito. */
export const TETO_DO_MIX = 50;

/**
 * O que a pessoa colou ou digitou.
 *
 * Link vai direto para a fila, como num bot de Discord: quem cola uma
 * playlist quer ouvir a playlist, nao escolher faixa por faixa. Texto vira
 * busca, porque ai sim ha o que escolher.
 */
export function tipoDeEntrada(
  texto: string,
): "busca" | "video" | "playlist" | "mix" {
  const limpo = texto.trim();
  if (!RE_LINK_YOUTUBE.test(limpo)) return "busca";
  const lista = /[?&]list=([^&#]+)/.exec(limpo)?.[1];
  if (!lista) return "video";
  return /^RD/i.test(lista) ? "mix" : "playlist";
}

/** Quanto falta para a fila acabar, contando a faixa atual. */
export function duracaoDaFila(estado: EstadoMusicBox): number {
  const restante = estado.current?.duration_s
    ? Math.max(0, estado.current.duration_s - estado.position_s)
    : 0;

  return estado.queue.reduce(
    (total, faixa) => total + (faixa.duration_s ?? 0),
    restante,
  );
}

/**
 * Conversa com as rotas do MusicBox.
 *
 * Toda acao devolve o estado novo, entao a tela nunca precisa adivinhar como
 * ficou: ela mostra o que o servidor respondeu.
 */
export function criarCliente(
  apiUrl: string,
  cabecalho: () => [string, string],
  channelId: () => string,
) {
  // Store reconciliado por `id`, e nao signal: o poll de 2 s devolve objetos
  // novos, e com signal o <For> da fila remontava todas as linhas a cada
  // poll (hover piscando, foco do teclado perdido).
  const [loja, setLoja] = createStore<EstadoMusicBox>(
    structuredClone(ESTADO_VAZIO),
  );
  const estado = () => loja;
  const setEstado = (novo: EstadoMusicBox) =>
    setLoja(reconcile(novo, { key: "id", merge: false }));
  const [erro, setErro] = createSignal<string>();

  async function chamar(
    caminho: string,
    opcoes: RequestInit = {},
  ): Promise<Response> {
    const [chave, valor] = cabecalho();
    return fetch(`${apiUrl}/musicbox/${channelId()}${caminho}`, {
      ...opcoes,
      headers: {
        ...(opcoes.body ? { "content-type": "application/json" } : {}),
        [chave]: valor,
        ...(opcoes.headers ?? {}),
      },
    });
  }

  /** Traduz a recusa do servidor em algo que a pessoa consiga agir. */
  async function explicar(resposta: Response): Promise<string> {
    const corpo = await resposta.json().catch(() => null);
    if (corpo?.type === "FeatureDisabled") {
      return corpo.feature === "musicbox:agent"
        ? "Nenhum agente de música está conectado agora."
        : "O MusicBox não está configurado neste servidor.";
    }
    if (resposta.status === 403) return "Você não tem permissão para isso.";
    return `A operação falhou (${resposta.status}).`;
  }

  /**
   * Aplica uma acao que devolve o estado novo.
   *
   * Devolve se deu certo: quem chama precisa saber, senao uma faixa que o
   * servidor recusou aparecia como "Na fila". Falha de rede vira mensagem
   * em vez de promessa rejeitada sem ninguem tratar.
   */
  async function agir(
    caminho: string,
    opcoes: RequestInit = {},
  ): Promise<boolean> {
    setErro(undefined);
    try {
      const resposta = await chamar(caminho, opcoes);
      if (!resposta.ok) {
        setErro(await explicar(resposta));
        return false;
      }
      setEstado((await resposta.json()) as EstadoMusicBox);
      return true;
    } catch {
      setErro("Sem conexão com o servidor. Tente de novo.");
      return false;
    }
  }

  return {
    estado,
    erro,
    setErro,

    async recarregar() {
      // Poll de fundo: falha de rede aqui so espera o proximo.
      const resposta = await chamar("/queue").catch(() => undefined);
      if (resposta?.ok) setEstado((await resposta.json()) as EstadoMusicBox);
    },

    async buscar(termo: string, limite: number): Promise<Faixa[]> {
      const resposta = await chamar("/resolve", {
        method: "POST",
        body: JSON.stringify({ query: termo, limit: limite }),
      });
      if (!resposta.ok) throw new Error(await explicar(resposta));
      return ((await resposta.json()) as { tracks: Faixa[] }).tracks;
    },

    adicionar: (faixas: Faixa[]) =>
      agir("/queue", {
        method: "POST",
        body: JSON.stringify({ tracks: faixas }),
      }),

    remover: (indice: number) => agir(`/queue/${indice}`, { method: "DELETE" }),
    limpar: () => agir("/queue", { method: "DELETE" }),
    tocarDaFila: (indice: number) =>
      agir(`/queue/${indice}/play`, { method: "POST" }),
    proxima: () => agir("/next", { method: "POST" }),
    alternar: () => agir("/toggle", { method: "POST" }),

    async parar() {
      setErro(undefined);
      const resposta = await chamar("/stop", { method: "POST" }).catch(
        () => undefined,
      );
      if (!resposta?.ok) {
        setErro(
          resposta
            ? await explicar(resposta)
            : "Sem conexão com o servidor. Tente de novo.",
        );
        return;
      }
      setEstado(ESTADO_VAZIO);
    },

    ajustar: (mudanca: { repeat?: Repeticao; shuffle?: boolean }) =>
      agir("/settings", { method: "PATCH", body: JSON.stringify(mudanca) }),
  };
}

export type ClienteMusicBox = ReturnType<typeof criarCliente>;
