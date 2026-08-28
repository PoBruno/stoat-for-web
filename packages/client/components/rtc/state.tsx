import {
  Accessor,
  batch,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  JSX,
  Setter,
  useContext,
} from "solid-js";
import {
  RoomContext,
  TrackReferenceOrPlaceholder,
  useTracks,
} from "solid-livekit-components";

import {
  LocalAudioTrack,
  LocalTrackPublication,
  Room,
  ScreenSharePresets,
  Track,
  VideoResolution,
} from "livekit-client";
import { Channel } from "stoat.js";

import { SoundController, useSound } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { ModalController, useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import {
  gainForVolumePosition,
  NoiseSuppresionState,
  ScreenShareQualityName,
  Voice as VoiceSettings,
} from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";

import { Device, useDevice } from "@revolt/common";
import { InRoom } from "./components/InRoom";
import { RoomAudioManager } from "./components/RoomAudioManager";
import {
  abrirTempos,
  fecharTempos,
  instalarTempos,
  marcarTempo,
} from "./tempos";
import { VoiceProcessor } from "./VoiceProcessor";

/**
 * Prefixo das identidades que existem na sala mas nao sao pessoas.
 *
 * So aparece quando NAO ha conta de bot configurada para o MusicBox. Com uma
 * conta de verdade, o agente entra com a identidade dela e a interface o
 * desenha com nome e avatar como qualquer outro — nao ha o que esconder.
 *
 * Precisa bater com `MUSICBOX_IDENTITY_PREFIX` no backend
 * (crates/core/database/src/voice/mod.rs).
 */
const PREFIXO_OCULTO = "mb!";

/**
 * Se este participante deve ficar fora da interface.
 *
 * Vale so para o que se MOSTRA. O audio dele continua sendo assinado e
 * tocado — filtrar na reproducao seria silenciar a musica.
 */
export function ehParticipanteOculto(identity: string): boolean {
  return identity.startsWith(PREFIXO_OCULTO);
}

type State =
  | "READY"
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING";

type ScreenShareQuality = {
  name: ScreenShareQualityName;
  resolution: VideoResolution;
  fullName: string;
  /**
   * Dica de conteudo para o encoder.
   *
   * Declarado como uniao, e nao como `string`: o `contentHint` do DOM e
   * `string` solto, mas `ScreenShareCaptureOptions` do livekit exige estes
   * tres valores, e era por isso que a dica so podia ser aplicada tarde, na
   * MediaStreamTrack, em vez de ir junto com a captura.
   */
  contentHint: "motion" | "detail" | "text";
  /**
   * Cabecalho da linha no seletor: `720p`, `1080p`, `Fonte`.
   *
   * Existe porque com oito opcoes a fileira unica de botoes esmagou os
   * rotulos ate virarem colunas de letras. Agrupar por resolucao devolve a
   * estrutura que as qualidades sempre tiveram.
   */
  grupo: string;
  /** Rotulo curto dentro da linha: `30`, `60`, `90`, `120`, `5`. */
  rotulo: string;
};

/**
 * Bits por segundo para cada qualidade de compartilhamento de tela.
 *
 * POR QUE ISTO PRECISA EXISTIR
 *
 * `setScreenShareEnabled(enabled, captureOptions, publishOptions)` tem tres
 * argumentos e o codigo passava dois. Sem o terceiro valem os
 * `publishDefaults` do livekit-client, cujo default de tela e
 * `ScreenSharePresets.h1080fps15.encoding` — **2.5 Mbps a 15 quadros por
 * segundo**, independentemente da opcao escolhida pelo usuario.
 *
 * Medido na maquina do usuario com 720p60 selecionado: captura entregava
 * 1280x720@60, o encoder recebia `maxFramerate: 15`, e a saida ficava entre
 * 14 e 16 fps com `qualityLimitationReason: "none"` em 15 de 15 amostras —
 * ou seja, nem CPU nem banda: o teto configurado.
 *
 * Os valores abaixo sobem menos que proporcionalmente ao numero de quadros
 * porque quadros mais proximos no tempo se parecem mais entre si, e o codec
 * gasta menos bits em cada um. Medido: dobrar de 15 para 60 fps exigiu ~1,6x
 * o bitrate, nao 4x, e o custo de encode POR QUADRO ate caiu.
 */
const BITRATE_TELA: Record<ScreenShareQualityName, number> = {
  /** 720p30 — o mesmo do preset antigo, que ja saturava a 15fps */
  low: 2_500_000,
  /** 720p60 */
  hd60: 4_000_000,
  /** 720p90 */
  hd90: 5_000_000,
  /** 720p120 */
  hd120: 6_000_000,
  /** 1080p30 */
  high: 5_000_000,
  /** 1080p60 */
  fhd60: 8_000_000,
  /** 1080p90 — o mais pesado; e o primeiro candidato a encostar em CPU */
  fhd90: 10_000_000,
  /** resolucao original a 5fps: quase nada muda entre quadros, mas cada um
   *  precisa estar nitido — e conteudo de texto */
  text: 1_500_000,
};

class Voice {
  #settings: VoiceSettings;

  channel: Accessor<Channel | undefined>;
  #setChannel: Setter<Channel | undefined>;

  room: Accessor<Room | undefined>;
  #setRoom: Setter<Room | undefined>;

  #setSoundboardOpen: Setter<boolean>;

  /** Whether the soundboard panel is open */
  soundboardOpen: Accessor<boolean>;

  #setMusicboxOpen: Setter<boolean>;

  /** Whether the MusicBox panel is open */
  musicboxOpen: Accessor<boolean>;

  /** Clipe do soundboard tocando agora, se houver */
  #soundboard?: {
    ctx: AudioContext;
    fonte: AudioBufferSourceNode;
    faixa: LocalAudioTrack;
  };

  vidTracks: Accessor<TrackReferenceOrPlaceholder[]>;

  state: Accessor<State>;
  #setState: Setter<State>;

  deafen: Accessor<boolean>;
  microphone: Accessor<boolean>;

  video: Accessor<boolean>;
  #setVideo: Setter<boolean>;

  screenshare: Accessor<boolean>;
  #setScreenshare: Setter<boolean>;

  fullscreen: Accessor<boolean>;
  #setFullscreen: Setter<boolean>;

  /** Ids of tracks promoted to the stage, in the order they were pinned */
  pinnedIds: Accessor<string[]>;
  #setPinnedIds: Setter<string[]>;

  showBar: Accessor<boolean>;
  #setShowBar: Setter<boolean>;

  private sound: SoundController;
  private device: Device;

  private openModal;
  private config;
  private limits;
  /**
   * Instancia dona do `Client`.
   *
   * Guardada porque a insercao otimista precisa do id do proprio usuario
   * ANTES de a sala do LiveKit existir -- nesse ponto ainda nao ha
   * `room.localParticipant.identity`.
   */
  private instance!: ReturnType<typeof useInstance>;
  private screenShareTracks: Set<string>;
  private voiceProcessor?: VoiceProcessor;

  constructor(
    voiceSettings: VoiceSettings,
    modals: ModalController,
    sound: SoundController,
    device: Device,
  ) {
    this.#settings = voiceSettings;
    this.sound = sound;
    this.device = device;

    const [channel, setChannel] = createSignal<Channel>();
    this.channel = channel;
    this.#setChannel = setChannel;

    const [room, setRoom] = createSignal<Room>();
    this.room = room;
    this.#setRoom = setRoom;

    const [soundboardOpen, setSoundboardOpen] = createSignal(false);
    this.soundboardOpen = soundboardOpen;
    this.#setSoundboardOpen = setSoundboardOpen;

    const [musicboxOpen, setMusicboxOpen] = createSignal(false);
    this.musicboxOpen = musicboxOpen;
    this.#setMusicboxOpen = setMusicboxOpen;

    this.vidTracks = () => [];

    const [state, setState] = createSignal<State>("READY");
    this.state = state;
    this.#setState = setState;

    this.deafen = () => voiceSettings.deafen;
    this.microphone = () => voiceSettings.micOn && !voiceSettings.deafen;

    const [video, setVideo] = createSignal(false);
    this.video = video;
    this.#setVideo = setVideo;

    const [screenshare, setScreenshare] = createSignal(false);
    this.screenshare = screenshare;
    this.#setScreenshare = setScreenshare;

    const [fullscreen, setFullscreen] = createSignal(false);
    this.fullscreen = fullscreen;
    this.#setFullscreen = setFullscreen;

    const [pinnedIds, setPinnedIds] = createSignal<string[]>([]);
    this.pinnedIds = pinnedIds;
    this.#setPinnedIds = setPinnedIds;

    const [showBar, setShowBar] = createSignal(true);
    this.showBar = showBar;
    this.#setShowBar = setShowBar;

    const inst = useInstance();
    this.instance = inst;
    this.config = inst.config;
    this.limits = inst.limits;
    this.openModal = modals.openModal;

    this.screenShareTracks = new Set();

    // Setup settings listeners
    this.settingsListeners();
  }

  // Dynamically set echo cancellation and gain control when the settings are changed
  // These functions are needed to maintain reactivity. Don't ask me why but if you make them not functions it breaks.
  private settingsListeners() {
    const getSettings = () => this.#settings;

    const setEchoCancellation = (echoCancellation: boolean) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.constraints.echoCancellation = echoCancellation;
      }
    };

    const setAutoGainControl = (autoGainControl: boolean) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.constraints.autoGainControl = autoGainControl;
      }
    };

    const setNoiseSuppression = (noiseSuppression: NoiseSuppresionState) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        if (noiseSuppression === "browser") {
          track.constraints.noiseSuppression = true;
          //@ts-expect-error voiceIsolation is not yet standard, but it supported by livekit and most chromium based browsers, including electron.
          track.constraints.voiceIsolation = true;
        } else {
          track.constraints.noiseSuppression = false;
          //@ts-expect-error voiceIsolation is not yet standard, but it supported by livekit and most chromium based browsers, including electron.
          track.constraints.voiceIsolation = false;
        }
      }
    };

    const restartTrack = () => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.restartTrack();
      }
    };

    createEffect(() => {
      setEchoCancellation(getSettings().echoCancellation ?? true);
      setAutoGainControl(getSettings().autoGainControl ?? true);
      setNoiseSuppression(getSettings().noiseSupression ?? "browser");
      restartTrack();
    });
  }

  async connect(channel: Channel, auth?: { url: string; token: string }) {
    this.disconnect();

    abrirTempos("connect", channel.id);

    this.device.setWakeLocked();

    const room = new Room({
      audioCaptureDefaults: {
        deviceId: this.#settings.preferredAudioInputDevice,
        echoCancellation: this.#settings.echoCancellation,
        noiseSuppression: this.#settings.noiseSupression === "browser",
        autoGainControl: this.#settings.autoGainControl,
        voiceIsolation: this.#settings.noiseSupression === "browser",
      },
      audioOutput: {
        deviceId: this.#settings.preferredAudioOutputDevice,
      },
      videoCaptureDefaults: {
        resolution: {
          width: 1280,
          height: 720,
          frameRate: 30,
        },
        deviceId: this.#settings.preferredVideoDevice,
      },
    });

    const todasAsFaixas = useTracks(
      [
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
      ],
      { room, onlySubscribed: false },
    );

    // O agente de musica entra na sala como participante para publicar audio,
    // mas nao e gente: nao tem conta, e a interface o desenharia como
    // "Unknown User" ocupando metade da chamada.
    //
    // Filtrar aqui cobre o palco, a fileira, os fixados e o contador de
    // arranjo, porque todos leem `vidTracks`.
    this.vidTracks = createMemo(() =>
      todasAsFaixas().filter(
        (faixa) => !ehParticipanteOculto(faixa.participant.identity),
      ),
    );

    batch(() => {
      this.#setRoom(room);
      this.#setChannel(channel);
      this.#setState("CONNECTING");
      this.#setVideo(false);
      this.#setScreenshare(false);
    });

    marcarTempo("conectando");

    // Afordancia de dev, no mesmo espirito dos data-* do Call: sem uma porta
    // de entrada para o Room nao da para dirigir a camada de RTC por teste
    // automatizado. Some no build de producao.
    if (import.meta.env.DEV) {
      const w = window as unknown as {
        __stoatRoom?: Room;
        __stoatVoice?: Voice;
      };
      w.__stoatRoom = room;
      w.__stoatVoice = this;
      instalarTempos();
    }

    room.addListener("connected", () => {
      marcarTempo("sala-conectada");
      this.#setState("CONNECTED");

      // Insercao otimista: sem isto voce so aparece na propria chamada
      // quando o `VoiceChannelJoin` volta do servidor, o que exige o webhook
      // do LiveKit chegar no `voice-ingress`. Medido em ~1.7s (p95 2.1s) no
      // dev local, com tudo na mesma maquina.
      this.#reafirmarPresenca(channel, room);
      if (this.speakingPermission)
        room.localParticipant
          .setMicrophoneEnabled(this.#settings.micOn)
          .then((track) => {
            this.#settings.micOn = track != null;
          });
      for (const p of room.remoteParticipants.values()) {
        const screenShareTrack = p.getTrackPublication(
          Track.Source.ScreenShare,
        );
        if (screenShareTrack) {
          this.screenShareTracks.add(screenShareTrack.trackSid);
        }
      }
      // VOCE entrando: duas notas subindo. Distinto de outra pessoa entrando,
      // que e uma nota so e 6 dB mais baixa. Antes os dois casos tocavam o
      // mesmo clipe e nao dava para saber de quem era o evento.
      this.sound.playSound("selfJoinVoice");
    });

    room.addListener("disconnected", () => {
      // Este caminho e SO a queda involuntaria: a saida deliberada passa por
      // `disconnect()`, que remove os listeners antes de derrubar a sala e
      // portanto nunca chega aqui. Tres notas descendo, para nao confundir
      // com voce mesmo saindo.
      this.#setState("DISCONNECTED");
      this.sound.playSound("voiceDisconnected");

      // A lista tambem precisa parar de mostrar voce: o `VoiceChannelLeave`
      // de verdade so vem pelo webhook do LiveKit e pode demorar dezenas de
      // segundos.
      const meuId = this.instance.client?.user?.id;
      if (meuId) channel.optimisticVoiceLeave(meuId);
    });

    room.addListener("localTrackPublished", (pub) => {
      if (pub.audioTrack && pub.audioTrack.source === Track.Source.Microphone) {
        if (!pub.audioTrack.getProcessor()) {
          pub.audioTrack?.setProcessor(
            (this.voiceProcessor = new VoiceProcessor(this.#settings)),
          );
        }
        // No `connected` o microfone ainda nao foi publicado, entao a
        // insercao otimista nasce com `isPublishing: false` -- que e o que
        // desenha `mic_off` na sidebar. Reafirmar aqui e o que corrige o
        // "aparece mudo por padrao" (stoatchat/for-desktop#95).
        this.#reafirmarPresenca(channel, room);
      }
    });

    room.addListener("localTrackUnpublished", () =>
      this.#reafirmarPresenca(channel, room),
    );

    room.addListener("trackMuted", (_pub, participante) => {
      if (participante === room.localParticipant)
        this.#reafirmarPresenca(channel, room);
    });

    room.addListener("trackUnmuted", (_pub, participante) => {
      if (participante === room.localParticipant)
        this.#reafirmarPresenca(channel, room);
    });

    room.addListener("participantConnected", (participante) => {
      // O MusicBox entra e sai da sala conforme a fila anda. Anunciá-lo com
      // som de chegada faria a chamada apitar a cada troca de faixa, e ele
      // nem aparece na lista de pessoas — seria um som sem dono visível.
      if (ehParticipanteOculto(participante.identity)) return;
      this.sound.playSound("userJoinVoice");
    });

    room.addListener("participantDisconnected", (participante) => {
      if (ehParticipanteOculto(participante.identity)) return;
      this.sound.playSound("userLeaveVoice");
    });

    room.addListener("trackPublished", (pub, participant) => {
      if (pub.source === Track.Source.ScreenShare) {
        pub.once("subscribed", (track) => {
          // Play the sound once playback starts, which might be quite a bit after subscription
          // as it starts paused for the screen share settings modal.
          track.once("videoPlaybackStarted", () => {
            this.sound.playSound("streamStart");
            if (track.sid) {
              this.screenShareTracks.add(track.sid);
            }

            // Promote the share to the stage - that is almost always what you
            // want to look at, and it composes with shares already pinned
            // instead of replacing them.
            //
            // Done here rather than on `trackPublished` because a share is
            // published muted (paused for the quality modal) and a muted
            // screen share renders nothing, which would leave the stage blank.
            const id = `${Track.Source.ScreenShare}_${participant.sid}`;
            this.#setPinnedIds((ids) =>
              ids.includes(id) ? ids : [...ids, id],
            );
          });
        });
      }
    });

    room.addListener("trackUnpublished", (unpub) => {
      if (this.screenShareTracks.has(unpub.trackSid)) {
        this.sound.playSound("streamEnd");
        this.screenShareTracks.delete(unpub.trackSid);
      }
    });

    // Gather latency
    //
    // Escolher o no mais proximo so faz sentido quando ha mais de um. Com um
    // no — o caso de qualquer instancia self-hosted pequena, inclusive esta —
    // isto e um round-trip de rede inteiro para decidir entre uma opcao, e ele
    // acontece ANTES de pedir o token, bloqueando a entrada. Medido em 3ms
    // local mas 314ms na primeira chamada (DNS/TLS frios); atras de um CDN
    // seria pior.
    const nos = this.config.features.livekit.nodes;
    const selected =
      nos.length === 1
        ? nos[0].name
        : await Promise.any(
            nos.map(async (node) => {
              // fetch() only accepts http(s); map the websocket URL onto it.
              // Anchored per-scheme so plain `ws://` (non-TLS self-hosted
              // instances) is handled too - a bare .replace("wss", "https")
              // leaves `ws://` untouched and fetch() then throws "URL scheme
              // is not supported".
              const probeUrl = node.public_url
                .replace(/^wss:/i, "https:")
                .replace(/^ws:/i, "http:");

              return fetch(probeUrl).then(() => {
                return node.name;
              });
            }),
          );

    marcarTempo("sondagem");

    if (!auth) {
      auth = await channel.joinCall(selected);
    }

    marcarTempo("token");

    // Insercao otimista, AQUI e nao no evento `connected`.
    //
    // O `connected` dispara junto com o fim de `room.connect()`, que a
    // medicao mostrou custar ~1.75s sozinho (p95 2.1s) mesmo com tudo na
    // mesma maquina -- inserir la nao adiantaria nada. O token ja chegou em
    // ~13ms, e a partir daqui a entrada e um fato: ou conecta, ou o catch
    // abaixo desfaz.
    const meuId = this.instance.client?.user?.id;
    if (meuId) channel.optimisticVoiceJoin(meuId, this.#vaiPublicar(room));

    try {
      await room.connect(auth.url, auth.token, {
        autoSubscribe: false,
      });
    } catch (e) {
      // Nao deixar a lista mentir: se a conexao falhou, voce nao esta la.
      if (meuId) channel.optimisticVoiceLeave(meuId);
      throw e;
    }

    marcarTempo("fim-connect");
    fecharTempos();
  }

  /**
   * Garante que o proprio usuario esteja na lista de participantes do canal.
   *
   * Chamado ao conectar e sempre que o microfone muda, por dois motivos:
   *
   * 1. **Aparecer na hora.** A lista so recebe voce quando o
   *    `VoiceChannelJoin` chega pelo WebSocket, no fim de uma cadeia de cinco
   *    saltos (browser -> LiveKit -> webhook -> voice-ingress -> Redis ->
   *    bonfire -> WS).
   * 2. **Nao ser expulso por um evento atrasado.** O `VoiceChannelLeave` de
   *    uma sessao anterior pode chegar ate ~28s depois. Se voce reentrou
   *    nesse meio tempo, o tratador do SDK apaga voce da lista sem checar
   *    nada (`events/v1.ts:1067`). Reafirmar enquanto conectado desfaz isso.
   */
  #reafirmarPresenca(channel: Channel, room: Room) {
    const meuId =
      this.instance.client?.user?.id ?? room.localParticipant?.identity;
    if (!meuId) return;
    channel.optimisticVoiceJoin(meuId, this.#vaiPublicar(room));
  }

  /**
   * Se este usuario deve constar como publicando o microfone.
   *
   * Enquanto a publicacao nao existe, vale a INTENCAO (a preferencia do
   * usuario mais a permissao de falar). Isto e o que corrige o icone de
   * microfone mudo fantasma: `room.connect()` leva ~1.75s, e ate o
   * `localTrackPublished` chegar a lista desenhava `mic_off` para quem nao
   * tinha mutado nada. Medido em 2079ms de mentira antes da correcao.
   * Ver `stoatchat/for-desktop#95`.
   *
   * Depois que a publicacao existe, ela e a verdade — inclusive quando o
   * usuario muta, que e o caso em que a lista PRECISA dizer mudo.
   */
  #vaiPublicar(room: Room): boolean {
    const pub = room.localParticipant?.getTrackPublication(
      Track.Source.Microphone,
    );
    if (pub) return !pub.isMuted;
    return !!this.speakingPermission && !!this.#settings.micOn;
  }

  disconnect() {
    this.device.releaseWakeLock();
    try {
      const room = this.room();
      if (!room) return;

      abrirTempos("disconnect", this.channel()?.id);

      // Remocao otimista. Nao existe rota REST de leave: a saida so e
      // conhecida quando o LiveKit dispara `participant_left` para o
      // `voice-ingress`. Medido entre 15ms e 28 SEGUNDOS -- e nesse intervalo
      // voce continua desenhado na chamada de onde acabou de sair, com o
      // icone de microfone mudo (porque `isPublishing` volta a nascer false).
      const canalQueSai = this.channel();
      const meuId = room.localParticipant?.identity;
      if (canalQueSai && meuId) canalQueSai.optimisticVoiceLeave(meuId);

      room.removeAllListeners();
      room.disconnect();

      batch(() => {
        this.#setState("READY");
        this.#setRoom();
        this.#setChannel();
        this.#setFullscreen(false);
        this.vidTracks = () => [];
      });

      this.screenShareTracks = new Set();

      // VOCE saindo: duas notas descendo.
      this.sound.playSound("selfLeaveVoice");

      marcarTempo("fim-disconnect");
      fecharTempos();
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleDeafen(fromMute?: boolean) {
    try {
      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setMicrophoneEnabled(
        (this.#settings.micOn || !!fromMute) &&
          !room.localParticipant.isMicrophoneEnabled,
      );

      this.#settings.deafen = !this.#settings.deafen;
      if (fromMute) {
        this.#settings.micOn = room.localParticipant.isMicrophoneEnabled;
      }
      if (this.#settings.deafen) {
        this.sound.playSound("deafen");
      } else {
        this.sound.playSound("undeafen");
      }
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleMute() {
    if (this.#settings.deafen) {
      this.toggleDeafen(true);
      return;
    }
    try {
      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setMicrophoneEnabled(
        !room.localParticipant.isMicrophoneEnabled,
      );

      this.#settings.micOn = room.localParticipant.isMicrophoneEnabled;

      if (this.#settings.micOn) {
        this.sound.playSound("unmute");
      } else {
        this.sound.playSound("mute");
      }
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleCamera() {
    try {
      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setCameraEnabled(
        !room.localParticipant.isCameraEnabled,
      );

      this.#setVideo(room.localParticipant.isCameraEnabled);
    } catch (e) {
      this.onErr(e);
    }
  }

  /**
   * Get the enabled screen share qualities. "low" will always be enabled.
   * Each screen share quality is checked against the limit if the limit is available on the client.
   *
   * The server only limits resolution and aspect ratio, never framerate, so the
   * 60FPS variants are gated by the same resolution check as their 30FPS twin.
   *
   * As opcoes de 90 e 120 fps existem para quem tem monitor de alta taxa. Numa
   * tela de 60 Hz elas nao quebram nada: `frameRate: { ideal, max }` e um
   * pedido, e a captura entrega o que o painel produzir -- 60. Ninguem recebe
   * quadro que a tela nao desenhou, e ninguem fica pior por pedir mais.
   *
   * TODO: Translate the fullNames here, I can't figure out how to do it.
   *
   * @returns A partial record of ScreenShareQualityName to ScreenShareQuality. Will always contain "low" quality.
   */
  getEnabledScreenShareQualities(): Partial<
    Record<ScreenShareQualityName, ScreenShareQuality>
  > {
    /** Monta uma qualidade a partir de um preset, trocando so o framerate. */
    const emFps = (
      name: ScreenShareQualityName,
      base: VideoResolution,
      frameRate: number,
      grupo: string,
    ): ScreenShareQuality => ({
      name,
      resolution: { ...base, frameRate },
      fullName: `${grupo} ${frameRate}FPS`,
      contentHint: "motion",
      grupo,
      rotulo: String(frameRate),
    });

    const r720 = ScreenSharePresets.h720fps30.resolution;
    const r1080 = ScreenSharePresets.h1080fps30.resolution;

    // Always enable low
    const qualities: Partial<
      Record<ScreenShareQualityName, ScreenShareQuality>
    > = {
      low: emFps("low", r720, 30, "720p"),
      hd60: emFps("hd60", r720, 60, "720p"),
      hd90: emFps("hd90", r720, 90, "720p"),
      hd120: emFps("hd120", r720, 120, "720p"),
    };

    const limit = this.limits().video_resolution;

    if (
      (limit[0] === 0 || limit[0] >= 1920) &&
      (limit[1] === 0 || limit[1] >= 1080)
    ) {
      qualities.high = emFps("high", r1080, 30, "1080p");
      qualities.fhd60 = emFps("fhd60", r1080, 60, "1080p");
      qualities.fhd90 = emFps("fhd90", r1080, 90, "1080p");

      // Copy rather than mutate: ScreenSharePresets is a module-level object
      // shared with livekit-client, and the upstream code was writing into it.
      const originalResolution = {
        ...ScreenSharePresets.original.resolution,
        frameRate: 5,
        aspectRatio: 0,
        width: limit[0],
        height: limit[1],
      };

      // If both resolutions are limited, set aspect ratio
      if (originalResolution.height !== 0 && originalResolution.width !== 0) {
        originalResolution.aspectRatio =
          originalResolution.width / originalResolution.height;
      }

      qualities.text = {
        name: "text",
        resolution: originalResolution,
        fullName: `Source 5FPS`,
        contentHint: "text",
        grupo: "Fonte",
        rotulo: "5",
      };
    }

    return qualities;
  }

  /**
   * Reaplica bitrate, framerate e preferencia de degradacao no sender.
   *
   * A publicacao ja aconteceu quando o modal de qualidade abre, entao trocar
   * de opcao la so mudava a captura. Sem isto, escolher 1080p60 num usuario
   * cuja preferencia salva era 720p30 entregava 1080p60 capturado dentro de
   * um envelope de 720p30.
   *
   * As camadas de simulcast tem bitrates proporcionais entre si; a proporcao
   * e preservada em vez de igualar todas ao teto.
   */
  async #reaplicarEncoding(
    videoTrack: { sender?: RTCRtpSender },
    qualidade: ScreenShareQuality,
  ) {
    const sender = videoTrack.sender;
    if (!sender?.getParameters) return;

    try {
      const parametros = sender.getParameters();
      if (!parametros.encodings?.length) return;

      const opcoes = this.#opcoesDePublicacao(qualidade);
      parametros.degradationPreference = opcoes.degradationPreference;

      const teto = opcoes.screenShareEncoding.maxBitrate;
      const maior =
        Math.max(...parametros.encodings.map((e) => e.maxBitrate ?? 0)) || teto;

      for (const camada of parametros.encodings) {
        camada.maxFramerate = opcoes.screenShareEncoding.maxFramerate;
        camada.maxBitrate = Math.round(
          ((camada.maxBitrate ?? maior) / maior) * teto,
        );
      }

      await sender.setParameters(parametros);
    } catch (erro) {
      // Nao derruba o compartilhamento por causa disto: o stream continua
      // valendo com o envelope da publicacao inicial.
      console.warn("[tela] nao consegui reaplicar o encoding:", erro);
    }
  }

  /**
   * Opcoes de PUBLICACAO para uma qualidade de tela.
   *
   * O terceiro argumento de `setScreenShareEnabled`, que nao era passado.
   *
   * `degradationPreference` merece atencao: o default do livekit para tela e
   * `'maintain-resolution'` (`getDefaultDegradationPreference`), que derruba
   * QUADROS para preservar nitidez. Para jogo e video e o oposto do desejado
   * — quem escolheu 60fps quer fluidez, e perder um pouco de nitidez num
   * quadro em movimento rapido nem se percebe. Para `text`, que e conteudo
   * parado onde a nitidez e tudo, mantemos o comportamento original.
   */
  #opcoesDePublicacao(qualidade: ScreenShareQuality) {
    return {
      screenShareEncoding: {
        maxFramerate: qualidade.resolution.frameRate,
        maxBitrate: BITRATE_TELA[qualidade.name],
      },
      degradationPreference:
        qualidade.contentHint === "text"
          ? ("maintain-resolution" as const)
          : ("maintain-framerate" as const),
    };
  }

  async toggleScreenshare() {
    const room = this.room();
    if (!room) throw "invalid state";

    if (this.screenshare()) {
      await room.localParticipant.setScreenShareEnabled(false);

      this.#setScreenshare(room.localParticipant.isScreenShareEnabled);

      this.sound.playSound("streamEnd");
    } else {
      const qualities = this.getEnabledScreenShareQualities();
      let screenPickerQualityName: ScreenShareQualityName | undefined;
      let screenPickerAudio: boolean | undefined;

      // Register the modal on screen picker handler if it exists
      if (window.native && window.native.onceScreenPicker) {
        window.native.onceScreenPicker((sources) => {
          this.openModal({
            type: "screen_share_picker",
            onCancel: () => {
              window.native.screenPickerCallback(-1, false);
            },
            callback: (
              idx: number,
              qualityName: ScreenShareQualityName,
              audio: boolean,
            ) => {
              window.native.screenPickerCallback(idx, audio);
              screenPickerQualityName = qualityName;
              screenPickerAudio = audio;
            },
            sources: sources,
            qualities: Object.keys(qualities).map((k) => {
              const v = qualities[k as ScreenShareQualityName]!;
              return {
                name: k,
                fullName: v.fullName,
                grupo: v.grupo,
                rotulo: v.rotulo,
              };
            }),
          });
        });
      }

      try {
        const qualidadeInicial =
          qualities[this.#settings.screenShareQuality || "low"] ??
          qualities.low!;

        const localTrack = await room.localParticipant.setScreenShareEnabled(
          true,
          {
            resolution: qualidadeInicial.resolution,
            // Na CAPTURA, nao depois da publicacao. Setar `contentHint` na
            // MediaStreamTrack apos a negociacao chega tarde para a escolha
            // inicial do encoder — e no caminho em que o modal nao abre nao
            // chegava nunca (medido: `contentHint: ""`).
            contentHint: qualidadeInicial.contentHint,
            audio: {
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false,
              voiceIsolation: false,
              restrictOwnAudio: true,
            },
          },
          this.#opcoesDePublicacao(qualidadeInicial),
        );

        const screenAudioTrack = room.localParticipant.getTrackPublication(
          Track.Source.ScreenShareAudio,
        );

        this.#setScreenshare(room.localParticipant.isScreenShareEnabled);

        if (localTrack) {
          // This event is only fired if the screen share is ended by closing the window being streamed.
          // This catches the ending and disables screen sharing on our side. If this weren't here,
          // livekit would still share stream audio after closing the window being streamed.
          localTrack.on("ended", () => {
            this.toggleScreenshare();
            const oldAudioTrack = room.localParticipant.getTrackPublication(
              Track.Source.ScreenShareAudio,
            );
            if (oldAudioTrack && oldAudioTrack.track) {
              room.localParticipant.unpublishTrack(oldAudioTrack.track);
            }
          });

          const callback = async (
            qualityName: ScreenShareQualityName,
            audio: boolean,
          ) => {
            const quality = qualities[qualityName] || qualities.low!;

            if (localTrack.videoTrack) {
              await localTrack.videoTrack.mediaStreamTrack.applyConstraints({
                // `max` sozinho e TETO, nao alvo: o navegador pode entregar
                // qualquer coisa abaixo dele. `ideal` e o que de fato pede os
                // 60. Largura e altura ja passavam os dois; framerate nao.
                frameRate: {
                  ideal: quality.resolution.frameRate,
                  max: quality.resolution.frameRate,
                },
                width:
                  quality.resolution.width === 0
                    ? undefined
                    : {
                        ideal: quality.resolution.width,
                        max: quality.resolution.width,
                      },
                height:
                  quality.resolution.height === 0
                    ? undefined
                    : {
                        // Altura pede ALTURA. Antes pedia a largura como
                        // ideal com a altura como teto — em 1080p isso e
                        // "queria 1920, no maximo 1080", e o resultado ficava
                        // ao gosto do navegador.
                        ideal: quality.resolution.height,
                        max: quality.resolution.height,
                      },
              });
              localTrack.videoTrack.mediaStreamTrack.contentHint =
                quality.contentHint;

              // A publicacao aconteceu com a qualidade das PREFERENCIAS. Se a
              // pessoa escolheu outra no modal, sem isto so a captura mudaria
              // e o encoder ficaria com o bitrate e o framerate da anterior.
              await this.#reaplicarEncoding(localTrack.videoTrack, quality);

              if (!audio && screenAudioTrack?.track) {
                room.localParticipant.unpublishTrack(screenAudioTrack.track);
              }
              this.sound.playSound("streamStart");
            }
          };

          if (screenPickerQualityName) {
            await callback(
              screenPickerQualityName || "low",
              screenPickerAudio || false,
            );
          } else if (
            this.#settings.screenShareQualityAsk &&
            Object.keys(qualities).length > 1
          ) {
            localTrack.pauseUpstream();
            screenAudioTrack?.pauseUpstream();
            this.openModal({
              onCancel: async () => {
                await room.localParticipant.setScreenShareEnabled(false);
                this.#setScreenshare(
                  room.localParticipant.isScreenShareEnabled,
                );
              },
              type: "screen_share_settings",
              trackReference: {
                participant: room.localParticipant,
                publication: localTrack,
                source: Track.Source.ScreenShare,
              },
              qualities: Object.keys(qualities).map((k) => {
                const v = qualities[k as ScreenShareQualityName]!;
                return {
                  name: k,
                  fullName: v.fullName,
                  grupo: v.grupo,
                  rotulo: v.rotulo,
                };
              }),
              audio: !!screenAudioTrack,
              callback: async (qualityName, audio) => {
                await callback(qualityName, audio);
                localTrack.resumeUpstream();
                if (audio) {
                  screenAudioTrack?.resumeUpstream();
                }
              },
            });
          } else {
            // Caminho que NAO EXISTIA. Quando a pessoa marca "nao perguntar de
            // novo", ou quando so ha uma qualidade disponivel, o callback
            // nunca rodava: `applyConstraints` e `contentHint` jamais eram
            // aplicados e o som de inicio nao tocava. Medido: `contentHint`
            // chegando vazio em toda execucao sem modal.
            await callback(
              this.#settings.screenShareQuality || "low",
              this.#settings.screenShareAudio,
            );
          }
        }
      } catch (e) {
        this.onErr(e);
      }
    }
  }

  toggleFullscreen(fullscreen: boolean = !this.fullscreen()) {
    this.#setFullscreen(fullscreen);
  }

  trackId(t: TrackReferenceOrPlaceholder) {
    return `${t.source}_${t.participant.sid}`;
  }

  /**
   * Promote or demote a track from the stage.
   *
   * Multiple tracks may be pinned at once; the order is preserved so the
   * arrangement can treat the first pin as the primary one.
   */
  togglePin(t?: TrackReferenceOrPlaceholder) {
    if (!t) return this.#setPinnedIds([]);

    const id = this.trackId(t);
    this.#setPinnedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  /** Remove every track from the stage */
  clearPins() {
    this.#setPinnedIds([]);
  }

  isPinned(t: TrackReferenceOrPlaceholder) {
    return this.pinnedIds().includes(this.trackId(t));
  }

  /** Tracks currently on the stage, in pin order */
  pinnedTracks(): TrackReferenceOrPlaceholder[] {
    const tracks = this.vidTracks();
    return this.pinnedIds()
      .map((id) => tracks.find((t) => this.trackId(t) === id))
      .filter((t): t is TrackReferenceOrPlaceholder => !!t);
  }

  /** Tracks not on the stage */
  unpinnedTracks(): TrackReferenceOrPlaceholder[] {
    return this.vidTracks().filter((t) => !this.isPinned(t));
  }

  /**
   * Drop pins whose track has gone away (participant left, screen share
   * stopped, ...) so the stage never holds a dangling reference.
   */
  prunePins() {
    const tracks = this.vidTracks();
    this.#setPinnedIds((ids) => {
      const alive = ids.filter((id) =>
        tracks.some((t) => this.trackId(t) === id),
      );
      return alive.length === ids.length ? ids : alive;
    });
  }

  toggleShowBar() {
    this.#setShowBar((s) => !s);
  }

  getConnectedUser(userId: string) {
    return this.room()?.getParticipantByIdentity(userId);
  }

  showCard(channel: Channel) {
    return (
      channel.isVoice &&
      (this.channel()?.id === channel.id ||
        channel.type === "TextChannel" ||
        !!channel.voiceParticipants.size)
    );
  }

  getMicrophoneTrack(): LocalTrackPublication | undefined {
    const track = this.room()?.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    return track;
  }

  get listenPermission() {
    return !!this.channel()?.havePermission("Listen");
  }

  get speakingPermission() {
    return !!this.channel()?.havePermission("Speak");
  }

  get soundboardPermission() {
    return !!this.channel()?.havePermission("UseSoundboard");
  }

  /**
   * Se este usuario pode mexer na musica da chamada.
   *
   * Bit proprio e nao `Connect`: entrar na chamada e mandar na musica que
   * todo mundo ouve sao coisas diferentes.
   */
  get musicboxPermission() {
    return !!this.channel()?.havePermission("UseMusicBox");
  }

  /**
   * Open or close the soundboard panel
   *
   * Fecha o MusicBox ao abrir: os dois ocupam a mesma faixa acima das
   * mensagens, e o MusicBox usa a altura inteira. Deixar os dois abertos
   * espremeria a conversa ate sumir.
   */
  toggleSoundboard() {
    this.#setSoundboardOpen((aberto) => {
      if (!aberto) this.#setMusicboxOpen(false);
      return !aberto;
    });
  }

  /**
   * Open or close the MusicBox panel
   */
  toggleMusicbox() {
    this.#setMusicboxOpen((aberto) => {
      if (!aberto) this.#setSoundboardOpen(false);
      return !aberto;
    });
  }

  /**
   * Whether a soundboard clip can be played right now.
   *
   * Estar num canal nao basta: publicar uma track exige a conexao de verdade
   * estabelecida. Sem isto o botao de tocar aceitava clique e nao acontecia
   * nada, deixando a UI travada no estado "tocando".
   */
  get canPlaySound() {
    return this.state() === "CONNECTED" && this.soundboardPermission;
  }

  /**
   * Play a soundboard clip into the call.
   *
   * The clip goes out as its own LiveKit track rather than being mixed into
   * the microphone. Two reasons: mixing would silence it whenever the user is
   * muted, and it would be mangled by the noise suppression chain, which is
   * tuned for speech and destroys music.
   *
   * @param url Where to fetch the audio from
   * @param onEnded Called once playback finishes
   */
  async playSound(url: string, onEnded?: () => void) {
    const room = this.room();
    if (!room || !this.canPlaySound) {
      // Avisa o chamador de qualquer forma: retornar calado deixava o botao
      // presdo em "parar" para sempre.
      onEnded?.();
      return;
    }

    // Um clipe por vez: publicar dois com a mesma fonte seria recusado, e
    // sobrepor audio no canal e ruim de ouvir de qualquer forma.
    this.stopSound();

    const ctx = new AudioContext();
    const destino = ctx.createMediaStreamDestination();

    const dados = await fetch(url).then((r) => r.arrayBuffer());
    const buffer = await ctx.decodeAudioData(dados);

    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;

    // Sai pela track, no nivel cheio: quem escuta regula do lado de la.
    fonte.connect(destino);

    // E tambem pelos alto-falantes de quem tocou. O LiveKit nao devolve a
    // propria track, entao sem este ramo quem aperta o botao nao ouve nada —
    // e sozinho no canal parece que a feature nao funciona.
    const monitor = ctx.createGain();
    monitor.gain.value = gainForVolumePosition(this.#settings.soundboardVolume);
    fonte.connect(monitor);
    monitor.connect(ctx.destination);

    const faixa = new LocalAudioTrack(destino.stream.getAudioTracks()[0]);
    await room.localParticipant.publishTrack(faixa, {
      source: Track.Source.Unknown,
      name: SOUNDBOARD_TRACK,
      // Musica e efeito nao sao voz: estes tres estragam o clipe.
      dtx: false,
      red: false,
      stopMicTrackOnMute: false,
    });

    this.#soundboard = { ctx, fonte, faixa };

    fonte.onended = () => {
      this.stopSound();
      onEnded?.();
    };

    fonte.start();
  }

  /**
   * Stop whatever the soundboard is playing and unpublish its track.
   */
  stopSound() {
    const atual = this.#soundboard;
    if (!atual) return;
    this.#soundboard = undefined;

    try {
      atual.fonte.onended = null;
      atual.fonte.stop();
    } catch {
      // já havia terminado
    }

    this.room()?.localParticipant.unpublishTrack(atual.faixa);
    atual.faixa.stop();
    void atual.ctx.close();
  }

  private onErr(e: unknown) {
    if ((e as Error).name !== "NotAllowedError")
      this.openModal({ type: "error2", error: e });
  }
}

/**
 * Nome da track do soundboard.
 *
 * O LiveKit nao tem uma `Source` propria para isto, entao a publicacao usa
 * `Unknown` e este nome e o que distingue o clipe de qualquer outra track
 * solta do lado de quem escuta.
 */
export const SOUNDBOARD_TRACK = "soundboard";

const voiceContext = createContext<Voice>(null as unknown as Voice);

/**
 * Mount global voice context and room audio manager
 */
export function VoiceContext(props: { children: JSX.Element }) {
  const state = useState();
  const modals = useModals();
  const sound = useSound();
  const device = useDevice();
  const voice = new Voice(state.voice, modals, sound, device);

  // A afordancia de dev so era instalada dentro de `connect`, entao um teste
  // nao conseguia ENTRAR na chamada pela camada de RTC — `__stoatVoice` nao
  // existia antes da primeira entrada, que era justamente o que ele queria
  // disparar. Instalar aqui resolve o ovo-e-galinha. Some no build de producao.
  if (import.meta.env.DEV) {
    (window as unknown as { __stoatVoice?: Voice }).__stoatVoice = voice;
  }

  return (
    <voiceContext.Provider value={voice}>
      <RoomContext.Provider value={voice.room}>
        <VoiceCallCardContext>{props.children}</VoiceCallCardContext>
        <InRoom>
          <RoomAudioManager />
        </InRoom>
      </RoomContext.Provider>
    </voiceContext.Provider>
  );
}

export const useVoice = () => useContext(voiceContext);
