import { For, JSX, Show, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { Markdown } from "@revolt/markdown";
import {
  Button,
  CompositionMediaPicker,
  FileDropAnywhereCollector,
  FilePasteCollector,
  Row,
  Symbol,
  Text,
  humanFileSize,
} from "@revolt/ui";
import type { EditorCommands } from "@revolt/ui/components/features/texteditor/TextEditor2";
import { TextEditor2 } from "@revolt/ui/components/features/texteditor/TextEditor2";

import { Attachments } from "./attachments";

const Frame = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    borderRadius: "var(--borderRadius-md)",
    border: "1px solid var(--md-sys-color-outline-variant)",
    background: "var(--md-sys-color-surface-container-high)",
    overflow: "hidden",
  },
});

/** Heading levels offered by the toolbar */
const HEADINGS = [1, 2, 3, 4] as const;

const Toolbar = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--gap-xs)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderBottom: "1px solid var(--md-sys-color-outline-variant)",
  },
});

const Tool = styled("button", {
  base: {
    display: "grid",
    placeItems: "center",
    minWidth: "30px",
    height: "30px",
    paddingInline: "var(--gap-s)",
    borderRadius: "var(--borderRadius-sm)",
    color: "var(--md-sys-color-on-surface-variant)",
    transition: "all var(--transitions-fast)",

    _hover: {
      background: "var(--md-sys-color-surface-container-highest)",
      color: "var(--md-sys-color-on-surface)",
    },
  },
});

const Sep = styled("span", {
  base: {
    width: "1px",
    height: "18px",
    marginInline: "var(--gap-xs)",
    background: "var(--md-sys-color-outline-variant)",
  },
});

const Tabs = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderBottom: "1px solid var(--md-sys-color-outline-variant)",
  },
});

/**
 * The editor and the preview swap by visibility, not by mounting: unmounting
 * CodeMirror would throw away undo history and cursor position every time the
 * tab is toggled.
 */
const Pane = styled("div", {
  base: {
    padding: "var(--gap-md)",
    minHeight: "96px",
  },
  variants: {
    hidden: {
      true: { display: "none" },
    },
  },
});

const Preview = styled("div", {
  base: {
    minHeight: "96px",
    color: "var(--md-sys-color-on-surface)",
    overflowWrap: "anywhere",
  },
});

const Faded = styled("div", {
  base: {
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

/** Actions live inside the frame so they line up with it, not beside it */
const Footer = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "var(--gap-md)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderTop: "1px solid var(--md-sys-color-outline-variant)",
  },
});

const Strip = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    borderTop: "1px solid var(--md-sys-color-outline-variant)",
  },
});

const Thumb = styled("div", {
  base: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-xs)",
    width: "112px",
  },
});

const ThumbImage = styled("img", {
  base: {
    width: "112px",
    height: "80px",
    objectFit: "cover",
    borderRadius: "var(--borderRadius-sm)",
    background: "var(--md-sys-color-surface-container-highest)",
  },
});

const ThumbBlank = styled("div", {
  base: {
    display: "grid",
    placeItems: "center",
    width: "112px",
    height: "80px",
    borderRadius: "var(--borderRadius-sm)",
    background: "var(--md-sys-color-surface-container-highest)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Remove = styled("button", {
  base: {
    position: "absolute",
    top: "var(--gap-sm)",
    right: "var(--gap-sm)",
    display: "grid",
    placeItems: "center",
    width: "22px",
    height: "22px",
    borderRadius: "var(--borderRadius-full)",
    color: "var(--md-sys-color-on-error)",
    background: "var(--md-sys-color-error)",
  },
});

const Name = styled("span", {
  base: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const HiddenInput = styled("input", {
  base: {
    position: "absolute",
    width: "1px",
    height: "1px",
    opacity: 0,
    pointerEvents: "none",
  },
});

/**
 * Markdown editor with a preview tab and attachments.
 *
 * The editor itself is the app's CodeMirror one, so highlighting and
 * autocomplete match the message box. `onComplete` is deliberately not passed:
 * in a forum, Enter is a new line, not submit.
 */
export function MarkdownComposer(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  attachments?: Attachments;
  onRejected?: (names: string[]) => void;
  /** Rendered in a bar inside the frame, e.g. Cancel / Comment */
  actions?: JSX.Element;
}) {
  const { t } = useLingui();
  const client = useClient();
  const instance = useInstance();
  const [previewing, setPreviewing] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;
  let cmd: EditorCommands | undefined;

  // Snapshot, never a live binding: `TextEditor2` rewrites its whole document
  // whenever `initialValue` changes, and its `onChange` trims. Feeding the
  // value back would delete a trailing space the moment you typed one, which
  // silently broke every toolbar command ("## " became "##").
  // eslint-disable-next-line solid/reactivity
  const initialValue = [props.value] as const;

  /**
   * Put an image into the text where the cursor is.
   *
   * It is also staged as an attachment: a file that only exists as a markdown
   * URL is never claimed by the post, and `prune_dangling_files` deletes it an
   * hour later.
   */
  async function insertInline(file: File) {
    if (!props.attachments) return;

    const rejected = props.attachments.add([file]);
    if (rejected.length) {
      props.onRejected?.(rejected);
      return;
    }

    setUploading(true);
    try {
      const ids = await props.attachments.upload(client(), instance.mediaUrl);
      const id = ids[ids.length - 1];
      const alt = file.name.replace(/[[\]]/g, "");
      cmd?.insert(`\n![${alt}](${instance.mediaUrl}/attachments/${id})\n`);
    } catch (error) {
      props.onRejected?.([file.name]);
      console.error(error);
    } finally {
      setUploading(false);
    }
  }

  /** Files arriving by paste or drop: images go inline, the rest attach */
  function onIncoming(files: File[]) {
    const inline = files.filter((f) => f.type.startsWith("image/"));
    const rest = files.filter((f) => !f.type.startsWith("image/"));

    for (const image of inline) void insertInline(image);
    if (rest.length) onFiles(rest);
  }

  /** Stage files, reporting anything the limits rejected */
  function onFiles(files: File[]) {
    const rejected = props.attachments?.add(files) ?? [];
    if (rejected.length) props.onRejected?.(rejected);
  }

  return (
    <Frame>
      <Tabs>
        <Row gap="sm" align>
          <Button
            size="xs"
            group="standard"
            variant={previewing() ? "text" : "tonal"}
            groupActive={!previewing()}
            onPress={() => setPreviewing(false)}
          >
            <Trans>Write</Trans>
          </Button>
          <Button
            size="xs"
            group="standard"
            variant={previewing() ? "tonal" : "text"}
            groupActive={previewing()}
            onPress={() => setPreviewing(true)}
          >
            <Trans>Preview</Trans>
          </Button>
        </Row>

        <Show when={props.attachments}>
          <Button
            size="xs"
            variant="text"
            aria-label={t`Attach files`}
            isDisabled={!props.attachments!.canAdd()}
            onPress={() => fileInput?.click()}
          >
            <Row gap="xs" align>
              <Symbol size={16}>attach_file</Symbol>
              <Trans>Attach</Trans>
            </Row>
          </Button>
        </Show>
      </Tabs>

      <Show when={!previewing()}>
        <Toolbar>
          <For each={HEADINGS}>
            {(level) => (
              <Tool
                type="button"
                aria-label={t`Heading ${level}`}
                title={t`Heading ${level}`}
                onClick={() => cmd?.prefixLines("#".repeat(level) + " ")}
              >
                <Text class="label" size="small">
                  H{level}
                </Text>
              </Tool>
            )}
          </For>

          <Sep />

          <Tool
            type="button"
            aria-label={t`Bold`}
            onClick={() => cmd?.wrap("**")}
          >
            <Symbol size={16}>format_bold</Symbol>
          </Tool>
          <Tool
            type="button"
            aria-label={t`Italic`}
            onClick={() => cmd?.wrap("*")}
          >
            <Symbol size={16}>format_italic</Symbol>
          </Tool>
          <Tool
            type="button"
            aria-label={t`Strikethrough`}
            onClick={() => cmd?.wrap("~~")}
          >
            <Symbol size={16}>strikethrough_s</Symbol>
          </Tool>
          <Tool
            type="button"
            aria-label={t`Code`}
            onClick={() => cmd?.wrap("`")}
          >
            <Symbol size={16}>code</Symbol>
          </Tool>

          <Sep />

          <Tool
            type="button"
            aria-label={t`Bulleted list`}
            onClick={() => cmd?.prefixLines("- ")}
          >
            <Symbol size={16}>format_list_bulleted</Symbol>
          </Tool>
          <Tool
            type="button"
            aria-label={t`Numbered list`}
            onClick={() => cmd?.prefixLines((i) => `${i}. `)}
          >
            <Symbol size={16}>format_list_numbered</Symbol>
          </Tool>
          <Tool
            type="button"
            aria-label={t`Quote`}
            onClick={() => cmd?.prefixLines("> ")}
          >
            <Symbol size={16}>format_quote</Symbol>
          </Tool>
          <Tool
            type="button"
            aria-label={t`Code block`}
            onClick={() => cmd?.wrap("\n```\n", "\n```\n")}
          >
            <Symbol size={16}>data_object</Symbol>
          </Tool>

          <Sep />

          <Tool
            type="button"
            aria-label={t`Link`}
            onClick={() => cmd?.wrap("[", "](url)")}
          >
            <Symbol size={16}>link</Symbol>
          </Tool>
          <Show when={props.attachments}>
            <Tool
              type="button"
              aria-label={t`Insert image`}
              onClick={() => fileInput?.click()}
            >
              <Symbol size={16}>image</Symbol>
            </Tool>
          </Show>

          <CompositionMediaPicker
            onMessage={() => {}}
            onTextReplacement={(text) => cmd?.insert(text)}
          >
            {(trigger) => (
              <>
                <Tool
                  type="button"
                  aria-label={t`Emoji`}
                  onClick={trigger.onClickEmoji}
                >
                  <Symbol size={16}>mood</Symbol>
                </Tool>
                <div ref={trigger.ref} />
              </>
            )}
          </CompositionMediaPicker>

          <Show when={uploading()}>
            <Text class="label" size="small">
              <Trans>Uploading…</Trans>
            </Text>
          </Show>
        </Toolbar>
      </Show>

      <Pane hidden={previewing()}>
        <TextEditor2
          autoFocus={props.autoFocus}
          placeholder={props.placeholder}
          initialValue={initialValue}
          onChange={props.onChange}
          commands={(c) => (cmd = c)}
        />
      </Pane>

      <Pane hidden={!previewing()}>
        <Preview>
          <Show
            when={props.value.trim()}
            fallback={
              <Faded>
                <Text class="body" size="small">
                  <Trans>Nothing to preview yet.</Trans>
                </Text>
              </Faded>
            }
          >
            <Markdown content={props.value} allowInlineMedia />
          </Show>
        </Preview>
      </Pane>

      <Show when={props.attachments?.files().length}>
        <Strip>
          <For each={props.attachments!.files()}>
            {(entry) => (
              <Thumb>
                <Show
                  when={entry.dataUri}
                  fallback={
                    <ThumbBlank>
                      <Symbol size={28}>description</Symbol>
                    </ThumbBlank>
                  }
                >
                  <ThumbImage src={entry.dataUri} alt={entry.file.name} />
                </Show>
                <Remove
                  type="button"
                  aria-label={t`Remove attachment`}
                  onClick={() => props.attachments!.remove(entry.id)}
                >
                  <Symbol size={14}>close</Symbol>
                </Remove>
                <Name>
                  <Text class="label" size="small">
                    {entry.file.name}
                  </Text>
                </Name>
                <Name>
                  <Text class="label" size="small">
                    {humanFileSize(entry.file.size)}
                  </Text>
                </Name>
              </Thumb>
            )}
          </For>
        </Strip>
      </Show>

      <Show when={props.actions}>
        <Footer>{props.actions}</Footer>
      </Show>

      <Show when={props.attachments}>
        <HiddenInput
          ref={fileInput}
          type="file"
          multiple
          aria-label={t`Attach files`}
          onChange={(e) => {
            const picked = e.currentTarget.files;
            if (picked) onIncoming([...picked]);
            e.currentTarget.value = "";
          }}
        />
        <FilePasteCollector onFiles={onIncoming} />
        <FileDropAnywhereCollector onFiles={onIncoming} allowInModal />
      </Show>
    </Frame>
  );
}
