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

export const DOWNLOAD_LINUX = `${DOWNLOAD_RELEASES}/latest/download/stoat-amd64.deb`;
