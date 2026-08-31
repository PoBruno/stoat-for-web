import { Show } from "solid-js";

import { Trans } from "@lingui/solid/macro";

import { podeCriarServidor } from "@revolt/client";
import { Dialog, DialogProps } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to create or join a server
 */
export function CreateOrJoinServerModal(
  props: DialogProps & Modals & { type: "create_or_join_server" },
) {
  const { openModal } = useModals();

  // Instâncias podem restringir a criação de servidores a alguns usuários
  // (`restrict_server_creation`). Sem esta checagem o caminho do `+` na barra
  // lateral oferecia "Criar" a todo mundo e só o servidor recusava, depois de
  // a pessoa ter escolhido nome e ícone — descobrir a regra por um erro,
  // tendo trabalho antes.
  //
  // Aqui esconder é o certo, e não explicar: ninguém se autoriza a criar
  // servidor, então não há nada que a pessoa possa fazer com a explicação.
  // Entrar num servidor continua possível, e é por isso que o botão do `+`
  // permanece.
  const criarServidor = () => podeCriarServidor(props.client);

  const acaoCriar = {
    text: "Create",
    onClick: () => {
      openModal({ type: "create_server", client: props.client });
    },
  };

  const acaoEntrar = {
    text: "Join",
    onClick: () => {
      openModal({ type: "join_server", client: props.client });
    },
  };

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={criarServidor() ? "Create or join a server" : "Join a server"}
      actions={criarServidor() ? [acaoCriar, acaoEntrar] : [acaoEntrar]}
    >
      <Show
        when={criarServidor()}
        fallback={<Trans>Would you like to join an existing server?</Trans>}
      >
        <Trans>
          Would you like to create a new server or join an existing one?
        </Trans>
      </Show>
    </Dialog>
  );
}
