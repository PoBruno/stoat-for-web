import { For, Show, createResource, createSignal, onCleanup } from "solid-js";

import { Plural, Trans, useLingui } from "@lingui/solid/macro";
import { Channel, ForumPost, User } from "stoat.js";
import { styled } from "styled-system/jsx";

import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MdEdit from "@material-design-icons/svg/outlined/edit.svg?component-solid";
import MdLock from "@material-design-icons/svg/outlined/lock.svg?component-solid";
import MdPushPin from "@material-design-icons/svg/outlined/push_pin.svg?component-solid";

import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { Markdown } from "@revolt/markdown";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import {
  Avatar,
  Button,
  Column,
  IconButton,
  Row,
  Symbol,
  Text,
  Time,
} from "@revolt/ui";

import {
  ContextMenu,
  ContextMenuButton,
  ContextMenuDivider,
} from "../../../../components/app/menus/ContextMenu";

import { createAttachments } from "./attachments";
import { ForumAttachments } from "./ForumAttachments";
import { ForumThread } from "./ForumThread";
import { MarkdownComposer } from "./MarkdownComposer";

/**
 * Scrollable body of the post page
 */
const Scroll = styled("div", {
  base: {
    minHeight: 0,
    flexGrow: 1,
    overflowY: "auto",
    padding: "0 var(--gap-lg) var(--gap-lg)",
  },
});

/**
 * Sticky bar with the back button
 */
const TopBar = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-md) var(--gap-lg)",
    flexShrink: 0,
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Article = styled("article", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    padding: "var(--gap-lg)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-low)",
  },
});

/** Counters and the follow button, under the title */
const Stats = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--gap-l)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

/** Vote plus the overflow menu; collapse sits at the far right */
const Actions = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
  },
});

/** Empurrado para a direita, no canto inferior do bloco do post */
const Collapse = styled("button", {
  base: {
    marginInlineStart: "auto",
    display: "flex",
    alignItems: "center",
    paddingInline: "var(--gap-s)",
    height: "28px",
    borderRadius: "var(--borderRadius-full)",
    color: "var(--md-sys-color-on-surface-variant)",
    transition: "all var(--transitions-fast)",

    _hover: {
      background: "var(--md-sys-color-surface-container-highest)",
      color: "var(--md-sys-color-on-surface)",
    },
  },
});

const Meta = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-s)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Content = styled("div", {
  base: {
    color: "var(--md-sys-color-on-surface)",
    overflowWrap: "anywhere",
  },
});

/**
 * Faixa do topo do post (chips + titulo), que tambem recolhe o post.
 *
 * E um <button> de verdade, e nao uma div com onClick, para vir de graca o
 * foco por teclado e o acionamento por Enter/Espaco. Fica desabilitado quando
 * o post e curto — sem isso o cabecalho pareceria clicavel sem fazer nada.
 */
const Header = styled("button", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    alignItems: "flex-start",
    textAlign: "start",
    width: "100%",
    borderRadius: "var(--borderRadius-md)",
    transition: "background var(--transitions-fast)",
  },
  variants: {
    clickable: {
      true: {
        cursor: "pointer",

        _hover: {
          background: "var(--md-sys-color-surface-container-high)",
        },
      },
    },
  },
});

/** Quantos rostos aparecem antes de a contagem falar por si */
const MAX_FACES = 5;

/**
 * Avatares sobrepostos dos participantes.
 *
 * A sobreposicao usa margem negativa a partir do SEGUNDO filho, para a pilha
 * nao ficar deslocada em relacao ao que vem antes dela na linha.
 */
const Pile = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",

    "& > *:not(:first-child)": {
      marginInlineStart: "-6px",
    },

    // Recorta o avatar de baixo para a sobreposicao ficar legivel mesmo
    // quando dois avatares tem cores parecidas.
    "& > *": {
      outline: "2px solid var(--md-sys-color-surface-container-low)",
      borderRadius: "var(--borderRadius-full)",
    },
  },
});

/** Altura a partir da qual um post vira candidato a recolher */
const COLLAPSE_THRESHOLD = 420;

/**
 * Corpo do post, recolhível.
 *
 * O corte usa max-height com um degradê por cima em vez de cortar o conteúdo:
 * assim nada é desmontado e reexpandir não recarrega imagem nenhuma.
 */
const Body = styled("div", {
  base: {
    position: "relative",
    transition: "max-height var(--transitions-medium)",
  },
  variants: {
    collapsed: {
      true: {
        maxHeight: "260px",
        overflow: "hidden",

        _after: {
          content: '""',
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          height: "72px",
          background:
            "linear-gradient(to bottom, transparent, var(--md-sys-color-surface-container-low))",
          pointerEvents: "none",
        },
      },
    },
  },
});

const Chip = styled("span", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    padding: "1px var(--gap-s)",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
  },
});

const Divider = styled("div", {
  base: {
    height: "1px",
    margin: "var(--gap-lg) 0",
    background: "var(--md-sys-color-outline-variant)",
  },
});

/**
 * A single forum post with its comment thread.
 *
 * Reached by URL, so it is linkable and the browser back button works.
 */
export function ForumPostView(props: {
  channel: Channel;
  postId: string;
  post?: ForumPost;
  onBack: () => void;
}) {
  const { t } = useLingui();
  const { showError } = useModals();
  const client = useClient();
  const instance = useInstance();
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [composing, setComposing] = createSignal(false);

  /*
   * O recolhido vive em `layout.openSections`, e nao num signal local, para
   * sobreviver a navegacao e ao reload. Aquele store so grava o valor
   * CONTRARIO ao default, entao apenas os posts que o usuario recolheu de
   * fato ocupam espaco — os demais nem viram chave.
   *
   * Semantica da secao: "aberta" = post expandido; por isso o default e true.
   */
  const [commenters, setCommenters] = createSignal<User[]>([]);

  /**
   * Quem participou do topico.
   *
   * O autor entra sempre e em primeiro lugar: ele pode nao ter comentado
   * nada, mas e participante por definicao. O resto vem dos autores dos
   * comentarios, deduplicado por id.
   */
  const participants = () => {
    const autor = post()?.author;
    const vistos = new Set<string>();
    const lista: User[] = [];

    for (const u of [...(autor ? [autor] : []), ...commenters()]) {
      if (vistos.has(u.id)) continue;
      vistos.add(u.id);
      lista.push(u);
    }

    return lista;
  };

  const state = useState();
  const sectionId = () => `forum-post-${props.postId}`;
  const collapsed = () => !state.layout.getSectionState(sectionId(), true);
  const toggleCollapsed = () =>
    state.layout.toggleSectionState(sectionId(), true);

  // Só faz sentido oferecer "recolher" quando há o que recolher.
  const [tall, setTall] = createSignal(false);
  /**
   * Liga o observador de tamanho ao corpo do post.
   *
   * Via callback de ref, e nao onMount: o corpo vive dentro de um <Show> que
   * so resolve depois do fetch, entao no mount do componente o elemento ainda
   * nao existe. ResizeObserver e nao uma medicao unica porque imagens carregam
   * depois e mudam a altura — sem isso um post longo com print nao ganharia o
   * botao.
   */
  function observeBody(el: HTMLDivElement) {
    const observer = new ResizeObserver(() =>
      // scrollHeight ignora o corte do max-height, entao a medida continua
      // valida mesmo com o post ja recolhido.
      setTall(el.scrollHeight > COLLAPSE_THRESHOLD),
    );

    observer.observe(el);
    onCleanup(() => observer.disconnect());
  }

  // Sem isto, colar uma imagem enquanto edita nao fazia nada: o composer so
  // trata paste/drop quando recebe um store de anexos.
  const editAttachments = createAttachments({
    maxSize: () => instance.limits().file_upload_size_limits.attachments,
    maxCount: () => instance.limits().message_attachments,
  });

  // Always fetch by id. A resource whose source is conditionally undefined
  // never resolves, and under Suspense that renders as a spinner forever.
  // The collection dedupes, so this returns the same live instance the feed
  // already has.
  const [fetched] = createResource(
    () => props.postId,
    // props.channel is read inside the fetcher, which runs on the source
    // signal; the channel never changes for a mounted post view.
    // eslint-disable-next-line solid/reactivity
    async (id) => {
      try {
        return await props.channel.fetchPost(id);
      } catch (error) {
        showError(error);
        return undefined;
      }
    },
  );

  const post = () => fetched() ?? props.post;

  /** Settle an action started in an event handler */
  const settle = (p: Promise<unknown>) => p.catch(showError);

  return (
    <>
      <TopBar>
        <Button
          size="xs"
          variant="text"
          onPress={props.onBack}
          aria-label={t`Back to forum`}
        >
          <Row gap="sm" align>
            <Symbol size={18}>arrow_back</Symbol>
            <Trans>Back to forum</Trans>
          </Row>
        </Button>
      </TopBar>

      <Scroll>
        <Show
          when={!fetched.loading}
          fallback={
            <Text class="body">
              <Trans>Loading post…</Trans>
            </Text>
          }
        >
          <Show
            when={post()}
            fallback={
              <Text class="body">
                <Trans>Post not found.</Trans>
              </Text>
            }
          >
            {(loaded) => (
              <>
                <Article>
                  <Header
                    type="button"
                    clickable={tall()}
                    // Quando o post nao e alto o bastante nao ha o que
                    // recolher, entao o cabecalho vira um bloco inerte.
                    disabled={!tall()}
                    aria-expanded={tall() ? !collapsed() : undefined}
                    aria-label={collapsed() ? t`Expand post` : t`Collapse post`}
                    onClick={toggleCollapsed}
                  >
                    <Row gap="sm" align>
                      <Show when={loaded().pinned}>
                        <Chip>
                          <Symbol size={14}>push_pin</Symbol>
                          <Text class="label" size="small">
                            <Trans>Pinned</Trans>
                          </Text>
                        </Chip>
                      </Show>
                      <Show when={loaded().locked}>
                        <Chip>
                          <Symbol size={14}>lock</Symbol>
                          <Text class="label" size="small">
                            <Trans>Locked</Trans>
                          </Text>
                        </Chip>
                      </Show>
                    </Row>

                    <Text class="headline" size="small">
                      {loaded().title}
                    </Text>
                  </Header>

                  <Stats>
                    <Row gap="xs" align>
                      <Symbol size={14}>visibility</Symbol>
                      <Text class="label" size="small">
                        <Plural
                          value={loaded().views}
                          one="# view"
                          other="# views"
                        />
                      </Text>
                    </Row>
                    <Show when={participants().length > 1}>
                      <Row gap="xs" align>
                        <Pile>
                          <For each={participants().slice(0, MAX_FACES)}>
                            {(user) => (
                              <Avatar
                                size={18}
                                src={user.avatarURL}
                                fallback={user.displayName ?? user.id}
                              />
                            )}
                          </For>
                        </Pile>
                        <Text class="label" size="small">
                          <Plural
                            value={participants().length}
                            one="# participant"
                            other="# participants"
                          />
                        </Text>
                      </Row>
                    </Show>
                    <Show when={!loaded().locked}>
                      <Button
                        size="xs"
                        variant="filled"
                        onPress={() => setComposing(true)}
                      >
                        <Row gap="xs" align>
                          <Symbol size={14}>chat_bubble</Symbol>
                          <Trans>Comment</Trans>
                        </Row>
                      </Button>
                    </Show>
                    <Button
                      size="xs"
                      variant={loaded().subscribed ? "tonal" : "outlined"}
                      onPress={() =>
                        settle(loaded().setSubscribed(!loaded().subscribed))
                      }
                    >
                      <Row gap="xs" align>
                        <Symbol size={14}>
                          {loaded().subscribed
                            ? "notifications_active"
                            : "notifications"}
                        </Symbol>
                        <Show
                          when={loaded().subscribed}
                          fallback={<Trans>Follow</Trans>}
                        >
                          <Trans>Following</Trans>
                        </Show>
                      </Row>
                    </Button>
                  </Stats>

                  <Meta>
                    <Avatar
                      size={24}
                      src={loaded().author?.avatarURL}
                      fallback={
                        loaded().author?.displayName ?? loaded().authorId
                      }
                    />
                    <Text class="label" size="small">
                      {loaded().author?.displayName ?? loaded().authorId}
                    </Text>
                    <Text class="label" size="small">
                      ·
                    </Text>
                    <Text class="label" size="small">
                      <Time value={loaded().createdAt} format="relative" />
                    </Text>
                    <Show when={loaded().editedAt}>
                      <Text class="label" size="small">
                        <Trans>(edited)</Trans>
                      </Text>
                    </Show>
                  </Meta>

                  <Show
                    when={!editing()}
                    fallback={
                      <Column gap="md">
                        <MarkdownComposer
                          autoFocus
                          value={draft()}
                          onChange={setDraft}
                          placeholder={t`Write your post…`}
                          attachments={editAttachments}
                        />
                        <Row gap="sm">
                          <Button
                            size="xs"
                            variant="filled"
                            onPress={() =>
                              settle(
                                editAttachments
                                  .upload(client(), instance.mediaUrl)
                                  // Roda depois do upload, ja dentro de um
                                  // handler de evento; nao ha o que rastrear.
                                  // eslint-disable-next-line solid/reactivity
                                  .then((ids) =>
                                    loaded().edit({
                                      content: draft().trim(),
                                      attachments: ids.length ? ids : undefined,
                                    }),
                                  )
                                  .then(() => {
                                    editAttachments.clear();
                                    setEditing(false);
                                  }),
                              )
                            }
                          >
                            <Trans>Save</Trans>
                          </Button>
                          <Button
                            size="xs"
                            variant="text"
                            onPress={() => setEditing(false)}
                          >
                            <Trans>Cancel</Trans>
                          </Button>
                        </Row>
                      </Column>
                    }
                  >
                    <Body ref={observeBody} collapsed={collapsed()}>
                      <Show when={loaded().content}>
                        <Content>
                          <Markdown
                            content={loaded().content}
                            allowInlineMedia
                          />
                        </Content>
                      </Show>

                      <ForumAttachments
                        files={loaded().attachments}
                        content={loaded().content}
                      />
                    </Body>
                  </Show>

                  <Actions>
                    <Show when={tall()}>
                      <Collapse
                        type="button"
                        // Sem aria-label de proposito: o botao ja tem texto
                        // visivel, e um rotulo igual ao do cabecalho deixaria
                        // dois controles indistinguiveis para leitor de tela.
                        onClick={toggleCollapsed}
                      >
                        <Row gap="xs" align>
                          <Symbol size={16}>
                            {collapsed() ? "unfold_more" : "unfold_less"}
                          </Symbol>
                          <Text class="label" size="small">
                            <Show
                              when={collapsed()}
                              fallback={<Trans>Collapse</Trans>}
                            >
                              <Trans>Expand</Trans>
                            </Show>
                          </Text>
                        </Row>
                      </Collapse>
                    </Show>

                    <Button
                      size="xs"
                      variant={loaded().upvoted ? "tonal" : "outlined"}
                      onPress={() => settle(loaded().toggleUpvote())}
                    >
                      <Row gap="xs" align>
                        <Symbol size={16}>arrow_upward</Symbol>
                        {loaded().score}
                      </Row>
                    </Button>

                    <Show
                      when={
                        loaded().canModerate ||
                        loaded().canEdit ||
                        loaded().canDelete
                      }
                    >
                      <IconButton
                        size="xs"
                        aria-label={t`Post actions`}
                        use:floating={{
                          contextMenuHandler: "click",
                          contextMenu: () => (
                            <ContextMenu>
                              <Show when={loaded().canEdit}>
                                <ContextMenuButton
                                  icon={MdEdit}
                                  onClick={() => {
                                    setDraft(loaded().content ?? "");
                                    setEditing(true);
                                  }}
                                >
                                  <Trans>Edit</Trans>
                                </ContextMenuButton>
                              </Show>

                              <Show when={loaded().canModerate}>
                                <ContextMenuButton
                                  icon={MdPushPin}
                                  onClick={() =>
                                    settle(loaded().setPinned(!loaded().pinned))
                                  }
                                >
                                  <Show
                                    when={loaded().pinned}
                                    fallback={<Trans>Pin</Trans>}
                                  >
                                    <Trans>Unpin</Trans>
                                  </Show>
                                </ContextMenuButton>
                                <ContextMenuButton
                                  icon={MdLock}
                                  onClick={() =>
                                    settle(loaded().setLocked(!loaded().locked))
                                  }
                                >
                                  <Show
                                    when={loaded().locked}
                                    fallback={<Trans>Lock</Trans>}
                                  >
                                    <Trans>Unlock</Trans>
                                  </Show>
                                </ContextMenuButton>
                              </Show>

                              <Show when={loaded().canDelete}>
                                <ContextMenuDivider />
                                <ContextMenuButton
                                  icon={MdDelete}
                                  destructive
                                  onClick={() =>
                                    settle(
                                      loaded()
                                        .delete()
                                        // Runs after the request; onBack is a
                                        // plain callback prop.
                                        // eslint-disable-next-line solid/reactivity
                                        .then(() => props.onBack()),
                                    )
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
                    </Show>
                  </Actions>
                </Article>

                <Divider />

                <ForumThread
                  onParticipants={setCommenters}
                  post={loaded()}
                  composing={composing()}
                  onCloseComposer={() => setComposing(false)}
                />
              </>
            )}
          </Show>
        </Show>
      </Scroll>
    </>
  );
}
