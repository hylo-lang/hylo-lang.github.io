# Syntax grammars

TextMate grammars for the site's code blocks and the playground (see `credits.md` for where each
comes from). Two describe the compiler's textual outputs, and are maintained here:

| grammar | language id | for |
|---|---|---|
| `hylo-ir.tmLanguage.json` | `hylo-ir` | Hylo IR, as `hc --emit raw-ir` and `--emit ir` print it |
| `wasm-asm.tmLanguage.json` | `wasm-asm` | WebAssembly as LLVM prints it for wasm32 targets (`hc --emit asm`): GNU-style directives and labels, not the WAT text format |

LLVM IR needs no grammar here: Shiki and most editors have one.

`syntax.test.ts` checks them through the highlighter the site uses: it highlights the IR and
assembly that the playground's compiler prints for the examples, and fails if any word is left
without a scope, so a construct the compiler learns shows up there first. It also checks both
grammars line by line. `pnpm test` runs it, with the compiler from `@hylo-lang/hylo-wasm`.

The scopes are the conventional TextMate ones, so any theme colours them. For Hylo IR:

| what | scope |
|---|---|
| `fun`, `global` | `keyword.other.*` |
| instructions (`access`, `store`, ...) | `keyword.other.instruction` |
| terminators (`br`, `condbr`, `return`, ...) | `keyword.control.terminator` |
| conventions and capabilities (`let`, `inout`, `sink`, `set`) | `storage.modifier.convention` |
| `%pN`, `%rN`, `%bN` | `variable.parameter`, `variable.other.register`, `entity.name.label.block` |
| function names, synthesized names (`$implementation[...]`) | `entity.name.function`, `support.function.synthesized` |
| builtins (`icmp_sgt_i32`) | `support.function.builtin` |
| machine types (`i32`, `ptr`, `float64`), other types | `storage.type.machine`, `entity.name.type` |
| `#preferred`, `#witness`, `#!poison` | `constant.language.*` |
