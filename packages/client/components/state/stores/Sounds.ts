import { State } from "..";

import { AbstractStore } from ".";

/**
 * Nomes dos sons de interface.
 *
 * Cada evento se distingue por tres eixos redundantes -- direcao, timbre e
 * numero de notas. Ver `.opencode/scripts/gerar-sons.py`, que sintetiza os
 * arquivos, e `.opencode/plans/voz-latencia-e-sons.md` secao 4.
 *
 * Removidos em 2026-08-28: `ringtoneIncoming`, `ringtoneOutgoing`,
 * `streamViewerJoin` e `streamViewerLeave`. As quatro chaves existiam desde
 * `feat: Add sounds (#1206)` e nunca foram tocadas por nenhum caminho de
 * codigo; os quatro arquivos eram o MESMO blob de 1 segundo de silencio
 * digital (-91 dBFS). Codigo morto com arquivo morto.
 */
export type NomeSom =
  /** Mensagem/notificacao nova. */
  | "message"
  /** Voce mutou o microfone. Uma nota grave -- uma coisa mudou. */
  | "mute"
  /** Voce desmutou o microfone. */
  | "unmute"
  /** Voce ensurdeceu: microfone + audio. Duas notas -- duas coisas mudaram. */
  | "deafen"
  /** Voce desensurdeceu. */
  | "undeafen"
  /** VOCE entrou na chamada. */
  | "selfJoinVoice"
  /** VOCE saiu da chamada. */
  | "selfLeaveVoice"
  /** OUTRA pessoa entrou. Uma nota, 6 dB mais baixo que o seu. */
  | "userJoinVoice"
  /** OUTRA pessoa saiu. */
  | "userLeaveVoice"
  /** Comecou um compartilhamento de tela. */
  | "streamStart"
  /** Terminou um compartilhamento de tela. */
  | "streamEnd"
  /** Alguem foi movido de canal. */
  | "userMoved"
  /** A chamada caiu sem voce pedir. */
  | "voiceDisconnected";

/** Liga/desliga por som. */
export type TypeSounds = Record<NomeSom, boolean> & {
  /**
   * Volume dos sons de interface, de 0 a 1.
   *
   * Nao existia: o `SoundController` nunca atribuia `volume` no elemento de
   * audio, entao tudo tocava em ganho cheio e a unica saida era desligar o
   * som. Os volumes do store `Voice` sao de MIDIA do LiveKit e nao tocam
   * nestes avisos.
   */
  volume: number;
};

/** Todas as chaves de som, na ordem em que a tela de configuracoes as mostra. */
export const NOMES_SOM: NomeSom[] = [
  "message",
  "selfJoinVoice",
  "selfLeaveVoice",
  "userJoinVoice",
  "userLeaveVoice",
  "mute",
  "unmute",
  "deafen",
  "undeafen",
  "streamStart",
  "streamEnd",
  "userMoved",
  "voiceDisconnected",
];

/** Volume padrao. Cheio assusta; mudo demais nao informa. */
const VOLUME_PADRAO = 0.5;

export class Sounds extends AbstractStore<"sounds", TypeSounds> {
  constructor(state: State) {
    super(state, "sounds");
  }

  hydrate(): void {}

  default(): TypeSounds {
    return {
      ...(Object.fromEntries(NOMES_SOM.map((n) => [n, true])) as Record<
        NomeSom,
        boolean
      >),
      volume: VOLUME_PADRAO,
    };
  }

  clean(input: Partial<TypeSounds>): TypeSounds {
    const saida = {} as TypeSounds;
    for (const nome of NOMES_SOM) {
      saida[nome] = typeof input[nome] === "boolean" ? input[nome] : true;
    }
    // Um valor invalido vindo do disco nao pode silenciar o app nem estourar
    // o ganho; o store e persistido em IndexedDB e ja recebeu chaves de
    // versoes anteriores.
    saida.volume =
      typeof input.volume === "number" &&
      isFinite(input.volume) &&
      input.volume >= 0 &&
      input.volume <= 1
        ? input.volume
        : VOLUME_PADRAO;
    return saida;
  }

  enabled(t: NomeSom): boolean {
    return this.get()[t];
  }

  toggle(t: NomeSom) {
    return this.set(t, !this.enabled(t));
  }

  /** Volume dos sons de interface, de 0 a 1. */
  get volume(): number {
    return this.get().volume;
  }

  setVolume(v: number) {
    return this.set("volume", Math.max(0, Math.min(1, v)));
  }
}
