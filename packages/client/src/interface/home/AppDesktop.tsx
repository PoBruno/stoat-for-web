import { Show } from "solid-js";

import { Trans } from "@lingui/solid/macro";

import { useLinhaDeAtualizacao } from "@revolt/app/interface/desktop/linhaDeAtualizacao";
import { CategoryButton, Symbol } from "@revolt/ui";

/**
 * Aviso de atualização do app desktop, na Home.
 *
 * Só aparece quando há versão nova de verdade: baixando ou pronta para
 * instalar. O app já procura sozinho (ao abrir, a cada 30 min e ao acordar o
 * PC, ver for-desktop/src/native/atualizacao.ts), então um card fixo de
 * "clique para procurar" só servia para responder "você já está na versão
 * mais recente". Procurar à mão continua na bandeja e em Configurações >
 * Desktop.
 */
export function AppDesktop() {
  const { estado, status, acao } = useLinhaDeAtualizacao();

  const fase = () => estado().fase;

  return (
    <Show when={fase() === "baixando" || fase() === "pronta"}>
      <CategoryButton
        onClick={acao}
        description={status()}
        icon={
          <Symbol size={22}>
            {fase() === "pronta" ? "download" : "downloading"}
          </Symbol>
        }
      >
        <Show
          when={fase() === "pronta"}
          fallback={<Trans>Downloading an update</Trans>}
        >
          <Trans>Update ready</Trans>
        </Show>
      </CategoryButton>
    </Show>
  );
}
