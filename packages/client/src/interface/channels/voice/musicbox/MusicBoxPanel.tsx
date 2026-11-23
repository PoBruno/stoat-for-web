import { For, Match, Show, Switch, createSignal } from "solid-js";

import { styled } from "styled-system/jsx";

import { useState } from "@revolt/state";
import { CircularProgress } from "@revolt/ui";
import { Button, IconButton, Slider } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { useConfirmacao } from "./Controles";
import {
  type ClienteMusicBox,
  type Faixa,
  type TipoDeEntrada,
  TETO_DA_PLAYLIST,
  TETO_DO_MIX,
  TETO_DO_SPOTIFY,
  duracaoDaFila,
  duracaoLegivel,
  duracaoOuAoVivo,
  tipoDeEntrada,
} from "./estado";
import { usarMusicBox } from "./loja";

/** O que aconteceu com o ultimo link colado. */
type Retorno =
  | { tipo: "ok"; texto: string; detalhe?: string }
  | { tipo: "vazio"; texto: string; detalhe?: string };

/**
 * Painel do MusicBox, mostrado durante a chamada.
 *
 * Uma coluna so, como a tela de playlist do Spotify: a busca no topo, a
 * faixa atual em destaque (capa grande, fundo tirado da capa) e a fila
 * embaixo, em tabela. Antes eram duas colunas lado a lado, e metade da tela
 * ficava com as dicas de busca paradas enquanto a fila se apertava na outra.
 *
 * Buscar por nome troca o corpo pelos resultados; "Voltar para a fila" (ou
 * Esc) desfaz. Link vai direto para a fila sem sair da vista dela.
 *
 * Os controles (tocar, pular, repetir...) ficam na barra de baixo da
 * chamada, no MiniPlayer, e nao aqui.
 */
export function MusicBoxPanel(props: {
  channelId: string;
  onClose: () => void;
}) {
  // O canal e fixo por instancia: quem troca de canal remonta (<Show keyed>).
  // eslint-disable-next-line solid/reactivity
  const mb = usarMusicBox(props.channelId);

  const [termo, setTermo] = createSignal("");
  /** Termo da busca cujos resultados estao na tela; nulo = vendo a fila. */
  const [buscado, setBuscado] = createSignal<string | null>(null);
  const [resultados, setResultados] = createSignal<Faixa[]>([]);
  const [buscando, setBuscando] = createSignal<false | TipoDeEntrada>(false);
  const [aviso, setAviso] = createSignal<string>();
  const [retorno, setRetorno] = createSignal<Retorno>();
  const [adicionadas, setAdicionadas] = createSignal<Set<string>>(
    new Set<string>(),
  );

  async function enviar(e?: Event) {
    e?.preventDefault();
    const texto = termo().trim();
    if (!texto || buscando()) return;

    const tipo = tipoDeEntrada(texto);
    setBuscando(tipo);
    setAviso(undefined);
    setRetorno(undefined);
    try {
      if (tipo === "busca") {
        setBuscado(texto);
        setResultados([]);
        // Cem resultados para "radiohead" e uma parede de texto onde
        // bastavam alguns.
        const achadas = await mb.buscar(texto, 15);
        setAdicionadas(new Set<string>());
        setResultados(achadas);
        if (!achadas.length) setAviso("Nada encontrado para isso.");
        return;
      }

      const faixas = await mb.buscar(
        texto,
        tipo === "video" || tipo === "spotify-musica" ? 1 : TETO_DA_PLAYLIST,
      );
      if (!faixas.length) {
        setRetorno(retornoVazio(tipo));
        return;
      }
      if (!(await mb.adicionar(faixas))) return;

      setTermo("");
      setBuscado(null);
      setResultados([]);
      setRetorno(resumoDoLink(tipo, faixas));
    } catch (falha) {
      setResultados([]);
      setAviso(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setBuscando(false);
    }
  }

  /** Volta para a fila, apagando a busca. */
  function voltarParaFila() {
    setTermo("");
    setBuscado(null);
    setResultados([]);
    setAviso(undefined);
    setRetorno(undefined);
  }

  /**
   * Adiciona sem apagar a busca: para pegar a segunda musica do mesmo album
   * nao e preciso pesquisar de novo. O que ja entrou fica marcado.
   */
  async function adicionar(faixa: Faixa) {
    // So marca "Na fila" se o servidor aceitou; a recusa aparece no aviso.
    if (!(await mb.adicionar([faixa]))) return;
    setAdicionadas((antes) => new Set(antes).add(faixa.id));
  }

  /** Abrindo um link: ele vai para a fila, entao a fila continua a vista. */
  const abrindoLink = () => {
    const tipo = buscando();
    return tipo && tipo !== "busca" ? tipo : false;
  };

  return (
    <Painel>
      <Topo>
        <Marca>
          <Symbol>queue_music</Symbol>
          <span>MusicBox</span>
        </Marca>

        <BarraDeBusca onSubmit={enviar}>
          <Icone>
            <Show
              when={tipoDeEntrada(termo()) === "busca"}
              fallback={<Symbol>link</Symbol>}
            >
              <Symbol>search</Symbol>
            </Show>
          </Icone>
          <Campo
            value={termo()}
            placeholder="Buscar, ou colar link do YouTube ou do Spotify"
            aria-label="Buscar música ou colar link do YouTube ou do Spotify"
            onInput={(e: InputEvent) =>
              setTermo((e.currentTarget as HTMLInputElement).value)
            }
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Escape") voltarParaFila();
            }}
          />
          <Show when={termo()}>
            <IconButton
              size="xs"
              onPress={voltarParaFila}
              aria-label="Limpar busca"
            >
              <Symbol size={18}>close</Symbol>
            </IconButton>
          </Show>
          <Show when={termo().trim() && tipoDeEntrada(termo()) !== "busca"}>
            <Button
              size="sm"
              isDisabled={!!buscando()}
              onPress={() => void enviar()}
            >
              {tipoDeEntrada(termo()) === "video" ||
              tipoDeEntrada(termo()) === "spotify-musica"
                ? "Adicionar"
                : "Adicionar tudo"}
            </Button>
          </Show>
        </BarraDeBusca>

        <Direita>
          <VolumeDaMusica mb={mb} />
          <IconButton onPress={props.onClose} aria-label="Fechar o MusicBox">
            <Symbol>close</Symbol>
          </IconButton>
        </Direita>
      </Topo>

      {/* Sem agente ou sem permissao, todo botao pareceria nao fazer nada. */}
      <Show when={mb.erro()}>
        <Faixinha data-tipo="erro" role="alert">
          <Symbol size={18}>error</Symbol>
          <span>{mb.erro()}</span>
          <IconButton
            size="xs"
            onPress={() => mb.setErro(undefined)}
            aria-label="Fechar aviso"
          >
            <Symbol size={16}>close</Symbol>
          </IconButton>
        </Faixinha>
      </Show>

      <Corpo>
        <Show
          when={buscado()}
          fallback={
            <section aria-label="Fila">
              <Switch>
                <Match when={abrindoLink()}>
                  {(tipo) => (
                    <Faixinha role="status">
                      <Girando />
                      <span>{ABRINDO[tipo()]}</span>
                    </Faixinha>
                  )}
                </Match>
                <Match when={aviso()}>
                  {(mensagem) => (
                    <Faixinha data-tipo="erro" role="alert">
                      <Symbol size={18}>error</Symbol>
                      <span>{mensagem()}</span>
                      <IconButton
                        size="xs"
                        onPress={() => setAviso(undefined)}
                        aria-label="Fechar aviso"
                      >
                        <Symbol size={16}>close</Symbol>
                      </IconButton>
                    </Faixinha>
                  )}
                </Match>
                <Match when={retorno()}>
                  {(r) => (
                    <Faixinha data-tipo={r().tipo} role="status">
                      <Symbol size={18}>
                        {r().tipo === "ok" ? "playlist_add_check" : "block"}
                      </Symbol>
                      <span>
                        <b>{r().texto}</b>
                        <Show when={r().detalhe}> {r().detalhe}</Show>
                      </span>
                      <IconButton
                        size="xs"
                        onPress={() => setRetorno(undefined)}
                        aria-label="Fechar aviso"
                      >
                        <Symbol size={16}>close</Symbol>
                      </IconButton>
                    </Faixinha>
                  )}
                </Match>
              </Switch>

              <Fila mb={mb} />
            </section>
          }
        >
          {(oQue) => (
            <section aria-label="Adicionar músicas">
              <CabecalhoDaSecao>
                <h3>
                  Resultados para <q>{oQue()}</q>
                </h3>
                <Button size="sm" variant="text" onPress={voltarParaFila}>
                  <Symbol size={18}>arrow_back</Symbol> Voltar para a fila
                </Button>
              </CabecalhoDaSecao>

              <Switch>
                <Match when={buscando() === "busca"}>
                  <Vazio>
                    <CircularProgress />
                    <span>{ABRINDO.busca}</span>
                  </Vazio>
                </Match>
                <Match when={aviso()}>
                  {(mensagem) => (
                    <Vazio>
                      <span>{mensagem()}</span>
                    </Vazio>
                  )}
                </Match>
                <Match when={resultados().length}>
                  <Tabela>
                    <For each={resultados()}>
                      {(faixa) => (
                        <Linha>
                          <Numero>
                            <Symbol size={18}>music_note</Symbol>
                          </Numero>
                          <FaixaNaLinha faixa={faixa} />
                          <Duracao>{duracaoOuAoVivo(faixa.duration_s)}</Duracao>
                          <Show
                            when={adicionadas().has(faixa.id)}
                            fallback={
                              <IconButton
                                size="sm"
                                variant="tonal"
                                onPress={() => void adicionar(faixa)}
                                aria-label="Adicionar à fila"
                                use:floating={{
                                  tooltip: {
                                    placement: "top",
                                    content: "Adicionar à fila",
                                  },
                                }}
                              >
                                <Symbol>add</Symbol>
                              </IconButton>
                            }
                          >
                            <JaNaFila
                              aria-label="Na fila"
                              use:floating={{
                                tooltip: {
                                  placement: "top",
                                  content: "Na fila",
                                },
                              }}
                            >
                              <Symbol>check</Symbol>
                            </JaNaFila>
                          </Show>
                        </Linha>
                      )}
                    </For>
                  </Tabela>
                </Match>
              </Switch>
            </section>
          )}
        </Show>
      </Corpo>
    </Painel>
  );
}

/** O que dizer enquanto o link abre. */
const ABRINDO: Record<TipoDeEntrada, string> = {
  busca: "Buscando…",
  video: "Abrindo o vídeo…",
  playlist: "Abrindo a playlist…",
  mix: "Abrindo o Mix…",
  "spotify-musica": "Abrindo a música do Spotify…",
  "spotify-album": "Abrindo o álbum do Spotify…",
  "spotify-playlist": "Abrindo a playlist do Spotify…",
};

/** Por que um link nao trouxe nada, dito de um jeito que ajude. */
function retornoVazio(tipo: TipoDeEntrada): Retorno {
  switch (tipo) {
    case "video":
      return { tipo: "vazio", texto: "Esse vídeo não está disponível." };
    case "spotify-musica":
    case "spotify-album":
      return {
        tipo: "vazio",
        texto: "O Spotify não mostrou isso.",
        detalhe:
          "Pode ter saído do catálogo ou não estar disponível no Brasil.",
      };
    case "spotify-playlist":
      return {
        tipo: "vazio",
        texto: "O Spotify não mostrou essa playlist.",
        detalhe:
          "Ela precisa ser pública. “Músicas curtidas” é da sua conta e não pode ser lida: copie as músicas para uma playlist pública.",
      };
    default:
      return {
        tipo: "vazio",
        texto: "Essa playlist está vazia, é privada ou não existe.",
        detalhe:
          "“Curtidos” e “Assistir mais tarde” são da sua conta e não podem ser lidos. Copie as músicas para uma playlist pública ou não listada.",
      };
  }
}

/** Frase do que entrou na fila depois de colar um link. */
function resumoDoLink(tipo: TipoDeEntrada, faixas: Faixa[]): Retorno {
  const n = faixas.length;
  const musicas = n === 1 ? "1 música" : `${n} músicas`;
  const peloYoutube = "Do Spotify só vem a lista; o áudio toca pelo YouTube.";

  if (tipo === "video") {
    return { tipo: "ok", texto: `Na fila: ${faixas[0].title}` };
  }
  if (tipo === "spotify-musica") {
    return {
      tipo: "ok",
      texto: `Na fila: ${faixas[0].title}`,
      detalhe: peloYoutube,
    };
  }
  if (tipo === "spotify-album") {
    return {
      tipo: "ok",
      texto: `${musicas} do álbum na fila`,
      detalhe: peloYoutube,
    };
  }
  if (tipo === "spotify-playlist") {
    return {
      tipo: "ok",
      texto: `${musicas} da playlist na fila`,
      detalhe:
        n >= TETO_DO_SPOTIFY
          ? `O Spotify mostra no máximo ${TETO_DO_SPOTIFY} por playlist. O áudio toca pelo YouTube.`
          : peloYoutube,
    };
  }
  if (tipo === "mix") {
    return {
      tipo: "ok",
      texto: `${musicas} do Mix na fila`,
      detalhe:
        n >= TETO_DO_MIX
          ? `O Mix do YouTube não tem fim; entram as primeiras ${TETO_DO_MIX}.`
          : undefined,
    };
  }
  return {
    tipo: "ok",
    texto: `${musicas} da playlist na fila`,
    detalhe:
      n >= TETO_DA_PLAYLIST
        ? `A playlist é maior: entraram as primeiras ${TETO_DA_PLAYLIST}.`
        : "Vídeos privados ou removidos ficam de fora.",
  };
}

/** O que mostrar no lugar do destaque quando nada toca. */
function Dicas() {
  return (
    <ListaDeDicas>
      <li>
        <Symbol size={22}>search</Symbol>
        <span>
          <b>Busque pelo nome</b> e escolha as faixas com <b>+</b>.
        </span>
      </li>
      <li>
        <Symbol size={22}>playlist_play</Symbol>
        <span>
          <b>Cole o link de uma playlist</b> e ela entra inteira na fila.
        </span>
      </li>
      <li>
        <Symbol size={22}>smart_display</Symbol>
        <span>
          <b>Cole o link de um vídeo</b> para tocar só ele.
        </span>
      </li>
      <li>
        <Symbol size={22}>library_music</Symbol>
        <span>
          <b>Links do Spotify</b> também valem: música, álbum ou playlist
          pública (até {TETO_DO_SPOTIFY}).
        </span>
      </li>
    </ListaDeDicas>
  );
}

/**
 * Volume da musica, por ouvinte.
 *
 * O audio do MusicBox chega como faixa de um participante, entao o volume e
 * o do participante: quem acha alto abaixa so para si.
 */
function VolumeDaMusica(props: { mb: ClienteMusicBox }) {
  const state = useState();

  const identidade = () => props.mb.estado().bot_identity;
  const volume = () => {
    const id = identidade();
    return id ? state.voice.getUserVolume(id) : 1;
  };

  return (
    <Show when={identidade()}>
      {(id) => (
        <Volume>
          <IconButton
            size="sm"
            onPress={() =>
              state.voice.setUserVolume(id(), volume() > 0 ? 0 : 1)
            }
            aria-label={volume() > 0 ? "Silenciar a música" : "Tirar do mudo"}
          >
            <Show when={volume() > 0} fallback={<Symbol>volume_off</Symbol>}>
              <Symbol>volume_up</Symbol>
            </Show>
          </IconButton>
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={volume()}
            onInput={(e) =>
              state.voice.setUserVolume(id(), e.currentTarget.value)
            }
            onChange={(e) =>
              state.voice.setUserVolume(id(), e.currentTarget.value)
            }
            labelFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </Volume>
      )}
    </Show>
  );
}

/** Tocando agora, em destaque, e a tabela do que vem a seguir. */
function Fila(props: { mb: ClienteMusicBox }) {
  const confirmarLimpar = useConfirmacao();
  const estado = () => props.mb.estado();
  const atual = () => estado().current;

  return (
    <>
      <Show
        when={atual()}
        fallback={
          <SemNada>
            <Symbol size={40}>queue_music</Symbol>
            <h2>Nada tocando</h2>
            <Dicas />
          </SemNada>
        }
      >
        {(faixa) => <Destaque faixa={faixa()} mb={props.mb} />}
      </Show>

      <Show when={atual()}>
        <CabecalhoDaSecao>
          <h3>
            A seguir
            <Show when={estado().queue.length}>
              <small>
                {estado().queue.length}{" "}
                {estado().queue.length === 1 ? "faixa" : "faixas"} ·{" "}
                {duracaoLegivel(duracaoDaFila(estado()))}
              </small>
            </Show>
          </h3>
          <Show when={estado().queue.length}>
            <Button
              size="sm"
              variant="text"
              onPress={() =>
                // eslint-disable-next-line solid/reactivity -- a acao roda no clique
                confirmarLimpar.pedir(() => void props.mb.limpar())
              }
            >
              {confirmarLimpar.armado() ? "Confirmar limpeza?" : "Limpar"}
            </Button>
          </Show>
        </CabecalhoDaSecao>

        <Show
          when={estado().queue.length}
          fallback={
            <Vazio>
              <span>Depois desta, acaba. Busque ou cole um link acima.</span>
            </Vazio>
          }
        >
          <Tabela>
            <LinhaDeTitulos aria-hidden="true">
              <span>#</span>
              <span>Título</span>
              <Symbol size={16}>schedule</Symbol>
              <span />
            </LinhaDeTitulos>
            <For each={estado().queue}>
              {(faixa, indice) => (
                <Linha
                  data-fila
                  onDblClick={() => void props.mb.tocarDaFila(indice())}
                  title="Clique duas vezes para tocar agora"
                >
                  {/* O numero vira o botao de tocar no hover, como no
                      Spotify: um botao a menos parado em cada linha. */}
                  <Numero>
                    <span>{indice() + 1}</span>
                    <IconButton
                      size="sm"
                      onPress={() => void props.mb.tocarDaFila(indice())}
                      aria-label="Tocar agora"
                      use:floating={{
                        tooltip: { placement: "top", content: "Tocar agora" },
                      }}
                    >
                      <Symbol>play_arrow</Symbol>
                    </IconButton>
                  </Numero>
                  <FaixaNaLinha faixa={faixa} />
                  <Duracao>{duracaoOuAoVivo(faixa.duration_s)}</Duracao>
                  <AcaoNoHover>
                    <IconButton
                      size="sm"
                      onPress={() => void props.mb.remover(indice())}
                      aria-label="Tirar da fila"
                      use:floating={{
                        tooltip: { placement: "top", content: "Tirar da fila" },
                      }}
                    >
                      <Symbol>close</Symbol>
                    </IconButton>
                  </AcaoNoHover>
                </Linha>
              )}
            </For>
          </Tabela>
        </Show>
      </Show>
    </>
  );
}

/**
 * A faixa atual em destaque: capa grande e a propria capa, desfocada, como
 * fundo. Igual ao topo de uma playlist no Spotify.
 *
 * Enquanto o agente prepara o audio (`loading`), o tempo nao corre: aparece
 * "Preparando o áudio…" com a barra pulsando. Antes o relogio andava durante
 * a carga e voltava a zero quando o som saia, e parecia tocar mudo.
 */
function Destaque(props: { faixa: Faixa; mb: ClienteMusicBox }) {
  const estado = () => props.mb.estado();
  const duracao = () => props.faixa.duration_s ?? 0;
  const carregando = () => estado().playing && !!estado().loading;

  return (
    <Heroi
      style={{
        "--capa": props.faixa.cover_url
          ? `url("${props.faixa.cover_url}")`
          : "none",
      }}
    >
      <CapaGrande>
        <Show
          when={props.faixa.cover_url}
          fallback={<Symbol size={56}>music_note</Symbol>}
        >
          {(capa) => <img src={capa()} alt="" />}
        </Show>
      </CapaGrande>

      <InfoDoHeroi>
        <Rotulo data-estado={carregando() ? "carregando" : undefined}>
          <Switch fallback="Pausado">
            <Match when={carregando()}>
              <Girando /> Carregando
            </Match>
            <Match when={estado().playing}>
              <Equalizador aria-hidden="true">
                <i />
                <i />
                <i />
              </Equalizador>
              Tocando agora
            </Match>
          </Switch>
        </Rotulo>
        <Titulo title={props.faixa.title}>{props.faixa.title}</Titulo>
        <Artista>{props.faixa.author ?? "desconhecido"}</Artista>

        <Show
          when={!carregando()}
          fallback={
            <Progresso>
              <span>–:––</span>
              <Barra data-carregando role="progressbar" aria-busy="true">
                <div />
              </Barra>
              <span>{duracaoOuAoVivo(duracao())}</span>
              <Preparando>Preparando o áudio…</Preparando>
            </Progresso>
          }
        >
          {/* So exibicao: o servidor nao tem rota de busca (seek). */}
          <Progresso>
            <span>{duracaoLegivel(estado().position_s)}</span>
            <Barra
              role="progressbar"
              aria-label="Progresso da faixa"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, duracao())}
              aria-valuenow={estado().position_s}
            >
              <div
                style={{
                  width: `${
                    duracao() > 0
                      ? Math.min(100, (estado().position_s / duracao()) * 100)
                      : 0
                  }%`,
                }}
              />
            </Barra>
            <span>{duracaoOuAoVivo(duracao())}</span>
          </Progresso>
        </Show>
      </InfoDoHeroi>
    </Heroi>
  );
}

/** Capa pequena, titulo e artista: o miolo de toda linha de tabela. */
function FaixaNaLinha(props: { faixa: Faixa }) {
  return (
    <Miolo>
      <Miniatura capa={props.faixa.cover_url} />
      <Textos>
        <span>{props.faixa.title}</span>
        <span>{props.faixa.author ?? "desconhecido"}</span>
      </Textos>
    </Miolo>
  );
}

/**
 * Miniatura de item de lista.
 *
 * `loading="lazy"` nao e detalhe: uma playlist de 100 faixas dispararia 100
 * requisicoes de imagem de uma vez, sendo que so um punhado esta na tela.
 */
function Miniatura(props: { capa: string | null }) {
  return (
    <MiniCapa>
      <Show when={props.capa} fallback={<Symbol size={18}>music_note</Symbol>}>
        {(capa) => <img src={capa()} alt="" loading="lazy" />}
      </Show>
    </MiniCapa>
  );
}

/** Indicador de carga do tamanho do texto. */
function Girando() {
  return <Roda aria-hidden="true" />;
}

/**
 * O painel nao pinta fundo proprio: herda o do cartao da chamada.
 * `containerType` deixa o layout reagir a largura do PAINEL, e nao da
 * janela: com a lista de membros aberta, a janela e larga e o painel nao.
 */
const Painel = styled("div", {
  base: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    color: "var(--md-sys-color-on-surface)",
    containerType: "inline-size",
  },
});

/** Marca, busca centralizada e, a direita, volume e fechar. */
const Topo = styled("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "1fr minmax(0, 560px) 1fr",
    alignItems: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-sm) var(--gap-sm) var(--gap-sm) var(--gap-lg)",
    flexShrink: 0,

    "@container (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr) auto",
      "& > :first-child": { display: "none" },
    },
  },
});

const Marca = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    fontWeight: 700,
    fontSize: "15px",
    color: "var(--md-sys-color-on-surface)",
  },
});

const Direita = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "var(--gap-xs)",
  },
});

/** Tudo abaixo do topo rola junto, como uma pagina do Spotify. */
const Corpo = styled("div", {
  base: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "0 var(--gap-lg) var(--gap-lg)",

    "@container (max-width: 480px)": {
      padding: "0 var(--gap-sm) var(--gap-sm)",
    },
  },
});

/**
 * O topo da faixa atual. A capa vira fundo (`--capa`), borrada e escurecida
 * por um degrade ate a cor da superficie, para o texto continuar legivel
 * com qualquer capa.
 */
const Heroi = styled("div", {
  base: {
    position: "relative",
    isolation: "isolate",
    display: "flex",
    alignItems: "flex-end",
    gap: "var(--gap-lg)",
    padding: "var(--gap-lg)",
    marginBottom: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    overflow: "hidden",
    background: "var(--md-sys-color-surface-container)",

    _before: {
      content: '""',
      position: "absolute",
      inset: "-40px",
      zIndex: -2,
      backgroundImage: "var(--capa)",
      backgroundSize: "cover",
      backgroundPosition: "center",
      filter: "blur(40px) saturate(1.4)",
      opacity: 0.55,
    },
    _after: {
      content: '""',
      position: "absolute",
      inset: 0,
      zIndex: -1,
      background:
        "linear-gradient(180deg, transparent 0%, var(--md-sys-color-surface-container) 100%)",
    },

    "@container (max-width: 520px)": {
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      padding: "var(--gap-md)",
    },
  },
});

const CapaGrande = styled("div", {
  base: {
    width: "168px",
    height: "168px",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: "var(--borderRadius-md)",
    overflow: "hidden",
    background: "var(--md-sys-color-surface-container-highest)",
    color: "var(--md-sys-color-on-surface-variant)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
    "& img": { width: "100%", height: "100%", objectFit: "cover" },

    "@container (max-width: 720px)": { width: "120px", height: "120px" },
  },
});

const InfoDoHeroi = styled("div", {
  base: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
});

const Rotulo = styled("span", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--md-sys-color-primary)",

    '&[data-estado="carregando"]': {
      color: "var(--md-sys-color-on-surface-variant)",
    },
    "@container (max-width: 520px)": { alignSelf: "center" },
  },
});

/** Titulo grande, em ate duas linhas, como o nome de uma playlist. */
const Titulo = styled("h2", {
  base: {
    margin: 0,
    fontSize: "clamp(20px, 4cqi, 34px)",
    lineHeight: 1.15,
    fontWeight: 800,
    color: "var(--md-sys-color-on-surface)",
    lineClamp: 2,
    wordBreak: "break-word",
  },
});

const Artista = styled("span", {
  base: {
    fontSize: "14px",
    color: "var(--md-sys-color-on-surface-variant)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

/** Tempo, barra e duracao numa linha, como o player do Spotify. */
const Progresso = styled("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "var(--gap-sm)",
    marginTop: "var(--gap-md)",
    fontSize: "12px",
    fontVariantNumeric: "tabular-nums",
    color: "var(--md-sys-color-on-surface-variant)",
    maxWidth: "560px",
  },
});

const Preparando = styled("span", {
  base: {
    gridColumn: "1 / -1",
    fontSize: "12px",
  },
});

const Barra = styled("div", {
  base: {
    height: "4px",
    borderRadius: "var(--borderRadius-full)",
    background:
      "color-mix(in srgb, var(--md-sys-color-on-surface) 18%, transparent)",
    overflow: "hidden",

    "& > div": {
      height: "100%",
      borderRadius: "inherit",
      background: "var(--md-sys-color-on-surface)",
      // Anda suave entre os polls de 2 s, em vez de pular.
      transition: "width 2s linear",
    },

    // Carregando: barra cheia, fraca, pulsando. Nao finge progresso.
    "&[data-carregando] > div": {
      width: "100%",
      opacity: 0.35,
      animation: "pulse 1.4s ease-in-out infinite",
    },
  },
});

/** Tres barrinhas que sobem e descem: esta saindo som. */
const Equalizador = styled("span", {
  base: {
    display: "inline-flex",
    alignItems: "flex-end",
    gap: "2px",
    height: "10px",

    "& i": {
      width: "3px",
      height: "100%",
      background: "currentColor",
      borderRadius: "1px",
      transformOrigin: "bottom",
      animation: "musicboxEqualizador 0.9s ease-in-out infinite",
    },
    "& i:nth-child(2)": { animationDelay: "-0.3s" },
    "& i:nth-child(3)": { animationDelay: "-0.6s" },
  },
});

const Roda = styled("span", {
  base: {
    display: "inline-block",
    width: "12px",
    height: "12px",
    flexShrink: 0,
    borderRadius: "50%",
    border: "2px solid currentColor",
    borderTopColor: "transparent",
    animation: "spin 0.8s linear infinite",
  },
});

const SemNada = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-xl, 32px) var(--gap-md)",
    color: "var(--md-sys-color-on-surface-variant)",

    "& h2": {
      margin: 0,
      fontSize: "20px",
      fontWeight: 700,
      color: "var(--md-sys-color-on-surface)",
    },
  },
});

/** Titulo de secao ("A seguir", "Resultados para ...") com acao a direita. */
const CabecalhoDaSecao = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--gap-md)",
    minHeight: "40px",
    margin: "var(--gap-sm) 0 var(--gap-xs)",

    "& h3": {
      margin: 0,
      display: "flex",
      alignItems: "baseline",
      gap: "var(--gap-sm)",
      minWidth: 0,
      fontSize: "18px",
      fontWeight: 700,
      color: "var(--md-sys-color-on-surface)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    "& small": {
      fontSize: "13px",
      fontWeight: 400,
      color: "var(--md-sys-color-on-surface-variant)",
    },
  },
});

const Tabela = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
  },
});

/**
 * Colunas fixas: numero, faixa, duracao, acao. Grade e nao flex para a
 * duracao de todas as linhas ficar alinhada, como numa tabela de verdade.
 */
const Linha = styled("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr) 56px 40px",
    alignItems: "center",
    gap: "var(--gap-sm)",
    minHeight: "56px",
    padding: "0 var(--gap-xs)",
    borderRadius: "var(--borderRadius-md)",

    _hover: {
      background:
        "color-mix(in srgb, var(--md-sys-color-on-surface) 7%, transparent)",
    },

    "@container (max-width: 480px)": {
      gridTemplateColumns: "minmax(0, 1fr) 40px",
      "& > :first-child, & > :nth-child(3)": { display: "none" },
    },
  },
});

const LinhaDeTitulos = styled(Linha, {
  base: {
    minHeight: "32px",
    marginBottom: "var(--gap-xs)",
    borderBottom:
      "1px solid color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent)",
    borderRadius: 0,
    fontSize: "12px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--md-sys-color-on-surface-variant)",
    "& > :first-child": { textAlign: "center" },
    _hover: { background: "transparent" },
  },
});

/** O numero da linha; no hover (ou foco) vira o botao de tocar. */
const Numero = styled("div", {
  base: {
    display: "grid",
    placeItems: "center",
    fontSize: "14px",
    fontVariantNumeric: "tabular-nums",
    color: "var(--md-sys-color-on-surface-variant)",

    "& > *": { gridArea: "1 / 1" },
    "& > button": { opacity: 0 },
    "[data-fila]:hover &": {
      "& > span": { opacity: 0 },
      "& > button": { opacity: 1 },
    },
    "&:focus-within > span": { opacity: 0 },
    "&:focus-within > button": { opacity: 1 },
  },
});

const Miolo = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",
    minWidth: 0,
  },
});

/**
 * `minWidth: 0` e o que permite o corte com reticencias: sem isso um item de
 * flex nunca encolhe abaixo do proprio conteudo, e titulos longos empurram a
 * duracao e o botao para fora do painel.
 */
const Textos = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,

    "& > span": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    "& > span:first-child": {
      fontSize: "15px",
      color: "var(--md-sys-color-on-surface)",
    },
    "& > span:last-child": {
      fontSize: "13px",
      color: "var(--md-sys-color-on-surface-variant)",
    },
  },
});

const MiniCapa = styled("div", {
  base: {
    width: "40px",
    height: "40px",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: "var(--borderRadius-sm)",
    overflow: "hidden",
    background: "var(--md-sys-color-surface-container-highest)",
    color: "var(--md-sys-color-on-surface-variant)",
    "& img": { width: "100%", height: "100%", objectFit: "cover" },
  },
});

/** Duracao da linha, alinhada a direita como numero. */
const Duracao = styled("span", {
  base: {
    textAlign: "right",
    fontSize: "13px",
    fontVariantNumeric: "tabular-nums",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

/** Tirar da fila: so aparece no hover, para a lista ficar limpa. */
const AcaoNoHover = styled("div", {
  base: {
    display: "grid",
    placeItems: "center",
    opacity: 0,
    transition: "opacity .15s",
    "[data-fila]:hover &": { opacity: 1 },
    "&:focus-within": { opacity: 1 },
    "@container (max-width: 480px)": { opacity: 1 },
  },
});

const JaNaFila = styled("div", {
  base: {
    width: "32px",
    height: "32px",
    display: "grid",
    placeItems: "center",
    justifySelf: "center",
    color: "var(--md-sys-color-primary)",
  },
});

const Volume = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    width: "150px",

    "& mdui-slider": { flexGrow: 1, minWidth: 0 },

    // Estreito: so o botao de mudo. O deslizante empurrava o "fechar" para
    // fora do painel.
    "@container (max-width: 720px)": {
      width: "auto",
      "& mdui-slider": { display: "none" },
    },
  },
});

const BarraDeBusca = styled("form", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    minWidth: 0,
    height: "44px",
    padding: "0 var(--gap-xs) 0 var(--gap-md)",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-highest)",
    transition: "box-shadow .15s",

    _hover: {
      boxShadow:
        "0 0 0 1px color-mix(in srgb, var(--md-sys-color-on-surface) 25%, transparent)",
    },
    "&:focus-within": {
      boxShadow: "0 0 0 2px var(--md-sys-color-on-surface)",
    },
  },
});

const Icone = styled("div", {
  base: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Campo = styled("input", {
  base: {
    flexGrow: 1,
    minWidth: 0,
    padding: "10px 0",
    border: "none",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
    fontSize: "14px",
    "&:focus": { outline: "none" },
  },
});

const Vazio = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-lg)",
    textAlign: "center",
    fontSize: "14px",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

/** Aviso de uma linha: link abrindo, link adicionado, erro. */
const Faixinha = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    margin: "0 0 var(--gap-md)",
    padding: "var(--gap-xs) var(--gap-xs) var(--gap-xs) var(--gap-md)",
    minHeight: "40px",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-high)",
    color: "var(--md-sys-color-on-surface)",
    fontSize: "13px",
    flexShrink: 0,

    "& > span": { flex: 1, minWidth: 0 },
    '&[data-tipo="ok"] > :first-child': {
      color: "var(--md-sys-color-primary)",
    },
    '&[data-tipo="vazio"] > :first-child': {
      color: "var(--md-sys-color-error)",
    },
    '&[data-tipo="erro"]': {
      background: "var(--md-sys-color-error-container)",
      color: "var(--md-sys-color-on-error-container)",
    },

    // O erro geral fica entre o topo e o corpo, fora da margem do corpo.
    "*:not(section) > &": { margin: "0 var(--gap-lg) var(--gap-sm)" },
  },
});

const ListaDeDicas = styled("ul", {
  base: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    width: "100%",
    maxWidth: "720px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "var(--gap-sm)",
    fontSize: "13px",

    "& li": {
      display: "flex",
      gap: "var(--gap-sm)",
      alignItems: "flex-start",
      padding: "var(--gap-md)",
      borderRadius: "var(--borderRadius-lg)",
      background: "var(--md-sys-color-surface-container)",
    },
    "& li > :first-child": {
      color: "var(--md-sys-color-primary)",
      flexShrink: 0,
    },
    "& b": { color: "var(--md-sys-color-on-surface)" },
  },
});
