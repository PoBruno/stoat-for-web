import { For, Show } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { Channel } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useUsers } from "@revolt/markdown/users";
import { useVoice } from "@revolt/rtc";
import { Avatar, Ripple, Text, typography } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";
import { css } from "styled-system/css";

/**
 * Call card (preview)
 */
export function VoiceCallCardPreview(props: { channel: Channel }) {
  const voice = useVoice();
  const { t } = useLingui();

  const ids = () => [...props.channel.voiceParticipants.keys()];
  const users = useUsers(ids);

  function subtext() {
    const names = users()
      .map((user) => user?.username)
      .filter((x) => x);

    if (names.length > 3) {
      return t`with ${names.length} others`;
    } else if (names.length && names.length !== 0) {
      return t`with ${names.join(", ")}`;
    } else {
      return t`Start the call`;
    }
  }

  /**
   * O que esta acontecendo la dentro, alem das vozes.
   *
   * Saber que ha tela compartilhada antes de entrar muda a decisao de entrar
   * -- e essa informacao ja existe no canal, so nao era mostrada.
   */
  const atividade = () => props.channel.voiceStatus;

  return (
    <Preview onClick={() => voice.connect(props.channel)}>
      <Ripple />
      <Avatars>
        <For each={users()} fallback={<Symbol size={24}>voice_chat</Symbol>}>
          {(user) => (
            <Avatar size={24} src={user?.avatar} fallback={user?.username} />
          )}
        </For>
      </Avatars>
      <Text class="title" size="large">
        <Show
          when={voice.state() === "READY"}
          fallback={<Trans>Switch to this voice channel</Trans>}
        >
          <Trans>Join the voice channel</Trans>
        </Show>
      </Text>
      <p class={css(typography.raw({ class: "body" }), LineClampText)}>
        {subtext()}
      </p>

      <Show when={atividade() === "screenshare" || atividade() === "video"}>
        <Atividade>
          <Symbol size={16}>
            {atividade() === "screenshare" ? "screen_share" : "camera_video"}
          </Symbol>
          <Text class="label" size="small">
            <Show
              when={atividade() === "screenshare"}
              fallback={<Trans>Someone has their camera on</Trans>}
            >
              <Trans>Someone is sharing their screen</Trans>
            </Show>
          </Text>
        </Atividade>
      </Show>
    </Preview>
  );
}

/** Aviso do que esta acontecendo na chamada, para quem ainda nao entrou. */
const Atividade = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    marginTop: "var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderRadius: "var(--borderRadius-full)",
    color: "var(--md-sys-color-on-primary-container)",
    background: "var(--md-sys-color-primary-container)",
  },
});

const Preview = styled("div", {
  base: {
    position: "relative", // <Ripple />
    borderRadius: "var(--borderRadius-lg)",

    height: "100%",
    justifyContent: "center",

    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-lg)",

    color: "var(--md-sys-color-on-surface)",
  },
});

const Avatars = styled("div", {
  base: {
    display: "flex",
    flexShrink: 0,
    height: "fit-content",

    "& :not(:first-child)": {
      marginInlineStart: "-9px",
    },
  },
});

const LineClampText = css.raw({
  lineClamp: "2",
  overflow: "hidden",
  display: "-webkit-box",
});
