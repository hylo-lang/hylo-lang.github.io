---
layout: default
---

This page gives a quick tour of Val's feature in the form of a progressive guide.
It assumes familiarity with an imperative programming language (e.g., C++) and basic concepts of [memory management](https://en.wikipedia.org/wiki/Memory_management).

This tour does not cover the entire language.
You may consult the [specification](https://github.com/val-lang/specification/blob/main/spec.md) for more information.

Keep in mind that Val is under active development.
Some of the features presented in this tour (and in the specification) may not be fully implemented yet or subject to change in the future.

## Hello, World!

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
*Command line arguments are accessed by reading a constant named `Environment.arguments`.*
*Return statuses are signalued by calling the global function `exit(status:)`.*

To run this program:
- Copy that `main` function in a file `Hello.val`.
- Run the command `valc Hello.val -o hello`.
- Run the command `./ hello` to run the executable.

## Modules

A Val program is made of **modules** that are linked together to build one **executable**.
A module is a collection of one or multiple files.
A module that defines a public `main` function is called an entry module.
A program shall contain only one entry module.

The program we wrote above is made of two modules.
The first contains the `hello.val` file and is the program's entry module.
The second is Val's standard library, which is always implicitly imported, and defines common types, traits, functions and subscripts.

### Bundling files

You may bundle multiple files in a single module by passing all of them as arguments to `valc`.
For example, let us define a function that prints a specialized greeting in a separate file and call it from `Hello.val`:

```val
// In `Hello.val`
public fun main() {
  greet("World")
}

// In `Greet.val`
fun greet(_ name: String) {
  print("Hello, ${name}!")
}
```

Here, we declare a function `greet` that takes a single argument of type `String`.
The underscore (i.e., `_`) before the parameter name signals that it is unlabeled.
We'll come back to labels later.

To run this program:
- Run the command `valc Hello.val Greet.val -o hello`
- Run the command `./hello`

*Alternatively, you may put both source files in a folder, say `Sources`, and compile the program with `valc Sources -o hello`.*

Note that `greet` need not to be `public` to be visible from another file in the module.
All entities declared at the top level of a file are visible everywhere in a module, but not beyond that module's boundary.

### Bundling modules

The simplest way to work with multiple modules is to gather source files in different folders.
For example, let's move `greet` in a different module, using the following arborescence:

```
Sources
  |- Hello
  |  |- Hello.val
  |- Greet
  |  |- Greet.val
```

Let's also slightly modify both source files:

```val
// In `Sources/Hello/Hello.val`
import Greet
public fun main() {
  greet("World")
}

// In `Sources/Greet/Greet.val`
public fun greet(_ name: String) {
  print("Hello, ${name}!")
}
```

The statement `import Greet` at the top of `Hello.val` tells the compiler it should import the module `Greet` when it compiles that source file.
Implicitly, that makes `Greet` a dependency of `Hello`.

Notice that `greet` had to be made public because we want it to cross module boundary.
As such, it can be called from `Hello.val`.

To run this program:
- Run the command `valc --modules Sources/Hello Sources/Greet -o hello`
- Run the command `./hello`

* * *

[Home](./)