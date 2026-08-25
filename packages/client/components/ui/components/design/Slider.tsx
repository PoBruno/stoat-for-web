import {
  type JSX,
  createEffect,
  createSignal,
  on,
  onCleanup,
  splitProps,
} from "solid-js";

import "mdui/components/slider.js";

type Props = Omit<
  JSX.HTMLAttributes<HTMLInputElement>,
  "onChange" | "onInput"
> & {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  tickmarks?: boolean;
  labelFormatter?: (value: number) => string;
  onChange?: (event: { currentTarget: { value: number } }) => void;
  onInput?: (event: { currentTarget: { value: number } }) => void;
};

/**
 * Sliders let users make selections from a range of values
 *
 * `onInput` fires continuously while the handle is being dragged, which is
 * what a volume control wants: you hear the level as you move, instead of
 * guessing and letting go to find out.
 *
 * It is filtered, though. The control also emits `input` while it settles
 * during mount, carrying the bottom of its range before it has been handed
 * the value we mean it to show. Passing that through set the volume to zero
 * just by opening the menu, which is why this used to listen for `change`
 * and only report on release.
 *
 * The filter is the presence of a real interaction: a pointer held down on
 * the control, or keyboard focus for the arrow keys. Neither is true while
 * the component is mounting, and both are true whenever a person is actually
 * moving the handle.
 *
 * @library MDUI
 * @specification https://m3.material.io/components/sliders
 */
export function Slider(props: Props) {
  const [ref, setRef] = createSignal<
    | (HTMLElement & {
        labelFormatter?: (value: number) => string;
        value: number;
      })
    | undefined
  >();

  const [local, rest] = splitProps(props, ["labelFormatter", "onInput"]);

  const [arrastando, setArrastando] = createSignal(false);

  createEffect(
    on(ref, (elemento) => {
      if (!elemento) return;

      if (local.labelFormatter) {
        elemento.labelFormatter = local.labelFormatter;
      }

      const comecou = () => setArrastando(true);
      // O ponteiro pode ser solto fora do controle; ouvir na janela evita
      // ficar preso achando que o arraste continua.
      const terminou = () => setArrastando(false);

      const aoDigitar = (evento: Event) => {
        if (!local.onInput) return;
        if (!arrastando() && document.activeElement !== elemento) return;
        const alvo = evento.target as unknown as { value: number };
        local.onInput({ currentTarget: { value: alvo.value } });
      };

      elemento.addEventListener("pointerdown", comecou);
      window.addEventListener("pointerup", terminou);
      window.addEventListener("pointercancel", terminou);
      elemento.addEventListener("input", aoDigitar);

      onCleanup(() => {
        elemento.removeEventListener("pointerdown", comecou);
        window.removeEventListener("pointerup", terminou);
        window.removeEventListener("pointercancel", terminou);
        elemento.removeEventListener("input", aoDigitar);
      });
    }),
  );

  return <mdui-slider ref={setRef} {...rest} />;
}
