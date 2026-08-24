import { For, Show, createMemo } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { useNavigate } from "@revolt/routing";
import { Avatar, Text } from "@revolt/ui";

/**
 * Quantos avatares cabem antes de virar "+N".
 */
const LIMITE = 8;

/**
 * Amigos online, num canto da Home.
 *
 * Os dados já estavam no cliente — a tela de Amigos faz exatamente este
 * filtro. Aqui só aparecem os que estão online: a lista completa continua
 * em /friends, e repetir tudo aqui só faria barulho.
 */
export function AmigosOnline() {
  const client = useClient();
  const navigate = useNavigate();

  const online = createMemo(() =>
    client()
      .users.filter((user) => user.relationship === "Friend" && user.online)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  );

  return (
    <Bloco onClick={() => navigate("/friends")}>
      <Titulo>
        <Text class="label" size="large">
          <Trans>Amigos</Trans>
        </Text>
        <Contagem>{online().length}</Contagem>
      </Titulo>

      <Show
        when={online().length > 0}
        fallback={
          <Text class="body" size="small">
            <Trans>Ninguém online agora.</Trans>
          </Text>
        }
      >
        <Avatares>
          <For each={online().slice(0, LIMITE)}>
            {(user) => (
              // O nome vai no `title` do wrapper: o Avatar não aceita esse
              // atributo, e sem ele a fileira de rostos não diz quem é quem.
              <span title={user.displayName}>
                <Avatar src={user.animatedAvatarURL} size={28} />
              </span>
            )}
          </For>
          <Show when={online().length > LIMITE}>
            <Mais>+{online().length - LIMITE}</Mais>
          </Show>
        </Avatares>
      </Show>
    </Bloco>
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
    cursor: "pointer",
    transition: "background .15s",
    _hover: { background: "var(--md-sys-color-surface-container-high)" },
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

const Contagem = styled("span", {
  base: {
    fontSize: "0.8em",
    fontWeight: 700,
    color: "var(--md-sys-color-primary)",
  },
});

const Avatares = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-sm)",
    alignItems: "center",
  },
});

const Mais = styled("span", {
  base: {
    fontSize: "0.8em",
    fontWeight: 600,
  },
});
