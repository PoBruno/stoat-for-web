import { Show } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { detect } from "detect-browser";
import { BiLogosWindows } from "solid-icons/bi";
import { FaBrandsLinux } from "solid-icons/fa";
import { styled } from "styled-system/jsx";

import MdInfo from "@material-design-icons/svg/outlined/info.svg?component-solid";
import MdInventory2 from "@material-design-icons/svg/outlined/inventory_2.svg?component-solid";
import MdArchive from "@material-design-icons/svg/outlined/archive.svg?component-solid";

import {
  DOWNLOAD_APPIMAGE,
  DOWNLOAD_ARCH,
  DOWNLOAD_DEBIAN,
  DOWNLOAD_RELEASES,
  DOWNLOAD_WINDOWS,
} from "@revolt/common";
import { CategoryButton, Column, Text, iconSize } from "@revolt/ui";

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
  // ele nenhum dos instaladores serve.
  if (/android/i.test(os)) return "outro";
  if (/linux/i.test(os)) return "linux";
  return "outro";
}

/**
 * Baixar o aplicativo para computador
 *
 * Linux aparece em três formatos porque não existe um que sirva a todos. O
 * `.deb` e o `.pkg.tar.zst` entram no gerenciador de pacotes da distribuição;
 * o AppImage não instala nada e existe para quem não usa nenhuma das duas
 * famílias.
 */
export function DownloadApp() {
  const atual = sistema();

  const windows = (
    <Link href={DOWNLOAD_WINDOWS} target="_blank" rel="noopener noreferrer">
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
    <>
      <Link href={DOWNLOAD_DEBIAN} target="_blank" rel="noopener noreferrer">
        <CategoryButton
          action="external"
          ignoreClick
          icon={<FaBrandsLinux size={22} />}
          description={
            <Trans>
              Debian, Ubuntu e derivados. Instale com: sudo apt install
              ./stoat-amd64.deb
            </Trans>
          }
        >
          <Trans>Baixar .deb</Trans>
        </CategoryButton>
      </Link>

      <Link href={DOWNLOAD_ARCH} target="_blank" rel="noopener noreferrer">
        <CategoryButton
          action="external"
          ignoreClick
          icon={<FaBrandsLinux size={22} />}
          description={
            <Trans>
              Arch, CachyOS, Manjaro e EndeavourOS. Instale com: sudo pacman -U
              ./stoat-x86_64.pkg.tar.zst
            </Trans>
          }
        >
          <Trans>Baixar para Arch</Trans>
        </CategoryButton>
      </Link>

      <Link href={DOWNLOAD_APPIMAGE} target="_blank" rel="noopener noreferrer">
        <CategoryButton
          action="external"
          ignoreClick
          icon={<MdArchive {...iconSize(22)} />}
          description={
            <Trans>
              Para as demais distribuições. Não instala nada: dê permissão com
              chmod +x e execute o arquivo.
            </Trans>
          }
        >
          <Trans>Baixar AppImage</Trans>
        </CategoryButton>
      </Link>
    </>
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

      {/* O sistema detectado vem primeiro. */}
      <Show
        when={atual === "linux"}
        fallback={
          <>
            <CategoryButton.Group>{windows}</CategoryButton.Group>
            <CategoryButton.Group>{linux}</CategoryButton.Group>
          </>
        }
      >
        <CategoryButton.Group>{linux}</CategoryButton.Group>
        <CategoryButton.Group>{windows}</CategoryButton.Group>
      </Show>

      <CategoryButton.Group>
        <Link href={DOWNLOAD_RELEASES} target="_blank" rel="noopener noreferrer">
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
