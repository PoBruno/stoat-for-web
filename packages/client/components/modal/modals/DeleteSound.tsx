import { Trans } from "@lingui/solid/macro";
import { useMutation } from "@tanstack/solid-query";

import { Dialog, DialogProps } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to delete a soundboard sound
 */
export function DeleteSoundModal(
  props: DialogProps & Modals & { type: "delete_sound" },
) {
  const { showError } = useModals();

  const deleteSound = useMutation(() => ({
    mutationFn: () => props.sound.delete(),
    onError: showError,
    onSuccess: () => props.onClose(),
  }));

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Delete {props.sound.name}?</Trans>}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: <Trans>Delete</Trans>,
          onClick: () => deleteSound.mutateAsync(),
        },
      ]}
      isDisabled={deleteSound.isPending}
    >
      <Trans>Once it's deleted, there's no going back.</Trans>
    </Dialog>
  );
}
