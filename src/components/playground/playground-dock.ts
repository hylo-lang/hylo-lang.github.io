/**
 * The full-screen playground's panels: an editor for each file of the program, and each view of
 * what the compiler made of it, in a dock (dockview) whose panels the reader can arrange, side by
 * side or in tabs, by dragging their tabs.
 *
 * The files start in a group of their own, and the views in another beside it, or below it in a
 * narrow window. A group holding only the program's one file hides its tabs, so that a program of
 * one file looks as an editor alone. A file's tab names it: double-clicking it renames the file,
 * its close button removes the file (which the playground offers to undo), and the button after
 * the tabs adds one. A view's tab names the view; views are never removed.
 */
import {
  createDockview,
  type DockviewApi,
  type DockviewGroupPanel,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
  type IDockviewPanel,
  type IGroupHeaderProps,
  type IHeaderActionsRenderer,
  type ITabRenderer,
  type TabPartInitParameters,
} from 'dockview';
import type { Diagnostic, SourceFile } from '@hylo-lang/hylo-wasm/protocol';
import { createEditor, type Editor } from './editor';
import { freshFileName, isFileName } from './file-names';
import { VIEW_TITLES, type View } from './views';

/** What the playground is told of the dock. */
export interface PlaygroundDockOptions {
  /** Called after every edit of a file. */
  onEdit: () => void;
  /** Called when the reader presses Ctrl+Enter (⌘+Enter on a Mac) in an editor. */
  onRun: () => void;
  /** Called when a file is added, removed or renamed, or another one is shown. */
  onFilesChange: () => void;
  /** Called when the reader removes the file `name`, with what puts it back. */
  onRemove: (name: string, undo: () => void) => void;
  /** Called when the panel of `view` is shown or hidden, as its group shows another. */
  onViewVisibility: (view: View, visible: boolean) => void;
}

/** A file of the dock. */
interface DockFile {
  /** The id of its panel, which stays as the file is renamed. */
  readonly id: string;
  name: string;
  /** Its editor, once loaded. */
  editor: Editor | null;
  /** Its contents until its editor is loaded. */
  contents: string;
  /** Its tab, once rendered. */
  tab: FileTab | null;
}

/** A view of the dock: the elements its panel and its tab show, which the playground fills. */
interface DockView {
  readonly view: View;
  /** The panel showing the view, which the playground's `ResultPane` for it writes. */
  readonly panel: HTMLElement;
  /** The tab's element, which the `ResultPane` marks as pending or failed. */
  readonly tab: HTMLElement;
}

/** The theme of the dock, whose look `playground-dock.css` gives as `.dockview-theme-hylo`. */
const THEME = { name: 'hylo', className: 'dockview-theme-hylo' };

/** The kinds of panels, as dockview's components and tab components name them. */
const FILE = 'file';
const VIEW = 'view';

/** Returns the id of the panel of `view`. */
const viewPanelId = (view: View): string => `view-${view}`;

/** How many file panels have been created, which numbers the next one's id. */
let filePanelCount = 0;

/** The dock; see the module's documentation. */
export class PlaygroundDock {
  readonly #api: DockviewApi;
  readonly #options: PlaygroundDockOptions;
  /** The files, in the order of the program. */
  #files: DockFile[] = [];
  /** The views, in the order of their tabs. */
  readonly #views: DockView[];
  /** The file whose panel was last active, which is shown, and next to which files are added. */
  #lastActiveFile: DockFile | undefined;
  /** The diagnostics last shown, which an editor loading later shows too. */
  #diagnostics: readonly Diagnostic[] = [];
  /** The button adding files after the tabs of each group, by the group's id. */
  readonly #addFileActions = new Map<string, HTMLElement>();
  /**
   * Whether the constructor is done, before which the playground, still waiting for the dock, is
   * told nothing.
   */
  #built = false;

  /**
   * Creates a dock in `host` of `files`, showing `active` or the first file, and of `views`,
   * showing `selectedView`.
   */
  constructor(
    host: HTMLElement,
    files: readonly SourceFile[],
    active: string | undefined,
    views: readonly View[],
    selectedView: View,
    options: PlaygroundDockOptions,
  ) {
    this.#options = options;
    this.#views = views.map((view) => {
      const panel = document.createElement('div');
      panel.className = 'pg-panel pg-dock-view';
      const tab = document.createElement('span');
      tab.className = 'pg-dock-tab pg-dock-view-tab';
      tab.dataset.view = view;
      tab.textContent = VIEW_TITLES[view];
      return { view, panel, tab };
    });
    this.#api = createDockview(host, {
      theme: THEME,
      // Editors keep their state, as the reader's selection and undo history, in other tabs.
      defaultRenderer: 'always',
      disableFloatingGroups: true,
      createComponent: ({ id, name }) =>
        name === VIEW
          ? new ViewContent(this.#viewOfPanel(id)!, (view, visible) => {
              if (this.#built) options.onViewVisibility(view, visible);
            })
          : new FileContent(this),
      createTabComponent: ({ id, name }) =>
        name === VIEW ? new ViewTab(this.#viewOfPanel(id)!) : new FileTab(this),
      createRightHeaderActionComponent: (group) => new AddFileAction(this, group),
    });
    this.#api.onDidAddPanel(() => this.#updateTabs());
    this.#api.onDidRemovePanel(() => this.#updateTabs());
    this.#api.onDidLayoutChange(() => this.#updateTabs());
    this.#api.onDidActivePanelChange(({ panel }) => {
      const file = this.#fileOf(panel);
      if (file) this.#lastActiveFile = file;
      if (this.#built && file) this.#options.onFilesChange();
    });

    for (const file of files) this.#open(file);
    const filesGroup = this.#api.groups[0];
    const narrow = matchMedia('(max-width: 50rem)').matches;
    for (const [i, { view }] of this.#views.entries()) {
      this.#api.addPanel({
        id: viewPanelId(view),
        component: VIEW,
        tabComponent: VIEW,
        title: VIEW_TITLES[view],
        inactive: true,
        position:
          i === 0
            ? { referenceGroup: filesGroup, direction: narrow ? 'below' : 'right' }
            : { referencePanel: viewPanelId(this.#views[0].view), direction: 'within' },
      });
    }
    this.showView(selectedView);
    this.#showFile(active) ?? this.#showFile(files[0]?.name);
    this.#updateTabs();
    this.#built = true;
  }

  /** The files, in the order of the program, with their contents now. */
  get files(): SourceFile[] {
    return this.#files.map((f) => ({ name: f.name, contents: f.editor?.value ?? f.contents }));
  }

  /** The name of the file shown last made active. */
  get active(): string | undefined {
    return this.#lastActiveFile?.name;
  }

  /** Returns the panel of `view`, which the playground fills with it. */
  viewPanel(view: View): HTMLElement {
    return this.#views.find((v) => v.view === view)!.panel;
  }

  /** Returns the element of the tab of `view`, which the playground marks. */
  viewTab(view: View): HTMLElement {
    return this.#views.find((v) => v.view === view)!.tab;
  }

  /** Returns whether the panel of `view` is the one its group shows. */
  isViewVisible(view: View): boolean {
    return this.#api.getPanel(viewPanelId(view))?.api.isVisible ?? false;
  }

  /** Shows `view` in its group. */
  showView(view: View): void {
    const panel = this.#api.getPanel(viewPanelId(view));
    // Without making its group the active one, which takes the keyboard from the editor.
    panel?.api.group.model.openPanel(panel, { skipSetActive: true });
  }

  /** Shows the tab of `view` iff `available`, as views a request cannot produce are not. */
  setViewAvailable(view: View, available: boolean): void {
    this.viewTab(view).toggleAttribute('data-unavailable', !available);
  }

  /**
   * Replaces the files with `files`, showing `active` or the first one: a file of the same name
   * keeps its editor, whose code is replaced as an edit the reader can undo, and the others are
   * removed or added.
   */
  setFiles(files: readonly SourceFile[], active?: string): void {
    for (const file of [...this.#files]) {
      if (!files.some((f) => f.name === file.name)) this.#close(file);
    }
    for (const { name, contents } of files) {
      const file = this.#files.find((f) => f.name === name);
      if (file === undefined) this.#open({ name, contents });
      else if (file.editor) {
        if (file.editor.value !== contents) file.editor.replace(contents);
      } else file.contents = contents;
    }
    this.#files.sort(
      (a, b) =>
        files.findIndex((f) => f.name === a.name) - files.findIndex((f) => f.name === b.name),
    );
    this.#showFile(active) ?? this.#showFile(files[0]?.name);
    this.#options.onFilesChange();
  }

  /** Adds a file of a fresh name, in `group` or by the files, shows it, and lets the reader name it. */
  addFile(group?: DockviewGroupPanel): void {
    const name = freshFileName(new Set(this.#files.map((f) => f.name)), 'untitled');
    const file = this.#open({ name, contents: '' }, group);
    this.#showFile(name);
    this.#options.onFilesChange();
    // Once its tab is rendered.
    requestAnimationFrame(() => file.tab?.startRenaming());
  }

  /** Returns whether `diagnostic` is in one of the files, where the reader can be taken to it. */
  contains(diagnostic: Diagnostic): boolean {
    return this.#fileOfDiagnostic(diagnostic) !== undefined;
  }

  /** Marks each of `diagnostics` in the editor of its file, replacing those marked before. */
  showDiagnostics(diagnostics: readonly Diagnostic[]): void {
    this.#diagnostics = diagnostics;
    for (const file of this.#files) this.#showDiagnosticsOf(file);
  }

  /** Shows the file of `diagnostic`, and moves the caret to it in its editor. */
  reveal(diagnostic: Diagnostic): void {
    const file = this.#fileOfDiagnostic(diagnostic);
    if (!file) return;
    this.#api.getPanel(file.id)?.api.setActive();
    file.editor?.reveal(diagnostic.site.line, diagnostic.site.column);
  }

  /** Gives the keyboard focus to the editor of the file shown. */
  focus(): void {
    this.#lastActiveFile?.editor?.focus();
  }

  /**
   * Returns why `name` cannot be the new name of the file of the panel `id`, or `null` if it can.
   */
  problemWithName(id: string, name: string): string | null {
    if (!isFileName(name)) return 'A name such as point.hylo or geometry/point.hylo';
    if (this.#files.some((f) => f.name === name && f.id !== id)) return `${name} is taken`;
    return null;
  }

  /** Renames the file of the panel `id` to `name`, which `problemWithName` accepts. */
  rename(id: string, name: string): void {
    const file = this.#files.find((f) => f.id === id);
    if (!file || file.name === name) return;
    file.name = name;
    this.#api.getPanel(id)?.api.setTitle(name);
    this.#showDiagnosticsOf(file);
    this.#options.onFilesChange();
  }

  /** Removes the file of the panel `id`, unless it is the last, and offers to put it back. */
  remove(id: string): void {
    const file = this.#files.find((f) => f.id === id);
    if (!file || this.#files.length === 1) return;
    const index = this.#files.indexOf(file);
    const removed = { name: file.name, contents: file.editor?.value ?? file.contents };
    this.#close(file);
    this.#options.onFilesChange();
    this.#options.onRemove(removed.name, () => {
      if (this.#files.some((f) => f.name === removed.name)) return;
      const restored = this.#open(removed);
      // Back where it was in the program.
      this.#files.splice(this.#files.indexOf(restored), 1);
      this.#files.splice(Math.min(index, this.#files.length), 0, restored);
      this.#showFile(removed.name);
      this.#options.onFilesChange();
    });
  }

  /** Called by a file's content once its panel is created: loads its editor into `host`. */
  async attach(id: string, host: HTMLElement): Promise<void> {
    const file = this.#files.find((f) => f.id === id);
    if (!file) return;
    const editor = await createEditor(host, {
      value: file.contents,
      onChange: () => this.#options.onEdit(),
      onRun: () => this.#options.onRun(),
    });
    if (!this.#files.includes(file)) {
      editor.dispose();
      return;
    }
    file.editor = editor;
    this.#showDiagnosticsOf(file);
    if (this.#lastActiveFile === file) editor.focus();
  }

  /** Called by a file's content when its panel is shown again: lays its editor out. */
  shown(id: string): void {
    this.#files.find((f) => f.id === id)?.editor?.layout();
  }

  /** Called by a file's content when its panel is disposed. */
  detach(id: string): void {
    const file = this.#files.find((f) => f.id === id);
    file?.editor?.dispose();
    if (file) file.editor = null;
  }

  /** Called by a group's button adding files once rendered, and with `null` once disposed. */
  setAddFileAction(group: DockviewGroupPanel, element: HTMLElement | null): void {
    if (element) this.#addFileActions.set(group.id, element);
    else this.#addFileActions.delete(group.id);
    this.#updateTabs();
  }

  /** Called by a file's tab once rendered. */
  setTab(id: string, tab: FileTab): void {
    const file = this.#files.find((f) => f.id === id);
    if (file) file.tab = tab;
  }

  /** Whether the program has a single file, which cannot be removed. */
  get isSingle(): boolean {
    return this.#files.length === 1;
  }

  /**
   * Adds a panel for `file`, in `group`, or else that of the file last active, or of any file, and
   * returns it.
   */
  #open({ name, contents }: SourceFile, group?: DockviewGroupPanel): DockFile {
    const file: DockFile = {
      id: `file-${++filePanelCount}`,
      name,
      editor: null,
      contents,
      tab: null,
    };
    const near =
      group ??
      (this.#lastActiveFile && this.#api.getPanel(this.#lastActiveFile.id)?.api.group) ??
      this.#files.map((f) => this.#api.getPanel(f.id)?.api.group).find((g) => g !== undefined);
    this.#files.push(file);
    this.#api.addPanel({
      id: file.id,
      component: FILE,
      tabComponent: FILE,
      title: name,
      inactive: true,
      // As a tab of that group, rather than a group of its own beside it, as dockview would.
      ...(near && { position: { referenceGroup: near, direction: 'within' } }),
    });
    return file;
  }

  /** Removes the panel of `file`, and its group if it leaves it empty. */
  #close(file: DockFile): void {
    this.#files.splice(this.#files.indexOf(file), 1);
    if (this.#lastActiveFile === file) this.#lastActiveFile = undefined;
    const panel = this.#api.getPanel(file.id);
    if (!panel) return;
    const group = panel.api.group;
    this.#api.removePanel(panel);
    if (group.panels.length === 0 && this.#api.groups.length > 1) this.#api.removeGroup(group);
  }

  /** Shows the file `name`, if there is one, returning `null` if there is none. */
  #showFile(name: string | undefined): true | null {
    const file = this.#files.find((f) => f.name === name);
    if (!file) return null;
    this.#api.getPanel(file.id)?.api.setActive();
    this.#lastActiveFile = file;
    return true;
  }

  /**
   * Hides the tabs of a group holding only the program's one file, and shows those of the
   * others.
   */
  #updateTabs(): void {
    for (const group of this.#api.groups) {
      const holdsFiles = group.panels.some((panel) => this.#fileOf(panel) !== undefined);
      group.header.hidden =
        this.isSingle && group.panels.every((panel) => this.#fileOf(panel) !== undefined);
      // Files are added among files, not among the views.
      const action = this.#addFileActions.get(group.id);
      if (action) action.hidden = !holdsFiles;
      // The lone file's own button, while its group shows no tabs with theirs.
      for (const panel of group.panels) {
        if (this.#fileOf(panel)) {
          panel.view.content.element.toggleAttribute('data-alone', group.header.hidden);
        }
      }
    }
  }

  /** Returns the file of `panel`. */
  #fileOf(panel: IDockviewPanel | undefined): DockFile | undefined {
    return this.#files.find((f) => f.id === panel?.id);
  }

  /** Returns the view of the panel `id`. */
  #viewOfPanel(id: string): DockView | undefined {
    return this.#views.find((v) => viewPanelId(v.view) === id);
  }

  /** Returns the file `diagnostic` is in, if it is one of the dock's. */
  #fileOfDiagnostic(diagnostic: Diagnostic): DockFile | undefined {
    // The compiler names a file `name` by the path of `hylo:///name`.
    return this.#files.find((f) => diagnostic.file === `/${f.name}`);
  }

  /** Marks the diagnostics in `file` in its editor, if it is loaded. */
  #showDiagnosticsOf(file: DockFile): void {
    file.editor?.showDiagnostics(this.#diagnostics.filter((d) => d.file === `/${file.name}`));
  }
}

/** The contents of a file's panel: the host of its editor. */
class FileContent implements IContentRenderer {
  /**
   * The panel: the editor's host, and a button adding a file, which `playground-dock.css` shows,
   * faintly, while the file is alone, and its group shows no tabs, with their own button.
   */
  readonly element = document.createElement('div');
  readonly #host = document.createElement('div');
  #id = '';

  constructor(private readonly dock: PlaygroundDock) {
    this.element.className = 'pg-dock-file';
    this.#host.className = 'pg-dock-editor';
    const add = addFileButton('pg-dock-add pg-dock-add-alone', () => dock.addFile());
    this.element.append(this.#host, add);
  }

  init({ api }: GroupPanelPartInitParameters): void {
    this.#id = api.id;
    api.onDidVisibilityChange(({ isVisible }) => {
      if (isVisible) this.dock.shown(this.#id);
    });
    void this.dock.attach(this.#id, this.#host);
  }

  dispose(): void {
    this.dock.detach(this.#id);
  }
}

/** The contents of a view's panel: the element the playground fills with the view. */
class ViewContent implements IContentRenderer {
  readonly element: HTMLElement;

  constructor(
    private readonly view: DockView,
    private readonly onVisibility: (view: View, visible: boolean) => void,
  ) {
    this.element = view.panel;
  }

  init({ api }: GroupPanelPartInitParameters): void {
    api.onDidVisibilityChange(({ isVisible }) => this.onVisibility(this.view.view, isVisible));
  }
}

/** The tab of a view: its title, and no way of removing it. */
class ViewTab implements ITabRenderer {
  readonly element: HTMLElement;

  constructor(view: DockView) {
    this.element = view.tab;
  }

  init(_: TabPartInitParameters): void {}
}

/** The tab of a file: its name, which double-clicking edits, and a button removing it. */
class FileTab implements ITabRenderer {
  readonly element = document.createElement('div');
  readonly #label = document.createElement('span');
  readonly #close = document.createElement('button');
  #id = '';

  constructor(private readonly dock: PlaygroundDock) {
    this.element.className = 'pg-dock-tab';
    this.#label.className = 'pg-dock-tab-name';
    this.#close.type = 'button';
    this.#close.className = 'pg-dock-tab-close';
    this.#close.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    this.element.append(this.#label, this.#close);
  }

  init({ api, title }: TabPartInitParameters): void {
    this.#id = api.id;
    this.#setName(title ?? '');
    api.onDidTitleChange(({ title }) => this.#setName(title));
    this.#label.addEventListener('dblclick', () => this.startRenaming());
    // Not the start of a drag of the tab, nor its activation.
    this.#close.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.#close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.dock.remove(this.#id);
    });
    this.dock.setTab(this.#id, this);
  }

  /** Replaces the name by a field editing it, which Enter or leaving it confirms, Escape cancels. */
  startRenaming(): void {
    const old = this.#label.textContent ?? '';
    const input = document.createElement('input');
    input.className = 'pg-dock-tab-input';
    input.value = old;
    input.size = Math.max(old.length, 8);
    input.spellcheck = false;
    input.setAttribute('aria-label', 'File name');
    // The field takes the pointer and the keyboard rather than the dock.
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'dblclick']) {
      input.addEventListener(type, (event) => event.stopPropagation());
    }
    let done = false;
    const finish = (confirm: boolean) => {
      if (done) return;
      const name = input.value.trim();
      if (confirm && name !== old && this.dock.problemWithName(this.#id, name) !== null) {
        return;
      }
      done = true;
      input.replaceWith(this.#label);
      if (confirm && name !== old) this.dock.rename(this.#id, name);
    };
    input.addEventListener('input', () => {
      const problem =
        input.value.trim() === old ? null : this.dock.problemWithName(this.#id, input.value.trim());
      input.toggleAttribute('aria-invalid', problem !== null);
      input.title = problem ?? '';
      input.size = Math.max(input.value.length, 8);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
    });
    // Leaving the field with a name that cannot be keeps the old one.
    input.addEventListener('blur', () => {
      finish(true);
      if (!done) finish(false);
    });
    this.#label.replaceWith(input);
    input.focus();
    input.setSelectionRange(0, old.replace(/\.hylo$/, '').length);
  }

  /** Shows `name` as the file's, in the tab and to assistive technologies. */
  #setName(name: string): void {
    this.#label.textContent = name;
    this.#label.title = 'Double-click to rename';
    this.#close.setAttribute('aria-label', `Remove ${name}`);
    this.#close.title = `Remove ${name}`;
  }
}

/** Returns a button adding a file, of class `className`, calling `add`. */
function addFileButton(className: string, add: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = 'New file';
  button.setAttribute('aria-label', 'New file');
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  button.addEventListener('click', add);
  return button;
}

/** The button after the tabs of a group, adding a file to it, if the group holds files. */
class AddFileAction implements IHeaderActionsRenderer {
  readonly element = document.createElement('div');

  constructor(
    private readonly dock: PlaygroundDock,
    private readonly group: DockviewGroupPanel,
  ) {
    this.element.className = 'pg-dock-actions';
    this.element.append(addFileButton('pg-dock-add', () => dock.addFile(group)));
    dock.setAddFileAction(group, this.element);
  }

  init(_: IGroupHeaderProps): void {}

  dispose(): void {
    this.dock.setAddFileAction(this.group, null);
  }
}
