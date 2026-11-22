import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";

/**
 * Estado da atualizacao automatica do app desktop.
 *
 * Espelha `EstadoDaAtualizacao` de for-desktop/src/native/atualizacao.ts: o
 * processo principal baixa a versao nova em segundo plano e avisa por IPC.
 */
export type EstadoDaAtualizacao =
  | { fase: "desligada" }
  | { fase: "ociosa" }
  | { fase: "procurando" }
  | { fase: "baixando"; versao: string; progresso: number }
  | { fase: "pronta"; versao: string }
  | { fase: "erro"; mensagem: string };

/** Ponte exposta pelo preload do desktop a partir da v1.9.0. */
export type PonteDeAtualizacao = {
  estado(): Promise<EstadoDaAtualizacao>;
  procurar(): Promise<void>;
  instalar(): Promise<void>;
  aoMudar(callback: (estado: EstadoDaAtualizacao) => void): () => void;
};

/**
 * Ponte de atualizacao, ou `undefined` no navegador e em versoes do desktop
 * anteriores a 1.9.0 (que nao se atualizam sozinhas).
 */
export function ponteDeAtualizacao(): PonteDeAtualizacao | undefined {
  return window.native?.atualizacao;
}

/**
 * Estado da atualizacao do desktop como signal. Fica em `desligada` fora do
 * app desktop, entao quem usa nao precisa checar a plataforma.
 */
export function useAtualizacaoDoDesktop(): Accessor<EstadoDaAtualizacao> {
  const [estado, setEstado] = createSignal<EstadoDaAtualizacao>({
    fase: "desligada",
  });

  onMount(() => {
    const ponte = ponteDeAtualizacao();
    if (!ponte) return;
    void ponte.estado().then(setEstado);
    onCleanup(ponte.aoMudar(setEstado));
  });

  return estado;
}
