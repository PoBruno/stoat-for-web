/**
 * Onde os instaladores do aplicativo para computador são publicados.
 *
 * Os arquivos são publicados **sem a versão no nome** de propósito: assim
 * `releases/latest/download/<nome>` continua válido a cada versão nova, e
 * nenhuma tela precisa ser reconstruída só porque saiu um lançamento.
 */
export const DOWNLOAD_RELEASES =
  "https://github.com/PoBruno/stoat-for-desktop/releases";

export const DOWNLOAD_WINDOWS = `${DOWNLOAD_RELEASES}/latest/download/stoat-setup.exe`;

/**
 * Linux tem três formatos porque não há um que sirva a todos.
 *
 * O `.deb` e o `.pkg.tar.zst` instalam de verdade — entram no gerenciador de
 * pacotes, criam atalho e ícone. O AppImage não instala nada: é um executável
 * portátil, e existe para quem não usa nem Debian nem Arch.
 */
export const DOWNLOAD_DEBIAN = `${DOWNLOAD_RELEASES}/latest/download/stoat-amd64.deb`;

export const DOWNLOAD_ARCH = `${DOWNLOAD_RELEASES}/latest/download/stoat-x86_64.pkg.tar.zst`;

export const DOWNLOAD_APPIMAGE = `${DOWNLOAD_RELEASES}/latest/download/stoat-x86_64.AppImage`;

/** Mantido para quem já importava o nome antigo. */
export const DOWNLOAD_LINUX = DOWNLOAD_DEBIAN;
