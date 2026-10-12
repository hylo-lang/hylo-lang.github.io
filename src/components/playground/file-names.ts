/**
 * The names of a program's files, as snippets (`src/plugins/playground-source.ts`) and the
 * full-screen playground give them, and links to it carry them (`share.ts`).
 */

/**
 * The file names a program's files may have: `.hylo` files, in directories or not, whose names
 * the compiler shows in diagnostics as they are.
 */
export const FILE_NAME = /^[\w-]+(?:[./][\w-]+)*\.hylo$/;

/** Returns whether `name` is one a file of a program may have (see `FILE_NAME`). */
export const isFileName = (name: string): boolean => FILE_NAME.test(name);

/**
 * Returns the first of `<stem>.hylo`, `<stem>2.hylo`, `<stem>3.hylo` and so on that `taken` does
 * not have.
 */
export function freshFileName(taken: ReadonlySet<string>, stem = 'main'): string {
  for (let i = 1; ; ++i) {
    const name = i === 1 ? `${stem}.hylo` : `${stem}${i}.hylo`;
    if (!taken.has(name)) return name;
  }
}
