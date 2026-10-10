/**
 * The code editor of a playground: Monaco, highlighted by the same grammars and themes as the
 * site's static code blocks, and following the site's light or dark theme.
 */
import { shikiToMonaco } from '@shikijs/monaco';
import * as monaco from './monaco';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { getHighlighter, THEMES } from './highlight';
import type { Diagnostic } from '@hylo-lang/hylo-wasm/protocol';
import { MAIN_FILE } from './settings';

// Monaco runs the editor's language services in a worker, which it asks the page for.
(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

/** The site's code font, as `src/styles/fonts.css` sets it, or `''` if the page sets none. */
const font = getComputedStyle(document.documentElement).getPropertyValue('--sl-font-mono').trim();

/**
 * Resolves once Monaco highlights every language of the highlighter through Shiki, and the font
 * is loaded, since Monaco measures the font once, and a fallback measured in its place misplaces
 * the caret; done once per page.
 */
const ready = (async () => {
  await Promise.all([
    getHighlighter().then((h) => {
      for (const id of h.getLoadedLanguages()) monaco.languages.register({ id });
      shikiToMonaco(h, monaco as never);
    }),
    // A font that does not load leaves the fallback, which Monaco then measures correctly.
    font && document.fonts.load(`14px ${font}`).catch(() => {}),
  ]);
})();

/**
 * Returns the name of the Shiki theme matching the page's, which Starlight sets as `data-theme`
 * on the root element.
 */
function pageTheme(): string {
  return document.documentElement.dataset.theme === 'light' ? THEMES.light : THEMES.dark;
}
new MutationObserver(() => monaco.editor.setTheme(pageTheme())).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

/** What a playground may ask of its editor. None of it may be used once the editor is disposed. */
export interface Editor {
  /** The code. */
  readonly value: string;
  /** Replaces the code with `value`, as one edit the reader can undo, and scrolls to the top. */
  replace(value: string): void;
  /**
   * Marks the diagnostics of `diagnostics` that are in the code (`MAIN_FILE`) at their sites,
   * with their rendered text on hover, replacing those marked before.
   */
  showDiagnostics(diagnostics: readonly Diagnostic[]): void;
  /** Moves the caret to the 1-based `line` and `column`, scrolls it into view, and focuses. */
  reveal(line: number, column: number): void;
  /** Gives the editor the keyboard focus. */
  focus(): void;
  /** Removes the editor from its host and releases what it holds. */
  dispose(): void;
}

/** How `createEditor` creates an editor. */
export interface EditorOptions {
  /** The Hylo code the editor starts with. */
  value: string;
  /**
   * Whether the editor grows with its content, as one embedded in prose does, rather than filling
   * its container.
   */
  fitContent?: boolean;
  /** Called after every edit; `Editor.value` is the code. */
  onChange?: () => void;
  /** Called when the reader presses Ctrl+Enter (⌘+Enter on a Mac) in the editor. */
  onRun?: () => void;
}

/**
 * Returns an editor created in `host`, an element that is empty and laid out, once Monaco, the
 * highlighter and the editor's font are loaded.
 *
 * Rejects if Monaco or the highlighter fails to load; a font that fails to load leaves the
 * fallback font.
 */
export async function createEditor(host: HTMLElement, options: EditorOptions): Promise<Editor> {
  await ready;
  const editor = monaco.editor.create(host, {
    value: options.value,
    language: 'hylo',
    theme: pageTheme(),
    fontFamily: [font, 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace']
      .filter((f) => f !== '')
      .join(', '),
    fontSize: 14,
    lineHeight: 21,
    tabSize: 2,
    insertSpaces: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderLineHighlight: 'line',
    lineNumbersMinChars: 3,
    padding: { top: 12, bottom: 12 },
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    fixedOverflowWidgets: true,
    quickSuggestions: false,
    wordBasedSuggestions: 'off',
    stickyScroll: { enabled: false },
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      useShadows: false,
      // Scrolling the page over an embedded editor should scroll the page.
      alwaysConsumeMouseWheel: !options.fitContent,
    },
  });

  if (options.fitContent) {
    const fit = (): void => {
      host.style.height = `${editor.getContentHeight()}px`;
      editor.layout();
    };
    editor.onDidContentSizeChange(fit);
    fit();
  }
  editor.onDidChangeModelContent(() => options.onChange?.());
  if (options.onRun) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, options.onRun);
  }

  const severity = {
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning,
    note: monaco.MarkerSeverity.Info,
  };

  return {
    get value() {
      return editor.getValue();
    },
    replace(value) {
      const model = editor.getModel();
      if (!model) return;
      editor.pushUndoStop();
      editor.executeEdits('replace', [{ range: model.getFullModelRange(), text: value }]);
      editor.pushUndoStop();
      editor.setScrollTop(0);
    },
    showDiagnostics(diagnostics) {
      const model = editor.getModel();
      if (!model) return;
      monaco.editor.setModelMarkers(
        model,
        'hylo',
        // A site in another file, the standard library's, is nowhere in this code.
        diagnostics.filter((d) => d.file === MAIN_FILE).map((d) => ({
          severity: severity[d.level],
          // The whole diagnostic, as the compiler renders it.
          message: d.rendered.replace(/\n$/, ''),
          startLineNumber: d.site.line,
          startColumn: d.site.column,
          endLineNumber: d.site.endLine,
          // An empty range would underline nothing.
          endColumn:
            d.site.endLine === d.site.line
              ? Math.max(d.site.column + 1, d.site.endColumn)
              : d.site.endColumn,
        })),
      );
    },
    reveal(line, column) {
      editor.setPosition({ lineNumber: line, column });
      editor.revealLineInCenterIfOutsideViewport(line);
      editor.focus();
    },
    focus: () => editor.focus(),
    dispose: () => editor.dispose(),
  };
}
