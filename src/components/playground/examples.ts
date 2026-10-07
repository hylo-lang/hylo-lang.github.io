/**
 * Programs the full-screen playground offers to start from. Each compiles and runs with the
 * compiler as it is today, which has no printing yet: a program reports its result as its exit
 * status.
 */
export const EXAMPLES: readonly { name: string; source: string }[] = [
  {
    name: 'Exit status',
    source: `// A program reports its result as its exit status.
public fun main() -> Int32 {
  var x = 40
  &x = x + 2
  return if x == 42 { 42 } else { 1 }
}
`,
  },
  {
    name: 'Factorial',
    source: `fun factorial(n: sink Int32) -> Int32 {
  var m: Int32 = 1
  while n > (0 as Int32) {
    &m = m * n
    &n = n - (1 as Int32)
  }
  return m
}

public fun main() -> Int32 {
  factorial(5 as Int32)
}
`,
  },
  {
    name: 'Fibonacci',
    source: `fun fibonacci(n: sink Int32) -> Int32 {
  if n > (1 as Int32) {
    fibonacci(n - (1 as Int32)) + fibonacci(n - (2 as Int32))
  } else {
    n
  }
}

public fun main() -> Int32 {
  fibonacci(10 as Int32)
}
`,
  },
  {
    name: 'Traits',
    source: `trait P {
  fun f() -> Int32
  fun g() -> Int32 { self.f() + (2 as Int32) }
}

given <T> => T is P { fun f() -> Int32 { 40 } }

public fun main() -> Int32 {
  ().g()
}
`,
  },
  {
    name: 'A trap',
    source: `public fun main() {
  Builtin.trap()
}
`,
  },
  {
    name: 'A type error',
    source: `public fun main() -> Int32 {
  // Integer literals are \`Int\` unless something says otherwise.
  40 + 2
}
`,
  },
];
