import { For, Show, createMemo, createSignal, untrack } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { createFormControl, createFormGroup } from "solid-forms";
import { styled } from "styled-system/jsx";

import { useState } from "@revolt/state";
import { ScreenShareQualityName } from "@revolt/state/stores/Voice";
import { Avatar, Column, Dialog, DialogProps, Form2, Symbol } from "@revolt/ui";

import { Modals } from "../types";

import { SeletorQualidadeTela } from "./SeletorQualidadeTela";

/** Uma fonte de captura, como o app desktop entrega. */
type Fonte = (Modals & { type: "screen_share_picker" })["sources"][number];

/**
 * Escolher o que compartilhar, no modelo do Discord: abas "Telas" e
 * "Janelas" e uma grade de miniaturas.
 *
 * Antes era uma lista com "Screen 1" e "Screen 2" e um icone generico: com
 * dois monitores nao dava para saber qual era qual. O desktop manda uma
 * previa de cada fonte desde a v1.9.1 (e, nas telas, se e a principal e a
 * resolucao). Versao mais antiga sem previa cai no icone, como antes.
 */
export function ScreenSharePickerModal(
  props: DialogProps & Modals & { type: "screen_share_picker" },
) {
  const { voice } = useState();
  const { t } = useLingui();

  const group = createFormGroup({
    qualityName: createFormControl<ScreenShareQualityName>(
      voice.screenShareQuality || "low",
    ),
    audio: createFormControl(voice.screenShareAudio),
  });

  const telas = createMemo(() => props.sources.filter((s) => s.isFullScreen));
  const janelas = createMemo(() =>
    props.sources.filter((s) => !s.isFullScreen),
  );

  // Abre em "Telas", ja com a tela principal escolhida: e o palpite mais
  // comum. As fontes chegam uma vez so, entao ler fora de escopo reativo e
  // intencional (`untrack`).
  const [aba, setAba] = createSignal<"telas" | "janelas">("telas");
  const [escolhida, setEscolhida] = createSignal<number>(
    untrack(
      () =>
        (
          telas().find((s) => s.monitor?.principal) ??
          telas()[0] ??
          props.sources[0]
        )?.idx ?? 0,
    ),
  );

  /** Nome que diz qual monitor e: "Tela 1 · principal". */
  function nomeDaTela(fonte: Fonte, posicao: number) {
    const nome = t`Screen ${posicao + 1}`;
    return fonte.monitor?.principal ? `${nome} · ${t`main`}` : nome;
  }

  function compartilhar() {
    props.callback(
      escolhida(),
      group.controls.qualityName.value,
      group.controls.audio.value,
    );
    props.onClose();
  }

  const lista = () => (aba() === "telas" ? telas() : janelas());

  /** Troca de aba e escolhe o primeiro dela, para nunca compartilhar algo invisivel. */
  function irPara(nova: "telas" | "janelas") {
    setAba(nova);
    const itens = nova === "telas" ? telas() : janelas();
    if (!itens.some((f) => f.idx === escolhida()) && itens[0])
      setEscolhida(itens[0].idx);
  }

  return (
    <Dialog
      minWidth={560}
      show={props.show}
      onClose={() => {
        props.onCancel();
        props.onClose();
      }}
      title={t`Pick a Screen to Share`}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: <Trans>Go Live</Trans>,
          onClick: () => {
            compartilhar();
            return false;
          },
        },
      ]}
    >
      <Column>
        <Abas role="tablist">
          <Aba
            type="button"
            role="tab"
            aria-selected={aba() === "telas"}
            data-ativa={aba() === "telas" ? "1" : undefined}
            onClick={() => irPara("telas")}
          >
            <Symbol size={18}>monitor</Symbol>
            <Trans>Screens</Trans>
          </Aba>
          <Aba
            type="button"
            role="tab"
            aria-selected={aba() === "janelas"}
            data-ativa={aba() === "janelas" ? "1" : undefined}
            onClick={() => irPara("janelas")}
          >
            <Symbol size={18}>web_asset</Symbol>
            <Trans>Applications</Trans>
          </Aba>
        </Abas>

        <Grade role="listbox" aria-label={t`Pick a Screen to Share`}>
          <For each={lista()}>
            {(fonte, posicao) => (
              <Opcao
                type="button"
                role="option"
                aria-selected={escolhida() === fonte.idx}
                data-escolhida={escolhida() === fonte.idx ? "1" : undefined}
                onClick={() => setEscolhida(fonte.idx)}
                // Duplo clique escolhe e ja comeca, como no Discord.
                onDblClick={() => {
                  setEscolhida(fonte.idx);
                  compartilhar();
                }}
                title={fonte.name}
              >
                <Previa>
                  <Show
                    when={fonte.thumbnail}
                    fallback={
                      <Avatar
                        src={fonte.image}
                        fallback={fonte.name}
                        size={48}
                        shape="rounded-square"
                      />
                    }
                  >
                    <img src={fonte.thumbnail} alt="" />
                  </Show>
                </Previa>
                <Rotulo>
                  <Show when={!fonte.isFullScreen && fonte.image}>
                    <img src={fonte.image} alt="" />
                  </Show>
                  <Textos>
                    <span>
                      {fonte.isFullScreen
                        ? nomeDaTela(fonte, posicao())
                        : fonte.name}
                    </span>
                    {/* Resolucao em linha propria: junto do nome ela era
                        cortada, e e justamente o que distingue os monitores. */}
                    <Show when={fonte.isFullScreen && fonte.monitor}>
                      <small>
                        {fonte.monitor!.largura}×{fonte.monitor!.altura}
                      </small>
                    </Show>
                  </Textos>
                </Rotulo>
              </Opcao>
            )}
          </For>
          <Show when={lista().length === 0}>
            <Vazio>
              <Trans>Nothing to share here.</Trans>
            </Vazio>
          </Show>
        </Grade>

        <SeletorQualidadeTela
          control={group.controls.qualityName}
          qualities={props.qualities}
        />
        <Form2.Checkbox control={group.controls.audio}>
          <Trans>Share audio</Trans>
        </Form2.Checkbox>
      </Column>
    </Dialog>
  );
}

const Abas = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-xs)",
    padding: "var(--gap-xs)",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-highest)",
    alignSelf: "flex-start",
  },
});

const Aba = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    border: "none",
    borderRadius: "var(--borderRadius-full)",
    padding: "6px 14px",
    cursor: "pointer",
    background: "transparent",
    color: "var(--md-sys-color-on-surface-variant)",
    fontWeight: 600,

    "&[data-ativa]": {
      background: "var(--md-sys-color-secondary-container)",
      color: "var(--md-sys-color-on-secondary-container)",
    },
  },
});

const Grade = styled("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "var(--gap-md)",
    maxHeight: "max(36vh, 240px)",
    overflowY: "auto",
    padding: "2px",
  },
});

const Opcao = styled("button", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-xs)",
    padding: "var(--gap-xs)",
    border: "none",
    borderRadius: "var(--borderRadius-md)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
    cursor: "pointer",
    outline: "2px solid transparent",
    textAlign: "start",
    transition: "background .15s, outline-color .15s",

    _hover: { background: "var(--md-sys-color-surface-container-high)" },

    "&[data-escolhida]": {
      outlineColor: "var(--md-sys-color-primary)",
      background: "var(--md-sys-color-surface-container-high)",
    },
  },
});

const Previa = styled("div", {
  base: {
    aspectRatio: "16/9",
    width: "100%",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    borderRadius: "var(--borderRadius-sm)",
    background: "#000",

    "& > img": {
      width: "100%",
      height: "100%",
      objectFit: "contain",
    },
  },
});

const Rotulo = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    fontSize: "12px",
    minWidth: 0,

    "& > img": { width: "16px", height: "16px", flexShrink: 0 },
    "& > span": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  },
});

const Textos = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,

    "& > span": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    "& > small": {
      fontSize: "11px",
      color: "var(--md-sys-color-on-surface-variant)",
    },
  },
});

const Vazio = styled("div", {
  base: {
    gridColumn: "1 / -1",
    padding: "var(--gap-lg)",
    textAlign: "center",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});
