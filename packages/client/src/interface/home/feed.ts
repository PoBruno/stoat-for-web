import { Client, ForumPost } from "stoat.js";

/**
 * Quantos posts pedir por canal.
 *
 * Não existe rota agregada: a única forma de montar um feed hoje é pedir a
 * cada canal de fórum separadamente. Um número alto multiplica requisições
 * sem melhorar muito o resultado, já que a ordenação por atividade já traz
 * o que interessa para o topo.
 */
const POR_CANAL = 12;

/**
 * Canais de fórum que este usuário enxerga.
 *
 * `client.channels` só contém o que veio no `Ready`, e o servidor já aplica
 * `ViewChannel` ali — não é preciso filtrar permissão de novo aqui.
 */
export function canaisDeForum(client: Client) {
  return client.channels.filter((canal) => canal.type === "ForumChannel");
}

/**
 * Busca os posts recentes de todos os canais de fórum de uma vez.
 *
 * Isto é um *fan-out*: uma requisição por canal, mescladas no cliente. É
 * assim porque a API só expõe `/channels/{id}/posts`; não há `/feed`.
 *
 * A ordenação pedida é `Active` de propósito. Num feed de "seguindo", o que
 * importa é o post que recebeu resposta agora, não o que foi criado agora —
 * e é justamente `Active` que faz um post antigo com comentário novo subir.
 *
 * Toda a busca vive nesta função para que trocá-la por uma rota agregada,
 * quando existir, não encoste na interface.
 */
export async function buscarFeed(client: Client): Promise<ForumPost[]> {
  const canais = canaisDeForum(client);
  if (canais.length === 0) return [];

  // `allSettled` e não `all`: um canal que falhe (permissão que mudou, rede)
  // não pode zerar o feed inteiro.
  const respostas = await Promise.allSettled(
    canais.map((canal) =>
      canal.fetchPosts({ sort: "Active", limit: POR_CANAL }),
    ),
  );

  const posts = respostas
    // O ternário já estreita o tipo; um type guard aqui seria só ruído.
    .flatMap((r) => (r.status === "fulfilled" ? r.value.posts : []))
    // Um post apagado enquanto o feed carregava continua na coleção.
    .filter((post) => post.$exists);

  return ordenar(posts);
}

/**
 * Mais recente primeiro, considerando comentário novo como atividade.
 *
 * Posts fixados NÃO sobem aqui, ao contrário do que acontece dentro de um
 * canal: um fixado é importante no contexto dele, não no feed geral.
 */
export function ordenar(posts: ForumPost[]): ForumPost[] {
  return [...posts].sort((a, b) => atividade(b) - atividade(a));
}

function atividade(post: ForumPost): number {
  const ultimo = post.lastCommentAt?.getTime();
  return ultimo && ultimo > post.createdAt.getTime()
    ? ultimo
    : post.createdAt.getTime();
}
