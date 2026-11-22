import { JSXElement } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { useMutation } from "@tanstack/solid-query";

import { Dialog, DialogProps } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Confirma uma acao destrutiva antes de executa-la.
 *
 * Generico, para nao criar um modal por tipo de coisa apagavel (o
 * `DeleteSound` e o modelo). O botao fica travado enquanto a acao roda, entao
 * dois cliques nao mandam duas requisicoes.
 */
export function ConfirmarModal(
  props: DialogProps & Modals & { type: "confirmar" },
) {
  const { showError } = useModals();

  const executar = useMutation(() => ({
    mutationFn: () => props.acao(),
    onError: showError,
    onSuccess: () => props.onClose(),
  }));

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={props.titulo}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: (props.rotulo as JSXElement) ?? <Trans>Delete</Trans>,
          onClick: () => executar.mutateAsync(),
        },
      ]}
      isDisabled={executar.isPending}
    >
      {props.texto as JSXElement}
    </Dialog>
  );
}
