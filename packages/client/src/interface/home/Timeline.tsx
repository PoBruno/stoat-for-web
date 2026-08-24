import {
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { ForumPost } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { useNavigate } from "@revolt/routing";
import { Avatar, Button, Row, Symbol, Text, Time } from "@revolt/ui";

import { buscarFeed, canaisDeForum, ordenar } from "./feed";

type Aba = "seguindo" | "recentes";

/**
 * Linha do tempo dos fóruns.
 *
 * A Home era estática. Isto a transforma numa extensão do fórum: em vez de
 * o usuário abrir canal por canal para ver se algo aconteceu, o que teve
 * atividade vem até ele.
 */
export function Timeline() {
  const client = useClient();
  const navigate = useNavigate();

  const [aba, setAba] = createSignal<Aba>("seguindo");
  const [feed, { mutate, refetch }] = createResource(() =>
    buscarFeed(client()),
  );

  // O evento existe no protocolo desde sempre e nenhum componente escutava.
  // Com ele o feed cresce sozinho, sem ninguém precisar recarregar a página.
  onMount(() => {
    const aoCriar = (post: ForumPost) =>
      mutate((atual) => ordenar([post, ...(atual ?? [])]));

    client().on("forumPostCreate", aoCriar);
    onCleanup(() => client().off("forumPostCreate", aoCriar));
  });

  const seguindo = createMemo(() =>
    (feed() ?? []).filter((post) => post.subscribed),
  );

  const visiveis = createMemo(() =>
    aba() === "seguindo" ? seguindo() : (feed() ?? []),
  );

  const temForuns = createMemo(() => canaisDeForum(client()).length > 0);

  return (
    <Coluna>
      <Abas>
        <Button
          group="standard"
          variant={aba() === "seguindo" ? "tonal" : "text"}
          onPress={() => setAba("seguindo")}
        >
          <Trans>Seguindo</Trans>
        </Button>
        <Button
          group="standard"
          variant={aba() === "recentes" ? "tonal" : "text"}
          onPress={() => setAba("recentes")}
        >
          <Trans>Recentes</Trans>
        </Button>
        <Espaco />
        <Button variant="text" onPress={() => refetch()}>
          <Symbol size={20}>refresh</Symbol>
        </Button>
      </Abas>

      <Switch>
        <Match when={feed.loading && !feed()}>
          <Vazio>
            <Trans>Carregando…</Trans>
          </Vazio>
        </Match>

        <Match when={!temForuns()}>
          <Vazio>
            <Symbol size={32}>forum</Symbol>
            <Trans>Nenhum canal de fórum por aqui ainda.</Trans>
          </Vazio>
        </Match>

        <Match when={visiveis().length === 0 && aba() === "seguindo"}>
          <Vazio>
            <Symbol size={32}>notifications_none</Symbol>
            <Trans>
              Você ainda não segue nenhum post. Abra um post do fórum e toque em
              Seguir para acompanhá-lo aqui.
            </Trans>
            <Button variant="text" onPress={() => setAba("recentes")}>
              <Trans>Ver os recentes</Trans>
            </Button>
          </Vazio>
        </Match>

        <Match when={visiveis().length === 0}>
          <Vazio>
            <Symbol size={32}>forum</Symbol>
            <Trans>Nenhum post ainda.</Trans>
          </Vazio>
        </Match>

        <Match when={visiveis().length > 0}>
          <For each={visiveis()}>
            {(post) => (
              <Cartao post={post} aoAbrir={() => navigate(post.path)} />
            )}
          </For>
        </Match>
      </Switch>
    </Coluna>
  );
}

/**
 * Um post no feed.
 *
 * Mostra o canal de origem, que dentro do próprio fórum seria redundante mas
 * aqui é a informação que diz de onde aquilo veio.
 */
function Cartao(props: { post: ForumPost; aoAbrir: () => void }) {
  return (
    <Card onClick={props.aoAbrir}>
      <Meta>
        <Show when={props.post.channel}>
          <Canal>#{props.post.channel!.name}</Canal>
        </Show>
        <Show when={props.post.author}>
          <Avatar src={props.post.author!.animatedAvatarURL} size={16} />
          <Text class="label" size="small">
            {props.post.author!.displayName}
          </Text>
        </Show>
        <Text class="label" size="small">
          <Time value={props.post.createdAt} format="relative" />
        </Text>
        <Show when={props.post.subscribed}>
          <Seguindo>
            <Symbol size={14}>notifications_active</Symbol>
          </Seguindo>
        </Show>
      </Meta>

      <Text class="title" size="small">
        {props.post.title}
      </Text>

      <Rodape>
        <Item>
          <Symbol size={16}>arrow_upward</Symbol>
          {props.post.score}
        </Item>
        <Item>
          <Symbol size={16}>chat_bubble</Symbol>
          {props.post.commentCount}
        </Item>
      </Rodape>
    </Card>
  );
}

const Coluna = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    minWidth: 0,
    flexGrow: 1,
  },
});

const Abas = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
  },
});

const Espaco = styled("div", { base: { flexGrow: 1 } });

const Card = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container)",
    cursor: "pointer",
    transition: "background .15s",
    _hover: { background: "var(--md-sys-color-surface-container-high)" },
  },
});

const Meta = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    color: "var(--md-sys-color-on-surface-variant)",
    minWidth: 0,
  },
});

const Canal = styled("span", {
  base: {
    fontSize: "0.8em",
    fontWeight: 600,
    color: "var(--md-sys-color-primary)",
    whiteSpace: "nowrap",
  },
});

const Seguindo = styled("span", {
  base: {
    display: "inline-flex",
    color: "var(--md-sys-color-primary)",
  },
});

const Rodape = styled(Row, {
  base: {
    gap: "var(--gap-md)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Item = styled("span", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "0.85em",
  },
});

const Vazio = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-xl)",
    textAlign: "center",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});
