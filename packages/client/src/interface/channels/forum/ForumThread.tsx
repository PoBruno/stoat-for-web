import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
} from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { ForumComment, ForumPost, User } from "stoat.js";
import { styled } from "styled-system/jsx";

import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MdEdit from "@material-design-icons/svg/outlined/edit.svg?component-solid";

import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { Markdown } from "@revolt/markdown";
import { useModals } from "@revolt/modal";
import {
  Avatar,
  Button,
  IconButton,
  Row,
  Symbol,
  Text,
  Time,
} from "@revolt/ui";

import {
  ContextMenu,
  ContextMenuButton,
} from "../../../../components/app/menus/ContextMenu";
import { createAttachments } from "./attachments";

import { ForumAttachments } from "./ForumAttachments";
import { MarkdownComposer } from "./MarkdownComposer";

/**
 * One comment plus its rendered children
 */
type Node = { comment: ForumComment; children: Node[] };

/**
 * Build the tree from the flat list.
 *
 * The whole thread is in memory by design, so this is one pass to index and
 * one to link. A comment whose parent is missing (hard deleted) is promoted
 * to the root instead of disappearing.
 */
function buildTree(comments: ForumComment[]): Node[] {
  const nodes = new Map<string, Node>();
  for (const comment of comments) {
    nodes.set(comment.id, { comment, children: [] });
  }

  const roots: Node[] = [];
  for (const node of nodes.values()) {
    const parentId = node.comment.parentId;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Indentation rail for replies
 */
const Branch = styled("div", {
  base: {
    borderInlineStart: "2px solid var(--md-sys-color-outline-variant)",
    paddingInlineStart: "var(--gap-l)",
    marginInlineStart: "11px",
  },
});

const Entry = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-xs)",
    padding: "var(--gap-md)",
    marginInline: "calc(-1 * var(--gap-md))",
    borderRadius: "var(--borderRadius-sm)",
    transition: "background var(--transitions-fast)",

    // Makes the nesting readable: without it every level looks the same.
    _hover: {
      background: "var(--md-sys-color-surface-container-low)",
    },
  },
});

const Head = styled("div", {
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

const Tombstone = styled("div", {
  base: {
    fontStyle: "italic",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

/** Ordenação numa faixa própria, alinhada à direita, acima do rótulo */
/**
 * Coluna da thread.
 *
 * Precisa ser flex: os rotulos sao <Text>, que renderiza span inline, e num
 * div comum "Comentarios" e "Nenhum comentario ainda." saem grudados.
 */
const Wrapper = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    // Sem alinhamento cruzado de proposito: os filhos precisam esticar — a
    // SortRow alinha os icones a direita e os comentarios ocupam a largura.
  },
});

const SortRow = styled("div", {
  base: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "var(--gap-xs)",
    paddingBlock: "var(--gap-sm)",
  },
});

const Composer = styled("div", {
  base: {
    padding: "var(--gap-md) 0",
  },
});

/**
 * Box for writing a comment or a reply.
 *
 * Same Markdown editor and preview as the post composer, so what you type in
 * a comment behaves like what you type in a post.
 */
function Box(props: {
  label: string;
  action: string;
  autoFocus?: boolean;
  /** Prefill, for editing an existing comment */
  initialValue?: string;
  /** Shown next to the submit button when the box can be dismissed */
  onCancel?: () => void;
  onSend: (body: string, attachments?: string[]) => void;
}) {
  const { showError } = useModals();
  const client = useClient();
  const instance = useInstance();

  const [draft, setDraft] = createSignal(props.initialValue ?? "");

  const attachments = createAttachments({
    maxSize: () => instance.limits().file_upload_size_limits.attachments,
    maxCount: () => instance.limits().message_attachments,
  });

  /** Submit whatever is typed, if anything */
  async function send() {
    const body = draft().trim();
    if (!body) return;

    try {
      const ids = await attachments.upload(client(), instance.mediaUrl);
      props.onSend(body, ids.length ? ids : undefined);
      attachments.clear();
      setDraft("");
    } catch (error) {
      showError(error);
    }
  }

  return (
    <Composer>
      <MarkdownComposer
        value={draft()}
        onChange={setDraft}
        placeholder={props.label}
        autoFocus={props.autoFocus}
        attachments={attachments}
        actions={
          <>
            <Show when={props.onCancel}>
              <Button
                size="xs"
                variant="text"
                onPress={() => props.onCancel!()}
              >
                <Trans>Cancel</Trans>
              </Button>
            </Show>
            <Button size="xs" variant="filled" onPress={send}>
              {props.action}
            </Button>
          </>
        }
      />
    </Composer>
  );
}

/**
 * A single comment and everything below it
 */
function CommentNode(props: { node: Node; onChange: () => void }) {
  const { t } = useLingui();
  const { showError } = useModals();
  const [replying, setReplying] = createSignal(false);
  const [editing, setEditing] = createSignal(false);

  /**
   * Settle an action started in an event handler.
   *
   * Takes the Promise rather than a thunk so the reactive read stays inside
   * the handler, where Solid can track it.
   */
  const settle = (p: Promise<unknown>) =>
    // onChange is a plain callback prop read after the request settles;
    // there is nothing reactive to track here.
    // eslint-disable-next-line solid/reactivity
    p.then(() => props.onChange()).catch(showError);

  return (
    <div>
      <Entry>
        <Head>
          <Avatar
            size={20}
            src={props.node.comment.author?.avatarURL}
            fallback={
              props.node.comment.author?.displayName ??
              props.node.comment.authorId
            }
          />
          <Text class="label" size="small">
            {props.node.comment.author?.displayName ??
              props.node.comment.authorId}
          </Text>
          <Text class="label" size="small">
            ·
          </Text>
          <Text class="label" size="small">
            <Time value={props.node.comment.createdAt} format="relative" />
          </Text>
        </Head>

        <Show
          when={!props.node.comment.deleted}
          fallback={
            <Tombstone>
              <Text class="body" size="small">
                <Trans>[comment deleted]</Trans>
              </Text>
            </Tombstone>
          }
        >
          <Show
            when={!editing()}
            fallback={
              <Box
                autoFocus
                label={t`Edit comment`}
                action={t`Save`}
                initialValue={props.node.comment.content}
                onSend={(body) =>
                  settle(
                    props.node.comment
                      .edit({ content: body })
                      .then(() => setEditing(false)),
                  )
                }
              />
            }
          >
            <Content>
              <Markdown content={props.node.comment.content} allowInlineMedia />
            </Content>
          </Show>
        </Show>

        <ForumAttachments
          files={props.node.comment.attachments}
          content={props.node.comment.content}
        />

        <Row gap="xs" align>
          <Button
            size="xs"
            variant={props.node.comment.upvoted ? "tonal" : "text"}
            aria-label={t`Upvote`}
            onPress={() => settle(props.node.comment.toggleUpvote())}
          >
            <Row gap="xs" align>
              <Symbol size={14}>arrow_upward</Symbol>
              {props.node.comment.score}
            </Row>
          </Button>

          <IconButton
            size="xs"
            aria-label={t`Reply`}
            use:floating={{
              tooltip: { placement: "top", content: t`Reply` },
            }}
            onPress={() => setReplying(!replying())}
          >
            <Symbol size={16}>reply</Symbol>
          </IconButton>

          <Show
            when={
              (props.node.comment.canEdit || props.node.comment.canDelete) &&
              !props.node.comment.deleted
            }
          >
            <IconButton
              size="xs"
              aria-label={t`Comment actions`}
              use:floating={{
                contextMenuHandler: "click",
                contextMenu: () => (
                  <ContextMenu>
                    <Show when={props.node.comment.canEdit}>
                      <ContextMenuButton
                        icon={MdEdit}
                        onClick={() => setEditing(!editing())}
                      >
                        <Show when={editing()} fallback={<Trans>Edit</Trans>}>
                          <Trans>Cancel</Trans>
                        </Show>
                      </ContextMenuButton>
                    </Show>
                    <Show when={props.node.comment.canDelete}>
                      <ContextMenuButton
                        icon={MdDelete}
                        destructive
                        onClick={() => settle(props.node.comment.delete())}
                      >
                        <Trans>Delete</Trans>
                      </ContextMenuButton>
                    </Show>
                  </ContextMenu>
                ),
              }}
            >
              <Symbol size={16}>more_horiz</Symbol>
            </IconButton>
          </Show>
        </Row>

        <Show when={replying()}>
          <Box
            autoFocus
            label={t`Write a reply`}
            action={t`Send`}
            onSend={(body, attachments) =>
              settle(
                props.node.comment
                  .reply(body, attachments)
                  .then(() => setReplying(false)),
              )
            }
          />
        </Show>
      </Entry>

      <Show when={props.node.children.length}>
        <Branch>
          <For each={props.node.children}>
            {(child) => <CommentNode node={child} onChange={props.onChange} />}
          </For>
        </Branch>
      </Show>
    </div>
  );
}

/**
 * Comment thread for a forum post
 */
export function ForumThread(props: {
  post: ForumPost;
  onChange?: () => void;
  /** Whether the top level composer is open; owned by the post view */
  composing?: boolean;
  onCloseComposer?: () => void;
  /**
   * Reports who took part in the thread.
   *
   * The thread already fetches the comment authors, so the post view reuses
   * them instead of issuing a second request just to count participants.
   */
  onParticipants?: (users: User[]) => void;
}) {
  const { t } = useLingui();
  const { showError } = useModals();

  const [order, setOrder] = createSignal<"Top" | "Old" | "New">("Old");

  /** Sort options as icons; the label doubles as tooltip and accessible name */
  const ORDERS = [
    { id: "Old" as const, icon: "history", label: () => t`Oldest` },
    { id: "New" as const, icon: "schedule", label: () => t`Newest` },
    { id: "Top" as const, icon: "trending_up", label: () => t`Top` },
  ];

  const [thread, { refetch }] = createResource(
    () => ({ post: props.post, order: order() }),
    async ({ post, order }) => {
      try {
        return await post.fetchComments(order);
      } catch (error) {
        showError(error);
        return { comments: [], users: [], members: undefined };
      }
    },
  );

  const tree = () => buildTree(thread()?.comments ?? []);

  createEffect(() => props.onParticipants?.(thread()?.users ?? []));

  /**
   * Refresh the thread, and let the caller refresh the post's comment
   * counter, which lives on the post document rather than in the thread.
   */
  function refresh() {
    refetch();
    props.onChange?.();
  }

  return (
    <Wrapper>
      <SortRow>
        <For each={ORDERS}>
          {(option) => (
            <IconButton
              size="xs"
              variant={order() === option.id ? "tonal" : "standard"}
              aria-label={option.label()}
              use:floating={{
                tooltip: { placement: "top", content: option.label() },
              }}
              onPress={() => setOrder(option.id)}
            >
              <Symbol size={18}>{option.icon}</Symbol>
            </IconButton>
          )}
        </For>
      </SortRow>

      <Text class="title" size="small">
        <Trans>Comments</Trans>
      </Text>

      <Show when={props.post.locked}>
        <Text class="label" size="small">
          <Trans>This post is locked. No new comments.</Trans>
        </Text>
      </Show>

      <Show when={props.composing && !props.post.locked}>
        <Box
          autoFocus
          label={t`Write a comment`}
          action={t`Comment`}
          onCancel={() => props.onCloseComposer?.()}
          onSend={(body, attachments) =>
            props.post
              .comment(body, attachments)
              // Runs after the request; only a refetch and a callback prop.
              // eslint-disable-next-line solid/reactivity
              .then(() => {
                refresh();
                props.onCloseComposer?.();
              })
              .catch(showError)
          }
        />
      </Show>

      <Show
        when={!thread.loading}
        fallback={
          <Text class="label" size="small">
            <Trans>Loading comments…</Trans>
          </Text>
        }
      >
        <Show
          when={tree().length}
          fallback={
            <Text class="label" size="small">
              <Trans>No comments yet.</Trans>
            </Text>
          }
        >
          <For each={tree()}>
            {(node) => <CommentNode node={node} onChange={refresh} />}
          </For>
        </Show>
      </Show>
    </Wrapper>
  );
}
