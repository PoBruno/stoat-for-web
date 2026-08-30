import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import { useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useInstance } from "@revolt/instance";
import { useModals } from "@revolt/modal";
import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { Button, IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

export function VoiceCallCardActions(props: { size: "xs" | "sm" }) {
  const voice = useVoice();
  const state = useState();
  const navigate = useNavigate();
  const { t } = useLingui();
  const { limits } = useInstance();
  const { openModal } = useModals();

  /**
   * Por que não dá para liberar as anotações agora, ou nada se der.
   *
   * As duas causas são acionáveis por quem lê, e é por isso que valem uma
   * frase em vez de um botão ausente: uma se resolve instalando o app, a
   * outra trocando o que se compartilha.
   */
  const motivoAnotacao = () =>
    !voice.anotacaoDisponivel()
      ? t`This needs the desktop app: the browser cannot draw over your real screen. Install the Stoat app on Windows and share from it.`
      : !voice.fonteEhTelaInteira()
        ? t`This only works when you share a whole screen, not a single window.`
        : undefined;

  return (
    <Actions>
      <Show when={props.size === "xs"}>
        <IconButton
          variant="standard"
          size={props.size}
          onPress={() => {
            navigate(voice.channel()?.path ?? "");
            state.appDrawer()?.setShown(true);
          }}
          use:floating={{
            tooltip: {
              placement: "top",
              content: t`Return to voice channel`,
            },
          }}
        >
          <Symbol>arrow_top_left</Symbol>
        </IconButton>
      </Show>
      <IconButton
        size={props.size}
        variant={voice.microphone() ? "filled" : "tonal"}
        onPress={() => voice.toggleMute()}
        use:floating={{
          tooltip: {
            placement: "top",
            content: voice.speakingPermission
              ? voice.microphone()
                ? t`Mute`
                : t`Unmute`
              : t`Missing permission`,
          },
        }}
        isDisabled={!voice.speakingPermission}
      >
        <Show when={voice.microphone()} fallback={<Symbol>mic_off</Symbol>}>
          <Symbol>mic</Symbol>
        </Show>
      </IconButton>
      <IconButton
        size={props.size}
        variant={voice.deafen() || !voice.listenPermission ? "tonal" : "filled"}
        onPress={() => voice.toggleDeafen()}
        use:floating={{
          tooltip: {
            placement: "top",
            content: voice.listenPermission
              ? voice.deafen()
                ? t`Undeafen`
                : t`Deafen`
              : t`Missing permission`,
          },
        }}
        isDisabled={!voice.listenPermission}
      >
        <Show
          when={voice.deafen() || !voice.listenPermission}
          fallback={<Symbol>headset</Symbol>}
        >
          <Symbol>headset_off</Symbol>
        </Show>
      </IconButton>
      <IconButton
        size={props.size}
        variant={limits().video && voice.video() ? "filled" : "tonal"}
        onPress={() => {
          if (limits().video) voice.toggleCamera();
        }}
        use:floating={{
          tooltip: {
            placement: "top",
            content: limits().video
              ? voice.video()
                ? t`Stop camera`
                : t`Start camera`
              : t`Coming soon! 👀`,
          },
        }}
        isDisabled={!limits().video}
      >
        <Symbol>camera_video</Symbol>
      </IconButton>
      <IconButton
        size={props.size}
        variant={limits().video && voice.screenshare() ? "filled" : "tonal"}
        onPress={() => {
          if (limits().video) voice.toggleScreenshare();
        }}
        use:floating={{
          tooltip: {
            placement: "top",
            content: limits().video
              ? voice.screenshare()
                ? t`Stop sharing`
                : t`Share screen`
              : t`Coming soon! 👀`,
          },
        }}
        isDisabled={!limits().video}
      >
        <Show
          when={!limits().video || voice.screenshare()}
          fallback={<Symbol>stop_screen_share</Symbol>}
        >
          <Symbol>screen_share</Symbol>
        </Show>
      </IconButton>
      {/*
        Liberar anotacoes (laser) no meu compartilhamento.

        So aparece enquanto EU estou compartilhando, porque e um consentimento
        sobre a minha tela -- e por isso fica aqui, na barra, e nao no hover do
        tile: controle de consentimento nao pode sumir quando o mouse sai.

        Enquanto eu compartilho ele esta SEMPRE presente, mesmo quando nao da
        para usar. Esconde-lo economizava um botao e custava a explicacao:
        quem abria o app pelo navegador procurava o controle, nao achava, e
        concluia que o recurso nao existe. Agora ele diz o que falta -- e
        dizer isso e o proprio conserto, porque o que falta e acionavel.
      */}
      <Show when={voice.screenshare()}>
        <IconButton
          size={props.size}
          // Apagado quando não dá para usar, mas NÃO desabilitado: um botão
          // desabilitado não recebe clique, e o clique é justamente o momento
          // em que a pessoa pergunta "por que não?". Ele continua fazendo
          // algo — responde.
          variant={
            voice.anotacoesLiberadas()
              ? "filled"
              : motivoAnotacao()
                ? "standard"
                : "tonal"
          }
          onPress={() => {
            const motivo = motivoAnotacao();
            if (motivo) {
              openModal({
                type: "aviso",
                titulo: t`Annotations unavailable`,
                texto: motivo,
              });
              return;
            }
            voice.toggleAnotacoes();
          }}
          use:floating={{
            tooltip: {
              placement: "top",
              content:
                motivoAnotacao() ??
                (voice.anotacoesLiberadas()
                  ? t`Stop letting others draw`
                  : t`Let others draw on your screen`),
            },
          }}
        >
          <Show
            when={voice.anotacoesLiberadas()}
            fallback={<Symbol>gesture</Symbol>}
          >
            <Symbol>draw</Symbol>
          </Show>
        </IconButton>
      </Show>
      {/*
        Esconder a moldura de aviso sem desligar a anotação.

        Só existe enquanto a anotação está liberada, porque é sobre ela. A
        moldura serve para eu lembrar que autorizei desenharem na minha tela;
        numa explicação longa ela deixa de informar e passa a incomodar, e sem
        esta saída a pessoa desliga a anotação inteira só para se livrar dela.
      */}
      <Show when={voice.screenshare() && voice.anotacoesLiberadas()}>
        <IconButton
          size={props.size}
          variant="standard"
          onPress={() => voice.toggleMolduraAnotacao()}
          use:floating={{
            tooltip: {
              placement: "top",
              content: voice.molduraVisivel()
                ? t`Hide the border on my screen`
                : t`Show the border on my screen`,
            },
          }}
        >
          <Show
            when={voice.molduraVisivel()}
            fallback={<Symbol>border_clear</Symbol>}
          >
            <Symbol>border_outer</Symbol>
          </Show>
        </IconButton>
      </Show>
      <Button
        size={props.size}
        variant="_error"
        onPress={() => voice.disconnect()}
        use:floating={{
          tooltip: {
            placement: "top",
            content: t`End call`,
          },
        }}
      >
        <Symbol>call_end</Symbol>
      </Button>
    </Actions>
  );
}

const Actions = styled("div", {
  base: {
    flexShrink: 0,
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    zIndex: 2,

    display: "flex",
    width: "fit-content",
    justifyContent: "center",
    alignSelf: "center",

    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container)",
  },
});
