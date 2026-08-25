import { State } from "..";

import { AbstractStore } from ".";

/**
 * Possible noise suppresion states. Browser is browser noise suppresion and enhanced is machine learning suppression via RNNoise.
 */
export type NoiseSuppresionState = "disabled" | "browser" | "enhanced";

const NoiseSuppresionStates: NoiseSuppresionState[] = [
  "disabled",
  "browser",
  "enhanced",
];

/**
 * Possible screen share qualities.
 *
 * `text` is the source resolution at 5fps, meant for reading code/documents.
 * The rest are explicit resolution/framerate combinations.
 *
 * `low`/`high` are kept under their original names so preferences saved by
 * older builds keep working.
 */
export type ScreenShareQualityName =
  | "low" // 720p 30FPS
  | "hd60" // 720p 60FPS
  | "high" // 1080p 30FPS
  | "fhd60" // 1080p 60FPS
  | "text"; // source 5FPS

/**
 * Array of available screen share quality names.
 */
export const ScreenShareQualityNames: ScreenShareQualityName[] = [
  "low",
  "hd60",
  "high",
  "fhd60",
  "text",
];

/**
 * How the pinned tiles are laid out on the stage.
 *
 * - `auto`      pick columns/rows from the tile count and container shape
 * - `columns`   side by side
 * - `rows`      stacked on top of each other
 * - `grid`      square-ish grid
 * - `primary`   first pin large, the remaining pins in a side column
 */
export type CallArrangement = "auto" | "columns" | "rows" | "grid" | "primary";

export const CallArrangements: CallArrangement[] = [
  "auto",
  "columns",
  "rows",
  "grid",
  "primary",
];

/** Where the non-pinned tiles live */
export type CallFilmstrip = "bottom" | "side" | "hidden";

/**
 * O que a chamada mostra acima da barra de controles.
 *
 * Uma coisa de cada vez, e nao duas dividindo a altura. Dividir fazia o
 * soundboard caber tres linhas e a fila de musica caber tres faixas; nenhum
 * dos dois servia para o que existe.
 *
 * - `people`      quem esta na chamada e as telas compartilhadas
 * - `soundboard`  os sons do servidor
 * - `musicbox`    a fila de musica
 */
export type CallView = "people" | "soundboard" | "musicbox";

export const CallFilmstrips: CallFilmstrip[] = ["bottom", "side", "hidden"];

/**
 * Turn a volume slider position into the gain to actually apply.
 *
 * A slider that sets amplitude directly feels broken at the quiet end, and it
 * is not the listener's fault. Loudness is perceived roughly logarithmically,
 * so an amplitude of 0.05 does not sound like five percent of full — it sounds
 * like something closer to a sixth of it. The bottom of the slider ends up
 * doing almost nothing while the top does everything.
 *
 * Squaring the position below unity spreads the quiet end out: a fifth of the
 * way up is a fifth of the perceived loudness, near enough. Above unity the
 * position is used as-is, because boosting past the original level is coarse
 * by nature and squaring it would quadruple the ceiling.
 *
 * Unity and the maximum are both unchanged, so nobody's existing setting
 * changes meaning at the ends.
 *
 * @param position Slider position, 0 to 2, where 1 is the original level
 * @returns Gain to multiply the signal by
 */
export function gainForVolumePosition(position: number): number {
  if (position <= 0) return 0;
  return position <= 1 ? position * position : position;
}

export interface TypeVoice {
  preferredAudioInputDevice?: string;
  preferredAudioOutputDevice?: string;
  preferredVideoDevice?: string;

  echoCancellation: boolean;
  noiseSupression: NoiseSuppresionState;
  autoGainControl: boolean;

  screenShareQuality: ScreenShareQualityName;
  screenShareQualityAsk: boolean;
  screenShareAudio: boolean;

  inputVolume: number;
  outputVolume: number;
  deafen: boolean;
  micOn: boolean;

  /**
   * Whether to keep the text chat visible underneath an active call.
   *
   * When false (the default) the call card expands to fill the entire channel
   * body, giving all vertical space to participants and screen shares.
   */
  showCallChat: boolean;

  /** How the pinned ("stage") tiles are arranged */
  callArrangement: CallArrangement;

  /** Where the tiles that are not pinned are shown */
  callFilmstrip: CallFilmstrip;

  /** O que a chamada mostra acima da barra de controles */
  callView: CallView;

  userVolumes: Record<string, number>;
  userMutes: Record<string, boolean>;

  screenShareVolumes: Record<string, number>;
  screenShareMutes: Record<string, boolean>;

  /** Sound ids the user starred, newest first */
  soundboardFavourites: string[];

  /** Playback volume for soundboard clips, 0 to 1 */
  soundboardVolume: number;
}

/**
 * Handles enabling and disabling client experiments.
 */
export class Voice extends AbstractStore<"voice", TypeVoice> {
  /**
   * Construct store
   * @param state State
   */
  constructor(state: State) {
    super(state, "voice");
  }

  /**
   * Hydrate external context
   */
  hydrate(): void {
    /** nothing needs to be done */
  }

  /**
   * Generate default values
   */
  default(): TypeVoice {
    return {
      echoCancellation: true,
      noiseSupression: "enhanced",
      autoGainControl: true,
      screenShareQuality: "low",
      screenShareQualityAsk: true,
      screenShareAudio: true,
      inputVolume: 1.0,
      outputVolume: 1.0,
      deafen: false,
      micOn: true,
      showCallChat: false,
      callArrangement: "auto",
      callFilmstrip: "bottom",
      callView: "people",
      userVolumes: {},
      userMutes: {},
      screenShareVolumes: {},
      screenShareMutes: {},
      soundboardFavourites: [],
      soundboardVolume: 0.7,
    };
  }

  /**
   * Validate the given data to see if it is compliant and return a compliant object
   */
  clean(input: Partial<TypeVoice>): TypeVoice {
    const data = this.default();

    // Filtra elemento a elemento: o que vem do disco pode ter sido gravado por
    // uma versao anterior ou editado a mao.
    if (Array.isArray(input.soundboardFavourites)) {
      data.soundboardFavourites = input.soundboardFavourites.filter(
        (id) => typeof id === "string",
      );
    }

    if (
      typeof input.soundboardVolume === "number" &&
      input.soundboardVolume >= 0 &&
      input.soundboardVolume <= 1
    ) {
      data.soundboardVolume = input.soundboardVolume;
    }

    if (typeof input.preferredAudioInputDevice === "string") {
      data.preferredAudioInputDevice = input.preferredAudioInputDevice;
    }

    if (typeof input.preferredAudioOutputDevice === "string") {
      data.preferredAudioOutputDevice = input.preferredAudioOutputDevice;
    }

    if (typeof input.preferredVideoDevice === "string") {
      data.preferredVideoDevice = input.preferredVideoDevice;
    }

    if (typeof input.echoCancellation === "boolean") {
      data.echoCancellation = input.echoCancellation;
    }

    // migrate legacy noise suppression to new suppression state
    if ((input.noiseSupression as unknown) === "true") {
      data.noiseSupression = "enhanced";
    } else if ((input.noiseSupression as unknown) === "false") {
      data.noiseSupression = "disabled";
    } else if (
      input.noiseSupression &&
      NoiseSuppresionStates.includes(input.noiseSupression)
    ) {
      data.noiseSupression = input.noiseSupression;
    }

    if (typeof input.autoGainControl === "boolean") {
      data.autoGainControl = input.autoGainControl;
    }

    if (
      input.screenShareQuality &&
      ScreenShareQualityNames.includes(input.screenShareQuality)
    ) {
      data.screenShareQuality = input.screenShareQuality;
    }

    if (typeof input.screenShareQualityAsk === "boolean") {
      data.screenShareQualityAsk = input.screenShareQualityAsk;
    }

    if (typeof input.screenShareAudio === "boolean") {
      data.screenShareAudio = input.screenShareAudio;
    }

    if (typeof input.showCallChat === "boolean") {
      data.showCallChat = input.showCallChat;
    }

    if (
      input.callArrangement &&
      CallArrangements.includes(input.callArrangement)
    ) {
      data.callArrangement = input.callArrangement;
    }

    if (input.callFilmstrip && CallFilmstrips.includes(input.callFilmstrip)) {
      data.callFilmstrip = input.callFilmstrip;
    }

    if (
      input.callView === "people" ||
      input.callView === "soundboard" ||
      input.callView === "musicbox"
    ) {
      data.callView = input.callView;
    }

    if (typeof input.inputVolume === "number") {
      data.inputVolume = input.inputVolume;
    }

    if (typeof input.outputVolume === "number") {
      data.outputVolume = input.outputVolume;
    }

    if (typeof input.deafen === "boolean") {
      data.deafen = input.deafen;
    }

    if (typeof input.micOn === "boolean") {
      data.micOn = input.micOn;
    }

    if (typeof input.userVolumes === "object") {
      Object.entries(input.userVolumes)
        .filter(
          ([userId, volume]) =>
            typeof userId === "string" && typeof volume === "number",
        )
        .forEach(([k, v]) => (data.userVolumes[k] = v));
    }

    if (typeof input.userMutes === "object") {
      Object.entries(input.userMutes)
        .filter(
          ([userId, muted]) => typeof userId === "string" && muted === true,
        )
        .forEach(([k, v]) => (data.userMutes[k] = v));
    }

    if (typeof input.screenShareVolumes === "object") {
      Object.entries(input.screenShareVolumes)
        .filter(
          ([userId, volume]) =>
            typeof userId === "string" && typeof volume === "number",
        )
        .forEach(([k, v]) => (data.screenShareVolumes[k] = v));
    }

    if (typeof input.screenShareMutes === "object") {
      Object.entries(input.screenShareMutes)
        .filter(
          ([userId, muted]) => typeof userId === "string" && muted === true,
        )
        .forEach(([k, v]) => (data.screenShareMutes[k] = v));
    }

    return data;
  }

  /**
   * Set a user's volume
   * @param userId User ID
   * @param volume Volume
   */
  setUserVolume(userId: string, volume: number) {
    this.set("userVolumes", userId, volume);
  }

  /**
   * Get a user's volume
   *
   * `??` and not `||`: zero is a volume the user can choose, and it is also
   * the one value JavaScript treats as absent. With `||`, silencing someone
   * read back as full volume — the slider sprang back to the middle and the
   * mute button did nothing.
   *
   * @param userId User ID
   * @returns Volume or default
   */
  getUserVolume(userId: string): number {
    return this.get().userVolumes[userId] ?? 1.0;
  }

  /**
   * Set whether a user is muted
   * @param userId User ID
   * @param muted Whether they should be muted
   */
  setUserMuted(userId: string, muted: boolean) {
    this.set("userMutes", userId, muted);
  }

  /**
   * Get whether a user is muted
   * @param userId User ID
   * @returns Whether muted
   */
  getUserMuted(userId: string): boolean {
    return this.get().userMutes[userId] || false;
  }

  /**
   * Set a user's screen share volume
   * @param userId User ID
   * @param volume Volume
   */
  setScreenShareVolume(userId: string, volume: number) {
    this.set("screenShareVolumes", userId, volume);
  }

  /**
   * Get a user's screen share volume
   *
   * `??` and not `||`, for the same reason as {@link getUserVolume}: zero is
   * a choice, not an absence.
   *
   * @param userId User ID
   * @returns Volume or default
   */
  getScreenShareVolume(userId: string): number {
    return this.get().screenShareVolumes[userId] ?? 1.0;
  }

  /**
   * Set whether a user's screen share is muted
   * @param userId User ID
   * @param muted Whether they should be muted
   */
  setScreenShareMuted(userId: string, muted: boolean) {
    this.set("screenShareMutes", userId, muted);
  }

  /**
   * Get whether a user's screen share is muted
   * @param userId User ID
   * @returns Whether muted
   */
  getScreenShareMuted(userId: string): boolean {
    return this.get().screenShareMutes[userId] ?? true;
  }

  /**
   * Set the preferred audio input device
   */
  set preferredAudioInputDevice(value: string | undefined) {
    this.set("preferredAudioInputDevice", value);
  }

  /**
   * Set the preferred audio output device
   */
  set preferredAudioOutputDevice(value: string | undefined) {
    this.set("preferredAudioOutputDevice", value);
  }

  /**
   * Set the preferred video input device
   */
  set preferredVideoDevice(value: string | undefined) {
    this.set("preferredVideoDevice", value);
  }

  /**
   * Set echo cancellation
   */
  set echoCancellation(value: boolean) {
    this.set("echoCancellation", value);
  }

  /**
   * Set noise cancellation
   */
  set noiseSupression(value: NoiseSuppresionState) {
    this.set("noiseSupression", value);
  }

  /**
   * Set auto gain control
   */
  set autoGainControl(value: boolean) {
    this.set("autoGainControl", value);
  }

  /**
   * Set screen share quality
   */
  set screenShareQuality(value: ScreenShareQualityName) {
    this.set("screenShareQuality", value);
  }

  /**
   * Set screen share quality always ask
   */
  set screenShareQualityAsk(value: boolean) {
    this.set("screenShareQualityAsk", value);
  }

  /**
   * Set screen share audio
   */
  set screenShareAudio(value: boolean) {
    this.set("screenShareAudio", value);
  }

  /**
   * Set input volume
   */
  set inputVolume(value: number) {
    this.set("inputVolume", value);
  }

  /**
   * Set output volume
   */
  set outputVolume(value: number) {
    this.set("outputVolume", value);
  }

  /**
   * Set mic status
   */
  set micOn(value: boolean) {
    this.set("micOn", value);
  }

  /**
   * Set deafen status
   */
  set deafen(value: boolean) {
    this.set("deafen", value);
  }

  /**
   * Get the preferred audio input device
   */
  get preferredAudioInputDevice(): string | undefined {
    return this.get().preferredAudioInputDevice;
  }

  /**
   * Get the preferred audio output device
   */
  get preferredAudioOutputDevice(): string | undefined {
    return this.get().preferredAudioOutputDevice;
  }

  /**
   * Get the preferred video input device
   */
  get preferredVideoDevice(): string | undefined {
    return this.get().preferredVideoDevice;
  }

  /**
   * Get echo cancellation
   */
  get echoCancellation(): boolean | undefined {
    return this.get().echoCancellation;
  }

  /**
   * Get noise supression
   */
  get noiseSupression(): NoiseSuppresionState | undefined {
    return this.get().noiseSupression;
  }

  /**
   * Get auto gain control
   */
  get autoGainControl(): boolean | undefined {
    return this.get().autoGainControl;
  }

  /**
   * Get screen share quality
   */
  get screenShareQuality(): ScreenShareQualityName | undefined {
    return this.get().screenShareQuality;
  }

  /**
   * Get screen share quality always ask
   */
  get screenShareQualityAsk(): boolean {
    return this.get().screenShareQualityAsk;
  }

  /**
   * Get screen share audio
   */
  get screenShareAudio(): boolean {
    return this.get().screenShareAudio;
  }

  /**
   * Get input volume
   */
  get inputVolume(): number {
    return this.get().inputVolume;
  }

  /**
   * Get output volume
   */
  get outputVolume(): number {
    return this.get().outputVolume;
  }

  /**
   * Get deafen status
   */
  get deafen(): boolean {
    return this.get().deafen;
  }

  /**
   * Get mic status
   */
  get micOn(): boolean {
    return this.get().micOn;
  }

  /**
   * Whether the text chat stays visible underneath an active call
   *
   * Canal de voz nao tem chat: o servidor ja tem canais de texto para isso, e
   * a conversa ali so roubava altura de quem esta na chamada. Isto continua
   * valendo para conversas diretas e grupos, onde a chamada acontece dentro
   * de um chat que existe por si.
   */
  get showCallChat(): boolean {
    return this.get().showCallChat;
  }

  /**
   * Show or hide the text chat underneath an active call
   */
  set showCallChat(value: boolean) {
    this.set("showCallChat", value);
  }

  /**
   * Toggle the text chat underneath an active call
   */
  toggleCallChat() {
    this.set("showCallChat", !this.get().showCallChat);
  }

  /**
   * O que a chamada mostra acima da barra de controles
   */
  get callView(): CallView {
    return this.get().callView;
  }

  set callView(value: CallView) {
    this.set("callView", value);
  }

  /**
   * Alterna para uma visao, ou volta para as pessoas se ja estiver nela.
   *
   * Clicar de novo no botao aceso volta ao padrao em vez de nao fazer nada:
   * um botao que parece ligado e nao desliga confunde.
   */
  toggleCallView(view: CallView) {
    this.set("callView", this.get().callView === view ? "people" : view);
  }

  /**
   * How the pinned tiles are arranged on the stage
   */
  get callArrangement(): CallArrangement {
    return this.get().callArrangement;
  }

  set callArrangement(value: CallArrangement) {
    this.set("callArrangement", value);
  }

  /**
   * Where the non-pinned tiles are shown
   */
  get callFilmstrip(): CallFilmstrip {
    return this.get().callFilmstrip;
  }

  set callFilmstrip(value: CallFilmstrip) {
    this.set("callFilmstrip", value);
  }

  /**
   * Sound ids the user starred
   */
  get soundboardFavourites(): string[] {
    return this.get().soundboardFavourites;
  }

  /**
   * Whether a sound is starred
   */
  isFavouriteSound(id: string): boolean {
    return this.get().soundboardFavourites.includes(id);
  }

  /**
   * Star or unstar a sound
   *
   * Guarda o id, e nao o objeto: o som pode ser renomeado ou apagado no
   * servidor, e a lista nao deve carregar uma copia velha.
   */
  toggleFavouriteSound(id: string) {
    const atuais = this.get().soundboardFavourites;
    this.set(
      "soundboardFavourites",
      atuais.includes(id)
        ? atuais.filter((existente) => existente !== id)
        : [id, ...atuais],
    );
  }

  /**
   * Playback volume for soundboard clips
   */
  get soundboardVolume(): number {
    return this.get().soundboardVolume;
  }

  set soundboardVolume(value: number) {
    this.set("soundboardVolume", Math.min(1, Math.max(0, value)));
  }
}
