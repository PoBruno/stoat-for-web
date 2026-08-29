import { createEffect, onCleanup, onMount } from "solid-js";

import { Anotacao, normalizarSobreVideo, paraPixelsDoVideo } from "./anotacao";
import { desenharEtiqueta, desenharTraco } from "./traco";

/**
 * Canvas que fica sobre o <video> de um compartilhamento de tela.
 *
 * Faz duas coisas: desenha os tracos vivos, e -- quando `armado` -- captura o
 * ponteiro para produzir tracos novos.
 *
 * ## Custo quando ninguem esta desenhando
 *
 * O laco de `requestAnimationFrame` **para** quando nao ha traco vivo, e volta
 * a rodar no proximo tique. Um canvas parado nao custa quadro nenhum. Sem isso
 * a feature cobraria GPU de todo mundo o tempo todo, que e exatamente o que o
 * pedido proibia.
 */
export function CamadaAnotacao(props: {
  /** Estado de anotacao da sala */
  anotacao: Anotacao;
  /** Elemento de video sobre o qual desenhar */
  video: () => HTMLVideoElement | undefined;
  /** Se o ponteiro deve produzir tracos */
  armado: boolean;
  /** Chamado quando o usuario pede para sair do modo de desenho */
  aoDesarmar: () => void;
}) {
  let canvas: HTMLCanvasElement | undefined;
  let laco: number | undefined;
  let desenhando = false;
  let pendenteDeEnvio = false;

  /**
   * Redimensiona o canvas para casar com a caixa e o DPI da tela.
   */
  function ajustar() {
    const c = canvas;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return dpr;
  }

  /**
   * Desenha um quadro e reagenda enquanto houver traco vivo.
   */
  function quadro() {
    laco = undefined;
    const c = canvas;
    const v = props.video();
    if (!c || !v) return;

    const dpr = ajustar() ?? 1;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);

    const tracos = props.anotacao.vivos();
    for (const t of tracos) {
      const alfa = props.anotacao.opacidade(t);
      if (alfa <= 0) continue;
      const pixels = paraPixelsDoVideo(v, t.pts);
      if (pixels.length === 0) continue;
      desenharTraco(ctx, pixels, t.cor, alfa);
      desenharEtiqueta(ctx, pixels[0], pixels[1], t.nome, t.cor, alfa * 0.9);
    }

    if (tracos.length > 0) agendar();
  }

  /**
   * Agenda um quadro, sem empilhar dois.
   */
  function agendar() {
    if (laco === undefined) laco = requestAnimationFrame(quadro);
  }

  onMount(() => {
    const aoRedimensionar = () => agendar();
    window.addEventListener("resize", aoRedimensionar);

    onCleanup(() => {
      window.removeEventListener("resize", aoRedimensionar);
      if (laco !== undefined) cancelAnimationFrame(laco);
    });
  });

  // O tique muda a cada traco novo ou crescido; e o que religa o laco depois
  // de ele ter parado por falta de traco. Antes eu sondava a cada 250ms, que
  // era gasto continuo justamente no caso "ninguem esta desenhando" -- e o
  // sinal ja existia.
  createEffect(() => {
    props.anotacao.tique();
    agendar();
  });

  /**
   * Converte um evento em coordenada normalizada, se cair sobre o conteudo.
   */
  function ponto(e: PointerEvent): [number, number] | undefined {
    const v = props.video();
    if (!v) return undefined;
    return normalizarSobreVideo(v, e.clientX, e.clientY);
  }

  /**
   * Comeca um traco.
   */
  function aoDescer(e: PointerEvent) {
    if (!props.armado || e.button !== 0) return;
    const p = ponto(e);
    if (!p) return;
    // Sem isto o clique borbulha e o tile alterna o pin a cada traco.
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    desenhando = true;
    props.anotacao.comecar(p[0], p[1]);
    agendar();
  }

  /**
   * Acrescenta pontos, agrupando por quadro.
   */
  function aoMover(e: PointerEvent) {
    if (!props.armado || !desenhando) return;
    e.preventDefault();
    e.stopPropagation();

    const v = props.video();
    if (!v) return;

    // `getCoalescedEvents` devolve os pontos intermediarios que o navegador
    // agrupou num unico evento. Mouse de alta taxa fica suave sem custar um
    // datagrama por amostra.
    const brutos =
      typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];

    const pontos: number[] = [];
    for (const b of brutos) {
      const p = normalizarSobreVideo(v, b.clientX, b.clientY);
      if (p) pontos.push(p[0], p[1]);
    }
    if (pontos.length === 0) return;

    props.anotacao.continuar(pontos);
    agendar();

    // Um envio por quadro, nao um por evento.
    if (!pendenteDeEnvio) {
      pendenteDeEnvio = true;
      requestAnimationFrame(() => {
        pendenteDeEnvio = false;
        props.anotacao.enviarLote();
      });
    }
  }

  /**
   * Fecha o traco.
   */
  function aoSubir(e: PointerEvent) {
    if (!desenhando) return;
    e.preventDefault();
    e.stopPropagation();
    desenhando = false;
    props.anotacao.terminar();
  }

  /**
   * Esc desarma o modo de desenho.
   */
  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "Escape" && props.armado) {
      e.preventDefault();
      props.aoDesarmar();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", aoTeclar);
    onCleanup(() => window.removeEventListener("keydown", aoTeclar));
  });

  return (
    <canvas
      ref={canvas}
      data-anotacao-camada
      data-armado={props.armado ? "1" : "0"}
      onPointerDown={aoDescer}
      onPointerMove={aoMover}
      onPointerUp={aoSubir}
      onPointerCancel={aoSubir}
      style={{
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        // Desarmado o canvas e so vidro: o clique atravessa e continua
        // alternando o pin do tile, como antes da feature existir.
        "pointer-events": props.armado ? "auto" : "none",
        cursor: props.armado ? "crosshair" : "inherit",
        "z-index": "2",
      }}
    />
  );
}
