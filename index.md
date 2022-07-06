---
layout: default
---

Val is a research programming language to explore the concepts of [mutable value semantics](http://www.jot.fm/issues/issue_2022_02/article2.pdf) and [generic programming](https://www.fm2gp.com) for high-level systems programming.

Val aims to be:
- **Fast**: Val is compiled AOT to machine code and relies on its type system to support in-place mutation and avoid unecessary memory allocations.
- **Safe**: Val is memory safe in both single-threaded and concurrent settings. It does so by adopting mutable value semantics, a programming discipline that bans shared mutable state to uphold local reasoning.
- **Simple**: Val borrows heavily from [Swift](https://swift.org) which has demonstrated a user-friendly approach to generic programming. Further, its user model emphasizes on value, leaving out the typical complexities associated with reference semantics (e.g., memory regions, lifetime annotations, etc.).
- **Interoperable with C++**: Programming languages rarely survive in vacuum. Val aims to take advantage of the vast software capital of C++ by supporting full interoperability.

The [language tour](./language-tour.html) gives an overview of Val's most salient feature.
The [specification](https://github.com/val-lang/specification/blob/main/spec.md) (work in progress) provides detailed information about Val's syntax and semantics.

Val is under active development and is not ready to be used yet.
The code of the compiler is open source and [hosted on GitHub](https://github.com/val-lang/val).

## Sounds great, but why another language?

Our goals overlap substantially with that of Rust and other commandable efforts, such as [Zig](https://ziglang.org) or [Vale](https://vale.dev).
Besides, other programming languages have value semantics (e.g., R or Whiley) and/or provide excellent support for generic programming (e.g., Swift or Haskell).
So why another one?

What sets Val apart in the current landscape is its focus on mutable value semantics for the purpose of writing efficient, generic code.
Val is a zero-cost abstraction language that fully acknowledges the physical constraints of computer architecture.
Yet, it presents a user model that marries these constraints with the benefits of value-oriented programming.

## Enough, show me some code!

Okay, okay.
Here's a simple program:

```val
subscript longer_of(_ a: inout String, _ b: inout String): String {
  yield if b.count() > a.count() { &b } else { &a }
}

public fun main() {
  var (x, y) = ("Hi", "World")
  inout z = longer_of[&x, &y]
  z .append("!")
  print("${x} ${y}") // "Hi World!"
}
```

This program declares two character strings, appends an exclamation mark to the longest, and prints them both after the mutation.
No unecessary allocation occurs.
The result of `longer_of` is a *projection* of the longer argument so the mutation of `z` applies in place, directly on the value of `y`.

To better understand, notice that `longer_of` is not a function; its a subscript.
A subscript does not return a value, it *projects* one, granting the caller temporary read and/or write access to it.

A Python programmer may think that `String` has reference semantics and that `longer_of` is simply returning a reference to `y`.
But all types in Val are value types and behave like ints.
There's a slightly more subtle mechanism at play.

A C/C++ programmer may think of `longer_of` as a function that takes and returns pointers or mutable references.
But Val offers more safety.
First, it guarantees that the values of the arguments `a` and `b` may not overlap.
Second, it guarantees that the value of `z` may not be accessed via `x` or `y` (or any other means) until the projection ends.

A Rust programmer may think of `longer_of` as a function that borrows its arguments mutably and returns a mutable reference bound by the lifetime of those arguments.
What happens is very similar, but notice that `longer_of` has no lifetime annotations.
There are not elided, they simply do not exist in Val because the it uses a simpler model, devoid of references.

Have a look at the section on subscripts in the [language tour](./language-tour.html) to get more information.
