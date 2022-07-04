---
layout: default
---

Val is a research programming language to explore the concepts of [mutable value semantics](http://www.jot.fm/issues/issue_2022_02/article2.pdf) and [generic programming](https://www.fm2gp.com) for high-level systems programming.

Val aims to be:
- **Fast**: Val is compiled AOT to machine code and relies on its type system to support in-place mutation and avoid unecessary memory allocations.
- **Safe**: Val is memory safe in both single-threaded and concurrent settings. It does so by adopting mutable value semantics, a programming discipline that bans shared mutable state to uphold local reasoning.
- **Simple**: Val borrows heavily from the [Swift programming language](https://swift.org) which has demonstrated a user-friendly approach to generic programming. Further, its user model emphasizes on value, leaving out the typical complexities associated with reference semantics (e.g., memory regions, lifetime annotations, etc.).
- **Interperatible with C++**: Programming languages rarely survive in vacuum. Val aims to take advantage of the vast software capital of C++ by supporting full interperability.
