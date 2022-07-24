---
layout: default
---

Val is a research programming language to explore the concepts of [mutable value semantics](http://www.jot.fm/issues/issue_2022_02/article2.pdf) and [generic programming](https://www.fm2gp.com) for high-level systems programming.

Val aims to be:
- **Fast by definition**: Val is compiled ahead-of-time to machine code and relies on its type system to support in-place mutation and avoid unecessary memory allocations. Val avoids hidden costs such as implicit copies and therefore avoids heavy dependence on an optimizer for basic performance.
- **Safe by default**: Val's foundation of [mutable value semantics](http://www.jot.fm/issues/issue_2022_02/article2.pdf) ensures that ordinary code is memory safe, typesafe, and data-race-free.  By explicit, auditable opt-in, programmers can use unsafe constructs for performance where necessary, and can build safe constructs using unsafe ones.
- **Simple**: Val borrows heavily from [Swift](https://swift.org) which has demonstrated a user-friendly approach to generic programming and deep support for value semantics.  Val's programming model strengthens and extends this support, while de-emphasizing reference semantics and avoiding the complexities that result from trying to make it statically safe (e.g., memory regions, lifetime annotations, etc.).
- **Interoperable with C++**: Programming languages rarely survive in vacuum. Val aims to take advantage of the vast software capital of C++ by supporting full interoperability.

The [language tour](./pages/language-tour.html) gives an overview of Val's features.
The [specification](https://github.com/val-lang/specification/blob/main/spec.md) (work in progress) provides detailed information about Val's syntax and semantics.

Val is under active development and is not ready to be used yet.
The code of the compiler is open source and [hosted on GitHub](https://github.com/val-lang/val).
The current status of the project is described on our [roadmap page](./pages/implementation-status.html).

## Sounds great, but why another language?

Our goals overlap substantially with that of Rust and other commendable efforts, such as [Zig](https://ziglang.org) or [Vale](https://vale.dev).
Besides, other programming languages have value semantics (e.g., R or Whiley) and/or provide excellent support for generic programming (e.g., Swift or Haskell).
So why another one?

What sets Val apart in the current landscape is its focus on mutable value semantics for the purpose of writing efficient, generic code, and its attention to C++ interoperability.
Val is a zero-cost abstraction language that fully acknowledges the physical constraints of computer architecture.
Yet, it presents a user model that marries these constraints with the benefits of value-oriented programming.

## Enough, show me some code!

Okay, okay.
Here's a simple program:

```val
subscript longer_of(_ a: inout String, _ b: inout String): String {
  if b.count() > a.count() { yield &b } else { yield &a }
}

func emphasize(_ z: inout String, strength: Int = 1) {
  z.append(repeat_element("!", count: strength)))
}

public fun main() {
  var (x, y) = ("Hi", "World")
  emphasize(&longer_of[&x, &y])
  print("${x} ${y}") // "Hi World!"
}
```

This program declares two character strings, appends an exclamation mark to the longest, and prints them both after the mutation.
No pointers or references are used (`&` in Val does not mean “address of”—it simply marks a mutation), and no unecessary allocation occurs.
The result of `longer_of` is a *projection* of the longer argument, so the mutation of `z` by `emphasize` occurs directly on the value of `y`.  The value is neither copied, nor moved, and yet it is not being passed by reference to `emphasize`.  The body of `emphasize` *owns* `z` in exactly the same way as it owns `strength`, which is passed by value: `z` is an independent value that can only be touched by `emphasize`.

To better understand, notice that `longer_of` is not a function; its a subscript.
A subscript does not return a value, it *projects* one, granting the caller temporary read and/or write access to it.

A Python programmer may think that `String` has reference semantics and that `longer_of` is simply returning a reference to `y`.
A C/C++ programmer may think of `longer_of` as a function that takes and returns pointers or mutable references to values.
Neither of these views are quite right.
All types in Val are value types and their instances behave like ints. 
As a result, the possible accesses to a function parameter are always visible in the body of that function, and can't be hidden behind some stored reference.

The language guarantees to `emphasize` that the value of `z` will not be accessed via `x` or `y` (or any other means) until that function returns.

A Rust programmer may think of `longer_of` as a function that borrows its arguments mutably and returns a mutable reference bound by the lifetime of those arguments.
What happens is semantically identical, but notice that in Val, `longer_of` has no lifetime annotations.
Lifetime annotations were not elided, they simply do not exist in Val because the it uses a simpler model, devoid of references.

Have a look at the section on subscripts in the [language tour](./pages/language-tour.html) to get more information.
