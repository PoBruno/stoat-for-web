import { Show } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useNavigate } from "@revolt/routing";
import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { IconButton, Row, Symbol, Text } from "@revolt/ui";

import { ContextMenu } from "../../../../components/app/menus/ContextMenu";
import { VolumeMusicBox } from "../../channels/voice/musicbox/VolumeMusicBox";

/**
 * Voice status pinned to the bottom of the channel sidebar.
 *
 * Mirrors what Discord does: once you are in a call the controls follow you
 * around the app, so leaving the voice channel to read a text channel does not
 * mean losing the mute button or the soundboard.
 *
 * Renders nothing when not connected, so the sidebar keeps its full height in
 * the common case.
 */
export function VoiceDock() {
  const voice = useVoice();
  const state = useState();
  const { t } = useLingui();
  const navigate = useNavigate();

  const conectado = () => voice.state() === "CONNECTED";

  /**
   * Abre (ou fecha) o soundboard/MusicBox.
   *
   * Os paineis vivem no card da chamada, que so existe na pagina do canal de
   * voz. Lendo um canal de texto, o clique so trocava um estado invisivel e
   * parecia nao fazer nada; abrir agora leva de volta a chamada.
   */
  function abrirPainel(painel: "soundboard" | "musicbox") {
    const abrindo = state.voice.callView !== painel;
    state.voice.toggleCallView(painel);
    const canal = voice.channel();
    if (abrindo && canal) navigate(canal.path);
  }

  /** Dica de botao, no padrao do card da chamada. */
  const dica = (content: string) => ({
    tooltip: { placement: "top" as const, content },
  });

  return (
    <Show when={voice.channel()}>
      {(canal) => (
        <Dock>
          <Info>
            <Row gap="xs" align>
              {/*
                Reflete o estado real da conexao. Antes bastava haver um canal
                selecionado, entao a barra dizia "Voz conectada" enquanto o
                card da chamada dizia "Desconectado".
              */}
              <Ponto conectado={conectado()} />
              <Text class="label" size="small">
                <Show when={conectado()} fallback={<Trans>Connecting…</Trans>}>
                  <Trans>Voice connected</Trans>
                </Show>
              </Text>
            </Row>
            {/* Como no Discord: o nome do canal leva de volta a chamada. */}
            <NomeDoCanal
              type="button"
              title={t`Return to voice channel`}
              onClick={() => navigate(canal().path)}
            >
              {canal().name}
            </NomeDoCanal>
          </Info>

          <Row gap="xs" align>
            <IconButton
              size="xs"
              variant={voice.microphone() ? "standard" : "tonal"}
              aria-label={voice.microphone() ? t`Mute` : t`Unmute`}
              isDisabled={!voice.speakingPermission}
              onPress={() => voice.toggleMute()}
              use:floating={dica(
                voice.speakingPermission
                  ? voice.microphone()
                    ? t`Mute`
                    : t`Unmute`
                  : t`Missing permission`,
              )}
            >
              <Show
                when={voice.microphone()}
                fallback={
                  <Symbol size={18} style={{ color: VERMELHO }}>
                    mic_off
                  </Symbol>
                }
              >
                <Symbol size={18}>mic</Symbol>
              </Show>
            </IconButton>

            <IconButton
              size="xs"
              variant={voice.deafen() ? "tonal" : "standard"}
              aria-label={voice.deafen() ? t`Undeafen` : t`Deafen`}
              onPress={() => voice.toggleDeafen()}
              use:floating={dica(voice.deafen() ? t`Undeafen` : t`Deafen`)}
            >
              <Show
                when={voice.deafen()}
                fallback={<Symbol size={18}>headphones</Symbol>}
              >
                <Symbol size={18} style={{ color: VERMELHO }}>
                  headset_off
                </Symbol>
              </Show>
            </IconButton>

            <IconButton
              size="xs"
              variant={
                state.voice.callView === "soundboard" ? "tonal" : "standard"
              }
              aria-label={t`Soundboard`}
              isDisabled={!voice.soundboardPermission}
              onPress={() => abrirPainel("soundboard")}
              // Botao direito abre o volume aqui mesmo, sem precisar abrir o
              // painel inteiro so para mexer no controle deslizante.
              use:floating={{
                ...dica(t`Soundboard (right-click: volume)`),
                contextMenu: () => (
                  <ContextMenu>
                    <VolumeSoundboard />
                  </ContextMenu>
                ),
              }}
            >
              <Symbol size={18}>graphic_eq</Symbol>
            </IconButton>

            <IconButton
              size="xs"
              variant={
                state.voice.callView === "musicbox" ? "tonal" : "standard"
              }
              aria-label={t`MusicBox`}
              isDisabled={!voice.musicboxPermission}
              onPress={() => abrirPainel("musicbox")}
              // Botao direito abre o volume, igual ao soundboard. E por
              // usuario: cada um regula a musica no proprio ouvido.
              use:floating={{
                ...dica(t`MusicBox (right-click: volume)`),
                contextMenu: () => (
                  <ContextMenu>
                    <VolumeMusicBox channelId={voice.channel()?.id ?? ""} />
                  </ContextMenu>
                ),
              }}
            >
              <Symbol size={18}>music_note</Symbol>
            </IconButton>

            <IconButton
              size="xs"
              variant="standard"
              aria-label={t`Disconnect`}
              onPress={() => voice.disconnect()}
              use:floating={dica(t`Disconnect`)}
            >
              <Symbol size={18} style={{ color: VERMELHO }}>
                call_end
              </Symbol>
            </IconButton>
          </Row>
        </Dock>
      )}
    </Show>
  );
}

/**
 * Volume do soundboard, dentro do menu de contexto.
 *
 * Fica no menu e nao numa faixa fixa na barra: o controle e usado de vez em
 * quando, e a barra lateral e estreita demais para carregar um slider o tempo
 * todo. O menu fecha ao clicar fora, entao ele some sozinho.
 */
function VolumeSoundboard() {
  const state = useState();
  const { t } = useLingui();

  return (
    <Volume>
      <Row gap="xs" align>
        <Symbol size={16}>volume_up</Symbol>
        <Text class="label" size="small">
          <Trans>Soundboard volume</Trans>
        </Text>
      </Row>
      <Row gap="sm" align>
        <input
          type="range"
          min="0"
          max="100"
          aria-label={t`Soundboard volume`}
          value={Math.round(state.voice.soundboardVolume * 100)}
          onInput={(e) =>
            (state.voice.soundboardVolume = Number(e.currentTarget.value) / 100)
          }
        />
        <Text class="label" size="small">
          {Math.round(state.voice.soundboardVolume * 100)}%
        </Text>
      </Row>
    </Volume>
  );
}

const Volume = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    minWidth: "190px",

    "& input[type=range]": {
      flex: 1,
      minWidth: 0,
    },
  },
});

/** Mudo, surdo e desligar em vermelho, como no Discord e no card da chamada. */
const VERMELHO = "var(--md-sys-color-error)";

const NomeDoCanal = styled("button", {
  base: {
    all: "unset",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--md-sys-color-on-surface)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    _hover: { textDecoration: "underline" },
    "&:focus-visible": { outline: "2px solid var(--md-sys-color-primary)" },
  },
});

const Dock = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    flexShrink: 0,
    margin: "0 var(--gap-md) var(--gap-md)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-high)",
  },
});

const Info = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",

    "& > *": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  },
});

/** Bolinha de estado, no mesmo espírito do indicador de presença */
const Ponto = styled("div", {
  base: {
    width: "8px",
    height: "8px",
    borderRadius: "var(--borderRadius-full)",
    flexShrink: 0,
    background: "var(--md-sys-color-on-surface-variant)",
  },
  variants: {
    conectado: {
      true: { background: "var(--customColours-success-color)" },
    },
  },
});
