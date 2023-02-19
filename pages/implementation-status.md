---
layout: default
---

Val's implementation is at a very early stage.
Key components of the compiler are still to be implemented before a first version of the language can be used.
Further, some aspects of the language design are still immature and will likely require more iterations.

This page gives an overview of our roadmap going forward and provides details on our main milestones.

## 2023 - Q1/Q2

While we weren't able to deliver an alpha version of Val in 2022, we made significant progress on our original goals.
In particular, we finalized the design of stored projections, a feature essential to implement collection views of generic types in safe Val.
Elements of our design are presented here: https://github.com/val-lang/val-lang.github.io/discussions/39.

Our main objectives for the first half of 2023 are now as follow:
- deliver an alpha version of Val;
- validate the language's design; and
- assess its usability.

Progress toward those objectives will be measured by the following milestones:

### Implement a reference compiler

We expect to deliver a first version of an experimental compiler for Val sometime in late Q2.
This implementation will serve as a proof of concept to build non-trivial programs and evaluate the language's usability.
As such, we will not focus on performance and will push most optimizing code transformations to 2024.

We have already built a [prototype](https://github.com/val-lang/val) capable of compiling a small subset of Val to C++.
The following key components must be either completed or developed from scratch to turn that prototype into a working implementation:

#### Type inferrer/checker

The type inferrer/checker is the component responsible to verify that programs satisfy the flow-insensitive semantics of Val.
Its current implementation can analyze a sizeable subset of Val.
However, significant effort is still required to support generic features.

#### Intermediate representation

Once checked by the flow-insensitive type checker, Val programs are translated to an intermediate representation (IR) that is used to perform flow-sensitive type checking (a.k.a. lifetime and ownership analysis) and guaranteed optimizations.

Although we have already laid out foundations, the design of the IR itself is still a work in progress, as it is being co-designed with its implementation.
We plan on providing a specification by the end of the year.

The translation from Val source to the IR currently handles a small subset of the language.

#### Lifetime and ownership analysis

Lifetime and ownership analysis are two transformation passes that consume raw IR, freshly translated from the source code.
They instrument it with appropriate instructions to model the state of objects and memory at runtime and finally check whether programs satisfy the flow-sensitive semantics of Val.

The current implementation handles the same small subset as the IR translation.

#### LLVM Code generation

We opted to use LLVM as our backend.
Thus, the last step of our frontend pipeline is to emit bitcode and let LLVM generate machine code.

### Implement one-way interoperability with C++

Interoperability with C++ is one of the main goals of the Val project.
Despite their similarities, however, both languages have considerably different type systems, introducing important challenges.
Further, we do not expect the two languages to share the same ABI, meaning that seamless operability at the source level will likely require fairly sophisticated adapters under the hood.

To tackle these issues, we plan on implementing interoperability in two phases.
The first, which we expect to deliver by the end of the year, will only allow Val code to be used from C++.
We'll achieve that objective by generating C-like low-level APIs for all public Val symbols using LLVM together with C++ types and functions to wrap these APIs.

The second phase, on which we will work next year, will support seamless two-way interoperability by interfacing Val compiler with [clang](https://clang.llvm.org).

## 2023 - Q3/Q4

Our main objectives for the second half of 2023 will be to:
- complete the design of our language;
- implement a standard library; and
- write and publish a specification.

Progress toward those objectives will be measured by the following milestones:

### Complete the language design

Though many of the core principles of Val's design have been established already, there are still important open questions to address.
We consider the answers to these questions essential to the development of a viable alpha version of the language.

#### Concurrency

The design of Val's concurrency is still immature.
Though we have laid out some key principles, important questions have yet to be answered:

- Should we support concurrent interprocess communication?

Interprocess communication is a thorny problem in a programming language advocating for mutable value semantics.
The core issue is that a communication channel is essentially a mutable reference.

Our current position is that safe Val should not compromise on its strict adherence to value semantics, de facto discarding all forms of communication except at spawn and join events.
Nonetheless, we plan on investigating whether such a restriction is acceptable by developing a collection of concurrent program examples.

- Should we support cancellation at the language level?

Though it might be possible to implement cancellation at the library level with a handful of carefully written types that wrap unsafe operations behind safe APIs, proper language support may be required for the sake of usability and/or performance.


### Implement a standard library

Once we will have delivered the experimental compiler, A good part of Q4 will be dedicated to the implementation of a standard library for the language.
We will base our design on [Swift's standard library](https://developer.apple.com/documentation/swift/swift-standard-library), for two reasons:
1. Swift has had time to empirically demonstrate the success of its approach to generic programming; and
2. Val and Swift share very similar type systems, so we expect the concepts developed in the latter to be portable in the former.

### Write and publish the specification

A complete specification of the language will increase confidence in the soundness of the language design.
It will also serve as a reference document to write the implementation.

The specification is currently an [ongoing work](https://github.com/val-lang/specification) that we expect to be delivered together with an alpha version of the language implementation.
However, sections that relate to the semantics of the language still require significant effort.

We also plan on publishing the specification in the form of a website or [GitBook](https://www.gitbook.com).

## 2024

Our main objectives for 2024 will be to
- develop the missing features of the language;
- investigate optimal implementation strategies implement an efficient compiler;
- implement two-way interoperability with C++; and
- develop an inclusive community.

### Implement guaranteed optimizations

Val is designed in such a way that it can communicate runtime costs very transparently.
As a result, the language can offer several guaranteed optimization.
For example, Val guarantees that closures do not require heap allocation unless the type of their environment is erased.
We plan on implementing these guaranteed optimizations over Q1 and Q2.

### Investigate implementation strategies for concurrency

Once we will have finalized the design of Val's concurrency model, we will be able to investigate the optimal implementation strategies.

We are leaning toward a [stackful coroutines](https://dl.acm.org/doi/10.1145/1462166.1462167), mostly to avoid monadic asynchronous programming (a.k.a. [polychromatic functions](https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/)), where asynchronous operations can only be called from asynchronous contexts.
Nonetheless, discussions with experts have revealed that such a strategy may induce unfortunate runtime costs and that stackless coroutines may not necessarily force a monadic asynchronous style upon the language.

One solution might be to adopt a sackful model as a default strategy and surface stack information in the type system to let the compiler opt for stackless code generation whenever possible.

We on plan having adopted and implemented a strategy by the end of Q3.

### Implement two-way interoperability with C++

The objective of the second phase of C++ interoperability is to support seamless interaction of Val and C++ code in the same project.
To that end, we will interface with clang to let Val compiler understand C++ and generate any necessary glue code.

The main challenge will be to map C++ types to Val, as the former supports features that have no obvious equivalent in the latter (e.g., throwing destructors).
We also expect our investigation and implementation to raise a plethora of new open questions.
As such, we do not plan on delivering interoperability before Q4.

### Design and implement missing language features

Some of the features on our wishlist are out of scope for 2023, as we believe they are not essential to assess the validity of the language's design.
2024 will allow us to revisit these features with a working experimental implementation.

One of our main goals will be the inclusion of **variadic** generic parameters.
Val already supports scalar generic type and value parameters.
The former enable bounded polymorphism by the means of type constraints; the latter enable a restricted form of [dependent types](https://en.wikipedia.org/wiki/Dependent_type) by allowing types and operations to be parameterized by values computed during compilation.
A canonical example is a buffer (i.e., a fixed-size array).

```val
extension Buffer {
  fun concatenate<a: Int>(
    _ other: Buffer<Self.Element, a>
  ) -> Buffer<Self.Element, Self.size + a> { ... }
}
```

Support for variadic generic parameters will greatly improve Val's expressiveness with respect to type-level metaprogramming.
Our work in this area will be informed by contemporary efforts to leverage compile-time evaluation for metaprogramming, such as [Circle](https://www.circle-lang.org).

Other notable features in our wishlist include:
- exception handling;
- polymorphic effects; and
- resumable functions (a.k.a. [generators](https://en.wikipedia.org/wiki/Generator_(computer_programming))).

### Develop an inclusive community

The Val project aims to develop a programming language that is not only fast and safe but also **simple**.
By simple, we mean that Val should be accessible to users from all sorts of backgrounds.
A part of that objective lies in the language design, another in its community.

We're happy to have already received contributions in the form of discussions, issues, and even pull requests on the code of our compiler.
If Val is to survive, it is therefore that we continue to build an inclusive and welcoming community.
To that end, we plan on developing the following axes throughout 2024.

#### Tooling

A language is only as strong as its tooling.
We have already started working on a language extension for [VS Code](https://code.visualstudio.com) (see [vscode-val](https://github.com/val-lang/vscode-val)).
We also plan on developing a [LSP server](https://langserver.org) implementation.

#### Insightful error diagnostics

Good error diagnostics are essential to help developers write correct programs.
We believe that Val's model is amenable to developing insightful diagnostics and providing relevant suggestions.

We will take inspiration from [Elm](https://elm-lang.org) and [Rust](https://www.rust-lang.org), which are both known for delivering great error messages.

#### Language and library documentation

Although we will have already delivered a specification of Val by 2023, we understand that typical users won't expect to read that document to get started.
Instead, a comprehensive language guide and user-friendly documentation of the standard library will help novices and experts alike get up to speed.
Those resources will be published as an interactive website allowing users to run code directly on their browser.

#### Transparent process to follow and/or contribute

We strongly believe in the power of open source and the diversity of thoughts, ideas, and experiences.
Not only will we commit to keeping our code and documentation publicly available, but we will also set up a transparent process to discuss the language evalution.

## 2025 and beyond

Total world domination?

* * *

[Home](/)
