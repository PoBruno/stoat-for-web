import { useLingui } from "@lingui/solid/macro";

import { ponteDeAtualizacao, useAtualizacaoDoDesktop } from "./atualizacao";

/**
 * Texto e clique da linha "Atualizações" do desktop.
 *
 * Usado nas configurações do desktop e no card da Home, para os dois
 * dizerem a mesma coisa com as mesmas traduções.
 */
export function useLinhaDeAtualizacao() {
  const { t } = useLingui();
  const estado = useAtualizacaoDoDesktop();

  /** Status da atualizacao em uma frase */
  function status() {
    const atual = estado();
    switch (atual.fase) {
      case "procurando":
        return t`Checking for updates…`;
      case "baixando":
        return t`Downloading version ${atual.versao} (${atual.progresso}%)`;
      case "pronta":
        return t`Version ${atual.versao} is ready. Click to restart and update.`;
      case "erro":
        return t`Could not check for updates. Click to try again.`;
      case "ociosa":
        return t`Updates install automatically. Click to check now.`;
      default:
        return t`This version does not update by itself. Download the latest from the Stoat website.`;
    }
  }

  /** Instala se a versao nova ja baixou; senao procura agora */
  function acao() {
    const ponte = ponteDeAtualizacao();
    if (!ponte) return;
    if (estado().fase === "pronta") void ponte.instalar();
    else void ponte.procurar();
  }

  return { estado, status, acao };
}
