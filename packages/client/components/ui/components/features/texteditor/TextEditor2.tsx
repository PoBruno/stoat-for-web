import { Accessor, createEffect, on, onMount } from "solid-js";

import { defaultKeymap, history } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { css } from "styled-system/css";

import { scrollableStyles } from "../../../directives/scrollable";
import { AutoCompleteSearchSpace } from "../../utils/autoComplete";

import { useDevice } from "@revolt/common";
import { codeMirrorAutoComplete } from "./codeMirrorAutoComplete";
import { isInFencedCodeBlock } from "./codeMirrorCommon";
import { smartLineWrapping } from "./codeMirrorLineWrap";
import { markPlugins } from "./codeMirrorMarks";
import { markdownTheme } from "./codeMirrorTheme";
import { codeMirrorWidgets } from "./codeMirrorWidgets";

/**
 * Editing primitives exposed to whoever renders a toolbar.
 *
 * These live here rather than in the toolbar because only this component has
 * the CodeMirror view, and therefore the selection.
 */
export type EditorCommands = {
  /** Insert text at the cursor, replacing any selection */
  insert(text: string): void;
  /**
   * Wrap the selection, or insert the markers and place the cursor between
   * them when nothing is selected.
   */
  wrap(before: string, after?: string): void;
  /**
   * Prefix every line touched by the selection.
   *
   * `prefix` receives the index of the line within the selection, which is
   * what makes ordered lists number themselves.
   */
  prefixLines(prefix: string | ((index: number) => string)): void;
  focus(): void;
};

interface Props {
  /**
   * Receives the editing commands once the editor is ready
   */
  commands?: (commands: EditorCommands) => void;

  /**
   * Auto focus the input on creation
   */
  autoFocus?: boolean;

  /**
   * Placeholder to show when no text is shown
   */
  placeholder?: string;

  /**
   * Initial value to show in the text box
   */
  initialValue?: readonly [string];

  /**
   * Signal for sending a node replacement or focus request to the editor
   */
  nodeReplacement?: readonly [string | "_focus"];

  /**
   * Event is fired when the text content changes
   * @param value Text value
   */
  onChange: (value: string) => void;

  /**
   * Event is fired when user submits (Enter) content
   */
  onComplete?: () => void;

  /**
   * Event is fired when any keys are input
   */
  onTyping?: () => void;

  /**
   * Event is fired when 'previous context' is requested
   * i.e. edit the last message (given current is empty)
   */
  onPreviousContext?: () => void;

  /**
   * Auto complete search space
   */
  autoCompleteSearchSpace?: Accessor<AutoCompleteSearchSpace>;
}

const placeholderCompartment = new Compartment();

/**
 * Text editor powered by CodeMirror
 */
export function TextEditor2(props: Props) {
  const editorScrollbarClasses = scrollableStyles();

  const { isMobile } = useDevice();
  const codeMirror = document.createElement("div");
  codeMirror.className = editor;

  //Custom CSS
  codeMirror.style.minWidth = "0";

  /**
   * Handle 'Enter' key presses
   * Submit only if not currently in a code block
   */
  const enterKeymap = keymap.of([
    {
      key: isMobile ? "Ctrl-Enter" : "Enter",
      //TODO Ctrl-Enter is only detected on Firefox mobile, not Chrome mobile
      run: (view) => {
        if (!props.onComplete) return false;

        const cursor = view.state.selection.main;
        if (!isInFencedCodeBlock(view.state, cursor.from, cursor.to)) {
          props.onComplete();
          return true;
        } else {
          return false;
        }
      },
    },
  ]);

  /**
   * Handle 'ArrowUp' key presses
   */
  const arrowUpKeymap = keymap.of([
    {
      key: "ArrowUp",
      run: (view) => {
        if (view.state.doc.length > 0 || !props.onPreviousContext) return false;
        props.onPreviousContext();
        return true;
      },
    },
  ]);

  /**
   * CodeMirror instance
   */
  const view = new EditorView({
    parent: codeMirror,
    state: EditorState.create({
      doc: props.initialValue?.[0],
      extensions: [
        /* Enable browser spellchecking */
        EditorView.contentAttributes.of({
          spellcheck: "true",
          autocorrect: "true",
          autocapitalize: "true",
        }),

        /* Mount keymaps */
        enterKeymap,
        arrowUpKeymap,
        keymap.of(defaultKeymap as never), // required for atomic ranges to work: https://github.com/codemirror/dev/issues/923

        /* Enable history */
        history(),

        /* Use the bundled Markdown syntax */
        markdown({ base: markdownLanguage }),

        /* Linewrapping */
        smartLineWrapping,

        /* Placeholder */
        placeholderCompartment.of(
          // eslint-disable-next-line solid/reactivity
          props.placeholder ? placeholder(props.placeholder) : [],
        ),

        /* Autocomplete */
        // eslint-disable-next-line solid/reactivity
        codeMirrorAutoComplete(props.autoCompleteSearchSpace),

        /* Custom items */
        codeMirrorWidgets(),
        markPlugins,

        /* Widgets */
        markdownTheme,

        /* Handle change event */
        // eslint-disable-next-line solid/reactivity
        EditorView.updateListener.of((view) => {
          if (view.docChanged) {
            const text = view.state.doc.toString().trim();
            props.onChange?.(text);
            if (text) props.onTyping?.();
          }
        }),
      ],
    }),
  });

  /** Push a change and keep the consumer's value in sync */
  function apply(spec: Parameters<typeof view.dispatch>[0]) {
    view.dispatch(spec);
    props.onChange(view.state.doc.toString());
    view.focus();
  }

  // Handed over once, at setup: these close over the CodeMirror view, which
  // never changes for a mounted editor.
  // eslint-disable-next-line solid/reactivity
  props.commands?.({
    insert(text) {
      apply(view.state.replaceSelection(text));
    },

    wrap(before, after = before) {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);

      apply({
        changes: { from, to, insert: `${before}${selected}${after}` },
        // With no selection, park the cursor between the markers so typing
        // continues inside them.
        selection: {
          anchor: from + before.length + selected.length,
        },
      });
    },

    prefixLines(prefix) {
      const { from, to } = view.state.selection.main;
      const first = view.state.doc.lineAt(from).number;
      const last = view.state.doc.lineAt(to).number;

      const changes = [];
      let beforeFrom = 0;
      let beforeTo = 0;

      for (let n = first; n <= last; n++) {
        const line = view.state.doc.line(n);
        const marker =
          typeof prefix === "string" ? prefix : prefix(n - first + 1);
        changes.push({ from: line.from, insert: marker });

        // An insertion exactly at the cursor leaves the cursor in front of it,
        // so typing lands before the marker ("Um titulo## "). Move the
        // selection past everything inserted ahead of it.
        if (line.from <= from) beforeFrom += marker.length;
        if (line.from <= to) beforeTo += marker.length;
      }

      apply({
        changes,
        selection: { anchor: from + beforeFrom, head: to + beforeTo },
      });
    },

    focus() {
      view.focus();
    },
  });

  // Apply shared scrollbar styles from the exported scrollable style classes.
  const scroller = codeMirror.querySelector<HTMLDivElement>(".cm-scroller");
  if (scroller) {
    scroller.classList.add(...editorScrollbarClasses.split(" "));
  }

  // connect signals to extensions
  createEffect(
    on(
      () => props.placeholder,
      (text) => {
        view.dispatch({
          effects: placeholderCompartment.reconfigure(
            text ? placeholder(text) : [],
          ),
        });
      },
      {
        defer: true,
      },
    ),
  );

  // set initial value
  createEffect(
    on(
      () => props.initialValue?.[0] ?? "",
      (text) => {
        view.dispatch(
          view.state.update({
            changes: { from: 0, to: view.state.doc.length, insert: text },
            selection: {
              anchor: text.length,
            },
          }),
        );
      },
      {
        defer: true,
      },
    ),
  );

  // apply changes
  createEffect(
    on(
      () => props.nodeReplacement,
      (value) => {
        if (value) {
          view.focus();

          const text = value[0];
          if (text !== "_focus") {
            view.dispatch(view.state.replaceSelection(text));
            if (text) props.onTyping?.();
            props.onChange(view.state.doc.toString());
          }
        }
      },
      {
        defer: true,
      },
    ),
  );

  // auto focus on mount
  onMount(
    () =>
      props.autoFocus &&
      setTimeout(() => {
        view.focus();

        view.dispatch(
          view.state.update({
            selection: {
              anchor: view.state.doc.length,
            },
          }),
        );
      }, 0),
  );

  return <>{codeMirror}</>;
}

const editor = css({
  display: "inline-flex",
  height: "100%",
  width: "100%",
  flexGrow: 1,
  alignSelf: "center",

  color: "var(--md-sys-color-on-surface)",

  fontWeight: 400,
  fontSize: "var(--message-size)",
  fontFamily: "var(--fonts-primary)",

  "& .cm-editor": {
    width: "100%",
    alignSelf: "center",
    maxHeight: "100%",
  },

  "& .cm-editor.cm-focused": {
    outline: "none !important",
  },

  // copied from elements.ts
  "& .md-h1": {
    fontSize: "2em",
    fontWeight: 600,
  },
  "& .md-h2": {
    fontSize: "1.6em",
    fontWeight: 600,
  },
  "& .md-h3": {
    fontSize: "1.4em",
    fontWeight: 600,
  },
  "& .md-h4": {
    fontSize: "1.2em",
    fontWeight: 600,
  },
  "& .md-h5": {
    fontSize: "1em",
    fontWeight: 600,
  },
  "& .md-h6": {
    fontSize: "0.8em",
    fontWeight: 600,
  },

  "& .md-meta-atom": {
    fontSize: "inherit",
    fontWeight: "inherit",
  },

  "& .md-meta.md-list": {
    fontFamily: "var(--fonts-monospace)",
    fontWeight: "bold",
    opacity: "0.5",
  },

  "& .md-emph": {
    fontStyle: "italic",
  },

  "& .md-bold": {
    fontWeight: "bold",
  },

  "& .md-link": {
    textDecoration: "underline",
  },

  "& .md-strikethrough": {
    textDecoration: "line-through",
    textDecorationColor: "color-mix(in srgb, currentColor 40%, transparent)",
    textDecorationThickness: "2px",
  },

  "& .md-hr": {
    fontWeight: "bold",
  },

  "& .md-code": {
    fontFamily: "var(--fonts-monospace)",

    padding: "0.5px 4px",

    color: "#c9d1d9",
    caretColor: "currentColor",
    background: "#0d1117",
  },

  // adapted from elements.ts
  "& .md-quote.md-meta": {
    fontWeight: "bold",
  },

  "& .md-quote": {
    '&, &[class*="md-quote md-quote md-quote"]': {
      color: "var(--md-sys-color-on-secondary-container)",
      background: "var(--md-sys-color-secondary-container)",
      "--border": "var(--md-sys-color-secondary)",
    },

    '&[class="md-quote md-quote"], &[class="md-quote md-quote md-meta"], &[class="md-quote md-quote md-text"], &[class*="md-quote md-quote md-quote md-quote"]':
      {
        color: "var(--md-sys-color-on-tertiary-container)",
        background: "var(--md-sys-color-tertiary-container)",
        "--border": "var(--md-sys-color-tertiary)",
      },
  },

  // "& .md-comment": {},
});
