/**
 * Cronometragem das etapas de entrar e sair de um canal de voz.
 *
 * Existe porque "demora" nao e acionavel: sem numero por etapa nao da para
 * saber qual dos tres `await` em serie de `Voice.connect` custa o tempo, nem
 * provar que uma mudanca melhorou.
 *
 * So em `import.meta.env.DEV` — em producao todas as funcoes viram no-op e o
 * global nao existe. Ver `.opencode/plans/voz-latencia-e-sons.md`.
 */

/** Uma etapa cronometrada dentro de uma execucao. */
export type Marca = {
  /** Nome da etapa. */
  nome: string;
  /** `performance.now()` no momento da marca. */
  t: number;
  /** Milissegundos desde o inicio da execucao. */
  desdeInicio: number;
  /** Milissegundos desde a marca anterior. */
  desdeAnterior: number;
};

/** Uma execucao completa de entrar ou sair. */
export type Execucao = {
  /** `connect` ou `disconnect`. */
  tipo: "connect" | "disconnect";
  /** Id do canal, quando conhecido. */
  canal?: string;
  /** Momento de abertura, em epoch ms, para cruzar com outra aba. */
  abertoEm: number;
  /** Etapas na ordem em que aconteceram. */
  marcas: Marca[];
};

/** Historico das execucoes desta aba. */
const execucoes: Execucao[] = [];

/** Execucao em andamento, se houver. */
let atual: Execucao | undefined;

/** Se a cronometragem esta ativa. */
const ativo = import.meta.env.DEV;

/**
 * Abre uma execucao nova e fecha qualquer uma pendente.
 *
 * Fechar a pendente importa: `connect` chama `disconnect` na primeira linha,
 * entao trocar de canal abre duas execucoes encavaladas.
 */
export function abrirTempos(tipo: Execucao["tipo"], canal?: string) {
  if (!ativo) return;

  atual = { tipo, canal, abertoEm: Date.now(), marcas: [] };
  execucoes.push(atual);

  // Um teste que roda 10 vezes nao precisa de mais que isso, e um dev que
  // deixa a aba aberta o dia todo nao deve vazar memoria.
  if (execucoes.length > 100) execucoes.shift();

  marcarTempo("inicio");
}

/** Registra uma etapa na execucao em andamento. */
export function marcarTempo(nome: string) {
  if (!ativo || !atual) return;

  const t = performance.now();
  const primeira = atual.marcas[0];
  const anterior = atual.marcas[atual.marcas.length - 1];

  atual.marcas.push({
    nome,
    t,
    desdeInicio: primeira ? t - primeira.t : 0,
    desdeAnterior: anterior ? t - anterior.t : 0,
  });
}

/** Fecha a execucao em andamento. */
export function fecharTempos() {
  if (!ativo) return;
  atual = undefined;
}

/**
 * Publica o historico em `window.__stoatTempos`.
 *
 * E a porta de entrada do harness de medicao, no mesmo espirito de
 * `__stoatRoom` e `__stoatVoice`.
 *
 * Instalado na importacao, nao no primeiro `connect`: o harness precisa poder
 * chamar `limpar()` ANTES de entrar na primeira chamada, senao a medicao
 * comeca com lixo da carga da pagina.
 */
export function instalarTempos() {
  if (!ativo || typeof window === "undefined") return;

  (
    window as unknown as {
      __stoatTempos?: {
        execucoes: Execucao[];
        limpar: () => void;
      };
    }
  ).__stoatTempos = {
    execucoes,
    limpar: () => {
      execucoes.length = 0;
      atual = undefined;
    },
  };
}

instalarTempos();
