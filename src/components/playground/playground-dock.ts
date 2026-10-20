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
  /** Called after every edit the reader makes to a file. */
  onEdit: () => void;
  /** Called when the reader presses Ctrl+Enter (⌘+Enter on a Mac) in an editor. */
  onRun: () => void;
  /**
   * Called when a file is added, removed or renamed, or another one is shown, or when `setFiles`
   * replaces the code of files.
   */
  onFilesChange: () => void;
  /**
   * Called after files are removed, by the reader or by `setFiles` asked to report it, with their
   * names, and what puts the files back as they were.
   */
  onRemove: (names: string[], undo: () => void) => void;
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
  /** Whether files are being replaced, until which the playground is not told of their changes. */
  #settingFiles = false;
  /** Whether a view is one requests can produce, as `setAvailableViews` last said. */
  #isAvailable: (view: View) => boolean = () => true;

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
    this.#api.onDidLayoutChange(() => {
      this.#updateTabs();
      // Panels moved or removed may leave a group showing an unavailable view.
      this.#showAvailable();
    });
    this.#api.onDidActivePanelChange(({ panel }) => {
      const file = this.#fileOf(panel);
      if (file) this.#lastActiveFile = file;
      if (this.#built && !this.#settingFiles && file) this.#options.onFilesChange();
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
    if (panel) this.#show(panel);
  }

  /** Shows `panel` in its group. */
  #show(panel: IDockviewPanel): void {
    // Without making its group the active one, which takes the keyboard from the editor.
    panel.api.group.model.openPanel(panel, { skipSetGroupActive: true });
  }

  /**
   * Shows the tabs of the views `isAvailable` accepts, and only those, as views a request cannot
   * produce are not. A group showing a view made unavailable shows the result in its place if it
   * holds it, or else another of its views available, or else a file; a group of views none of
   * which is available is hidden. This holds as the reader moves or removes panels too.
   */
  setAvailableViews(isAvailable: (view: View) => boolean): void {
    this.#isAvailable = isAvailable;
    for (const { view, tab } of this.#views) {
      tab.toggleAttribute('data-unavailable', !isAvailable(view));
    }
    this.#showAvailable();
  }

  /** Shows only the available views, as `setAvailableViews` says, as the layout is now. */
  #showAvailable(): void {
    const isUnavailable = (panel: IDockviewPanel): boolean => {
      const view = this.#viewOfPanel(panel.id);
      return view !== undefined && !this.#isAvailable(view.view);
    };
    for (const group of this.#api.groups) {
      // Hidden while none of its panels is available, keeping its place for when one is.
      const hidden = group.panels.length > 0 && group.panels.every(isUnavailable);
      if (group.api.isVisible === hidden) group.api.setVisible(!hidden);
      if (hidden || !group.activePanel || !isUnavailable(group.activePanel)) continue;
      const available = group.panels.filter((p) => !isUnavailable(p));
      const views = available.filter((p) => this.#viewOfPanel(p.id) !== undefined);
      this.#show(views.find((p) => p.id === viewPanelId('result')) ?? views[0] ?? available[0]);
    }
  }

  /**
   * Replaces the files with `files`, showing `active` or the first one: a file of the same name
   * keeps its editor, whose code is replaced as an edit the reader can undo, and the others are
   * removed, which the playground is told of iff `report`, or added.
   */
  setFiles(files: readonly SourceFile[], active?: string, report = true): void {
    const names = new Set(files.map((f) => f.name));
    const removed = this.#files.filter((f) => !names.has(f.name));
    const before = report && removed.length > 0 ? { files: this.files, active: this.active } : null;
    this.#settingFiles = true;
    try {
      // Added before the others are removed, so that they go where the files are.
      const replaced = files.map(({ name, contents }) => {
        const file = this.#files.find((f) => f.name === name);
        if (file === undefined) return this.#open({ name, contents });
        if (!file.editor) file.contents = contents;
        else if (file.editor.value !== contents) file.editor.replace(contents);
        return file;
      });
      for (const file of removed) this.#close(file);
      this.#files = replaced;
      this.#showFile(active) ?? this.#showFile(files[0]?.name);
    } finally {
      this.#settingFiles = false;
    }
    this.#options.onFilesChange();
    if (before) {
      // Putting them back removes no file the reader would want back.
      this.#options.onRemove(
        removed.map((file) => file.name),
        () => this.setFiles(before.files, before.active, false),
      );
    }
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
    const active = this.active === file.name ? this.#neighbourOf(file) : this.active;
    this.setFiles(
      this.files.filter((f) => f.name !== file.name),
      active,
      true,
    );
  }

  /** Called by a file's content once its panel is created: loads its editor into `host`. */
  async attach(id: string, host: HTMLElement): Promise<void> {
    const file = this.#files.find((f) => f.id === id);
    if (!file) return;
    const editor = await createEditor(host, {
      // As set when the editor is loaded, which `setFiles` may have changed meanwhile.
      value: () => file.contents,
      // The files changing at once are told of as one change, once they all have.
      onChange: () => {
        if (!this.#settingFiles) this.#options.onEdit();
      },
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

  /** Removes `file`, with its panel, and its group if that leaves it empty. */
  #close(file: DockFile): void {
    const panel = this.#api.getPanel(file.id);
    // Before the file is forgotten, so that `detach` finds its editor. Dockview removes the group
    // if this leaves it empty.
    if (panel) this.#api.removePanel(panel);
    this.#files.splice(this.#files.indexOf(file), 1);
    if (this.#lastActiveFile === file) this.#lastActiveFile = undefined;
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

  /** Returns the name of the file next to `file` in its group, after it or else before it. */
  #neighbourOf(file: DockFile): string | undefined {
    const panels = this.#api.getPanel(file.id)?.api.group.panels ?? [];
    const i = panels.findIndex((p) => p.id === file.id);
    return [...panels.slice(i + 1), ...panels.slice(0, i).reverse()]
      .map((p) => this.#fileOf(p)?.name)
      .find((name) => name !== undefined);
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
