import { Show } from "solid-js";

import { Trans } from "@lingui/solid/macro";

import { podeCriarServidor } from "@revolt/client";
import { Dialog, DialogProps } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to create a group or server
 */
export function CreateGroupOrServer(
  props: DialogProps & Modals & { type: "create_group_or_server" },
) {
  const { openModal } = useModals();

  // Instâncias podem restringir a criação de servidores a alguns usuários.
  // Oferecer o botão a quem não pode só entrega um erro depois do clique.
  const criarServidor = () => podeCriarServidor(props.client);

  const acaoGrupo = {
    text: "Group",
    onClick: () => {
      openModal({ type: "create_group", client: props.client });
    },
  };

  const acaoServidor = {
    text: "Server",
    onClick: () => {
      openModal({ type: "create_server", client: props.client });
    },
  };

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={criarServidor() ? "Create a group or server" : "Create a group"}
      actions={criarServidor() ? [acaoGrupo, acaoServidor] : [acaoGrupo]}
    >
      <Show
        when={criarServidor()}
        fallback={<Trans>Would you like to create a new group?</Trans>}
      >
        <Trans>Would you like to create a new group or server?</Trans>
      </Show>
    </Dialog>
  );
}
