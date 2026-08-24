import { Show } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { detect } from "detect-browser";
import { BiLogosWindows } from "solid-icons/bi";
import { FaBrandsLinux } from "solid-icons/fa";
import { styled } from "styled-system/jsx";

import MdInfo from "@material-design-icons/svg/outlined/info.svg?component-solid";
import MdInventory2 from "@material-design-icons/svg/outlined/inventory_2.svg?component-solid";

import {
  DOWNLOAD_LINUX,
  DOWNLOAD_RELEASES,
  DOWNLOAD_WINDOWS,
} from "@revolt/common";
import { CategoryButton, Column, Text, iconSize } from "@revolt/ui";

const RELEASES = DOWNLOAD_RELEASES;
const WINDOWS = DOWNLOAD_WINDOWS;
const LINUX = DOWNLOAD_LINUX;

/**
 * Sistema operacional de quem está acessando, para destacar o instalador certo.
 *
 * Usa o `detect-browser`, que o projeto já carrega para nomear as sessões de
 * login, em vez de mais uma regex de user agent espalhada pelo código.
 */
function sistema(): "windows" | "linux" | "outro" {
  const os = detect()?.os ?? "";
  if (/windows/i.test(os)) return "windows";
  // "Linux" cobre as distribuições; Android também casa em /linux/i, e para
  // ele nenhum dos dois instaladores serve.
  if (/android/i.test(os)) return "outro";
  if (/linux/i.test(os)) return "linux";
  return "outro";
}

/**
 * Baixar o aplicativo para computador
 */
export function DownloadApp() {
  const atual = sistema();

  const windows = (
    <Link href={WINDOWS} target="_blank" rel="noopener noreferrer">
      <CategoryButton
        action="external"
        ignoreClick
        icon={<BiLogosWindows size={22} />}
        description={
          <Show
            when={atual === "windows"}
            fallback={<Trans>Instalador para Windows 10 e 11, 64 bits.</Trans>}
          >
            <Trans>Recomendado para o seu computador. Windows, 64 bits.</Trans>
          </Show>
        }
      >
        <Trans>Baixar para Windows</Trans>
      </CategoryButton>
    </Link>
  );

  const linux = (
    <Link href={LINUX} target="_blank" rel="noopener noreferrer">
      <CategoryButton
        action="external"
        ignoreClick
        icon={<FaBrandsLinux size={22} />}
        description={
          <Show
            when={atual === "linux"}
            fallback={
              <Trans>
                Pacote .deb para Debian e Ubuntu, 64 bits. Instale com: sudo apt
                install ./stoat-amd64.deb
              </Trans>
            }
          >
            <Trans>
              Recomendado para o seu computador. Instale com: sudo apt install
              ./stoat-amd64.deb
            </Trans>
          </Show>
        }
      >
        <Trans>Baixar para Linux</Trans>
      </CategoryButton>
    </Link>
  );

  return (
    <Column gap="lg">
      <Show when={window.native}>
        <Aviso>
          <MdInfo {...iconSize(18)} />
          <Text class="body" size="small">
            <Trans>
              Você já está usando o aplicativo para computador. Os links abaixo
              servem para instalar em outra máquina.
            </Trans>
          </Text>
        </Aviso>
      </Show>

      <CategoryButton.Group>
        {/* O instalador do sistema detectado vem primeiro. */}
        <Show when={atual === "linux"} fallback={windows}>
          {linux}
        </Show>
        <Show when={atual === "linux"} fallback={linux}>
          {windows}
        </Show>
      </CategoryButton.Group>

      <CategoryButton.Group>
        <Link href={RELEASES} target="_blank" rel="noopener noreferrer">
          <CategoryButton
            action="external"
            ignoreClick
            icon={<MdInventory2 {...iconSize(22)} />}
            description={
              <Trans>
                Todas as versões publicadas, incluindo as anteriores.
              </Trans>
            }
          >
            <Trans>Ver todas as versões</Trans>
          </CategoryButton>
        </Link>
      </CategoryButton.Group>
    </Column>
  );
}

/**
 * Link sem decoração
 */
const Link = styled("a", {
  base: {
    textDecoration: "none",
  },
});

/**
 * Aviso discreto no topo
 */
const Aviso = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    color: "var(--md-sys-color-on-surface-variant)",
    background: "var(--md-sys-color-surface-container-high)",
  },
});
