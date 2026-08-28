import { createContext, JSXElement, useContext } from "solid-js";

import { NomeSom, Sounds, useState } from "@revolt/state";
import deafenSound from "../../public/assets/sounds/deafen.ogg";
import messageSound from "../../public/assets/sounds/message_sound.ogg";
import muteSound from "../../public/assets/sounds/mute.ogg";
import selfJoinVoiceSound from "../../public/assets/sounds/self_join_voice.ogg";
import selfLeaveVoiceSound from "../../public/assets/sounds/self_leave_voice.ogg";
import streamEndSound from "../../public/assets/sounds/stream_end.ogg";
import streamStartSound from "../../public/assets/sounds/stream_start.ogg";
import undeafenSound from "../../public/assets/sounds/undeafen.ogg";
import unmuteSound from "../../public/assets/sounds/unmute.ogg";
import userJoinVoiceSound from "../../public/assets/sounds/user_join_voice.ogg";
import userLeaveVoiceSound from "../../public/assets/sounds/user_leave_voice.ogg";
import userMovedSound from "../../public/assets/sounds/user_moved.ogg";
import voiceDisconnectedSound from "../../public/assets/sounds/voice_disconnected.ogg";

/** Nome do som -> URL do arquivo, resolvida pelo Vite com hash. */
const ARQUIVOS: Record<NomeSom, string> = {
  deafen: deafenSound,
  message: messageSound,
  mute: muteSound,
  selfJoinVoice: selfJoinVoiceSound,
  selfLeaveVoice: selfLeaveVoiceSound,
  streamEnd: streamEndSound,
  streamStart: streamStartSound,
  undeafen: undeafenSound,
  unmute: unmuteSound,
  userJoinVoice: userJoinVoiceSound,
  userLeaveVoice: userLeaveVoiceSound,
  userMoved: userMovedSound,
  voiceDisconnected: voiceDisconnectedSound,
};

/**
 * Janela em que o MESMO som nao toca de novo.
 *
 * Sem isto, seis pessoas entrando juntas numa chamada disparam seis vezes o
 * mesmo clipe sobrepostos, o que soma amplitude e vira estalo. Sons
 * DIFERENTES continuam podendo se sobrepor -- mutar enquanto alguem entra sao
 * dois fatos, e o usuario deve ouvir os dois.
 */
const JANELA_REPETICAO_MS = 90;

/**
 * Toca os avisos sonoros da interface.
 *
 * Reescrito em 2026-08-28. O que havia antes:
 *
 * - `new Audio(url)` a CADA disparo, com um `switch` de 14 casos. Cada toque
 *   criava um elemento novo e refazia a decodificacao; o anterior era
 *   descartado no meio se ainda estivesse tocando.
 * - **Nenhum controle de volume.** `node.volume` nunca era atribuido, entao
 *   tudo saia em ganho cheio e a unica opcao era desligar.
 * - `canPlay()` declarava tratar colisao mas os dois ramos devolviam `true`,
 *   entao nao decidia nada.
 *
 * Agora: um `AudioContext`, buffers decodificados uma vez e cacheados, um
 * `GainNode` com o volume do usuario, e guarda de repeticao de verdade.
 * O modelo veio do fork `Trifall/stoat-for-web`, citado em
 * `stoatchat/for-web#1046` como referencia de sons decentes.
 *
 * Nao confundir com `Voice.playSound` (`components/rtc/state.tsx`), que tem o
 * mesmo nome, e do soundboard e PUBLICA uma track no LiveKit.
 */
export class SoundController {
  readonly soundState: Sounds;

  #ctx?: AudioContext;
  #buffers = new Map<NomeSom, AudioBuffer>();
  #ultimoToque = new Map<NomeSom, number>();
  #houveInteracao = false;
  #precarregou = false;

  lastPlayedSound?: NomeSom;

  constructor(soundState: Sounds) {
    this.soundState = soundState;

    this.canPlay = this.canPlay.bind(this);
    this.playSound = this.playSound.bind(this);

    if (typeof document !== "undefined") {
      // A politica de autoplay so libera audio depois de um gesto do usuario.
      // Antes isso aparecia como um `NotAllowedError` no console e o som
      // simplesmente nao saia; agora o contexto e retomado no primeiro gesto
      // e os buffers ja ficam prontos.
      const aoInteragir = () => {
        this.#houveInteracao = true;
        this.#contexto()?.resume();
        void this.#precarregar();
      };
      for (const evento of ["pointerdown", "keydown", "touchstart"]) {
        document.addEventListener(evento, aoInteragir, { once: true });
      }
    }
  }

  #contexto(): AudioContext | undefined {
    if (typeof window === "undefined") return undefined;
    if (!this.#ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return undefined;
      this.#ctx = new Ctor();
    }
    return this.#ctx;
  }

  /**
   * Decodifica todos os clipes de uma vez.
   *
   * Feito no primeiro gesto e nao no boot: decodificar 13 arquivos concorre
   * com a carga inicial do app, e antes do gesto o contexto esta suspenso de
   * qualquer forma.
   */
  async #precarregar() {
    if (this.#precarregou) return;
    this.#precarregou = true;

    const ctx = this.#contexto();
    if (!ctx) return;

    await Promise.all(
      (Object.keys(ARQUIVOS) as NomeSom[]).map((nome) =>
        this.#carregar(nome, ctx).catch(() => undefined),
      ),
    );
  }

  async #carregar(nome: NomeSom, ctx: AudioContext): Promise<AudioBuffer> {
    const existente = this.#buffers.get(nome);
    if (existente) return existente;

    const resposta = await fetch(ARQUIVOS[nome]);
    const bytes = await resposta.arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes);
    this.#buffers.set(nome, buffer);
    return buffer;
  }

  /**
   * Se este som pode tocar agora.
   *
   * @param novoSom Som a verificar
   */
  canPlay(novoSom: NomeSom): boolean {
    if (!this.soundState.enabled(novoSom)) return false;

    const ultimo = this.#ultimoToque.get(novoSom);
    if (
      ultimo !== undefined &&
      performance.now() - ultimo < JANELA_REPETICAO_MS
    )
      return false;

    return true;
  }

  /**
   * Toca um aviso sonoro.
   *
   * @param sound Som a tocar
   * @param force Ignora a checagem de `canPlay` (usado pela previa nas
   *   configuracoes, onde apertar o botao tem que soar sempre)
   * @returns Se o som foi despachado
   */
  playSound(sound: NomeSom, force?: boolean): boolean {
    if (!force && !this.canPlay(sound)) return false;

    const ctx = this.#contexto();
    if (!ctx) return false;

    const volume = this.soundState.volume;
    if (volume <= 0 && !force) return false;

    this.#ultimoToque.set(sound, performance.now());
    this.lastPlayedSound = sound;

    void (async () => {
      try {
        if (ctx.state === "suspended") {
          if (!this.#houveInteracao) return;
          await ctx.resume();
        }

        const buffer = await this.#carregar(sound, ctx);

        const fonte = ctx.createBufferSource();
        const ganho = ctx.createGain();
        fonte.buffer = buffer;
        ganho.gain.value = volume;
        fonte.connect(ganho);
        ganho.connect(ctx.destination);
        fonte.start();

        fonte.onended = () => {
          fonte.disconnect();
          ganho.disconnect();
        };
      } catch (motivo) {
        // Registrar o motivo torna o proximo diagnostico possivel; um som que
        // some sem explicacao ja custou tempo aqui.
        console.warn(
          `[sons] "${sound}" nao tocou:`,
          (motivo as Error)?.name ?? motivo,
        );
      }
    })();

    return true;
  }
}

const soundContext = createContext(null! as SoundController);

export function SoundContext(props: { children: JSXElement }) {
  const { sounds } = useState();

  const controller = new SoundController(sounds);

  // Afordancia de dev, no mesmo espirito de `__stoatClient` e `__stoatVoice`.
  // Sem uma porta de entrada nao da para provar por teste que os 13 clipes
  // carregam, decodificam e nao sao silencio -- que foi exatamente o defeito
  // anterior: quatro arquivos eram 1s de silencio digital e ninguem notou
  // porque nada os tocava. Some no build de producao.
  if (import.meta.env.DEV) {
    (
      window as unknown as {
        __stoatSound?: {
          controlador: SoundController;
          arquivos: Record<NomeSom, string>;
        };
      }
    ).__stoatSound = { controlador: controller, arquivos: ARQUIVOS };
  }

  return (
    <soundContext.Provider value={controller}>
      {props.children}
    </soundContext.Provider>
  );
}

export function useSound(): SoundController {
  return useContext(soundContext);
}
