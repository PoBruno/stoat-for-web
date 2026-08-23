import { For, Show } from "solid-js";

import { File } from "stoat.js";
import { styled } from "styled-system/jsx";

import { FileInfo, SizedContent } from "@revolt/ui";

const Grid = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    marginTop: "var(--gap-sm)",
  },
});

const Image = styled("img", {
  base: {
    maxWidth: "100%",
    borderRadius: "var(--borderRadius-sm)",
    cursor: "pointer",
  },
});

/**
 * Attachments on a post or comment.
 *
 * Deliberately not the messaging `Attachment` component: that one calls
 * `useMessage()` and only works inside a message tree.
 */
export function ForumAttachments(props: { files?: File[]; content?: string }) {
  /**
   * Files not already shown inside the text.
   *
   * An image pasted mid-text is both an attachment (so the post claims it and
   * it survives the dangling-file sweep) and a markdown link. Without this it
   * would render twice.
   */
  const shown = () =>
    (props.files ?? []).filter((file) => !props.content?.includes(file.id));

  return (
    <Show when={shown().length}>
      <Grid>
        <For each={shown()}>
          {(file) => (
            <Show
              when={file.metadata.type === "Image"}
              fallback={<FileInfo file={file} />}
            >
              <SizedContent
                width={(file.metadata as { width: number }).width}
                height={(file.metadata as { height: number }).height}
              >
                <Image
                  loading="lazy"
                  src={file.createFileURL()}
                  alt={file.filename}
                  onClick={() => window.open(file.originalUrl, "_blank")}
                />
              </SizedContent>
            </Show>
          )}
        </For>
      </Grid>
    </Show>
  );
}
