import { getVirtmic } from "./virtualMic";

export { useVoice, VoiceContext, ehParticipanteOculto } from "./state";

export { InRoom } from "./components/InRoom";
export { RoomAudioManager } from "./components/RoomAudioManager";
export { stoatSinkName } from "./virtualMic";

const originalMediaCall = navigator.mediaDevices.getDisplayMedia;

navigator.mediaDevices.getDisplayMedia = async function (opts) {
  const stream: MediaStream = await originalMediaCall.call(this, opts);

  // A resolucao NAO e mais forcada aqui.
  //
  // Este trecho travava toda captura em 640x480 a 5 quadros por segundo,
  // apesar do comentario antigo dizer 720p. Quem escolhesse 1080p60 nas
  // configuracoes recebia uma apresentacao de slides, e nao havia como
  // descobrir por que: a escolha era aceita e silenciosamente descartada.
  //
  // Quem manda na qualidade e `applyConstraints` logo depois de a faixa
  // existir (components/rtc/state.tsx), que le a preferencia de verdade.

  // Em Wayland o audio do compartilhamento nao vem junto com o video: o
  // portal entrega so a tela. O que traz o som e um microfone virtual criado
  // pelo processo principal, ligado as saidas de audio do sistema.
  if (opts?.audio && (await window.native?.isWayland?.())) {
    const id = await getVirtmic();

    console.debug("Virt mic acquired:", id);

    if (id) {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: {
            exact: id,
          },
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 2,
          sampleRate: 48000,
          sampleSize: 16,
        },
      });

      stream.getAudioTracks().forEach((t) => stream.removeTrack(t));
      stream.addTrack(audio.getAudioTracks()[0]);
    }
  }

  return stream;
};
