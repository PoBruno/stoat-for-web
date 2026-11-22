import { For, Show, createMemo } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import type { Channel } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { useNavigate } from "@revolt/routing";
import { Avatar, Symbol, Text } from "@revolt/ui";

/**
 * Quantos avatares cabem por call antes de virar "+N".
 */
const LIMITE = 6;

/**
 * Calls de voz com gente dentro, como o "Ativo agora" do Discord.
 *
 * Num grupo fechado de amigos a pergunta da Home é "tem alguém em call?".
 * Os participantes já chegam pelo WebSocket em `voiceParticipants` (é o
 * que a sidebar do servidor desenha), então aqui é só um filtro.
 */
export function EmCallAgora() {
  const client = useClient();
  const navigate = useNavigate();

  const calls = createMemo(() =>
    client()
      .channels.filter(
        (channel) => channel.isVoice && channel.voiceParticipants.size > 0,
      )
      .sort((a, b) => b.voiceParticipants.size - a.voiceParticipants.size),
  );

  return (
    <Bloco>
      <Titulo>
        <Text class="label" size="large">
          <Trans>Em call agora</Trans>
        </Text>
        <Show when={calls().length > 0}>
          <AoVivo />
        </Show>
      </Titulo>

      <Show
        when={calls().length > 0}
        fallback={
          <Text class="body" size="small">
            <Trans>Ninguém em call.</Trans>
          </Text>
        }
      >
        <For each={calls()}>
          {(channel) => (
            <Call channel={channel} onClick={() => navigate(channel.path)} />
          )}
        </For>
      </Show>
    </Bloco>
  );
}

/**
 * Uma call: canal, servidor e quem está dentro.
 */
function Call(props: { channel: Channel; onClick: () => void }) {
  const client = useClient();
  const participantes = () => [...props.channel.voiceParticipants.values()];
  const alguemCompartilhando = () =>
    participantes().some((p) => p.isScreensharing());

  return (
    <Item onClick={() => props.onClick()}>
      <Linha>
        <Symbol size={16}>volume_up</Symbol>
        <Nome>{props.channel.name}</Nome>
        <Show when={alguemCompartilhando()}>
          <Live>
            <Trans>AO VIVO</Trans>
          </Live>
        </Show>
      </Linha>
      <Show when={props.channel.server}>
        <Servidor>{props.channel.server!.name}</Servidor>
      </Show>
      <Avatares>
        <For each={participantes().slice(0, LIMITE)}>
          {(participante) => {
            const user = () => client().users.get(participante.userId);
            return (
              <span title={user()?.displayName}>
                <Avatar src={user()?.animatedAvatarURL} size={24} />
              </span>
            );
          }}
        </For>
        <Show when={participantes().length > LIMITE}>
          <Mais>+{participantes().length - LIMITE}</Mais>
        </Show>
      </Avatares>
    </Item>
  );
}

const Bloco = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Titulo = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--gap-sm)",
  },
});

/** Bolinha verde: tem call rolando. */
const AoVivo = styled("span", {
  base: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#3ba55d",
  },
});

const Item = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-xs)",
    padding: "var(--gap-sm)",
    marginInline: "calc(var(--gap-sm) * -1)",
    borderRadius: "var(--borderRadius-md)",
    cursor: "pointer",
    transition: "background .15s",
    _hover: { background: "var(--md-sys-color-surface-container-high)" },
  },
});

const Linha = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    color: "var(--md-sys-color-on-surface)",
  },
});

const Nome = styled("span", {
  base: {
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexGrow: 1,
  },
});

const Live = styled("span", {
  base: {
    fontSize: "0.65em",
    fontWeight: 700,
    padding: "1px 4px",
    borderRadius: "4px",
    background: "#ed4245",
    color: "white",
  },
});

const Servidor = styled("span", {
  base: {
    fontSize: "0.8em",
  },
});

const Avatares = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-xs)",
    alignItems: "center",
  },
});

const Mais = styled("span", {
  base: {
    fontSize: "0.8em",
    fontWeight: 600,
  },
});
