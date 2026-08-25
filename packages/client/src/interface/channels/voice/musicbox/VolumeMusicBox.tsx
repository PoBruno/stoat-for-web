import { Show, createSignal, onCleanup, onMount } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { Slider, Text } from "@revolt/ui/components/design";
import { Row } from "@revolt/ui/components/layout";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

/**
 * Volume da musica, dentro do menu de contexto do botao do MusicBox.
 *
 * E por usuario e nao global: quem acha a musica alta abaixa no proprio
 * navegador sem mexer no que os outros ouvem. Isso sai de graca porque o audio
 * do MusicBox chega como faixa de um participante da chamada, e o volume por
 * participante ja existe -- o `RoomAudioManager` ja multiplica por
 * `getUserVolume(identidade)`. O que faltava era so uma interface que
 * alcancasse a identidade certa.
 *
 * A identidade vem do SERVIDOR, e nao de um palpite: com bot configurado e o
 * id dele, sem bot e uma identidade sintetica derivada do canal. Adivinhar
 * qual dos presentes e o MusicBox daria errado em silencio -- o controle
 * mexeria num participante que nao existe e nada aconteceria.
 */
export function VolumeMusicBox(props: { channelId: string }) {
  const state = useState();
  const client = useClient();
  const instance = useInstance();
  const voice = useVoice();
  const { t } = useLingui();

  const [identidade, setIdentidade] = createSignal<string>();
  /**
   * O deslizante do mdui dispara `onInput` ao se inicializar, ANTES de receber
   * o valor que passamos — e aquele primeiro disparo carrega o minimo. Sem
   * este guarda, abrir o menu gravava volume 0,1 sozinho: a musica ficava
   * baixa sem ninguem ter tocado em nada, o que parece defeito do audio.
   */
  const [tocou, setTocou] = createSignal(false);

  onMount(() => {
    let vivo = true;

    (async () => {
      const [chave, valor] = client().authenticationHeader;
      try {
        const resposta = await fetch(
          `${instance.apiUrl}/musicbox/${props.channelId}/queue`,
          { headers: { [chave]: valor } },
        );
        if (!resposta.ok || !vivo) return;
        const fila = (await resposta.json()) as { bot_identity?: string };
        if (vivo) setIdentidade(fila.bot_identity);
      } catch {
        // Sem identidade o controle nao aparece; e melhor que um deslizante
        // que nao faz nada.
      }
    })();

    onCleanup(() => {
      vivo = false;
    });
  });

  /** Se o MusicBox esta de fato na chamada agora. */
  const presente = () => {
    const id = identidade();
    if (!id) return false;
    return !!voice.room()?.remoteParticipants?.get(id);
  };

  return (
    <Caixa>
      <Row gap="xs" align>
        <Symbol size={16}>volume_up</Symbol>
        <Text class="label" size="small">
          <Trans>MusicBox volume</Trans>
        </Text>
      </Row>

      <Show
        when={identidade()}
        fallback={
          <Text class="label" size="small">
            <Trans>MusicBox is not set up on this server.</Trans>
          </Text>
        }
      >
        {(id) => (
          <>
            <Row gap="sm" align>
              <Slider
                min={0}
                max={3}
                step={0.05}
                value={state.voice.getUserVolume(id())}
                onPointerDown={() => setTocou(true)}
                onKeyDown={() => setTocou(true)}
                onInput={(evento) => {
                  if (!tocou()) return;
                  state.voice.setUserVolume(id(), evento.currentTarget.value);
                }}
                labelFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <Text class="label" size="small">
                {(state.voice.getUserVolume(id()) * 100).toFixed(0)}%
              </Text>
            </Row>

            {/*
              Dizer que ninguem esta tocando importa: sem isso, mexer no
              deslizante sem ouvir diferenca pareceria defeito.
            */}
            <Show when={!presente()}>
              <Text class="label" size="small">
                <Trans>Nothing is playing right now.</Trans>
              </Text>
            </Show>
          </>
        )}
      </Show>
    </Caixa>
  );
}

const Caixa = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    minWidth: "220px",

    "& mdui-slider": {
      flex: 1,
      minWidth: 0,
    },
  },
});
