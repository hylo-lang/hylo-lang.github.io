---
layout: default
---

## Language tour

This page gives a quick tour of Val's feature in the form of a progressive guide.
It assumes familiarity with an imperative programming language (e.g., C++) and basic concepts of [memory management](https://en.wikipedia.org/wiki/Memory_management).

This tour does not cover the entire language.
You may consult the [specification](https://github.com/val-lang/specification/blob/main/spec.md) for more information.

Keep in mind that Val is under active development.
Some of the features presented in this tour (and in the specification) may not be fully implemented yet or subject to change in the future.

### Hello, World!

The tradition says language guides should start with a program that displays "Hello, World!" on the screen.
Let's oblige!

```val
public fun main() {
  print("Hello, World!")
}
```

Every program in Val must define a `main` function as its entry point.
That function never takes any argument and never returns anything.
Here, `main` contains single statement, which is a call to a global function `print` with a string argument.

*The standard library vends an API to interact with the program's environment.*
*Command line arguments are accessed by reading a global array of strings named `Environment.arguments`.*
*Return statuses are signalued by calling the global function `exit(status:)`.*

To run this program:
- Copy that `main` function in a file `hello.val`.
- Run the command `valc hello.val`.
- Run the command `./ hello` to run the executable.

### Modules

A Val program is made of **modules** that are linked together to build one **executable**.
A module is a collection of one or multiple files.
A module that defines a public `main` function is called an entry module.
A program shall contain only one entry module.

* * *

[Home](./)