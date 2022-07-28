---
layout: default
---

This page gives a quick tour of Val's features in the form of a progressive guide.
It assumes familiarity with an imperative programming language such as JavaScript, Python, C or C++.

This tour does not cover the entire language.
Please consult the [specification](https://github.com/val-lang/specification/blob/main/spec.md) for more detailed information.

Keep in mind that Val is under active development.
Some of the features presented in this tour (and in the specification) may not be fully implemented yet or subject to change in the future.

## Hello, World!

Tradition says language guides should start with a program that displays "Hello, World!" on the screen.
Let's oblige!

```val
public fun main() {
  print("Hello, World!")
}
```

Every program in Val must define a `main` function, with no parameters and no return value, as its entry point.
Here, `main` contains single statement, which is a call to a global function `print` with a string argument.

*The standard library vends an API to interact with the program's environment.*
*Command line arguments are accessed by reading a constant named `Environment.arguments`.*
*Return statuses are signalued by calling the global function `exit(status:)`.*

To run this program:
- Copy that `main` function into a file called `Hello.val`.
- Run the command `valc Hello.val -o hello`.
- Run the command `./hello` to run the executable.
{% comment %}
FIXME: these instructions are unix-specific; wouldn't work on Windows.
{% endcomment %}

## Modules

A Val program is composed of **modules** each of which is composed of one or more files.
A module that defines a public `main` function is called an **entry module**, of which there must be exactly one per program.

The program we wrote above is made of two modules.
The first contains the `hello.val` file and is the program's entry module.
The second is Val's standard library, which is always implicitly imported, and defines commonly-used components like the `Int` and `String` types, and the `print` function used above.

Each module defines an API resilience boundary: only public declarations are visible outside the module, and changes to non-public declarations, or to the bodies of public functions in the module cannot cause code outside the module to fail compilation.
A module *may* also define an ABI resilience boundary, within which code and details such as type layout are never encoded into other compiled modules (e.g. via inlining).

### Bundling files

You can bundle multiple files in a single module by passing all of them as arguments to `valc`.
For example, in a separate file we can define a function, that prints a specialized greeting, and call it from `Hello.val`:

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
The underscore (i.e., `_`) before the parameter name means that arguments passed here must be unlabeled.
We'll come back to argument labels later.

To run this program:
- Run the command `valc Hello.val Greet.val -o hello`
- Run the command `./hello`

*Alternatively, you can put both source files in a subdirectory, say `Sources/`, and compile the program with `valc Sources -o hello`.*

Note that `greet` need not be `public` to be visible from another file in the module.
All entities declared at the top level of a file are visible everywhere in a module, but not beyond that module's boundary.
{% comment %}
Do we need to say, "unless marked private?"
{% endcomment %}

### Bundling modules

The simplest way to work with multiple modules is to gather source files into different subdirectories.
For example, let's move `greet` in a different module, using the following directory structure:
{% comment %}
I love the word “arborescence!”  But nobody will know what it means.
{% endcomment %}

```
Sources
  |- Hello
  |  |- Hello.val
  |- Greetings
  |  |- Greetings.val
```

Let's also slightly modify both source files:

```val
// In `Sources/Hello/Hello.val`
import Greetings
public fun main() {
  greet("World")
}

// In `Sources/Greetings/Greetings.val`
public fun greet(_ name: String) {
  print("Hello, ${name}!")
}
```

The statement `import Greetings` at the top of `Hello.val` tells the compiler it should import the module `Greetings` when it compiles that source file.
Implicitly, that makes `Greetings` a dependency of `Hello`.

Notice that `greet` had to be made public so it could be visible to other modules.
As such, it can be called from `Hello.val`.

To run this program:
- Run the command `valc --modules Sources/Hello Sources/Greet -o hello`
- Run the command `./hello`

## Bindings

A binding is a name that denotes an object, and can be mutable or immutable.
The object denoted by a mutable binding can be modified, whereas that of an immutable binding cannot.

Immutable bindings are declared with `let` and can be initialized with the `=` operator:
It is not possible to modify the bound object during the [lifetime](#lifetime) of the binding.

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
They *project* the value of an object, or part of its value, mutably.

```val
public fun main() {
  var point = (x: 0.0, y: 1.0)
  inout x = &point.x
  x = 3.14
  print(point) // (x: 3.14, y: 1.0)
}
```

Note however that such a projection is not a reference in the usual sense; it has full ownership
over the value it projects, which cannot be accessed except through that projection.

### Lifetime

The *lifetime* of a binding denotes the region of the program where the value of that binding is accessed.
The lifetime always ends after the last expression in which the binding occurs.
For example, the lifetime of `weight` ends after the first call to `print` in the program below:

```
public fun main() {
  let weight = 1.0
  print(weight) // 1.0
  let length = 2.0
  print(length) // 1.0
}
```

Some operations are said to be *consuming*, because they force-end the lifetime of a binding.
In other words, they *must* be the last use of the consumed binding.
For example, assigning into a `var` binding consumes the source of the assignment. 
Similarly, [tuple](#tuples) initialization consumes the source values.

```val
public fun main() {
  let weight = 1.0
  let base_length = 2.0
  var length = base_length // <----------------------------------------------------+
  length += 3.0            //                                                      |
  let measurements = (     //                                                      |
    w: weight,             // <-----------------------------------------------+    |
    l: length)             //                                                 |    |
  print(weight)            // error: `weight` used after being consumed here -+    |
                           //                                                      |
  print(base_length)       // error: `base_length` used after being consumed here -+
}
```

The program above is illegal because the values of `weight` and `base_length` are used after being
consumed to initialize other objects.  The Val compiler will suggest that you change the code to
consume *copies* of `weight` and `base_length` instead, and will offer to insert these copies for you.
This design follows from two of Val's core principles:

1. **Copies are explicit by default**. 
Languages that copy most values implicitly (C++, Swift, R, …) often do so at great expense to performance, and avoiding implicit copies can itself incur a great expense in code size, in code and language complexity, and in development speed.
Fortunately, Val naturally needs far fewer copies than other languages, so explicit copies in code
are always salient rather than “noisy.” (For code where implicit copying is appropriate, Val offers a scoped `@implicitcopy` directive).

2. **Distinct bindings and distinct objects have *independent* values**. 
Languages that allow two accessible names to bind to the same mutable object (JavaScript, Python, Ruby, Lua, parts of C++ and Swift) are prone to hidden interactions, race conditions, and easily scale up into systems that can't be documented, tested, or understood.
Val allows access to a mutable value through exactly one binding at any given time.

## Basic types

Val is statically typed: the type of a binding must always match the type of the object it is bound to.
For instance, it is impossible to assign a floating point number to an integer binding:

```val
public fun main() {
  var length = 1
  length = 2.3 // error: expected type `Int`, found `Double`
}
```

The type of a binding is determined at declaration.
If an initializing expression is present, such as in all previous examples, the binding is given the type of that expression.
Alternatively, we can state the type of a binding explicitly:

```val
public fun main() {
  var weight: Double = 1.0
  weight = 2.3
  print(weight) // 2.3
}
```

The type of an expression can be retrieved, without evaluating the expression, using `type(of:)`:

```val
public fun main() {
  let weight = 2.3
  print(type(of: weight)) // Double
  print(type(of: "Hey!")) // String
}
```

Val's standard library defines the types that are most commonly used, including numeric types (e.g.,
`Int`, `Double`), text strings (`String`), Booleans (`Bool`), and types to represent data structures.
The remainder of this section gives an overview of the most important ones.

### Booleans, numbers, and strings

A [Boolean](https://en.wikipedia.org/wiki/Boolean_data_type) is a value that is either `true` or `false`.
In Val, those are represented by the type `Bool`:

```val
public fun main() {
  let is_two_greater_than_one = 2 > 1
  print(type(of: is_two_greater_than_one)) // Bool
}
```

Integer numbers are typically represented by the type `Int`, which represents a machine-size integer (usually 64 bits on modern computers).
Val also provides types to represent integers of different sizes and signedness.
For example, `UInt16` represents a 16-bit unsigned number and `Int8` a 8-bit signed number, independently of the machine for which the program is compiled.

*Note: The type `Int` should be preferred unless you need a different variant for a specific reason
(e.g., representing a hardware register, storage optimization).*
*This convention aids code consistency and interoperability.*

Floating point numbers are represented by the types `Float` and `Double`, denoting
[IEEE](https://en.wikipedia.org/wiki/IEEE_754) single and double-precision values respectively.

*Note: For the same reasons as `Int` should be preferred for every integer value, `Double` should be preferred for any floating-point value.*

Val does not support any kind of implicit conversion between numeric types.
For example, the following program is illegal:

```val
public fun main() {
  let n = 3.2
  let m = 8
  print(n * m) // error: cannot apply `Double.infix*` to argument of type `Int`
}
```

All numeric conversions must be written explicitly by calling the appropriate initializer.
For example, we can fix the program above by converting `m` to `Double` before the multiplication:

```val
public fun main() {
  let n = 3.2
  let m = 8
  print(n * Double(m)) // 25.6
}
```

By default, integer literals are interpreted as `Int` and floating-point as `Double`.
However, a literal may be interpreted as a different type depending on the context in which it appears:

```val
public fun main() {
  var n: Double = 2
  &n *= 10
  print(n) // prints 20.0
}
```

In the above example, `m` is explicitly declared to have type `Double`.
As a result, the compiler infers its initializer as an expression of type `Double` rather than `Int`.
Similarly, the compiler infers that the literal on the right hand side of `*=` should be interpreted as a floating-point number.

*Note: the ampersand in `&n += 10` indicates that `n` is being mutated in-place.*
*We come back to it later.*

Text is represented by the type `String` and has two literal forms.
Simple string literals are sequences of character surrounded by double quotes on a single line (e.g., `"Hello, World!"`).
Multiline literals are surrounded by sequences of three double quotes on either side and may contain new lines.

```val
public fun main() {
  let text = """
  C'est un trou de verdure où chante une rivière
  Accrochant follement aux herbes des haillons
  D'argent; où le soleil, de la montagne fière,
  Luit: c'est un petit val qui mousse de rayons.
  """
  print(text)
}
```

The first new-line delimiter in a multiline string literal is not part of the value of that literal if it immediately succeeds the opening delimiter.
The last new-line delimiter that is succeeded by a contiguous sequence of inline spaces followed by the closing delimiter is called the indentation marker.
The indentation marker and the succeeding inline spaces specify the indentation pattern of the literal and are not part of its value.

For example, in the program above, the indentation pattern is defined as two spaces.
Therefore, the value of `text` starts with "C'est" and ends with "rayons."

Strings can be mutated in place in Val:

```val
public fun main() {
  var text = "Hello, "
  &text.append("World!")  // <=== HERE
  print(text)             // Hello, World!
}
```

### Tuples

A tuple is a composition of zero or more values, each of which can have any type.
It can be created with a comma-separated list of values, enclosed in parentheses, and each value can (optionally) be labeled.
Of course, tuples can contain other tuples.

```val
public fun main() {
  let circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  print(circle)
}
```

*The elements of a tuple are laid out contiguously in memory, with potential padding to account for alignment.*

The elements of a tuple are accessed by appending `.n` to a tuple expression, where `n` denotes the `n`th element of the tuple, stating at zero.
An element can also be referred to by its label, if any.

```val
public fun main() {
  var circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  circle.0.1 = 3.6
  print(circle.origin) // (x: 6.3, y: 3.6)
}
```

The values of a tuple can be unpacked to local bindings through a process called "destructuring".
Irrelevant elements can be ignored by using an underscore:

```val
public fun main() {
  let circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  
  // Bind to px to circle.origin.x and r to circle.radius,
  // ignoring circle.origin.y
  let (origin: (x: px, y: _), radius: r) = circle
  
  print((px, r))  // (6.3, 1.0)
}
```

### Buffers, arrays, and slices

A buffer is a fixed-size collection of homogeneous elements laid out contiguously in memory.
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

*Note: indexing a buffer outside of its bounds is either caught as a compile-time error, or causes the program to terminate at runtime.*

The type of a buffer is written either `T[n]` or `Buffer<T, n>`, where `T` is a type and `n` the number of elements in the buffer.
All elements of a buffer must be initialized at the same time as the buffer itself, either by the means of a buffer literal expression, as in the program above, or by calling a buffer *initializer*:

```val
typealias Point = (x: Double, y: Double)
public fun main() {
  var triangle = Point[3](fun(i) { (x: Double(i), y: 0.0) }) // <== HERE
  triangle[1].y = 2.5
  print(triangle[1]) // (x: 1.0, y: 2.5)
}
```

In the program above, `triangle` is created by calling `Buffer.init(_:)`, which initializes each individual element with the result of a call to a function that accepts the element's index.
Here, the value passed to that initializer is a [closure](#closure) that returns points whose x-component are equal to the element's index.

An array is like a buffer that can be resized dynamically:

```val
typealias Point = (x: Double, y: Double)
public fun main() {
  var points = Array<Point>()
  print(points.count())            // 0
  points.append((x: 6.3, y: 1.0))  // <== HERE
  print(points.count())            // 1
}
```

Passing a range of indices to any collection's subscript creates a slice.
A slice is a projection of a sub-part of a collection that can be accessed for reading and or writing.

```val
public fun main() {
  let numbers = [0, 1, 2, 3, 4]
  print(numbers[2 ..< 4]) // [2, 3]
}
```

### Structures

Just like a tuple, a structure is a container composed of zero or more heterogeneous values.
Unlike a tuple, however, a structure offers a finer control over the visibility and mutability of its elements.

A structure is declared with the keyword `type` and contains typed properties declared as bindings:

```val
type Matrix3 {
  public var components: Double[3][3]
  public memberwise init
}
```

{% comment %}
I don't know if we discussed this, but making the memberwise init public has API resilience
implications.  In particular, it means you can't simply add/remove stored properties, even if they
were non-public, without breaking client code.  I'd like to design some facilities for helping a
library author to ensure API stability eventually.
{% endcomment %}

The type declaration above defines a type `Matrix3` with a single property of type `Double[3][3]`.
The second declaration exposes the default memberwise initializer of the type, allowing us to create matrices by calling `Matrix2.init(components:)`:

```val
type Matrix3 {
  public var components: Double[3][3]
  public memberwise init
}

public fun main() {
  var m = Matrix3(components: [
    [0 ,0, 0],
    [0 ,0, 0],
    [0 ,0, 0],
  ])
  m.components[0][0] = 1.0
  m.components[1][1] = 1.0
  m.components[2][2] = 1.0
  print(m)
}
```

In the program above, `m.components` can only be modified because `m` is a mutable binding **and** the `Matrix3` property `components` is declared with `var`.
Had that property been declared with `let`, the components of the matrix would remain immutable once the matrix had finished initializing, even though `m` is mutable.

Members that are not declared `public` cannot be accessed outside of the scope of a structure.
As we uncover more advanced constructs, we will show how to exploit that feature to design clean and safe APIs.

A structure can also define static properties.
Those are not part of structure instances.
Instead, they represent global bindings defined in the namespace of the structure.

Static properties are declared with `static`.
They can only be declared with `let` and are therefore always immutable:

```val
type Matrix3 {
  // ...
  public static let zero = Matrix3(components: [
    [0 ,0, 0],
    [0 ,0, 0],
    [0 ,0, 0],
  ])
}

public fun main() {
  print(Matrix3.zero)
}
```

### Unions

Two or more types can form a union type, also known as a [sum
type](https://en.wikipedia.org/wiki/Tagged_union).  In Val, a union is a supertype of all its
element types, so any element type can be used in an expression where the union type is expected:

```val
public fun main() {
  var x: Int | String = "Hello, World!"
  print(x) // Hello, World!
  x = 42
  print(x) // 42
}
```

It is often convenient to create (generic) type aliases to denote unions.
For example, Val's standard library defines [optionals](https://en.wikipedia.org/wiki/Option_type) as follows:

```val
public typealias Optional<T> = T | Nil
public type Nil {
  public init() {}
}
```

Here, the type `Nil` is an empty structure used only to mark the absence of a `T`.
The type `Optional<T>` is the union of any type `T` and `Nil`, which can be used to indicate that a particular value might be absent.

*Note: While `T | U | T` is equivalent to `T | U` (element type repetitions at the same level are collapsed), `(T | U) | T` is a distinct type.  Thus `Optional<Optional<T>>` is not the same as `Optional<T>`.*

## Functions and methods

A function are blocks of reusable code that performs a single action, or group of related actions.
They are an essential tool for managing the complexity of a program as it grows.

*Note: Though Val should not be considered a functional programming language, functions are
first-class citizens, and functional programming style is well-supported.  In fact, Val's mutable
value semantics can be freely mixed with purely functional code without eroding that code's local
reasoning properties*

### Free functions

A function declaration is introduced with the `fun` keyword, followed by the function's name, its
signature, and finally its body:

```val
typealias Vector2 = (x: Double, y: Double)

fun norm(_ v: Vector2) -> Double {
  Double.sqrt(v.x * v.x + v.y * v.y)
}

public fun main() {
  let velocity = (x: 3.0, y: 4.0)
  print(norm(velocity)) // 5.0
}
```

The program above declares a function named `norm` that accepts a 2-dimensional vector (represented as a pair of `Double`) and returns its norm, or length.

A function's signature describes its parameter and return types.
The return type of a function that does not return any value, like `main` above, may be omitted.  Equivalently
we can explicitly specify that the return type is `Void`.

A function is called using its name followed by its arguments and any argument labels, enclosed in parentheses.
Here, `norm` is called to compute the norm of the vector `(x: 3.0, y: 4.0)` with the expression `norm(velocity)`.

Notice that the name of the parameter to that function is prefixed by an underscore (i.e., `_`), signaling that the parameter is unlabeled.
If this underscore were omitted, a call to `norm` would require its argument to be labeled by the parameter name `v`.

You can specify a label different from the parameter name by replacing the underscore with an identifier.
This feature can be used to create APIs that are clear and economical at the use site, especially for functions that accept multiple parameters:

```val
typealias Vector2 = (x: Double, y: Double)

fun scale(_ v: Vector2, by factor: Vector2) -> Vector2 {
  (x: v.x * factor.x, y: v.y * factor.y)
}

let extent = (x: 4, y: 7)
let half = (x: 0.5, y: 0.5)

let middle = scale(extent, by: half)
```

Argument labels are also useful to distinguish between different variants of the same operation.

```val
typealias Vector2 = (x: Double, y: Double)

fun scale(_ v: Vector2, by factor: Vector2) -> Vector2 {
  (x: v.x * factor.x, y: v.y * factor.y)
}
fun scale(_ v: Vector2, uniformly_by factor: Double) -> Vector2 {
  (x: v.x * factor, y: v.y * factor)
}
```

The two `scale` functions above are similar, but not identical.
The first accepts a vector as the scaling factor, the second a scalar, a difference that is captured in the argument labels.
Argument labels are part of the full function name, so the first function can be referred to as `scale(_,by:)` and the second as `scale(_,uniformly_by:)`.
In fact, Val does not support type-based overloading, so the *only* way for two functions to share the same base name is to have different argument labels.
*Note: many of the use cases for type-based overloading in other languages can best be handled by using [method bundles](#method-bundles).*

A function with multiple statements that does not return `Void` must execute one `return` statement each time it is called.

```val
fun round(_ n: Double, digits: Int) -> Double {
  let factor = 10.0 ^ Double(digits)
  return (n * factor).round() / factor
}
```

To avoid warnings from the compiler, every non-`Void` value returned from a function must either be
used, or be explicitly discarded by binding it to `_`.

```val
fun round(_ n: Double, digits: Int) -> Double {
  let factor = 10.0 ^ Double(digits)
  return (n * factor).round() / factor
}

public fun main() {
  _ = round(3.14159, 3) // explicitly discards the result of `round(_:digits:)`
}
```

Function parameters can have default values, which can be omitted at the call site:

```val
fun round(_ n: Double, digits: Int = 3) -> Double {
  let factor = 10.0 ^ Double(digits)
  return (n * factor).round() / factor
}

let pi2 = round(pi, digits: 2) // pi rounded to 2 digits
let pi3 = round(pi)            // pi rounded to 3 digits, the default.
```

*Note: A default argument expression is evaluated at each call site.*

### Parameter passing conventions

A parameter passing convention describes how an argument is passed from caller to callee.  In Val,
there are four: `let`, `inout`, `sink` and `set`.  In the next series of examples, we will define
four corresponding functions to offset this 2-dimensional vector type:

```
typealias Vector2 = (x: Double, y: Double)
```

We will also show how Val's parameter passing conventions relate to other programming languages, namely C++ and Rust.

#### `let` parameters

Let's start with the `let` convention. Parameter passing conventions are always written before the
parameter type:

```val
fun offset_let(_ v: let Vector2, by delta: let Vector2) -> Vector2 {
  (x: v.x + delta.x, y: v.y + delta.y)
}
```

`let` is the default convention, so the declaration above is equivalent to

```val
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  (x: v.x + delta.x, y: v.y + delta.y)
}
```

`let` parameters are (notionally) passed by value, and are truly immutable.  The compiler wouldn't
allow us to modify `v` or `delta` inside the body of `offset_let` if we tried:

```val
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  &v.x += delta.x // Error: v is immutable
  &v.y += delta.y
  return v
}
```

[Recall that `&` is simply a marker required by the languages when a value is mutated]

Though `v` cannot be modified, `Vector2` is copyable, so we can copy `v` into a mutable variable and
modify *that*.

```val
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  var temporary = v.copy()
  &temporary.x += delta.x
  &temporary.y += delta.y
  return temporary
}
```

In fact, when it issues the error about `v` being immutable, the compiler will suggest a rewrite
equivalent to the one above (and in the right IDE, will offer to perform the rewrite for you).

The compiler also ensures that `v` and `delta` can't be modified by any other means during the call:
their values are truly independent of everything else in the program, preventing all possibility of
data races and allowing us to reason locally about everything that happens in the body of
`offset_let`.  It provides this guarantee in part by ensuring that nothing can modify the arguments
*passed to* `offset_let` while the function executes which allowing arguments to be passed without
making any copies.

A C++ developer can understand the `let` convention as *pass by `const` reference*, but with the
additional static guarantee that there is no way the referenced parameters can be modified during
the call.

```c++
Vector2 offset_let(Vector2 const& v, Vector2 const& delta) {
  return Vector2 { v.x + delta.x, v.y + delta.y };
}
```

For example, in the C++ version of our function, `v` and `delta` *could* be modified by another
thread while `offset_let` executes, causing a data race.  For a single-threaded example, just
imagine adding a `std::function` parameter that is called in the body; that parameter might have
captured a mutable reference to the argument and could (surprisingly!) modify `v` or `delta` through
it.

A Rust developer can understand a `let` parameter as a *pass by immutable borrow*, with exactly the
same guarantees:

```rust
fn offset_let(v: &Vector2, delta: &Vector2) -> Vector2 {
  Vector2 { x: v.x + delta.x, y: v.y + delta.y }
}
```

The only difference between an immutable borrow in Rust and a `let` in Val is that the language
encourages the programmer to think of a `let` parameter as being passed by value.

The `let` convention does not transfer ownership of the argument to the callee, meaning, for
example, that without first copying it, a `let` parameter can't be returned, or stored anywhere that
outlives the call.

```val
fun duplicate(_ v: Vector2) -> Vector2 {
  v // error: `v` cannot escape; return `v.copy()` instead.
}
```

#### `inout` parameters

The `inout` convention enables mutation across function boundaries, allowing a parameter's value to
be modified in place:

```val
fun offset_inout(_ target: inout Vector2, by delta: Vector2) {
  &target.x += delta.x
  &target.y += delta.y
}
```

Again, the compiler imposes some restrictions and offers guarantees in return.  First, arguments to
`inout` parameters must be mutable and marked with an ampersand (`&`) at the call site:

```val
fun main() {
  var v = (x: 3, y: 4)               // v is mutable.
  offset_inout(&v, by: (x: 1, y: 1)) // ampersand indicates mutation.
}
```

*Note: You can probably guess now why the `+=` operator's left operand is always prefixed by an ampersand:*
*the type of `Double.infix+=` is `(inout Double, Double) -> Void`.*

Second, `inout` arguments must be unique: they can only be passed to the function in one parameter
position.

```val
fun main() {
  var v = (x: 3, y: 4) 
  offset_inout(&v, by: v) // error: overlapping `inout` access to `v`; 
}                         // pass `v.copy()` as the second argument instead.
```

The compiler guarantees that the behavior of `target` in the body of `offset_inout` is as though it
had been declared to be a local `var`, with a value that is truly independent from everything else
in the program: only `offset_inout` can observe or modify `target` during the call. Just as with the
immutability of `let` parameters, this independence upholds local reasoning and guarantees freedom
from data races.

A C++ developer can understand the `inout` convention as *pass by reference*, with the additional
static guarantee of exclusive access through the reference to the referenced object:

```c++
void offset_inout(Vector2& target, Vector2 const& delta) {
  target.x += delta.x
  target.y += delta.y
}
```

In the C++ version of `offset_inout`, as before, the parameters may be accessible to other threads, opening the possibility of a data race.  Also, the two parameters can overlap, and again a simple variation on our function is enough to demonstrate why that might be a problem:

```c++
// Offsets target by 2*delta.
void double_offset_inout(Vector2& target, Vector2 const& delta) {
  offset_inout(target, delta)
  offset_inout(target, delta)
}
void main() {
  Vector2 v = {3, 4}
  double_offset_inout(v, v)
  print(v) // Should print {9, 12}, but prints {12, 16} instead.
}                        
```

A Rust developer can understand an `inout` parameter as a *pass by mutable borrow*, with exactly the
same guarantees:

```rust
fn offset_inout(target: &mut Vector2, delta: &Vector2) {
  target.x += delta.x;
  target.y += delta.y;
}
```

Again, the only difference is one of perspective: Val encourages you to think of `inout` parameters as though they are passed by “move-in/move-out,” and indeed the semantics are the same except that no data actually moves in memory.

Just as with `let` parameters, `inout` parameters are not owned by the callee, and their values cannot escape the callee without first being copied.

##### The Fine Print: Temporary Destruction

Although `inout` parameters are required to be valid at function entry and exit, a callee is
entitled to do anything with the value of such parameters, including destroying them, as long as it
puts a value back before returning:

```val
fun offset_inout(_ v: inout Vector2, by delta: Vector2) {
  let temporary = v.copy()
  v.deinit()
  // `v` is not bound to any value here
  v = (x: temporary.x + delta.x, y: temporary.y + delta.y)
}
```

In the example above, `v.deinit()` explicitly deinitializes the value of `v`, leaving it unbound.
Thus, trying to access its value would constitute an error caught at compile time.
Nonetheless, since `v` is reinitialized before the function returns, the compiler is satisfied.

*Note: A Rust developer can understand explicit deinitialization as a call to `drop`.*
*However, explicit deinitialization always consumes the value, even if its type is copyable.*

#### `sink` parameters

The `sink` convention indicates a transfer of ownership, so unlike previous examples the parameter
*can* escape the lifetime of the callee.

```val
fun offset_sink(_ base: sink Vector2, by delta: Vector2) -> Vector2 {
  &base.x += delta.x
  &base.y += delta.y
  return base        // OK; base escapes here!
}
```

Just as with `inout` parameters, the compiler enforces that arguments to `sink` parameters are
unique.  Because of the transfer of ownership, though, the argument
becomes inaccessible in the caller after the callee is invoked.

```val
fun main()
  let v = (x: 1, y: 2)
  print(offset_sink(v, (x: 3, y: 5)))  // prints (x: 4, y: 7)
  print(v) // <== error: v was consumed in the previous line
}          // to use v here, pass v.copy() to offset_sink.
```

A C++ developer can understand the `sink` convention as similar in intent to *pass by rvalue
reference*.  In fact it's more like pass-by-value where the caller first invokes `std::move` on the
argument, because ownership of the argument is transferred at the moment of the function call.

```c++
Vector2 offset_sink(Vector2 base, Vector2 const& delta) {
  base.x += delta.x
  base.y += delta.y
  return base
}

int main() {
  Vector2 v = {1, 2};
  print(offset_sink(std::move(v), {3, 5})); // prints (x: 4, y: 7)
  print(v);                                 // prints garbage
}
```

In Val, the lifetime of a moved-from value ends, rather than being left accessible in an
indeterminate state.

A Rust developer can understand a `sink` parameter as a *pass by move*.  If the source type is copyable it is as though it first assigned to a unique reference, so the move is forced:

```rust
fn offset_sink(base: Vector2, delta: &Vector2) -> Vector2 {
  base.x += delta.x
  base.y += delta.y
  return base
}
fn main() {
  let mut v: Vector2 = {1, 2};
  let moveV = &mut v;
  println("{}", offset_sink(moveV, {3, 5}))
}
```
{% comment %}
The above rust code is surely wrong.  Sombody please fix!
{% endcomment %}

The `sink` and `inout` conventions are closely related; so much so that `offset_sink` can be written
in terms of `offset_inout`, and vice versa.

```val
fun offset_sink2(_ v: sink Vector2, by delta: Vector2) -> Vector2 {
  offset_inout(&v, by: delta)
  return v
}

fun offset_inout2(_ v: inout Vector2, by delta: Vector2) {
  v = offset_sink(v, by: delta)
}
```

{% comment %}
We should say this somewhere, perhaps on a page called "Val for functional programmers," but it really doesn't belong here.

*Note: The correspondence highlights the fact that in-place mutation in Val is an efficient form of [functional update](https://en.wikipedia.org/wiki/Monad_(functional_programming)#State_monads).*
{% endcomment %}

#### `set` parameters

The `set` convention lets a callee initialize an uninitialized value.  The compiler will only accept uninitialized objects as arguments to a set parameter.

```val
fun init_vector(_ target: set Vector2, x: sink Double, y: sink Double) {
  target = (x: x, y: y)
}

public fun main() {
  var v: Vector2
  init_vector(&v, x: 1.5, y: 2.5)
  print(v)                         // (x: 1.5, y: 2.5)
  init_vector(&v, x: 3, y: 7).     // error: 
}
```

A C++ developer can understand the `set` convention in terms of the placement new operator, with the guarantee that the storage in which the new value is being created starts out uninitialized, and ends up initialized.

```c++
#include <new>

void init_vector(Vector2* v, double x, double y) {
  new(v) Vector2(components[0], components[1]);
}

int main() {
  alignas(Vector2) char _storage[sizeof(Vector2)];
  auto v1 = static_cast<Vector2*>(static_cast<void*>(_storage));
  init_vector(v1, 1.5, 2.5);
  std::cout << *v1 << std::endl;
}
```

### Methods

A method is a function associated with a particular type, called the **receiver**, on which it
primarily operates.  Method declaration syntax is the same as that of a free function, except that a
method is always declared in the scope of its receiver type, and the receiver parameter is omitted.

```val
type Vector2 {
  public var x: Double
  public var y: Double
  public memberwise init

  public fun offset_let(by delta: Vector2) -> Vector2 { // <== HERE
    Vector2(x: self.x + delta.x, y: self.y + delta.y)
  }
}
```

The program above declares `Vector2`, a [structure](#structures) with a method, `offset_let(by:)`,
which is nearly identical to the similarly named free function we declared in the section on
[parameter passing conventions](#parameter-passing-conventions).  The difference is that its first
parameter, a `Vector2` instance, has become implicit and is now named `self`.

For concision, `self` can be omitted from most expressions in a method.
Therefore, we can rewrite `offset_let` this way:

```val
type Vector2 {
  // ...
  public fun offset_let(by delta: Vector2) -> Vector2 {
    Vector2(x: x + delta.x, y: y + delta.y)
  }
}
```

A method is usually accessed as a member of the receiver instance that forms its implicit first
parameter, a syntax that binds that instance to the method:

```val
public fun main() {
  let unit_x = Vector2(x: 1.0, y: 0.0)
  let v1 = Vector2(x: 1.5, y: 2.5)
  let v2 = v1.offset_let(by: unit_x)  // <== HERE
  print(v2)
}
```

When the method is accessed through its type, instead of through an instance, we get a regular function with an explicit self parameter, so we could have made this equivalent call in the marked line above:

```val
  let v2 = Vector2.offset_let(self: v1, by: unit_x)
```

As usual, the default passing convention of the receiver is `let`.
Other passing conventions must be specified explicitly, just after the closing parenthesis of the method's parameter list.  In the following example, `self` is passed `inout`, making this a mutating method:

```val
type Vector2 {
  // ...
  public fun offset_inout(by delta: Vector2) inout -> Vector2 {
    &x += delta.x
    &y += delta.x
  }
}
```

In a call to an `inout` method like the one above, the receiver expression is marked with an ampersand, to indicate it is being mutated:

```val
fun main() {
  var y = Vector2(x: 3, y: 4)
  &y.offset_inout(by: Vector2(x: 7, y: 11)) // <== HERE
  print(y)
}
```

#### Method bundles

When multiple methods have the same functionality but differ only in the passing convention of their receiver, they can be grouped into a single *bundle*.

```val
type Vector2 {
  public var x: Double
  public var y: Double
  public memberwise init

  public fun offset(by delta: Vector2) -> Vector2 {
    let {
      Vector2(x: x + delta.x, y: y + delta.y)
    }
    inout {
      &x += delta.x
      &y += delta.y
    }
    sink {
      &x += delta.x
      &y += delta.y
      return self
    }
  }
}

public fun main() {
  let unit_x = Vector2(x: 1.0, y: 0.0)
  var v1 = Vector2(x: 1.5, y: 2.5)
  &v1.offset(by: unit_x)           // 1

  print(v1.offset(by: unit_x))     // 2
  
  let v2 = v1.offset(by: unit_x)   // 3
  print(v2)
}
```

In the program above, the method `Vector2.offset(by:)` defines three variants, each corresponding to an implementation of the same behavior, for a different receiver convention.

*Note: A method bundle can not declare a `set` variant as it does not make sense to operate on a receiver that has not been initialized yet.*

At the call site, the compiler determines the variant to apply depending on the context of the call.
In this example, the first call applies the `inout` variant as the receiver has been marked for mutation.
The second call applies the `sink` variant as the receiver is no longer used aftertward.

Thanks to the link between the `sink` and `inout` conventions, the compiler is able to synthesize one implementation from the other.
Further, the compiler can also synthesize a `sink` variant from a `let` one.

This feature can be used to avoid code duplication in cases where custom implementations of the different variants do not offer any performance benefit, or where performance is not a concern.
For example, in the case of `Vector2.offset(by:)`, it is sufficient to write the following declaration and let the compiler synthesize the missing variants.

```val
type Vector2 {
  // ...
  public fun offset(by delta: Vector2) -> Vector2 {
    let { Vector2(x: x + delta.x, y: y + delta.y) }
  }
}
```

#### Static methods

A type can be used as a namespace for global functions that relate to that type.
For example, the function `Double.random(in:using:)` is a global function declared in the namespace of `Double`.

A global function declared in the namespace of a type is called a *static method*.
Static methods do not have an implicit receiver parameter.
Instead, they behave just like regular global functions.

A static method is declared with `static`:

```val
type Vector2 {
  // ...
  public static fun random(in range: Range<Double>) -> Vector2 {
    Vector2(x: Double.random(in: range), y: Double.random(in: range))
  }
}
```

When the return type of a static method matches the type declared by its namespace, the latter can be omitted if the compiler can infer it from the context of the expression:

```val
public fun main() {
  let v1 = Vector2(x: 0.0, y: 0.0)
  let v2 = v1.offset(by: .random(in: 0.0 ..< 10.0))
  print(v2)
}
```

### Closures

Functions are first-class citizen in Val, meaning that they be assigned to bindings, passed as arguments or returned from functions, like any other value.
When a function is used as a value, it is called a *closure*.

```val
fun round(_ n: Double, digits: Int) -> Double {
  let factor = 10.0 ^ Double(digits)
  return (n * factor).round() / factor
}

public fun main() {
  let f = round(_:digits:)
  print(type(of: f)) // (_: Double, digits: Int) -> Double
}
```

Some methods of the standard library use closures to implement certain algorithms.
For example, the type `T[n]` has a method `reduce(into:_:)` that accepts a closure as second argument to describe how its elements should be combined.

```val
fun combine(_ partial_result: inout Int, _ element: Int) {
  &partial_result += element
}

public fun main() {
  let sum = [1, 2, 3].reduce(into: 0, combine)
  print(sum)
}
```

*Note: The method `Int.infix+=` has the same type as `combine(_:_:)` in this example.*
*Therefore, we could have written `numbers.reduce(into: 0, Int.infix+=)`.*

When the sole purpose of a function is to be used as a closure, it may be more convenient to write it inline, as a closure expression.
Such an expression resembles a function declaration, but has no name.
Further, the types of the parameters and/or the return type can be omitted if the compiler can infer those from the context.

```val
public fun main() {
  let sum = [1, 2, 3].reduce(into: 0, fun(_ partial_result, _ element) {
    &partial_result += element
  })
  print(sum)
}
```

#### Closure captures

A function can refer to bindings that are declared outside of its own scope.
When it does so, it is said to create *captures*.
There exists three kind of captures: `let`, `inout` and `sink`.

A `let` capture occurs when a function accesses a binding immutably.
For example, in the program below, the closure passed to `map(_:)` creates a `let` capture on `offset`.

```
public fun main() {
  let offset = 2
  let result = [1, 2, 3].map(fun(_ n) { n + offset })
  print(result) // [3, 4, 5]
}
```

An `inout` capture occurs when a function accesses a binding mutably.
For example, in the program below, the closure passed to `for_each(_:)` creates an `inout` capture on `sum`.

```val
public fun main() {
  var sum = 0
  let result = [1, 2, 3].for_each(fun(_ n) { &sum += n })
  print(sum) // 6
}
```

A `sink` capture occurs when a function acts as a sink for a value at its declaration.
Such a capture must be defined explicitly in a capture list.
For example, in the program below, `counter` is assigned to a closure that returns integers in incrementing order every time it is called.
The closure keeps track of its own state with a `sink` capture.

```val
public fun main() {
  var counter = fun[var i = 0]() inout -> Int {
    defer { &i += 1 }
    return i.copy()
  }
  print(&counter()) // 0
  print(&counter()) // 1
}
```

*Note: The signature of the closure must be annotated with `inout` because calling it modifies its own state (i.e., the values that it had captured).*
*Further, a call to `counter` must be prefixed by an ampersand to signal mutation.*

## Subscripts

A subscript is a resuable piece of code that *yields* the value of an object, or part thereof.
It operates very similarly to a function, but rather than returning a value to its caller, it temporarily yields control for the caller to access the yielded value.

```val
subscript min(_ x: Int, _ y: Int): Int {
  if y < x { y } else { x }
}

public fun main() {
  let one = 1
  let two = 2
  print(min[one, two]) // 1
}
```

The program above declares a subscript named `min` that accepts two integers and yields the value of the smallest.
A subscript is called using its name followed by its arguments, enclosed in square brackets (unlike functions, which require parentheses).
Here, it is called in `main` to print the minimum of `1` and `2`.

Note that, because `min` does not return a value, its parameters need not to be passed with the `sink` convention.
Indeed, they do not escape from the subscript.

To better understand, let us instrument the subscript to observe its behavior.
Similarly to functions, note that if the body of a subscript involves multiple statements, yielded values must be indicated by a `yield` statement.
Further, a subscript must have exactly one `yield` statement on every possible execution path.

```
subscript min(_ x: Int, _ y: Int): Int {
  print("enter")
  yield if y < x { y } else { x }
  print("leave")
}

public fun main() {
  let one = 1
  let two = 2

  let z = min[one, two] // enter
  print(z)              // 1
                        // leave
}
```

In the program above, `min` has been changed so that it prints a message before and after yielding a value.
In `main`, the first message appears `min` is called when the projection starts; the second message appears when the projection ends.

### Member subscripts

Subscripts declaired in type declarations and extensions are called member subscripts.
Just like methods, they receive an implicit receiver parameter.

```val
type Matrix3 {
  public var components: Double[3][3]
  public memberwise init

  public subscript row(_ index: Int): Double[3] {
    components[index]
  }
}
```

A member subscript can be anonymous.
In that case, it is called by affixing square brackets directly after the receiver.

```val
type Matrix3 {
  public var components: Double[3][3]
  public memberwise init

  public subscript(row: Int, col: Int): Double {
    components[row][col]
  }
}

public fun main() {
  var m = Matrix3(components: [
    [1 ,4, 7],
    [2 ,5, 8],
    [3 ,6, 9],
  ])
  print(m[row: 1, col: 1]) // 5.0
}
```

### Subscript bundles

Just like methods, subscripts and member subscripts can bundle multiple implementations to represent different variant of the same functionality depending on the context in which the subscript is being used.

#### `inout` subscripts

An `inout` subscript projects values mutably:

```val
subscript min_inout(_ x: inout Int, y: inout Int): Int {
  inout { if y < x { &x } else { &y } }
}

public fun main() {
  var (x, y) = (1, 2)
  &min_inout[&x, &z] += 2
  print(x) // 3
}
```

A mutable subscript can always be used immutably as well.
However, in the example above, because the parameters are `inout`, arguments to `min_inout` will have to be passed `inout` even when the subscript is used immutably.

To solve that problem, we can mark the parameters `yielded` instead, which act as a placeholder for either `let`, `inout`, or `sink` dependeing on the way the subscript is being used.

```val
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  inout { if y < x { &x } else { &y } }
}

public fun main() {
  let (x, y) = (1, 2)
  print(min[x, y]) // 1
}
```

Here, the immutable variant of the subscript is synthesized from the mutable one.
In some cases, however, you may need to implement different behavior.
In such situations, you can bundle multiple implementations together:

```
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  let   { if y < x { x } else { y } }
  inout { if y < x { &x } else { &y } }
}
```

#### `set` subscripts

A `set` subscript does not project any value.
Instead, it is used when the value produced by a subscript need not be used, but only assigned to a new value.

A `set` subscript accepts an implicit `sink` parameter named `new_value` denoting the value to assign:

```val
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  inout { if y < x { &x } else { &y } }
  set   { if y < x { x = new_value } else { y = new_value } }
}

public fun main() {
  var (x, y) = (1, 2)
  min[&x, &y] = 3
  print(min[x, y]) // 3
}
```

In the program above, the value of the subscript is not required to perform the assigment.
So rather than applying the `inout` variant, the compiler will choose to apply the `set` variant.

#### `sink` subscripts

A `sink` subscript **returns** a value instead of projecting one, consuming its `yielded` parameters.
It is used when a call to a subscript is the last use of its `yielded` arguments, or when the result of the subscript is being consumed.

```val
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  inout { if y < x { &x } else { &y } }
  sink  { if y < x { x } else { y } }
}

public fun main() {
  let (x, y) = (1, 2)
  var z = min[x, y] // last use of both x and y
  &z += 2
  print(z)          // 3
}
```

*Note: If the body of a `sink` subscript variant involves multiple statements, returned values must be indicated by a `return` statement rather than a `yield` statement.*

The `sink` variant of a subscript can always be synthesized from the `let` variant.

### Computed properties

A member subscript that accepts no argument can be declared as a *computed property*, which are accessed without square brackets.

```val
type Angle {
  public var radians: Double
  public memberwise init
  
  public property degrees: Double {
    let {
      radians * 180.0 / Double.pi
    }
    inout {
      var d = radians * 180.0 / Double.pi
      yield &d
      radians = d * Double.pi / 180.0
    }
    set {
      radians = new_value * Double.pi / 180.0
    }
  }
}
```

* * *

[Home](/)

<!-- Local Variables: -->
<!-- eval: (auto-fill-mode -1) -->
<!-- End: -->
