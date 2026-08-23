import { Show } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useVoice } from "@revolt/rtc";
import { IconButton, Row, Symbol, Text } from "@revolt/ui";

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

  return (
    <Show when={voice.channel()}>
      {(canal) => (
        <Dock>
          <Info>
            <Row gap="xs" align>
              <Ponto />
              <Text class="label" size="small">
                <Trans>Voice connected</Trans>
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

/** Bolinha de "conectado", no mesmo espírito do indicador de presença */
const Ponto = styled("div", {
  base: {
    width: "8px",
    height: "8px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--customColours-success-color)",
    flexShrink: 0,
  },
});
