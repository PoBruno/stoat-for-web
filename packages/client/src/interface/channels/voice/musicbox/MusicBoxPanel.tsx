import { For, Match, Show, Switch, createSignal } from "solid-js";

import { styled } from "styled-system/jsx";

import { useState } from "@revolt/state";
import { CircularProgress } from "@revolt/ui";
import { Button, IconButton, Slider, Text } from "@revolt/ui/components/design";
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
 * Duas colunas: **Adicionar** (busca) e **Fila**. Antes a busca tomava o
 * lugar da fila enquanto havia resultado, e para ver o que vinha a seguir era
 * preciso apagar a pesquisa. Agora as duas ficam lado a lado, como no
 * Spotify; em largura de celular, uma sobre a outra, e a fila nunca some.
 *
 * Os controles (tocar, pular, repetir...) ficam na barra de baixo da
 * chamada, no MiniPlayer, e nao aqui.
 *
 * Link do YouTube vai direto para a fila. Playlist entra inteira, Mix entra
 * com as primeiras 50, video entra sozinho. Texto vira busca, e ai se
 * escolhe faixa por faixa.
 */
export function MusicBoxPanel(props: {
  channelId: string;
  onClose: () => void;
}) {
  // O canal e fixo por instancia: quem troca de canal remonta (<Show keyed>).
  // eslint-disable-next-line solid/reactivity
  const mb = usarMusicBox(props.channelId);

  const [termo, setTermo] = createSignal("");
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
      setResultados([]);
      setRetorno(resumoDoLink(tipo, faixas));
    } catch (falha) {
      setResultados([]);
      setAviso(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setBuscando(false);
    }
  }

  function limparBusca() {
    setTermo("");
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

  return (
    <Painel>
      <Cabecalho>
        <Symbol>queue_music</Symbol>
        <Text class="title" size="small">
          MusicBox
        </Text>
        <Espaco />
        <VolumeDaMusica mb={mb} />
        <IconButton onPress={props.onClose} aria-label="Fechar o MusicBox">
          <Symbol>close</Symbol>
        </IconButton>
      </Cabecalho>

      {/* Sem agente ou sem permissao, todo botao pareceria nao fazer nada. */}
      <Show when={mb.erro()}>
        <AvisoDeErro role="alert">
          <Symbol size={18}>error</Symbol>
          <span>{mb.erro()}</span>
          <IconButton
            size="xs"
            onPress={() => mb.setErro(undefined)}
            aria-label="Fechar aviso"
          >
            <Symbol size={16}>close</Symbol>
          </IconButton>
        </AvisoDeErro>
      </Show>

      <Colunas>
        <Coluna data-coluna="busca" aria-label="Adicionar músicas">
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
                if (e.key === "Escape") limparBusca();
              }}
            />
            <Show when={termo()}>
              <IconButton
                size="xs"
                onPress={limparBusca}
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

          <Rolagem>
            <Switch fallback={<Dicas />}>
              <Match when={buscando()}>
                {(tipo) => (
                  <Vazio>
                    <CircularProgress />
                    <Text class="label">{ABRINDO[tipo()]}</Text>
                  </Vazio>
                )}
              </Match>
              <Match when={aviso()}>
                {(mensagem) => (
                  <Vazio>
                    <Text class="label">{mensagem()}</Text>
                  </Vazio>
                )}
              </Match>
              <Match when={resultados().length}>
                <For each={resultados()}>
                  {(faixa) => (
                    <Item>
                      <Miniatura capa={faixa.cover_url} />
                      <Identificacao>
                        <Text class="body">{faixa.title}</Text>
                        <Text class="label">
                          {faixa.author ?? "desconhecido"}
                        </Text>
                      </Identificacao>
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
                            tooltip: { placement: "top", content: "Na fila" },
                          }}
                        >
                          <Symbol>check</Symbol>
                        </JaNaFila>
                      </Show>
                    </Item>
                  )}
                </For>
              </Match>
              <Match when={retorno()}>
                {(r) => (
                  <Retornado data-tipo={r().tipo} role="status">
                    <Symbol size={28}>
                      {r().tipo === "ok" ? "playlist_add_check" : "block"}
                    </Symbol>
                    <Text class="body">{r().texto}</Text>
                    <Show when={r().detalhe}>
                      <Text class="label">{r().detalhe}</Text>
                    </Show>
                  </Retornado>
                )}
              </Match>
            </Switch>
          </Rolagem>
        </Coluna>

        <Coluna data-coluna="fila" aria-label="Fila">
          <Fila mb={mb} />
        </Coluna>
      </Colunas>
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

/** O que mostrar na coluna de busca antes de buscar. */
function Dicas() {
  return (
    <ListaDeDicas>
      <li>
        <Symbol size={20}>search</Symbol>
        <span>
          <b>Busque pelo nome</b> e escolha as faixas com <b>+</b>.
        </span>
      </li>
      <li>
        <Symbol size={20}>playlist_play</Symbol>
        <span>
          <b>Cole o link de uma playlist</b> e ela entra inteira na fila.
        </span>
      </li>
      <li>
        <Symbol size={20}>smart_display</Symbol>
        <span>
          <b>Cole o link de um vídeo</b> para tocar só ele.
        </span>
      </li>
      <li>
        <Symbol size={20}>library_music</Symbol>
        <span>
          <b>Links do Spotify</b> também valem: música, álbum ou playlist
          pública (até {TETO_DO_SPOTIFY}). O áudio toca pelo YouTube.
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

/** Tocando agora + o que vem a seguir. */
function Fila(props: { mb: ClienteMusicBox }) {
  const confirmarLimpar = useConfirmacao();
  const estado = () => props.mb.estado();
  const atual = () => estado().current;
  const duracao = () => atual()?.duration_s ?? 0;

  return (
    <>
      <Show
        when={atual()}
        fallback={
          <Vazio>
            <Symbol size={32} style={{ opacity: 0.4 }}>
              queue_music
            </Symbol>
            <Text class="label">Nada tocando. Adicione algo ao lado.</Text>
          </Vazio>
        }
      >
        {(faixa) => (
          <TocandoAgora>
            <Capa>
              <Show
                when={faixa().cover_url}
                fallback={<Symbol style={{ opacity: 0.4 }}>music_note</Symbol>}
              >
                {(capa) => <img src={capa()} alt="" />}
              </Show>
            </Capa>
            <Identificacao>
              <Rotulo>{estado().playing ? "Tocando agora" : "Pausado"}</Rotulo>
              <Text class="body">
                <b>{faixa().title}</b>
              </Text>
              <Text class="label">{faixa().author ?? "desconhecido"}</Text>
              {/* So exibicao: o servidor nao tem rota de busca (seek). */}
              <BarraDeProgresso
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
              </BarraDeProgresso>
              <LinhaDeTempo>
                <span>{duracaoLegivel(estado().position_s)}</span>
                <span>{duracaoOuAoVivo(duracao())}</span>
              </LinhaDeTempo>
            </Identificacao>
          </TocandoAgora>
        )}
      </Show>

      <Show when={atual()}>
        <Resumo>
          <Text class="label">
            <b>A seguir</b>
            <Show when={estado().queue.length}>
              {" · "}
              {estado().queue.length}{" "}
              {estado().queue.length === 1 ? "faixa" : "faixas"} ·{" "}
              {duracaoLegivel(duracaoDaFila(estado()))}
            </Show>
          </Text>
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
        </Resumo>
      </Show>

      <Rolagem>
        <Show when={atual() && !estado().queue.length}>
          <Vazio>
            <Text class="label">
              Depois desta, acaba. Adicione mais ao lado.
            </Text>
          </Vazio>
        </Show>
        <For each={estado().queue}>
          {(faixa, indice) => (
            <Item
              onDblClick={() => void props.mb.tocarDaFila(indice())}
              title="Clique duas vezes para tocar agora"
            >
              <Posicao>
                <Text class="label">{indice() + 1}</Text>
              </Posicao>
              <Miniatura capa={faixa.cover_url} />
              <Identificacao>
                <Text class="body">{faixa.title}</Text>
                <Text class="label">{faixa.author ?? "desconhecido"}</Text>
              </Identificacao>
              <Duracao>{duracaoOuAoVivo(faixa.duration_s)}</Duracao>
              <AcoesDoItem>
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
              </AcoesDoItem>
            </Item>
          )}
        </For>
      </Rolagem>
    </>
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
      <Show
        when={props.capa}
        fallback={<Symbol style={{ opacity: 0.4 }}>music_note</Symbol>}
      >
        {(capa) => <img src={capa()} alt="" loading="lazy" />}
      </Show>
    </MiniCapa>
  );
}

/**
 * O painel nao pinta fundo proprio: herda o do cartao da chamada, e os dois
 * viram uma peca so. `containerType` deixa as colunas reagirem a largura do
 * PAINEL, e nao da janela: com a lista de membros aberta, a janela e larga e
 * o painel nao.
 */
const Painel = styled("div", {
  base: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    minHeight: 0,
    color: "var(--md-sys-color-on-surface)",
    containerType: "inline-size",
  },
});

const Cabecalho = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-xs) var(--gap-xs) 0 var(--gap-md)",
    flexShrink: 0,
  },
});

const Espaco = styled("div", { base: { flex: 1 } });

/**
 * Lado a lado quando cabe; uma sobre a outra quando nao. Empilhado, a busca
 * fica com no maximo metade da altura: a fila continua a vista mesmo com 15
 * resultados na tela.
 */
const Colunas = styled("div", {
  base: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "var(--gap-md)",
    padding: "0 var(--gap-md) var(--gap-md)",

    "@container (max-width: 640px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      // A busca cresce com o conteudo ate 45% da altura; o resto e da fila.
      gridTemplateRows: "fit-content(45%) minmax(0, 1fr)",
    },
  },
});

const Coluna = styled("section", {
  base: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container-low)",
  },
});

/** A parte que rola, dentro de cada coluna. */
const Rolagem = styled("div", {
  base: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
});

const Capa = styled("div", {
  base: {
    width: "72px",
    height: "72px",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-highest)",
    overflow: "hidden",
    "& img": { width: "100%", height: "100%", objectFit: "cover" },
  },
});

const MiniCapa = styled(Capa, {
  base: { width: "36px", height: "36px" },
});

/**
 * `minWidth: 0` e o que permite o corte com reticencias: sem isso um item de
 * flex nunca encolhe abaixo do proprio conteudo, e titulos longos empurram a
 * duracao e o botao para fora do painel.
 */
const Identificacao = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flexGrow: 1,
    "& > *": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  },
});

const TocandoAgora = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-md)",
    alignItems: "center",
    padding: "var(--gap-sm)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container)",
    flexShrink: 0,
  },
});

const Rotulo = styled("span", {
  base: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--md-sys-color-primary)",
  },
});

const Volume = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    flexShrink: 0,
    width: "160px",

    "& mdui-slider": { flexGrow: 1, minWidth: 0 },

    // Estreito: so o botao de mudo. O deslizante empurrava o "fechar" para
    // fora do painel.
    "@container (max-width: 480px)": {
      width: "auto",
      "& mdui-slider": { display: "none" },
    },
  },
});

const LinhaDeTempo = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "11px",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const BarraDeBusca = styled("form", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    padding: "0 var(--gap-xs) 0 var(--gap-md)",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-highest)",
    flexShrink: 0,

    "&:focus-within": {
      outline: "2px solid var(--md-sys-color-primary)",
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
    fontSize: "0.9rem",
    "&:focus": { outline: "none" },
  },
});

const Resumo = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: "32px",
    padding: "0 var(--gap-xs)",
    flexShrink: 0,
  },
});

const Item = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "6px var(--gap-sm)",
    borderRadius: "var(--borderRadius-md)",
    "&:hover": { background: "var(--md-sys-color-surface-container)" },
  },
});

/** Botoes do item da fila: aparecem no hover, para a lista ficar limpa. */
const AcoesDoItem = styled("div", {
  base: {
    display: "flex",
    flexShrink: 0,
    opacity: 0.35,
    transition: "opacity .15s",
    "*:hover > &": { opacity: 1 },
    "&:focus-within": { opacity: 1 },
  },
});

const JaNaFila = styled("div", {
  base: {
    width: "32px",
    height: "32px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    color: "var(--md-sys-color-primary)",
  },
});

const Posicao = styled("div", {
  base: {
    width: "1.5rem",
    textAlign: "center",
    flexShrink: 0,
    "@container (max-width: 480px)": { display: "none" },
  },
});

/** Duracao do item; sai primeiro quando falta espaco, o titulo importa mais. */
const Duracao = styled("span", {
  base: {
    flexShrink: 0,
    fontSize: "12px",
    color: "var(--md-sys-color-on-surface-variant)",
    "@container (max-width: 480px)": { display: "none" },
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
  },
});

const Retornado = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--gap-xs)",
    padding: "var(--gap-lg) var(--gap-md)",
    textAlign: "center",
    color: "var(--md-sys-color-primary)",

    "& > span": { color: "var(--md-sys-color-on-surface)" },
    '&[data-tipo="vazio"]': { color: "var(--md-sys-color-error)" },
  },
});

const ListaDeDicas = styled("ul", {
  base: {
    listStyle: "none",
    margin: 0,
    padding: "var(--gap-sm)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    fontSize: "13px",
    color: "var(--md-sys-color-on-surface-variant)",

    "& li": {
      display: "flex",
      gap: "var(--gap-sm)",
      alignItems: "center",
    },
    "& b": { color: "var(--md-sys-color-on-surface)" },
  },
});

const AvisoDeErro = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    margin: "0 var(--gap-md)",
    padding: "var(--gap-xs) var(--gap-xs) var(--gap-xs) var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-error-container)",
    color: "var(--md-sys-color-on-error-container)",
    fontSize: "13px",
    flexShrink: 0,

    "& > span": { flex: 1 },
  },
});

const BarraDeProgresso = styled("div", {
  base: {
    height: "4px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-highest)",
    overflow: "hidden",
    marginTop: "var(--gap-sm)",
    flexShrink: 0,

    "& > div": {
      height: "100%",
      background: "var(--md-sys-color-primary)",
      // Anda suave entre os polls de 2 s, em vez de pular.
      transition: "width 2s linear",
    },
  },
});
