import { JSXElement } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { Dialog, DialogProps, Symbol } from "@revolt/ui";


import { Modals } from "../types";

const Texto = styled("div", {
  base: {
    whiteSpace: "pre-wrap",
  },
});

/**
 * Explica por que algo não pôde ser feito.
 *
 * Existe porque esconder um controle indisponível não ensina nada: a pessoa
 * procura um botão que não está lá e conclui que o recurso não existe. Um
 * controle presente que, ao ser tocado, diz o motivo e o que fazer, resolve
 * sozinho a maioria dos casos.
 *
 * É um aviso, não um erro — daí o ícone e o título próprios. Reaproveitar o
 * modal de erro faria uma condição normal parecer defeito.
 */
export function AvisoModal(props: DialogProps & Modals & { type: "aviso" }) {
  return (
    <Dialog
      icon={<Symbol size={24}>info</Symbol>}
      show={props.show}
      onClose={props.onClose}
      title={props.titulo}
      actions={[{ text: <Trans>OK</Trans> }]}
    >
      <Texto>{props.texto as JSXElement}</Texto>
    </Dialog>
  );
}
