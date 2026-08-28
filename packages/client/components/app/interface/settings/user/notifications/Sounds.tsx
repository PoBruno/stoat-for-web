import { Trans, useLingui } from "@lingui/solid/macro";
import { For, Show } from "solid-js";
import { styled } from "styled-system/jsx";

import { useSound } from "@revolt/client";
import { NomeSom, useState } from "@revolt/state";
import {
  CategoryButton,
  Checkbox,
  Column,
  IconButton,
  Row,
  Slider,
  Text,
  iconSize,
} from "@revolt/ui";

import MdVolumeUp from "@material-design-icons/svg/outlined/volume_up.svg?component-solid";

export default function Sounds() {
  const { settings, sounds } = useState();
  const soundController = useSound();
  const { t } = useLingui();

  const playSoundString = t`Play sound`;

  /**
   * Os treze sons, com o rotulo e uma descricao do que os diferencia.
   *
   * Antes esta tela era treze... nao: NOVE blocos copiados a mao, e as outras
   * cinco chaves nao apareciam em lugar nenhum. Uma tabela garante que
   * acrescentar um som ao enum o faz aparecer aqui sem edicao extra.
   */
  const linhas: { chave: NomeSom; rotulo: string; dica: string }[] = [
    {
      chave: "message",
      rotulo: t`Message received`,
      dica: t`A new message or mention arrived`,
    },
    {
      chave: "selfJoinVoice",
      rotulo: t`You joined the call`,
      dica: t`Two notes going up`,
    },
    {
      chave: "selfLeaveVoice",
      rotulo: t`You left the call`,
      dica: t`Two notes going down`,
    },
    {
      chave: "userJoinVoice",
      rotulo: t`Someone else joined`,
      dica: t`A single, quieter note`,
    },
    {
      chave: "userLeaveVoice",
      rotulo: t`Someone else left`,
      dica: t`A single, quieter note`,
    },
    {
      chave: "mute",
      rotulo: t`Microphone muted`,
      dica: t`One note: one thing changed`,
    },
    {
      chave: "unmute",
      rotulo: t`Microphone unmuted`,
      dica: t`One note: one thing changed`,
    },
    {
      chave: "deafen",
      rotulo: t`Deafened`,
      dica: t`Two notes: microphone and audio`,
    },
    {
      chave: "undeafen",
      rotulo: t`Undeafened`,
      dica: t`Two notes: microphone and audio`,
    },
    {
      chave: "streamStart",
      rotulo: t`Screen share started`,
      dica: t`A sweep, not a note`,
    },
    {
      chave: "streamEnd",
      rotulo: t`Screen share ended`,
      dica: t`A sweep, not a note`,
    },
    {
      chave: "userMoved",
      rotulo: t`Someone moved channel`,
      dica: t`Two notes, a smaller step`,
    },
    {
      chave: "voiceDisconnected",
      rotulo: t`Call dropped`,
      dica: t`Three notes going down`,
    },
  ];

  return (
    <Show when={settings.desktopNotificationsState !== "unsupported"}>
      <Column>
        <Text class="title">
          <Trans>Sounds</Trans>
        </Text>

        {/*
          O volume nao existia: o controlador nunca atribuia `volume` no
          elemento de audio, entao a unica forma de baixar o som era
          desliga-lo por completo.
        */}
        <Linha>
          <Text class="label" size="small">
            <Trans>Volume</Trans>
          </Text>
          <Slider
            min={0}
            max={100}
            value={Math.round(sounds.volume * 100)}
            onInput={(e) => sounds.setVolume(e.currentTarget.value / 100)}
          />
          <IconButton
            onPress={() => soundController.playSound("selfJoinVoice", true)}
            use:floating={{
              tooltip: { placement: "top", content: playSoundString },
            }}
          >
            <MdVolumeUp {...iconSize(18)} />
          </IconButton>
        </Linha>

        <CategoryButton.Group>
          <For each={linhas}>
            {(linha) => (
              <CategoryButton
                action={<Checkbox checked={sounds.enabled(linha.chave)} />}
                onClick={() => sounds.toggle(linha.chave)}
                icon="blank"
                description={linha.dica}
              >
                <Content>
                  {linha.rotulo}
                  <IconButton
                    onPress={() => soundController.playSound(linha.chave, true)}
                    use:floating={{
                      tooltip: {
                        placement: "top",
                        content: playSoundString,
                      },
                    }}
                  >
                    <MdVolumeUp {...iconSize(18)} />
                  </IconButton>
                </Content>
              </CategoryButton>
            )}
          </For>
        </CategoryButton.Group>
      </Column>
    </Show>
  );
}

/**
 * Sound content wrapper
 */
const Content = styled("div", {
  base: {
    display: "flex",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: "var(--gap-sm)",
  },
});

/**
 * Linha do controle de volume
 */
const Linha = styled(Row, {
  base: {
    alignItems: "center",
    gap: "var(--gap-md)",
    paddingInline: "var(--gap-md)",
  },
});
