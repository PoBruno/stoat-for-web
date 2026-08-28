import { For, Show } from "solid-js";
import { styled } from "styled-system/jsx";

import { ScreenShareQualityName } from "@revolt/state/stores/Voice";
import { Button, Text } from "@revolt/ui";

import type { IFormControl } from "solid-forms";

/** Uma opcao de qualidade, ja separada em grupo e rotulo curto. */
export type OpcaoQualidade = {
  name: string;
  fullName: string;
  /** Cabecalho da linha: `720p`, `1080p`, `Fonte`. */
  grupo: string;
  /** Rotulo curto do botao dentro da linha: `30`, `60`, `90`, `120`, `5`. */
  rotulo: string;
};

/**
 * Seletor de qualidade de compartilhamento de tela.
 *
 * POR QUE NAO E O `Form2.ButtonGroup`
 *
 * Aquele controle e uma `Row justify="stretch"` sem quebra de linha: os
 * botoes dividem a largura do modal em partes iguais. Com quatro opcoes isso
 * funciona; com oito, cada botao ficou com **57px** para escrever
 * "1080p 120FPS" e o rotulo virou uma coluna vertical de letras, sobrepondo a
 * previa e o checkbox abaixo. Verificado por print, nao por suposicao.
 *
 * As qualidades sao naturalmente bidimensionais — resolucao x taxa de quadros
 * — entao a grade mostra a estrutura em vez de escondê-la numa fileira:
 *
 * ```
 *   720p    [30] [60] [90] [120]
 *   1080p   [30] [60] [90]
 *   Fonte   [5]
 * ```
 *
 * Cada linha tem no maximo quatro botoes, e o rotulo e so o numero, entao
 * cabe com folga em qualquer largura de modal.
 */
export function SeletorQualidadeTela(props: {
  control: IFormControl<ScreenShareQualityName>;
  qualities: OpcaoQualidade[];
}) {
  /** Preserva a ordem em que as qualidades chegaram. */
  const grupos = () => {
    const ordem: string[] = [];
    const mapa = new Map<string, OpcaoQualidade[]>();
    for (const q of props.qualities) {
      if (!mapa.has(q.grupo)) {
        mapa.set(q.grupo, []);
        ordem.push(q.grupo);
      }
      mapa.get(q.grupo)!.push(q);
    }
    return ordem.map((nome) => ({ nome, itens: mapa.get(nome)! }));
  };

  return (
    <Grade>
      <For each={grupos()}>
        {(grupo) => (
          <Linha>
            <Rotulo>
              <Text class="label" size="small">
                {grupo.nome}
              </Text>
            </Rotulo>
            <Botoes>
              <For each={grupo.itens}>
                {(item, indice) => (
                  <Button
                    // NUNCA deixar `group` indefinido: o Button decide o
                    // visual com `group ? (groupActive ? "filled" : "tonal")
                    // : variant`, entao sem `group` ele cai no `variant`
                    // padrao e desenha o botao como se estivesse SELECIONADO.
                    // Era o que fazia a linha "Fonte", de um item so, aparecer
                    // marcada junto com a opcao realmente escolhida.
                    group={
                      grupo.itens.length === 1
                        ? "standard"
                        : indice() === 0
                          ? "connected-start"
                          : indice() === grupo.itens.length - 1
                            ? "connected-end"
                            : "connected"
                    }
                    groupActive={props.control.value === item.name}
                    aria-label={item.fullName}
                    onPress={() => {
                      props.control.setValue(
                        item.name as ScreenShareQualityName,
                      );
                      props.control.markDirty(true);
                    }}
                  >
                    {item.rotulo}
                  </Button>
                )}
              </For>
            </Botoes>
          </Linha>
        )}
      </For>
      <Show when={props.control.isTouched && !props.control.isValid}>
        <For each={Object.keys(props.control.errors ?? {})}>
          {(erro: string) => <small>{erro}</small>}
        </For>
      </Show>
    </Grade>
  );
}

const Grade = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
  },
});

const Linha = styled("div", {
  base: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "var(--gap-md)",
  },
});

/** Largura fixa para os cabecalhos alinharem entre as linhas. */
const Rotulo = styled("div", {
  base: {
    flexShrink: 0,
    width: "56px",
    textAlign: "end",
  },
});

/**
 * Os botoes de uma linha.
 *
 * Largura minima em vez de `justify="stretch"`: com stretch os botoes dividem
 * o espaco disponivel, entao uma linha de tres e outra de quatro davam
 * larguras diferentes para o mesmo rotulo, e "120" — tres digitos — nao cabia
 * e quebrava em duas linhas ("12" / "0"). Com largura minima fixa, toda a
 * grade alinha em coluna e qualquer rotulo de ate tres digitos cabe.
 */
const Botoes = styled("div", {
  base: {
    display: "flex",
    flexDirection: "row",
    "& > *": {
      minWidth: "62px",
    },
  },
});
