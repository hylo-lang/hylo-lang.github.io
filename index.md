---
layout: default
---

Hylo (formely Val) is a programming language that leverages [mutable value semantics](http://www.jot.fm/issues/issue_2022_02/article2.pdf) and [generic programming](https://www.fm2gp.com) for high-level systems programming.

Hylo aims to be:
- **Fast by definition**: Hylo is compiled ahead-of-time to machine code and relies on its type system to support in-place mutation and avoid unnecessary memory allocations. Hylo avoids hidden costs such as implicit copies and therefore avoids heavy dependence on an optimizer for basic performance.
- **Safe by default**: Hylo's foundation of [mutable value semantics](http://www.jot.fm/issues/issue_2022_02/article2.pdf) ensures that ordinary code is memory safe, typesafe, and data-race-free. By explicit, auditable opt-in, programmers can use unsafe constructs for performance where necessary, and can build safe constructs using unsafe ones.
- **Simple**: Hylo borrows heavily from [Swift](https://swift.org) which has demonstrated a user-friendly approach to generic programming and deep support for value semantics. Hylo's programming model strengthens and extends this support, while de-emphasizing reference semantics and avoiding the complexities that result from trying to make it statically safe (e.g., memory regions, lifetime annotations, etc.).

The [language tour](https://docs.hylo-lang.org/language-tour/) gives an overview of Hylo's features.
The [language specification](https://github.com/hylo-lang/specification/blob/main/spec.md) and [IR specification](https://docs.hylo-lang.org/hylo-ir/) (work in progress) provides detailed information about Hylo's syntax and semantics.

Hylo is under active development and is not ready to be used yet.
The code of the compiler is open source and [hosted on GitHub](https://github.com/hylo-lang/hyloc).
The current status of the project is described on our [roadmap page](./pages/implementation-status.html).

We opened a forum to host [community discussions](https://github.com/orgs/hylo-lang/discussions).
Please ask questions and/or tell us what you think about the Hylo project!

## Sounds great, but why another language?

Our goals overlap substantially with that of Rust and other commendable efforts, such as [Zig](https://ziglang.org) or [Vale](https://vale.dev).
Besides, other programming languages have value semantics (e.g., R or Whiley) and/or provide excellent support for generic programming (e.g., Swift or Haskell).
So why another one?

What sets Hylo apart in the current landscape is its focus on mutable value semantics for the purpose of writing efficient, generic code.
Hylo is a zero-cost abstraction language that fully acknowledges the physical constraints of computer architecture.
Yet, it presents a user model that marries these constraints with the benefits of value-oriented programming.

## Enough, show me some code!

Okay, okay.
Here's the kind of program we envision writing in Hylo:

```hylo
subscript longer_of(_ a: inout String, _ b: inout String): String {
  if b.count() > a.count() { yield &b } else { yield &a }
}

fun emphasize(_ z: inout String, strength: Int = 1) {
  z.append(repeat_element("!", count: strength))
}

public fun main() {
  var (x, y) = ("Hi", "World")
  emphasize(&longer_of[&x, &y])
  print("${x} ${y}") // "Hi World!"
}
```

This program declares two character strings, appends an exclamation mark to the longest, and prints them both after the mutation.
No pointers or references are used (`&` in Hylo does not mean “address of”—it simply marks a mutation), and no unnecessary allocation occurs.
The result of `longer_of` is a *projection* of the longer argument, so the mutation of `z` by `emphasize` occurs directly on the value of `y`.  The value is neither copied, nor moved, and yet it is not being passed by reference to `emphasize`.  The body of `emphasize` *owns* `z` in exactly the same way as it owns `strength`, which is passed by value: `z` is an independent value that can only be touched by `emphasize`.

To better understand, notice that `longer_of` is not a function; it's a subscript.
A subscript does not return a value, it *projects* one, granting the caller temporary read and/or write access to it.

A Python programmer may think that `String` has reference semantics and that `longer_of` is simply returning a reference to `y`.
A C/C++ programmer may think of `longer_of` as a function that takes and returns pointers or mutable references to values.
Neither of these views are quite right.
All types in Hylo are value types and their instances behave like ints. 
As a result, the possible accesses to a function parameter are always visible in the body of that function, and can't be hidden behind some stored reference.

The language guarantees to `emphasize` that the value of `z` will not be accessed via `x` or `y` (or any other means) until that function returns.

A Rust programmer may think of `longer_of` as a function that borrows its arguments mutably and returns a mutable reference bound by the lifetime of those arguments.
What happens is semantically identical, but notice that in Hylo, `longer_of` has no lifetime annotations.
Lifetime annotations were not elided, they simply do not exist in Hylo because it uses a simpler model, devoid of references.

Have a look at the section on subscripts in the [language tour](https://docs.hylo-lang.org/language-tour/subscripts) to get more information.
