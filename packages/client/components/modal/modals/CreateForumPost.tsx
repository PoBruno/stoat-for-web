import { createFormControl, createFormGroup } from "solid-forms";
import { For, Show, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";

import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import {
  Button,
  Column,
  Dialog,
  DialogProps,
  Form2,
  Row,
  Text,
} from "@revolt/ui";

import { useModals } from "..";
import { createAttachments } from "../../../src/interface/channels/forum/attachments";
import { MarkdownComposer } from "../../../src/interface/channels/forum/MarkdownComposer";
import { Modals } from "../types";

/**
 * Modal to create a new forum post
 */
export function CreateForumPostModal(
  props: DialogProps & Modals & { type: "create_forum_post" },
) {
  const { t } = useLingui();
  const client = useClient();
  const instance = useInstance();
  const { showError } = useModals();
  const [body, setBody] = createSignal("");
  const [tags, setTags] = createSignal<string[]>([]);

  const attachments = createAttachments({
    maxSize: () => instance.limits().file_upload_size_limits.attachments,
    maxCount: () => instance.limits().message_attachments,
  });

  const group = createFormGroup({
    title: createFormControl("", { required: true }),
  });

  async function onSubmit() {
    try {
      const ids = await attachments.upload(client(), instance.mediaUrl);

      const post = await props.channel.createPost({
        title: group.controls.title.value,
        content: body().trim() || undefined,
        attachments: ids.length ? ids : undefined,
        tags: tags(),
      });

      attachments.clear();

      // Close before the callback: the callback navigates, and navigating
      // while the dialog is still mounted leaves its scrim behind, swallowing
      // every click on the page underneath.
      props.onClose();
      props.cb?.(post);
    } catch (error) {
      showError(error);
    }
  }

  const submit = Form2.useSubmitHandler(group, onSubmit);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>New post</Trans>}
      actions={[
        { text: <Trans>Close</Trans> },
        {
          text: <Trans>Publish</Trans>,
          onClick: () => {
            onSubmit();
            return false;
          },
          isDisabled: !Form2.canSubmit(group),
        },
      ]}
      isDisabled={group.isPending}
    >
      <form onSubmit={submit}>
        <Column>
          <Form2.TextField
            minlength={1}
            maxlength={128}
            counter
            name="title"
            control={group.controls.title}
            label={t`Title`}
          />
          <Show when={props.channel.forumTags.length}>
            <Row gap="sm" wrap align>
              <Text class="label" size="small">
                <Trans>Tags</Trans>
              </Text>
              <For each={props.channel.forumTags}>
                {(tag) => (
                  <Button
                    size="xs"
                    group="standard"
                    variant={tags().includes(tag.id) ? "tonal" : "outlined"}
                    groupActive={tags().includes(tag.id)}
                    onPress={() =>
                      setTags((current) =>
                        current.includes(tag.id)
                          ? current.filter((t) => t !== tag.id)
                          : [...current, tag.id],
                      )
                    }
                  >
                    {tag.name}
                  </Button>
                )}
              </For>
            </Row>
          </Show>

          <MarkdownComposer
            value={body()}
            onChange={setBody}
            placeholder={t`Write your post…`}
            attachments={attachments}
            onRejected={(names) =>
              showError(
                new Error(
                  t`These files are too large or over the limit: ${names.join(", ")}`,
                ),
              )
            }
          />
        </Column>
      </form>
    </Dialog>
  );
}
