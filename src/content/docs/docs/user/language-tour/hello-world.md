---
title: Hello, World!
---

Tradition says language guides should start with a program that displays "Hello, World!" on the screen. Let's oblige!

```hylo
public fun main() {
  print("Hello, World!")
}
``` 

Every program in Hylo must define a `main` function, with no parameters and no return value, as its entry point. Here, `main` contains a single statement, which is a call to a global function `print` with a string argument.

_The standard library provides an API to interact with the program's environment._ _Command line arguments are accessed by reading a constant named `Environment.arguments`._ _Return statuses are signaled by calling the global function `exit(status:)`._

To run this program, open it online in [Compiler Explorer](https://godbolt.org/z/Mv9a77a4c).

If you happen to have the compiler [built locally](/docs/contributing/building-the-compiler/), you can also follow these steps:
* Copy that `main` function into a file called `Hello.hylo`.
* Run the command `hc Hello.hylo -o hello`.
* Run the command `./hello` to run the executable.
