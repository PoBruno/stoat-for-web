import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { Channel } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";
import { Button, Checkbox, Column, Row, Symbol, Text } from "@revolt/ui";

const SORTS = ["Hot", "New", "Top", "Active"] as const;

const TagRow = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-sm)",
    background: "var(--md-sys-color-surface-container-high)",
  },
});

const Field = styled("input", {
  base: {
    flexGrow: 1,
    minWidth: 0,
    height: "40px",
    paddingInline: "var(--gap-l)",
    borderRadius: "var(--borderRadius-full)",
    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container-high)",
    border: "1px solid transparent",

    _placeholder: { color: "var(--md-sys-color-on-surface-variant)" },
    _focus: { borderColor: "var(--md-sys-color-primary)" },
  },
});

const Section = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    marginBlockEnd: "var(--gap-xl)",
  },
});

/**
 * Turn a tag name into a stable id.
 *
 * Ids are what posts store, so they have to survive a rename: generated once
 * from the name, never recomputed afterwards.
 */
function toId(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || `tag-${Date.now().toString(36)}`;
}

/**
 * Forum-only channel settings: tags, default ordering, tag requirement.
 */
export function ForumSettings(props: { channel: Channel }) {
  const { t } = useLingui();
  const { showError } = useModals();
  const [draft, setDraft] = createSignal("");

  const forum = createMemo(() => props.channel.forum);
  const tags = () => props.channel.forumTags;

  /** Push the whole forum config; the route takes a full replacement */
  function save(changes: {
    available_tags?: { id: string; name: string }[];
    default_sort?: (typeof SORTS)[number];
    require_tag?: boolean;
  }) {
    props.channel.editForum(changes).catch(showError);
  }

  function addTag() {
    const name = draft().trim();
    if (!name) return;

    const id = toId(name);
    if (tags().some((tag) => tag.id === id)) {
      showError(new Error(t`There is already a tag called ${name}.`));
      return;
    }

    save({
      available_tags: [
        ...tags().map((x) => ({ id: x.id, name: x.name })),
        { id, name },
      ],
    });
    setDraft("");
  }

  return (
    <Column gap="lg">
      <Section>
        <Text class="title" size="medium">
          <Trans>Tags</Trans>
        </Text>
        <Text class="label" size="small">
          <Trans>
            Tags let people file a post under a topic and filter the feed by it.
          </Trans>
        </Text>

        <Row gap="md" align>
          <Field
            type="text"
            value={draft()}
            aria-label={t`New tag name`}
            placeholder={t`New tag name`}
            maxlength={32}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button size="xs" variant="filled" onPress={addTag}>
            <Trans>Add tag</Trans>
          </Button>
        </Row>

        <Show
          when={tags().length}
          fallback={
            <Text class="label" size="small">
              <Trans>No tags yet.</Trans>
            </Text>
          }
        >
          <For each={tags()}>
            {(tag) => (
              <TagRow>
                <Text class="body" size="small">
                  {tag.name}
                </Text>
                <Text class="label" size="small">
                  {tag.id}
                </Text>
                <Button
                  size="xs"
                  variant="text"
                  aria-label={t`Remove tag ${tag.name}`}
                  onPress={() =>
                    save({
                      available_tags: tags()
                        .filter((x) => x.id !== tag.id)
                        .map((x) => ({ id: x.id, name: x.name })),
                    })
                  }
                >
                  <Row gap="xs" align>
                    <Symbol size={16}>close</Symbol>
                    <Trans>Remove</Trans>
                  </Row>
                </Button>
              </TagRow>
            )}
          </For>
        </Show>
      </Section>

      <Section>
        <Text class="title" size="medium">
          <Trans>Default sorting</Trans>
        </Text>
        <Text class="label" size="small">
          <Trans>How the feed is ordered when someone opens this forum.</Trans>
        </Text>
        <Row gap="sm" wrap>
          <For each={SORTS}>
            {(option) => (
              <Button
                size="xs"
                group="standard"
                variant={forum()?.defaultSort === option ? "tonal" : "outlined"}
                groupActive={forum()?.defaultSort === option}
                onPress={() => save({ default_sort: option })}
              >
                {option}
              </Button>
            )}
          </For>
        </Row>
      </Section>

      <Section>
        <Text class="title" size="medium">
          <Trans>Require a tag</Trans>
        </Text>
        <Row gap="md" align>
          <Checkbox
            checked={forum()?.requireTag ?? false}
            onChange={(event) =>
              save({ require_tag: event.currentTarget.checked })
            }
          />
          <Text class="label" size="small">
            <Trans>Every new post must carry at least one tag.</Trans>
          </Text>
        </Row>
      </Section>
    </Column>
  );
}
