import { createRoot, onCleanup } from "solid-js";

import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";

import { type ClienteMusicBox, criarCliente } from "./estado";

/** Um estado por canal, com quantos componentes o estao usando. */
type Registro = {
  cliente: ClienteMusicBox;
  usos: number;
  relogio?: ReturnType<typeof setInterval>;
  descartar: () => void;
};

const registros = new Map<string, Registro>();

/**
 * O MusicBox de um canal, compartilhado por quem estiver na tela.
 *
 * O painel e o mini player da barra da chamada mostram a mesma fila. Cada um
 * com o seu cliente seriam duas sondagens a cada 2 s, e os dois podiam
 * discordar por um instante (pausa num, ainda tocando no outro). Aqui ha um
 * estado so por canal: o primeiro que monta liga a sondagem, o ultimo que
 * desmonta desliga.
 *
 * O estado vive num `createRoot` proprio porque pertence ao canal, e nao ao
 * componente que chegou primeiro: se ele desmontasse, levaria junto o estado
 * que o outro ainda esta mostrando.
 *
 * Chamar dentro de um componente (usa `onCleanup`). O canal nao e reativo:
 * quem troca de canal remonta (`<Show keyed>`).
 */
export function usarMusicBox(channelId: string): ClienteMusicBox {
  const client = useClient();
  const instance = useInstance();

  let registro = registros.get(channelId);
  if (!registro) {
    registro = createRoot((descartar) => ({
      cliente: criarCliente(
        instance.apiUrl,
        () => client().authenticationHeader,
        () => channelId,
      ),
      usos: 0,
      descartar,
    }));
    registros.set(channelId, registro);
  }

  const atual = registro;
  atual.usos++;
  if (atual.usos === 1) {
    void atual.cliente.recarregar();
    // Um evento pelo WebSocket seria melhor e e o destino disto, mas custa
    // uma variante nova atravessando backend, SDK e cliente.
    atual.relogio = setInterval(() => void atual.cliente.recarregar(), 2000);
  }

  onCleanup(() => {
    atual.usos--;
    if (atual.usos > 0) return;
    clearInterval(atual.relogio);
    atual.descartar();
    registros.delete(channelId);
  });

  return atual.cliente;
}
