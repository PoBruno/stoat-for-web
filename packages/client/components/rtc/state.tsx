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
  NoiseSuppresionState,
  ScreenShareQualityName,
  Voice as VoiceSettings,
} from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";

import { Device, useDevice } from "@revolt/common";
import { InRoom } from "./components/InRoom";
import { RoomAudioManager } from "./components/RoomAudioManager";
import { VoiceProcessor } from "./VoiceProcessor";

/**
 * Prefixo das identidades que existem na sala mas nao sao pessoas.
 *
 * Hoje so o agente do MusicBox, que entra para publicar audio e nao tem conta
 * no Stoat. Precisa bater com `MUSICBOX_IDENTITY_PREFIX` no backend
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
  contentHint: string;
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
    }

    room.addListener("connected", () => {
      this.#setState("CONNECTED");
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
      this.sound.playSound("userJoinVoice");
    });

    room.addListener("disconnected", () => this.#setState("DISCONNECTED"));

    room.addListener("localTrackPublished", (pub) => {
      if (pub.audioTrack && pub.audioTrack.source === Track.Source.Microphone) {
        if (!pub.audioTrack.getProcessor()) {
          pub.audioTrack?.setProcessor(
            (this.voiceProcessor = new VoiceProcessor(this.#settings)),
          );
        }
      }
    });

    room.addListener("participantConnected", () => {
      this.sound.playSound("userJoinVoice");
    });

    room.addListener("participantDisconnected", () => {
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
    const selected = await Promise.any(
      this.config.features.livekit.nodes.map(async (node) => {
        // fetch() only accepts http(s); map the websocket URL onto it.
        // Anchored per-scheme so plain `ws://` (non-TLS self-hosted instances)
        // is handled too - a bare .replace("wss", "https") leaves `ws://`
        // untouched and fetch() then throws "URL scheme is not supported".
        const probeUrl = node.public_url
          .replace(/^wss:/i, "https:")
          .replace(/^ws:/i, "http:");

        return fetch(probeUrl).then(() => {
          return node.name;
        });
      }),
    );

    if (!auth) {
      auth = await channel.joinCall(selected);
    }

    await room.connect(auth.url, auth.token, {
      autoSubscribe: false,
    });
  }

  disconnect() {
    this.device.releaseWakeLock();
    try {
      const room = this.room();
      if (!room) return;

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

      this.sound.playSound("userLeaveVoice");
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
   * TODO: Translate the fullNames here, I can't figure out how to do it.
   *
   * @returns A partial record of ScreenShareQualityName to ScreenShareQuality. Will always contain "low" quality.
   */
  getEnabledScreenShareQualities(): Partial<
    Record<ScreenShareQualityName, ScreenShareQuality>
  > {
    // Always enable low
    const qualities: Partial<
      Record<ScreenShareQualityName, ScreenShareQuality>
    > = {
      low: {
        name: "low",
        resolution: ScreenSharePresets.h720fps30.resolution,
        fullName: `720p 30FPS`,
        contentHint: "motion",
      },
      hd60: {
        name: "hd60",
        resolution: {
          ...ScreenSharePresets.h720fps30.resolution,
          frameRate: 60,
        },
        fullName: `720p 60FPS`,
        contentHint: "motion",
      },
    };

    const limit = this.limits().video_resolution;

    if (
      (limit[0] === 0 || limit[0] >= 1920) &&
      (limit[1] === 0 || limit[1] >= 1080)
    ) {
      qualities.high = {
        name: "high",
        resolution: ScreenSharePresets.h1080fps30.resolution,
        fullName: `1080p 30FPS`,
        contentHint: "motion",
      };

      qualities.fhd60 = {
        name: "fhd60",
        resolution: {
          ...ScreenSharePresets.h1080fps30.resolution,
          frameRate: 60,
        },
        fullName: `1080p 60FPS`,
        contentHint: "motion",
      };

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
      };
    }

    return qualities;
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
              return { name: k, fullName: v.fullName };
            }),
          });
        });
      }

      try {
        const localTrack = await room.localParticipant.setScreenShareEnabled(
          true,
          {
            resolution:
              this.getEnabledScreenShareQualities()[
                this.#settings.screenShareQuality || "low"
              ]?.resolution,
            audio: {
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false,
              voiceIsolation: false,
              restrictOwnAudio: true,
            },
          },
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
                frameRate: { max: quality.resolution.frameRate },
                width:
                  quality.resolution.width === 0
                    ? undefined
                    : {
                        ideal: quality.resolution.width,
                        max: quality.resolution.width,
                      },
                height:
                  quality.resolution.width === 0
                    ? undefined
                    : {
                        ideal: quality.resolution.width,
                        max: quality.resolution.height,
                      },
              });
              localTrack.videoTrack.mediaStreamTrack.contentHint =
                quality.contentHint;
              if (!audio && screenAudioTrack?.track) {
                room.localParticipant.unpublishTrack(screenAudioTrack.track);
              }
              this.sound.playSound("streamStart");
            }
          };

          if (screenPickerQualityName) {
            callback(
              screenPickerQualityName || "low",
              screenPickerAudio || false,
            );
          } else if (this.#settings.screenShareQualityAsk) {
            if (Object.keys(qualities).length > 1) {
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
                  return { name: k, fullName: v.fullName };
                }),
                audio: !!screenAudioTrack,
                callback: async (qualityName, audio) => {
                  callback(qualityName, audio);
                  localTrack.resumeUpstream();
                  if (audio) {
                    screenAudioTrack?.resumeUpstream();
                  }
                },
              });
            } else {
              callback(
                this.#settings.screenShareQuality || "low",
                this.#settings.screenShareAudio,
              );
            }
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
    monitor.gain.value = this.#settings.soundboardVolume;
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
