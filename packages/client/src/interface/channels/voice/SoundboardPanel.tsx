import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";

import { Plural, Trans, useLingui } from "@lingui/solid/macro";
import { Server, Sound } from "stoat.js";
import { styled } from "styled-system/jsx";

import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MdEdit from "@material-design-icons/svg/outlined/edit.svg?component-solid";

import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { Button, IconButton, Row, Symbol, Text } from "@revolt/ui";

import {
  ContextMenu,
  ContextMenuButton,
} from "../../../../components/app/menus/ContextMenu";

/** Chip that stands for "everything", regardless of category */
const TODOS = "\u0000todos";
/** Chip that stands for the user's starred sounds */
const FAVORITOS = "\u0000favoritos";

type Ordem = "recentes" | "nome" | "duracao";

/**
 * Soundboard panel, shown while connected to a voice channel.
 */
export function SoundboardPanel(props: {
  server: Server;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const client = useClient();
  const voice = useVoice();
  const state = useState();
  const { showError, openModal } = useModals();

  const [busca, setBusca] = createSignal("");
  const [chip, setChip] = createSignal<string>(FAVORITOS);
  const [ordem, setOrdem] = createSignal<Ordem>("recentes");
  const [lista, setLista] = createSignal(false);
  const [tocando, setTocando] = createSignal<string>();

  // Busca uma vez ao abrir; daqui para frente os eventos SoundCreate e
  // SoundDelete mantem a colecao viva, entao a UI le direto do store.
  const [carregou] = createResource(
    () => props.server.id,
    // Roda dentro do createResource, disparado pela fonte acima; o lint nao
    // enxerga isso como escopo rastreado.
    // eslint-disable-next-line solid/reactivity
    async () => {
      try {
        await props.server.fetchSounds();
      } catch (error) {
        showError(error);
      }
      return true;
    },
  );

  const sons = () => props.server.sounds;

  /** Categorias existentes, derivadas dos sons — nao ha lista separada */
  const categorias = createMemo(() => {
    const vistas = new Set<string>();
    for (const som of sons()) if (som.category) vistas.add(som.category);
    return [...vistas].sort((a, b) => a.localeCompare(b));
  });

  const visiveis = createMemo(() => {
    const termo = busca().trim().toLowerCase();
    const filtro = chip();

    let resultado = sons().filter((som) => {
      if (termo && !som.name.toLowerCase().includes(termo)) return false;
      if (filtro === TODOS) return true;
      if (filtro === FAVORITOS) return state.voice.isFavouriteSound(som.id);
      return som.category === filtro;
    });

    resultado = [...resultado];
    switch (ordem()) {
      case "nome":
        resultado.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "duracao":
        resultado.sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0));
        break;
      default:
        resultado.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return resultado;
  });

  // Se o usuario abre em Favoritos e nao tem nenhum, cair na aba vazia parece
  // defeito. Mostra Todos nesse caso.
  createEffect(() => {
    if (
      carregou() &&
      chip() === FAVORITOS &&
      state.voice.soundboardFavourites.length === 0
    ) {
      setChip(TODOS);
    }
  });

  function tocar(som: Sound) {
    setTocando(som.id);
    voice
      .playSound(som.url, () => setTocando(undefined))
      .catch((error) => {
        setTocando(undefined);
        showError(error);
      });

    // Avisa o canal em paralelo: o audio ja esta a caminho pela track, isto e
    // so o rotulo de "quem tocou o que".
    const canal = voice.channel();
    if (canal) {
      client()
        .api.post(
          `/channels/${canal.id}/sounds/${som.id}/play` as "/channels/{target}/sounds/{sound}/play",
        )
        .catch(() => {
          // Falhar o aviso nao pode calar o som que ja esta tocando.
        });
    }
  }

  onCleanup(() => voice.stopSound());

  return (
    <Painel>
      <Cabecalho>
        <Row gap="sm" align>
          <Symbol size={26}>graphic_eq</Symbol>
          <Titulo>
            <Text class="title" size="medium">
              <Trans>Soundboard</Trans>
            </Text>
            <Text class="label" size="small">
              <Trans>Play sounds in the channel</Trans>
            </Text>
          </Titulo>
        </Row>
        <Row gap="sm" align>
          <Show when={props.server.havePermission("ManageCustomisation")}>
            <Button
              size="xs"
              variant="tonal"
              onPress={() =>
                openModal({
                  type: "settings",
                  config: "server",
                  context: props.server,
                  // Abre direto na aba de sons: fazer o usuario procurar a
                  // engrenagem do servidor e depois a aba certa e o caminho
                  // que ele nao encontrou sozinho.
                  page: "sounds",
                })
              }
            >
              <Row gap="xs" align>
                <Symbol size={16}>edit</Symbol>
                <Trans>Customise</Trans>
              </Row>
            </Button>
          </Show>
          <IconButton
            size="sm"
            variant="standard"
            aria-label={t`Close soundboard`}
            onPress={() => props.onClose()}
          >
            <Symbol>close</Symbol>
          </IconButton>
        </Row>
      </Cabecalho>

      <Controles>
        <Campo>
          <Symbol size={18}>search</Symbol>
          <input
            value={busca()}
            placeholder={t`Search sounds`}
            onInput={(e) => setBusca(e.currentTarget.value)}
          />
        </Campo>
        <Row gap="sm" align>
          <Text class="label" size="small">
            <Trans>Volume</Trans>
          </Text>
          <Symbol size={18}>volume_up</Symbol>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(state.voice.soundboardVolume * 100)}
            onInput={(e) =>
              (state.voice.soundboardVolume =
                Number(e.currentTarget.value) / 100)
            }
          />
          <Text class="label" size="small">
            {Math.round(state.voice.soundboardVolume * 100)}%
          </Text>
        </Row>
      </Controles>

      <Filtros>
        <Row gap="xs" align wrap>
          <Chip
            active={chip() === FAVORITOS}
            onClick={() => setChip(FAVORITOS)}
          >
            <Symbol size={14}>star</Symbol>
            <Trans>Favourites</Trans>
          </Chip>
          <Chip active={chip() === TODOS} onClick={() => setChip(TODOS)}>
            <Trans>All</Trans>
          </Chip>
          <For each={categorias()}>
            {(categoria) => (
              <Chip
                active={chip() === categoria}
                onClick={() => setChip(categoria)}
              >
                {categoria}
              </Chip>
            )}
          </For>
        </Row>
        <Row gap="xs" align>
          <select
            value={ordem()}
            onChange={(e) => setOrdem(e.currentTarget.value as Ordem)}
          >
            <option value="recentes">{t`Most recent`}</option>
            <option value="nome">{t`Name`}</option>
            <option value="duracao">{t`Duration`}</option>
          </select>
          <IconButton
            size="xs"
            variant={lista() ? "standard" : "tonal"}
            aria-label={t`Grid view`}
            onPress={() => setLista(false)}
          >
            <Symbol size={18}>grid_view</Symbol>
          </IconButton>
          <IconButton
            size="xs"
            variant={lista() ? "tonal" : "standard"}
            aria-label={t`List view`}
            onPress={() => setLista(true)}
          >
            <Symbol size={18}>view_list</Symbol>
          </IconButton>
        </Row>
      </Filtros>

      <Show
        when={carregou()}
        fallback={
          <Vazio>
            <Trans>Loading sounds.</Trans>
          </Vazio>
        }
      >
        <Show
          when={visiveis().length}
          fallback={
            <Vazio>
              <Show
                when={sons().length}
                fallback={<Trans>No sounds on this server yet.</Trans>}
              >
                <Trans>Nothing matches that.</Trans>
              </Show>
            </Vazio>
          }
        >
          <Grade lista={lista()}>
            <For each={visiveis()}>
              {(som) => (
                <Cartao>
                  <Row gap="sm" align>
                    <Symbol size={22}>music_note</Symbol>
                    <Dados>
                      <Text class="label" size="large">
                        {som.name}
                      </Text>
                      <Row gap="xs" align>
                        <Show when={som.duration}>
                          <Text class="label" size="small">
                            {formatarDuracao(som.duration!)}
                          </Text>
                        </Show>
                        <Show when={state.voice.isFavouriteSound(som.id)}>
                          <Symbol size={12}>star</Symbol>
                        </Show>
                      </Row>
                    </Dados>
                  </Row>
                  <Row gap="xs" align>
                    <IconButton
                      size="xs"
                      variant={tocando() === som.id ? "filled" : "tonal"}
                      aria-label={t`Play`}
                      isDisabled={!voice.soundboardPermission}
                      onPress={() => tocar(som)}
                    >
                      <Symbol size={18}>
                        {tocando() === som.id ? "stop" : "play_arrow"}
                      </Symbol>
                    </IconButton>
                    <IconButton
                      size="xs"
                      variant="standard"
                      aria-label={t`Sound actions`}
                      use:floating={{
                        contextMenuHandler: "click",
                        contextMenu: () => (
                          <ContextMenu>
                            <ContextMenuButton
                              icon={MdEdit}
                              onClick={() =>
                                state.voice.toggleFavouriteSound(som.id)
                              }
                            >
                              <Show
                                when={state.voice.isFavouriteSound(som.id)}
                                fallback={<Trans>Add to favourites</Trans>}
                              >
                                <Trans>Remove from favourites</Trans>
                              </Show>
                            </ContextMenuButton>
                            <Show
                              when={podeGerir(
                                props.server,
                                som,
                                client().user?.id,
                              )}
                            >
                              <ContextMenuButton
                                icon={MdDelete}
                                destructive
                                onClick={() =>
                                  openModal({
                                    type: "delete_sound",
                                    sound: som,
                                  })
                                }
                              >
                                <Trans>Delete</Trans>
                              </ContextMenuButton>
                            </Show>
                          </ContextMenu>
                        ),
                      }}
                    >
                      <Symbol size={18}>more_horiz</Symbol>
                    </IconButton>
                  </Row>
                </Cartao>
              )}
            </For>
          </Grade>
        </Show>
      </Show>

      <Rodape>
        <Text class="label" size="small">
          <Plural value={sons().length} one="# sound" other="# sounds" />
        </Text>
        <Show when={!voice.soundboardPermission}>
          <Text class="label" size="small">
            <Trans>You cannot play sounds here.</Trans>
          </Text>
        </Show>
      </Rodape>
    </Painel>
  );
}

/** mm:ss a partir de milissegundos */
function formatarDuracao(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Quem subiu pode gerir; os demais precisam de ManageCustomisation */
function podeGerir(server: Server, som: Sound, usuarioId?: string): boolean {
  return (
    som.creator?.id === usuarioId ||
    server.havePermission("ManageCustomisation")
  );
}

const Painel = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    padding: "var(--gap-lg)",
    height: "100%",
    minHeight: 0,
    background: "var(--md-sys-color-surface-container-low)",
    borderRadius: "var(--borderRadius-lg)",
  },
});

const Cabecalho = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
});

/**
 * Titulo e subtitulo empilhados.
 *
 * Precisa ser flex-column: `Text` renderiza um span inline, e num div comum o
 * "Soundboard" e o subtitulo saem colados um no outro.
 */
const Titulo = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
  },
});

const Controles = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--gap-md)",
    flexWrap: "wrap",
  },
});

const Campo = styled("label", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    flex: 1,
    minWidth: "180px",
    paddingInline: "var(--gap-md)",
    height: "38px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-high)",

    "& input": {
      flex: 1,
      background: "transparent",
      border: "none",
      outline: "none",
      color: "var(--md-sys-color-on-surface)",
    },
  },
});

const Filtros = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--gap-md)",
    flexWrap: "wrap",
  },
});

const Chip = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    paddingInline: "var(--gap-md)",
    height: "30px",
    borderRadius: "var(--borderRadius-full)",
    cursor: "pointer",
    fontSize: "0.8rem",
    background: "var(--md-sys-color-surface-container-high)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
  variants: {
    active: {
      true: {
        background: "var(--md-sys-color-primary)",
        color: "var(--md-sys-color-on-primary)",
      },
    },
  },
});

const Grade = styled("div", {
  base: {
    display: "grid",
    gap: "var(--gap-sm)",
    overflowY: "auto",
    minHeight: 0,
    flex: 1,
  },
  variants: {
    lista: {
      true: { gridTemplateColumns: "1fr" },
      false: { gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" },
    },
  },
});

const Cartao = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container)",
  },
});

const Dados = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",

    "& > *": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  },
});

const Vazio = styled("div", {
  base: {
    flex: 1,
    display: "grid",
    placeItems: "center",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Rodape = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});
