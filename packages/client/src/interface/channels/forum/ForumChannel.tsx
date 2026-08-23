import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
} from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { ForumPost } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";
import { useLocation, useNavigate } from "@revolt/routing";
import {
  Avatar,
  Button,
  Header,
  Row,
  Symbol,
  Text,
  Time,
  main,
} from "@revolt/ui";

import { ChannelHeader } from "../ChannelHeader";
import { ChannelPageProps } from "../ChannelPage";

import { ForumPostView } from "./ForumPostView";

/** Matches the post id in `/channel/<id>/posts/<id>` */
const RE_POST = /\/posts\/([A-Z\d]{26})/;

const SORTS = ["Hot", "New", "Top", "Active"] as const;

/**
 * Toolbar above the feed
 */
const Toolbar = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--gap-md)",
    padding: "var(--gap-lg) var(--gap-lg) var(--gap-md)",
    flexShrink: 0,
  },
});

/**
 * Scrollable list of posts
 */
const Feed = styled("div", {
  base: {
    minHeight: 0,
    flexGrow: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    padding: "0 var(--gap-lg) var(--gap-lg)",
  },
});

/**
 * One post in the feed. The whole card is the link into the post.
 */
const Card = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-l)",
    padding: "var(--gap-l)",
    cursor: "pointer",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-low)",
    transition: "background var(--transitions-fast)",

    _hover: {
      background: "var(--md-sys-color-surface-container)",
    },
  },
});

/**
 * Vote gutter down the left of a card
 */
const Votes = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--gap-xs)",
    minWidth: "32px",
    flexShrink: 0,
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Arrow = styled("button", {
  base: {
    display: "grid",
    placeItems: "center",
    width: "28px",
    height: "28px",
    borderRadius: "var(--borderRadius-sm)",
    color: "var(--md-sys-color-on-surface-variant)",
    transition: "all var(--transitions-fast)",

    _hover: {
      background: "var(--md-sys-color-surface-container-highest)",
      color: "var(--md-sys-color-primary)",
    },
  },
  variants: {
    active: {
      true: { color: "var(--md-sys-color-primary)" },
    },
  },
});

const Body = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-xs)",
    minWidth: 0,
    flexGrow: 1,
  },
});

/**
 * Author line and counters under the title
 */
const Meta = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-s)",
    color: "var(--md-sys-color-on-surface-variant)",
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

const TagBar = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-sm)",
    padding: "0 var(--gap-lg) var(--gap-md)",
    flexShrink: 0,
  },
});

const Empty = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-xxl) var(--gap-lg)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

/**
 * Forum channel: a feed of posts, or one post opened.
 *
 * The open post lives in the URL (`.../posts/<id>`) rather than in component
 * state, so it is linkable and the browser back button works.
 */
export function ForumChannel(props: ChannelPageProps) {
  const { t } = useLingui();
  const { showError, openModal } = useModals();
  const navigate = useNavigate();
  const location = useLocation();
  const [sort, setSort] = createSignal<(typeof SORTS)[number]>("Hot");
  const [tag, setTag] = createSignal<string | undefined>();
  const openPostId = createMemo(() => location.pathname.match(RE_POST)?.[1]);

  // Opening the forum marks it read. The ack route takes any id as the read
  // position, so the newest activity id works exactly like a message id does
  // for a text channel.
  createEffect(
    on(
      () => props.channel.forum?.lastActivityId,
      (latest) => {
        if (latest) props.channel.ack(latest, true);
      },
    ),
  );

  const [feed, { refetch }] = createResource(
    () => ({ channel: props.channel, sort: sort(), tag: tag() }),
    async ({ channel, sort, tag }) => {
      try {
        return await channel.fetchPosts({ sort, tag });
      } catch (error) {
        showError(error);
        return { posts: [], users: [], members: undefined };
      }
    },
  );

  /** Posts to show, pinned first, minus anything just deleted */
  const posts = () =>
    [...(feed()?.posts ?? [])]
      .filter((post) => post.$exists)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned)) as ForumPost[];

  const openPost = () => posts().find((post) => post.id === openPostId());

  /** Translated label for a sort option */
  function sortLabel(option: (typeof SORTS)[number]) {
    switch (option) {
      case "Hot":
        return t`Hot`;
      case "New":
        return t`New`;
      case "Top":
        return t`Top`;
      case "Active":
        return t`Active`;
    }
  }

  /** Open the composer, then land on the post that was just written */
  function newPost() {
    openModal({
      type: "create_forum_post",
      channel: props.channel,
      cb: (post) => {
        refetch();
        navigate(post.path);
      },
    });
  }

  return (
    <>
      <Header placement="primary">
        <ChannelHeader channel={props.channel} />
      </Header>
      <main class={main()}>
        <Show
          when={!openPostId()}
          fallback={
            <ForumPostView
              channel={props.channel}
              postId={openPostId()!}
              post={openPost()}
              onBack={() => {
                refetch();
                navigate(props.channel.path);
              }}
            />
          }
        >
          <Toolbar>
            <Row gap="sm" align>
              <For each={SORTS}>
                {(option) => (
                  <Button
                    size="xs"
                    group="standard"
                    variant={sort() === option ? "tonal" : "text"}
                    groupActive={sort() === option}
                    onPress={() => setSort(option)}
                  >
                    {sortLabel(option)}
                  </Button>
                )}
              </For>
            </Row>

            <Show when={props.channel.havePermission("SendMessage")}>
              <Button size="xs" variant="filled" onPress={newPost}>
                <Trans>New post</Trans>
              </Button>
            </Show>
          </Toolbar>

          <Show when={props.channel.forumTags.length}>
            <TagBar>
              <Button
                size="xs"
                group="standard"
                variant={tag() ? "text" : "tonal"}
                groupActive={!tag()}
                onPress={() => setTag(undefined)}
              >
                <Trans>All</Trans>
              </Button>
              <For each={props.channel.forumTags}>
                {(available) => (
                  <Button
                    size="xs"
                    group="standard"
                    variant={tag() === available.id ? "tonal" : "text"}
                    groupActive={tag() === available.id}
                    onPress={() =>
                      setTag(tag() === available.id ? undefined : available.id)
                    }
                  >
                    {available.name}
                  </Button>
                )}
              </For>
            </TagBar>
          </Show>

          <Feed>
            <Show
              when={!feed.loading}
              fallback={
                <Empty>
                  <Text class="body">
                    <Trans>Loading posts…</Trans>
                  </Text>
                </Empty>
              }
            >
              <Show
                when={posts().length}
                fallback={
                  <Empty>
                    <Symbol size={48}>forum</Symbol>
                    <Text class="title" size="medium">
                      <Trans>No posts yet</Trans>
                    </Text>
                    <Text class="body" size="small">
                      <Trans>Be the first to write one.</Trans>
                    </Text>
                    <Show when={props.channel.havePermission("SendMessage")}>
                      <Button size="xs" variant="tonal" onPress={newPost}>
                        <Trans>New post</Trans>
                      </Button>
                    </Show>
                  </Empty>
                }
              >
                <For each={posts()}>
                  {(post) => (
                    <Card
                      onClick={(e: MouseEvent) => {
                        // Solid delegates click, so stopPropagation in the
                        // gutter is not reliable. Check the origin instead.
                        if ((e.target as HTMLElement).closest("[data-vote]")) {
                          return;
                        }
                        navigate(post.path);
                      }}
                    >
                      <Votes data-vote>
                        <Arrow
                          type="button"
                          active={post.upvoted}
                          aria-label={t`Upvote`}
                          onClick={() => post.toggleUpvote().catch(showError)}
                        >
                          <Symbol size={20}>
                            {post.upvoted ? "arrow_upward_alt" : "arrow_upward"}
                          </Symbol>
                        </Arrow>
                        <Text class="label" size="large">
                          {post.score}
                        </Text>
                      </Votes>

                      <Body>
                        <Row gap="sm" align>
                          <Show when={post.pinned}>
                            <Chip>
                              <Symbol size={14}>push_pin</Symbol>
                              <Text class="label" size="small">
                                <Trans>Pinned</Trans>
                              </Text>
                            </Chip>
                          </Show>
                          <Show when={post.locked}>
                            <Chip>
                              <Symbol size={14}>lock</Symbol>
                              <Text class="label" size="small">
                                <Trans>Locked</Trans>
                              </Text>
                            </Chip>
                          </Show>
                          <For each={post.tags}>
                            {(id) => (
                              <Show
                                when={props.channel.forumTags.find(
                                  (t) => t.id === id,
                                )}
                              >
                                {(found) => (
                                  <Chip>
                                    <Text class="label" size="small">
                                      {found().name}
                                    </Text>
                                  </Chip>
                                )}
                              </Show>
                            )}
                          </For>
                        </Row>

                        <Text class="title" size="medium">
                          {post.title}
                        </Text>

                        <Meta>
                          <Avatar
                            size={20}
                            src={post.author?.avatarURL}
                            fallback={post.author?.displayName ?? post.authorId}
                          />
                          <Text class="label" size="small">
                            {post.author?.displayName ?? post.authorId}
                          </Text>
                          <Text class="label" size="small">
                            ·
                          </Text>
                          <Text class="label" size="small">
                            <Time value={post.createdAt} format="relative" />
                          </Text>
                          <Text class="label" size="small">
                            ·
                          </Text>
                          <Row gap="xs" align>
                            <Symbol size={14}>chat_bubble</Symbol>
                            <Text class="label" size="small">
                              {post.commentCount}
                            </Text>
                          </Row>
                        </Meta>
                      </Body>
                    </Card>
                  )}
                </For>
              </Show>
            </Show>
          </Feed>
        </Show>
      </main>
    </>
  );
}
