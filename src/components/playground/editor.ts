/**
 * The code editor of a playground: Monaco, highlighted by the same grammars and themes as the
 * site's static code blocks, and following the site's light or dark theme.
 */
import { shikiToMonaco } from '@shikijs/monaco';
import * as monaco from './monaco';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { getHighlighter, THEMES } from './highlight';
import type { Diagnostic } from './protocol';

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

/** Resolves once Monaco highlights through Shiki; done once per page. */
const ready = (async () => {
  for (const id of ['hylo', 'hylo-ir', 'wasm-asm', 'llvm']) monaco.languages.register({ id });
  shikiToMonaco(await getHighlighter(), monaco as never);
})();

/** The theme matching the page's: Starlight sets `data-theme` on the root element. */
function pageTheme(): string {
  return document.documentElement.dataset.theme === 'light' ? THEMES.light : THEMES.dark;
}
new MutationObserver(() => monaco.editor.setTheme(pageTheme())).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

/** What a playground may ask of its editor. */
export interface Editor {
  readonly value: string;
  /** Replaces the code, as an edit the reader can undo. */
  replace(value: string): void;
  /** Underlines `diagnostics`, replacing those shown before. */
  showDiagnostics(diagnostics: Diagnostic[]): void;
  /** Moves the caret to `line`:`column`, scrolls it into view and focuses the editor. */
  reveal(line: number, column: number): void;
  focus(): void;
  dispose(): void;
}

export interface EditorOptions {
  /** The Hylo code the editor starts with. */
  value: string;
  /**
   * Whether the editor grows with its content, as one embedded in prose does, rather than filling
   * its container.
   */
  fitContent?: boolean;
  /** Called after every edit. */
  onChange?: (value: string) => void;
  /** Called on Ctrl+Enter (⌘+Enter on a Mac). */
  onRun?: () => void;
}

/** Creates an editor in `host`. */
export async function createEditor(host: HTMLElement, options: EditorOptions): Promise<Editor> {
  await ready;
  const editor = monaco.editor.create(host, {
    value: options.value,
    language: 'hylo',
    theme: pageTheme(),
    fontFamily: 'var(--__sl-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
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
  editor.onDidChangeModelContent(() => options.onChange?.(editor.getValue()));
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
        diagnostics.map((d) => ({
          severity: severity[d.level],
          message: d.message,
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
