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

## Bindings

A binding is a name that denotes an object or a projection (more on that later).
Bindings can be mutable or not.
The value of a mutable can be modified whereas that of an immutable binding cannot.

Immutable bindings are declared with `let` and can be initialized with the `=` operator:
It is not possible to modify their value after their initialization.

```val
public fun main() {
  let gravity = 9.81
  gravity = 11.2 // error: cannot assign, `gravity` is a `let` binding
}
```

Mutable bindings are typically declared with `var`.

```val
public fun main() {
  var length = 1
  length = 2
  print(length) // 2
}
```

Bindings declared with `inout` are also mutable but operate differently.
They *project* the value (or part thereof) of an object mutably.

```val
public fun main() {
  var point = (x: 0.0, y: 1.0)
  inout x = &point.x
  x = 3.14
  print(point) // (x: 3.14, y: 1.0)
}
```

### Lifetime

The *lifetime* of a binding denotes the region of the program where the value of that binding can be accessed.
That always end after the last expression in which the binding occurs.
For example, the lifetime of `weight` ends after the first call to `print` in the program below:

```
public fun main() {
  let weight = 1.0
  print(weight) // 1.0
  let length = 2.0
  print(length) // 1.0
}
```

Some operations are said to be *consuming*, because they end the lifetime of a binding.
In other words, they *must* be the last use of the consumed binding.
For example, assigning a `var` binding or a creating a [tuple](#tuples) consumes the values that initialize its elements:

```val
public fun main() {
  let weight = 1.0
  let length = 2.0
  let measurements = (
    w: weight,  // error: `weight` is used after escaping here.
    l: length)
  print(weight) // use occurs here
}
```

The program above is illegal because the value of `weight` *escapes* to initialize another object.
To better understand, we must keep in mind that Val places great emphasis on the concept of *value independence*.

The constructs of Val manipulate *objects*, which can be thought as independent resources representing some data.
A binding is a mean to access an object's value, through a name.
From there, three basic principles apply, which Val upholds by changing the capabilities of a program's bindings depending on its control flow:
1. When an object is created, its *ownership* is attributed to a binding or another object.
2. An object always has exactly one owner at any given point during its existence.
3. There can never be more than a single mutable access to an object at any given point.

In the program above, the first line of `main` creates an object representing a floating-point number.
Its ownership is attributed to `weight`, satisfying the first and second principles.
Since all bindings are immutable in this example, the third principle holds trivially.

Objects may form whole/part relationships.
In that case, the "whole" becomes owner of the "part".
Here, that happens when a tuple is created at line 3 of `main`, consuming the values of `weight` and `length`, and thus their ownership.
A transfer of ownership ends the lifetime of all bindings before the transfer.
Thus, it is illegal to use `weight` at line 6.

If we follow the compiler's suggestion, a solution is to copy `weight`'s value to create the tuple.
By doing so, we will create a new independent object whose ownership can be attributed to the tuple, without transferring that of `weight`.

```val
public fun main() {
  let weight = 1.0
  let length = 2.0
  let measurements = (
    w: weight.copy(),
    l: length)
  print(weight) // 1.0
}
```

## Types

Val is statically typed: bindings of a given type cannot be assigned a value of a different one.
For instance, it is impossible to assign a floating point number to an integer binding:

```val
public fun main() {
  var length = 1
  length = 2.3 // error: expected type `Int`, found `Double`
}
```

The type of a binding is determined at declaration.
If an initializing expression is present, such as in all previous examples, the binding is given the type of that expression.
Alternatively, we may state the type of a binding explicitly by the means of an annotation:

```val
public fun main() {
  var weight: Double = 1
  weight = 2.3
  print(weight) // 2.3
}
```

### Tuples

A tuple is a container composed of zero or more heterogeneous values.
t is a kind of [record data structure](https://en.wikipedia.org/wiki/Record_(computer_science)).
It can be created with a comma-separated list of values, enclosed in parentheses, and optionally labeled.
Of course, tuples can contain other tuples.

```val
public fun main() {
  let circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  print(circle)
}
```

*The elements of a tuple are laid out contiguously in memory, with potential padding to accounf for alignment.*

The elements of a tuple are accessed by appending `.n` to a tuple expression, where `n` denotes the `n-th` element of the tuple, stating at zero.
Elements may also be referred to by their label, if any.

```val
public fun main() {
  var circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  circle.0.1 = 3.6
  print(circle.origin) // (x: 6.3, y: 3.6)
}
```

The values of a tuple may be unpacked to local bindings through a process called "destructuring".
Irrelevant elements may be ignored by using an underscore:

```val
public fun main() {
  let circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  let (origin: (x: px, y: _), radius: r) = circle
  print((px, r)) // (6.3, 1.0)
}
```

In the program above, the tuple assigned to `circle` is destructured to initialize two local bindings: `px` and `r`.
Notice that the y-componenent of the circle's origin is ignored.

### Buffers, arrays, and slices

A buffer is a fixed-size collection of homogeneous elements, laid out contiguously in memory.
It can be created with a comma-separated list of values, enclosed in square brackets.
The elements of a buffer can be accessed by *subscripting* a buffer expression with an integer index:

```val
public fun main() {
  let triangle = [
    (x: 0.0, y: 0.0),
    (x: 1.0, y: 0.0),
    (x: 0.0, y: 1.0),
  ]
  print(triangle[1]) // (x: 1.0, y: 0.0)
}
```

*Note: indexing a buffer outside of is either caught as a compile-time error, or causes the program to terminate at runtime.*

The type of a buffer is written either `T[n]` or `Buffer<T, n>`, where `T` is a type and `n` the number of elements in the buffer.
All elements of a buffer must be initialized at the same time as the buffer itself, either by the means of a buffer literal expression, as in the program above, or by calling a buffer *initializer*:

```val
typealias Point = (x: Double, y: Double)
public fun main() {
  var triangle = Point[3](fun(i) { (x: Double(i), y: 0.0) })
  triangle[1].y = 2.5
  print(triangle[1]) // (x: 1.0, y: 2.5)
}
```

In the program above, `triangle` is created by calling `Buffer.init(_:)`, which initializes each individual element with the result of a call to a function that accepts the element's index.
Here, the value passed to that initializer is a [closure](#closure) that returns points whose x-component are equal to the element's index.

An array is similar to a buffer, but may additionally be resized dynamically:

```val
typealias Point = (x: Double, y: Double)
public fun main() {
  var points = Array<Point>()
  print(points.count()) // 0
  points.append((x: 6.3, y: 1.0))
  print(points.count()) // 1
}
```

Indexing a buffer, an array (or a slice) by a range creates a slice.
A slice is a projection of a sub-part of a collection that can be accessed for reading and or writing.

```val
public fun main() {
  let numbers = [0, 1, 2, 3, 4]
  print(numbers[2 ..< 4]) // [2, 3]
}
```

### Records

Just like a tuple, a record is a container composed of zero or more heterogeneous values.
Unlike a tuple, however, a record type offers a finer control over the visibility and mutability of its elements.

A record type is declared with the keyword `type` and contains typed properties declared as bindings:

```val
type Matrix2 {
  public var components: Double[2][2]
  public memberwise init
}
```

The type declaration above defines a type `Matrix2` with a single property of type `Double[2][2]`.
The second declaration exposes the default memberwise initializer of the type, allowing us to create matrices by calling `Matrix2.init(components:)`:

```val
type Matrix2 {
  public var components: Double[2][2]
  public memberwise init
}

public fun main() {
  var m = Matrix2(components: [[0, 0], [0, 0]])
  m.components[0][0] = 1.0
  m.components[1][1] = 1.0
  print(m) // Matrix2(components: [[1.0, 0.0], [0.0, 1.0]])
}
```

In the program above, `m.components` can be modified because `m` is a mutable binding **and** the property `components` is mutable, as it is declared with `var`.
Would that property be declared with `let`, the components of the matrix would remain immutable once the matrix has finished initializing, notwistaning the mutability of the binding to which it is assigned.

Members that are not declared `public` cannot be accessed outside of the scope of a record type.
As we uncover more advanced constructs, we will show how to exploit that feature to design clean and safe APIs.

### Unions

Two or more types can form a union type, also known as a [sum type](https://en.wikipedia.org/wiki/Tagged_union).
A sum type is a super type of all its elements.
Among other things, it means that if a type `T` is the union of the types `U` and `V`, then a binding of type `T` can be assigned to a value of type `U` *or* a value of type `V`.

```val
public fun main() {
  var x: Int | String = "Hello, World!"
  x = 42
  print(x) // 42
}
```

It is often convenient to create type aliases to denote unions.
Those can even define generic type arguments.
For example, Val's standard library defines [option types](https://en.wikipedia.org/wiki/Option_type) as follows:

```val
public typealias Option<T> = T | Nil
public type Nil {
  public memberwise init
}
```

Here, the type `Nil` is an empty record type with no property.
The type `Option<T>` is the union of any type `T` and `Nil`, which can be used to indicate that a particular value might be absent.

*Note: the union of `T | U` with `T` is not equal to `T | U`.*
*Instead, it is `(T | U) | T`.*

### Closures

* * *

[Home](./)