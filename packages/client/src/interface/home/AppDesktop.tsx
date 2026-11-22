import { Trans } from "@lingui/solid/macro";

import { useLinhaDeAtualizacao } from "@revolt/app/interface/desktop/linhaDeAtualizacao";
import { CategoryButton, Symbol } from "@revolt/ui";

/**
 * Versão do app desktop e estado da atualização, na Home.
 *
 * No navegador o atalho é "Baixar aplicativo"; dentro do app isso não faz
 * sentido, e o que interessa é saber se está em dia (o app se atualiza
 * sozinho desde a v1.9.0). Clicar procura agora ou instala a versão pronta.
 */
export function AppDesktop() {
  const { estado, status, acao } = useLinhaDeAtualizacao();

  return (
    <CategoryButton
      onClick={acao}
      description={status()}
      icon={
        <Symbol size={22}>
          {estado().fase === "pronta" ? "download" : "desktop_windows"}
        </Symbol>
      }
    >
      <Trans>Stoat for Desktop</Trans> v{window.native.versions.desktop()}
    </CategoryButton>
  );
}
