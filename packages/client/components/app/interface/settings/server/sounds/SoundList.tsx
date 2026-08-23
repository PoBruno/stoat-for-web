import { createFormControl, createFormGroup } from "solid-forms";
import { For, Match, Show, Switch, createMemo, createResource } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { Server } from "stoat.js";

import { useClient } from "@revolt/client";
import { useError } from "@revolt/i18n";
import { useInstance } from "@revolt/instance";
import { useModals } from "@revolt/modal";
import { styled } from "styled-system/jsx";

import {
  CircularProgress,
  Column,
  Form2,
  IconButton,
  Row,
  Symbol,
  Text,
} from "@revolt/ui";

/** Rotulo do grupo de sons sem categoria */
const SEM_CATEGORIA = "\u0000sem";

/**
 * Soundboard settings for a server: upload and manage sounds.
 */
export function SoundList(props: { server: Server }) {
  const err = useError();
  const { t } = useLingui();
  const client = useClient();
  const { openModal, showError } = useModals();
  const instance = useInstance();

  // Uma busca ao abrir; depois os eventos mantem a colecao viva.
  const [carregou] = createResource(
    () => props.server.id,
    // Roda dentro do createResource, disparado pela fonte acima; o lint nao
    // enxerga isso como escopo rastreado.
    // eslint-disable-next-line solid/reactivity
    async () => {
      try {
        await props.server.fetchSounds();
      } catch (error) {
        showError(error);
      }
      return true;
    },
  );

  /**
   * Sons agrupados por categoria, com os sem categoria por ultimo.
   */
  const porCategoria = createMemo(() => {
    const grupos = new Map<string, typeof props.server.sounds>();
    for (const som of props.server.sounds) {
      const chave = som.category?.trim() || SEM_CATEGORIA;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(som);
    }

    for (const lista of grupos.values()) {
      lista.sort((a, b) => a.name.localeCompare(b.name));
    }

    return [...grupos.entries()].sort(([a], [b]) => {
      if (a === SEM_CATEGORIA) return 1;
      if (b === SEM_CATEGORIA) return -1;
      return a.localeCompare(b);
    });
  });

  function isDisabled() {
    return props.server.sounds.length >= instance.globalLimits.server_sounds;
  }

  const editGroup = createFormGroup(
    {
      name: createFormControl("", { required: true }),
      category: createFormControl(""),
      file: createFormControl<string | File[] | null>(null, { required: true }),
    },
    { disabled: isDisabled() },
  );

  async function onSubmit() {
    const arquivo = (editGroup.controls.file.value as File[])[0];

    // A duracao e medida aqui, no browser, porque o backend nao decodifica
    // audio: guardar o numero pronto evita o painel ter que baixar todos os
    // clipes so para mostrar "00:02".
    const duracao = await medirDuracao(arquivo).catch(() => undefined);

    const body = new FormData();
    body.append("file", arquivo);

    const [key, value] = client().authenticationHeader;
    const data: { id: string } = await fetch(`${instance.mediaUrl}/sounds`, {
      method: "POST",
      body,
      headers: { [key]: value },
    }).then((res) => res.json());

    await props.server.createSound(data.id, {
      name: editGroup.controls.name.value,
      category: editGroup.controls.category.value || undefined,
      duration: duracao,
    });
  }

  function onReset() {
    editGroup.controls.name.setValue("");
    editGroup.controls.category.setValue("");
    editGroup.controls.file.setValue(null);
  }

  const submit = Form2.useSubmitHandler(editGroup, onSubmit, onReset);

  return (
    <Column gap="lg">
      <form onSubmit={submit}>
        {/*
          Uma coluna, e nao arquivo a esquerda com campos a direita: a versao
          anterior deixava metade da largura vazia e o botao de criar solto no
          meio, longe do que ele cria.
        */}
        <Formulario>
          <Form2.FileInput
            control={editGroup.controls.file}
            accept="audio/*"
            imageJustify={false}
            allowRemoval={false}
            maxSize={instance.limits().file_upload_size_limits["sounds"]}
            hideErrors={true}
          />

          <Campos>
            <Form2.TextField
              minlength={1}
              maxlength={32}
              counter
              name="name"
              control={editGroup.controls.name}
              label={t`Sound name`}
              autocomplete="off"
            />
            <Form2.TextField
              maxlength={32}
              name="category"
              control={editGroup.controls.category}
              label={t`Category`}
              helper={t`Free text. Sounds sharing a category are grouped together.`}
              helper-on-focus={true}
              autocomplete="off"
            />
          </Campos>

          <Row align gap="md">
            <Form2.Submit group={editGroup}>
              <Trans>Add sound</Trans>
            </Form2.Submit>
            <Switch
              fallback={
                <Text class="label" size="small">
                  <Trans>
                    {instance.globalLimits.server_sounds -
                      props.server.sounds.length}{" "}
                    slots left
                  </Trans>
                </Text>
              }
            >
              <Match when={editGroup.errors?.error}>
                {err(editGroup.errors!.error)}
              </Match>
              <Match when={editGroup.isPending}>
                <CircularProgress />
              </Match>
            </Switch>
          </Row>
        </Formulario>
      </form>

      <Column gap="sm">
        <Show
          when={carregou()}
          fallback={
            <Text class="label" size="small">
              <Trans>Loading sounds.</Trans>
            </Text>
          }
        >
          <Show
            when={props.server.sounds.length}
            fallback={
              <Text class="label" size="small">
                <Trans>No sounds on this server yet.</Trans>
              </Text>
            }
          >
            {/* Agrupa por categoria: com dezenas de sons uma lista corrida
                vira um paredao sem hierarquia. */}
            <For each={porCategoria()}>
              {([categoria, sons]) => (
                <Column gap="sm">
                  <Text class="label" size="small">
                    <Show
                      when={categoria !== SEM_CATEGORIA}
                      fallback={<Trans>Uncategorised</Trans>}
                    >
                      {categoria}
                    </Show>
                  </Text>
                  <For each={sons}>
                    {(sound) => (
                      <Linha>
                        <Row gap="sm" align>
                          <Symbol size={20}>music_note</Symbol>
                          <Column gap="none">
                            <Text class="label" size="large">
                              {sound.name}
                            </Text>
                            <Show when={sound.duration}>
                              <Text class="label" size="small">
                                {formatarDuracao(sound.duration!)}
                              </Text>
                            </Show>
                          </Column>
                        </Row>
                        <IconButton
                          size="xs"
                          variant="standard"
                          aria-label={t`Delete`}
                          onPress={() =>
                            openModal({ type: "delete_sound", sound })
                          }
                        >
                          <Symbol size={18}>delete</Symbol>
                        </IconButton>
                      </Linha>
                    )}
                  </For>
                </Column>
              )}
            </For>
          </Show>
        </Show>
      </Column>
    </Column>
  );
}

/** mm:ss a partir de milissegundos */
function formatarDuracao(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const Formulario = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    padding: "var(--gap-lg)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container)",
  },
});

const Campos = styled("div", {
  base: {
    display: "grid",
    gap: "var(--gap-md)",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  },
});

const Linha = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container)",

    _hover: {
      background: "var(--md-sys-color-surface-container-high)",
    },
  },
});

/**
 * Read how long an audio file plays for.
 *
 * Uses an <audio> element rather than decoding through WebAudio: decoding a
 * whole file just to read its length would allocate the entire PCM buffer.
 */
function medirDuracao(arquivo: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const audio = new Audio();

    const limpar = () => URL.revokeObjectURL(url);

    audio.addEventListener("loadedmetadata", () => {
      limpar();
      // Streams sem duracao conhecida devolvem Infinity.
      if (Number.isFinite(audio.duration)) {
        resolve(Math.round(audio.duration * 1000));
      } else {
        reject(new Error("duracao desconhecida"));
      }
    });
    audio.addEventListener("error", () => {
      limpar();
      reject(new Error("nao consegui ler o audio"));
    });

    audio.src = url;
  });
}
