/**
 * The program on the home page: a subscript projecting the lesser of two variables, which the
 * caller then mutates in place. The page shows `excerpt`, and its playground link opens `program`,
 * which `home-example.test.ts` checks compiles and runs.
 */

/** The whole program, as the playground opens it. */
export const program = `/// Projects the lesser of \`a\` and \`b\`, which the caller can then mutate in place.
subscript min(a: inout Int, b: inout Int) inout -> Int {
  if a < b { yield &a } else { yield &b }
}

public fun main() {
  var (x, y) = (4, 2)
  inout m = &min[&x, &y]
  &m += 1
  precondition(y == 3)
}
`;

/** What the page shows of `program`: the subscript, and its use without the \`main\` around it. */
export const excerpt = `subscript min(a: inout Int, b: inout Int) inout -> Int {
  if a < b { yield &a } else { yield &b }
}

var (x, y) = (4, 2)
inout m = &min[&x, &y]
&m += 1  // y is now 3`;
