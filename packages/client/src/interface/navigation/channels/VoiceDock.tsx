import { Show } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { IconButton, Row, Symbol, Text } from "@revolt/ui";

import { ContextMenu } from "../../../../components/app/menus/ContextMenu";

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
  const { t } = useLingui();

  const conectado = () => voice.state() === "CONNECTED";

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
            <Text class="label" size="small">
              {canal().name}
            </Text>
          </Info>

          <Row gap="xs" align>
            <IconButton
              size="xs"
              variant={voice.microphone() ? "standard" : "tonal"}
              aria-label={voice.microphone() ? t`Mute` : t`Unmute`}
              isDisabled={!voice.speakingPermission}
              onPress={() => voice.toggleMute()}
            >
              <Show
                when={voice.microphone()}
                fallback={<Symbol size={18}>mic_off</Symbol>}
              >
                <Symbol size={18}>mic</Symbol>
              </Show>
            </IconButton>

            <IconButton
              size="xs"
              variant={voice.deafen() ? "tonal" : "standard"}
              aria-label={voice.deafen() ? t`Undeafen` : t`Deafen`}
              onPress={() => voice.toggleDeafen()}
            >
              <Show
                when={voice.deafen()}
                fallback={<Symbol size={18}>headphones</Symbol>}
              >
                <Symbol size={18}>headset_off</Symbol>
              </Show>
            </IconButton>

            <IconButton
              size="xs"
              variant={voice.soundboardOpen() ? "tonal" : "standard"}
              aria-label={t`Soundboard`}
              isDisabled={!voice.soundboardPermission}
              onPress={() => voice.toggleSoundboard()}
              // Botao direito abre o volume aqui mesmo, sem precisar abrir o
              // painel inteiro so para mexer no controle deslizante.
              use:floating={{
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
              variant="standard"
              aria-label={t`Disconnect`}
              onPress={() => voice.disconnect()}
            >
              <Symbol size={18}>call_end</Symbol>
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
