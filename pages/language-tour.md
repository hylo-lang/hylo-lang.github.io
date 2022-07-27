---
layout: default
---

This page gives a quick tour of Val's features in the form of a progressive guide.
It assumes familiarity with an imperative programming language such as JavaScript, Python, C or C++..

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

Note that `greet` need not to be `public` to be visible from another file in the module.
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

A tuple is a [record](https://en.wikipedia.org/wiki/Record_(computer_science)) that composes zero or
more heterogeneous values.
It can be created with a comma-separated list of values, enclosed in parentheses, and optionally labeled.
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

### Records

Just like a tuple, a record is a container composed of zero or more heterogeneous values.
Unlike a tuple, however, a record type offers a finer control over the visibility and mutability of its elements.

A record type is declared with the keyword `type` and contains typed properties declared as bindings:

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

Members that are not declared `public` cannot be accessed outside of the scope of a record type.
As we uncover more advanced constructs, we will show how to exploit that feature to design clean and safe APIs.

A record type can also define static properties.
Those are not part of record instances.
Instead, they represent global bindings defined in the namespace of the record.

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

Here, the type `Nil` is an empty record used only to mark the absence of a `T`.
The type `Optional<T>` is the union of any type `T` and `Nil`, which can be used to indicate that a particular value might be absent.

*Note: While `T | U | T` is equivalent to `T | U` (element type repetitions at the same level are collapsed), `(T | U) | T` is a distinct type.  Thus `Optional<Optional<T>>` is not the same as `Optional<T>`.*

## Functions and methods

Functions are blocks of organized and reusable code that performs a single action, or group of related actions.
They are an essential tool for managing the complexity of a program as it grows.

*Note: Though Val should not be considered a functional programming language, functions are
first-class citizens, and functional programming style is well-supported.  In fact, Val's mutable
value semantics can be freely mixed with pure-functional code without eroding that code's local
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

The program above declares a function named `norm` that accepts a 2-dimensional vector (represented as a pair of `Double`) and returns its norm.
{% comment %}
The API of a function arguably includes the its semantics and preconditions.
{% endcomment %}

A function's signature describes its parameter and a return types.

*Note: The return type of a function that does not return any value may be omitted.*
*In that case, the declaration is interpreted as though the return type was `Void`.*

A function is called using its name followed by its arguments, enclosed in parentheses.
Here, `norm` is called to compute the norm of the vector `(x: 3.0, y: 4.0)` with the expression `norm(velocity)`.

Notice that the name of the parameter to that function is prefixed by an underscore (i.e., `_`), signaling that the parameter is unlabeled.
If this underscore were omitted, a call to `norm` would require its argument to be labeled by the parameter name `v`.

It is also possible to define different labels by prefixing the parameter name with an identifier.
This feature can be used to create very expressive APIs, in particular for functions that accept multiple parameters:

```val
typealias Vector2 = (x: Double, y: Double)

fun scale(_ v: Vector2, by factor: Vector2) -> Vector2 {
  (x: v.x * factor.x, y: v.y * factor.y)
}
```

Argument labels are also useful to distinguish between different variants of the same operation.
Further, note that Val does not support type-based overloading, meaning that the only way for two functions to share the same base name is to have different argument labels.

```val
typealias Vector2 = (x: Double, y: Double)

fun scale(_ v: Vector2, by factor: Vector2) -> Vector2 {
  (x: v.x * factor.x, y: v.y * factor.y)
}
fun scale(_ v: Vector2, by_scalar factor: Double) -> Vector2 {
  (x: v.x * factor, y: v.y * factor)
}
```

The program above declares two variants of a `scale` function with different argument labels.
One accepts two vectors, the other a scalar as the scaling factor.

Argument labels are part of a function's complete name.
In fact, in this example, `scale` is merely a shorthand for either `scale(_:by:)` or `scale(_:by_scalar:)`.

If the body of a function involves multiple statements, return values must be indicated by a `return` statement:

```val
fun round(_ n: Double, digits: Int) -> Double {
  let factor = 10.0 ^ Double(digits)
  return (n * factor).round() / factor
}
```

If a function has a return a value (i.e., its return type is not `Void`), Val always expects its caller to use it or will complain with a warning otherwise.
You can use a discard statement to silence this warning:

```val
fun round(_ n: Double, digits: Int) -> Double {
  let factor = 10.0 ^ Double(digits)
  return (n * factor).round() / factor
}

public fun main() {
  _ = round(3.14159, 3) // explicitly discards the result of `round(_:digits:)`
}
```

Function can have default values for their parameters:

```val
fun round(_ n: Double, digits: Int = 3) -> Double {
  let factor = 10.0 ^ Double(digits)
  return (n * factor).round() / factor
}
```

In the program above, `round(_:digits:)` has a default value for its second argument.
Hence, one may omit the second argument when calling it.

*Note: The expression of a default argument is evaluated at each call site.*

### Parameter passing conventions

A parameter passing conventions describes how the value of an argument is passed from caller to callee.
In other words, it describes the semantics of the language at function boundaries.

Val provides four different parameter passing conventions: `let`, `inout`, `sink` and `set`.
Let us construct a running example to understand their effect.
In the next series of code examples, we will define different variants of a function to offset a 2-dimensional vector, represented as follows:

```
typealias Vector2 = (x: Double, y: Double)
```

We will also illustrate how Val's parameter passing conventions relate to other programming languages, namely C++ and Rust.

#### `let` parameters

Let us start with the `let` convention, which is the default and thus needs not to be stated explicitly.

```val
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  (x: v.x + delta.x, y: v.y + delta.y)
}
```

*Note: Although all parameters adopt the `let` convention by default, it can be specified explicitly by prefixing the type of a parameter by `let`.*

`let` parameters are passed by value and are immutable in the function.
So there's a kind of contract between the caller and the callee: both agree not to mutate the argument until the latter returns.
There's an additional clause in the fine print: the argument is "safe" to use at the entry of the function, meaning that it's fully initialized and that its invariants hold.

An important point to make from the outset is that, for all intents and purposes, this contract states that the value of a `let` parameter is independent from any other value a function might access.
In turns, that property guarantees local reasoning and excludes a large class of problems attributed to spooky action at a distance.
Underneath the user model, the contract also enables a key strategy to efficiently compile pass by value semantics.
Namely, because the value is guaranteed immutable, the compiler can compile `let` parameters with references.

In summary, we get the best of two propositions: at the level of the user model, the developer is free to enjoy the benefits of pass by value semantics to uphold local reasoning.
Meanwhile, at the machine level, the compiler is free to exploit the guarantees of the `let` convention to avoid hidden copy costs.

A C++ developer can understand the `let` convention as *pass by constant reference*, but with additional guarantees, and write the following function:

```c++
Vector2 offset_let(Vector2 const& v, Vector2 const& delta) {
  return Vector2 { v.x + delta.x, v.y + delta.y };
}
```

A Rust developer can understand it as a *pass by immutable borrow*, with the same guarantees, and write the following function:

```rust
fn offset_let(v: &Vector2, delta: &Vector2) -> Vector2 {
  Vector2 { x: v.x + delta.x, y: v.y + delta.y }
}
```

Because of the aforementioned contract, the compiler will not let us change the body of `offset_let(_:by:)` as follows:

```val
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  &v.x += delta.x
  &v.y += delta.y
  return v
}
```

This implementation attempts to modify `v` in place, breaking the clause that guarantees it to be immutable for the duration of the call.

Though the argument cannot be modified, it can be copied (as `Vector2` is a copyable type).
So, there is a way to write `offset_let(_:by:)` in terms of in place updates:

```val
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  var temporary = v.copy()
  &temporary.x += delta.x
  &temporary.y += delta.y
  return temporary
}
```

Here, `v.copy()` creates a new, independent value.
As a result, the mutations no longer apply to the parameter's value but to that of the local binding, leaving the former intact.

The `let` convention does not confer ownership, meaning that a function cannot return the value of a `let` parameter without copying it.
For example, the following function is illegal:

```val
fun duplicate(_ v: Vector2) -> Vector2 {
  v // error: `v` cannot escape
}
```

Passing arguments to `let` parameters does not require any particular syntax.
Further, the same value can be passed to multiple parameters, assuming it does not violate any contract.
In effect, that means the values of two `let` parameters can overlap:

```val
public fun main() {
  let v1 = (x: 1.5, y: 2.5)
  let v2 = offset_let(v1, by: v1)
  print(v2) // (x: 3.0, y: 5.0)
}
```

#### `inout` parameters

The `inout` convention enables mutation across function boundaries, allowing a parameter's value to be modified in place.
It is specified by prefixing the type of a parameter with `inout`:

```val
fun offset_inout(_ v: inout Vector2, by delta: Vector2) {
  &v.x += delta.x
  &v.y += delta.y
}
```

*Note: `offset_inout(_:by:)` has not return value.*

Again, there's a contract between caller and callee.
Arguments to `inout` parameters are mutable and unique at entry and exit.
By "unique", we mean that there are no other way to access the referred storage, mutable or otherwise.

A C++ developer can understand the `inout` convention as *pass by reference*, but with additional guarantees, and write the following function:

```c++
void offset_inout(Vector2& v, Vector2 const& delta) {
  v.x += delta.x
  v.y += delta.y
}
```

A Rust developer can understand it as a *pass by mutable borrow*, with the same guarantees, and write the following function:

```rust
fn offset_inout(v: &mut Vector2, delta: &Vector2) {
  v.x += delta.x;
  v.y += delta.y;
}
```

The fine print also says that arguments to `inout` parameters are valid at function entry and exit.
That means a callee is entitled to do anything with the value of such parameters, including destroying them, as long as it puts a value back before returning.

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
Nonetheless, since `v` is reinitialized to a new value before the function returns, the contract is actually satisfied.

*Note: A Rust developer can understand explicit deinitialization as a call to `drop`.*
*However, explicit deinitialization always consumes the value, even if it is instance of a copyable type.*

Passing an argument to an `inout` parameter requires its expression to be prefixed by an ampersand (i.e., `&`).
This ampersand is not an address-of operator, as found in C/C++.
It is merely a marker that signals mutation.

```val
public fun main() {
  var v1 = (x: 1.5, y: 2.5)
  offset_inplace(&v1, by: (x: 1.0, y: 0.0))
  print(v1) // (x: 2.5, y: 2.5)
}
```

*Note: It should be clear now why the operator `+=` requires the left operand to be prefixed by an ampersand.*
*Indeed, the type of `Double.infix+=` is `(inout Double, Double) -> Void`.*

Just like the `let` convention, the `inout` convention does not confer ownership.
Therefore, the value of an `inout` parameter is not allowed to escape.

Because the contract says there cannot be any other access to value of an `inout` parameter, it is not possible to pass the an "inouted" value to multiple parameters.
For example, the following program is illegal:

```val
public fun main() {
  var v1 = (x: 1, y: 2)
  offset_inplace(&v1, by: v1)
  print(v1)
}
```

#### `sink` parameters

The `sink` convention relates to escapedness and let the developer indicate when transfers of ownership take place.
It is specified by prefixing the type of a parameter with `sink`:

```val
fun offset_sink(_ v: sink Vector2, by delta: Vector2) -> Vector2 {
  (x: v.x + delta.x, y: v.y + delta.y)
}
```

Here, the contract says not only that arguments to `sink` parameters are unique, but also that their ownership is transferred to the callee.
Hence, a caller no can no longer access the value it has given to a `sink` parameter after the callee returns.

A C++ developer can understand the `sink` convention as *pass by rvalue reference*, with guarantee that the argument moves, and write the following below.
Further, note that a move is a destructive operation in Val.

```c++
Vector2 offset_sink(Vector2&& v, Vector2 const& delta) {
  return Vector2 { v.x + delta.x, v.y + delta.y };
}
```

A Rust developer can understand it as a *pass by move* and write the following below.
Note, however, that passing a value to a `sink` parameter always moves it in Val, even if that value has a copyable type.

```rust
fn offset_sink(v: Vector2, delta: &Vector2) -> Vector2 {
  Vector2 { x: v.x + delta.x, y: v.y + delta.y }
}
```

Since the value of a `sink` parameter is known to be unique at the function entry, it can be modified in place, just like the value of an `inout` parameter.
Further, since a callee receives ownership, it is free to let the value escape.
Therefore, an alternative implementation of `offset_sink(_:by:)` can be written as follows:

```val
fun offset_sink(_ v: sink Vector2, by delta: Vector2) -> Vector2 {
  &v.x += delta.x
  &v.y += delta.y
  return v
}
```

Stepping back, the fact that both `sink` and `inout` relate to uniqueness suggests some kind of correspondence.
Indeed, `offset_sink` can be written from `offset_inout`, and vice versa.

```val
fun offset_sink_alt(_ v: sink Vector2, by delta: Vector2) -> Vector2 {
  offset_inout(&v, by: delta)
  return v
}

fun offset_inout_alt(_ v: inout Vector2, by delta: Vector2) {
  v = offset_sink(v, by: delta)
}
```

*Note: The correspondence highlights the fact that in place mutation is an efficient form of [functional update](https://en.wikipedia.org/wiki/Monad_(functional_programming)#State_monads).*

Passing arguments to `sink` parameters does not require any particular syntax.
However, because of the ownership transfer, the lifetime of all bindings bound to the passed value end with the function call.
For example, the following program is illegal, as it attempts to read `v1` after it has been sunk:

```val
public fun main() {
  let v1 = (x: 1.5, y: 2.5)
  let v2 = offset_sink(v1, by: v1) // error: `v1` accessed after escaping
  print(v2)
}
```

#### `set` parameters

The `set` convention enables initialization across function boundaries.
Just like the `inout` convention, it allows a parameter's value to be modified in place, but the contract is different: a `set` parameter is guaranteed to be uninitialized at the function entry.

```val
fun init_vector(_ v: set Vector2, x: sink Double, y: sink Double) {
  v = (x: x, y: y)
}

public fun main() {
  var v1: Vector2
  init_vector(&v1, x: 1.5, y: 2.5)
  print(v1) // (x: 1.5, y: 2.5)
}
```

A C++ developer can understand the `set` convention in terms of the placement new operator, with the guarantee that the storage in which the new value is being created is indeed initialized.

```c++
#include <new>

void init_vector(Vector2* v, double x, double y) {
  new(v) Vector2(components[0], components[1]);
}

int main() {
  alignas(Vector2) char _storage[sizeof(Vector2)];
  auto v1 = reinterpret_cast<Vector2*>(_storage);
  init_vector(v1, 1.5, 2.5);
  std::cout << *v1 << std::endl;
}
```

### Methods

Methods are functions that are associated with a particular type.
They are declared very similarly to free functions, but appear in type declarations and extensions.

```val
type Vector2 {
  public var x: Double
  public var y: Double
  public memberwise init

  public fun offset_let(by delta: Vector2) -> Vector2 {
    Vector2(x: self.x + delta.x, y: self.y + delta.y)
  }
}

public fun main() {
  let unit_x = Vector2(x: 1.0, y: 0.0)
  let v1 = Vector2(x: 1.5, y: 2.5)
  let v2 = v1.offset_let(by: unit_x)
  print(v2)
}
```

The program above declares `Vector2` a [record type](#records) with two public properties, a public memberwise initializer and a method.
The latter is nearly identical to the free function we declaredin the section on [parameter passing conventions](#parameter-passing-conventions).
The difference is that its first parameter has become implicit and is now named `self`.

In a method, `self` denotes the *receiver*, an implicit argument that refers to the value on which the method is called.
The call `v1.offset_let(by: unit_x)` applies the method `Vector2.offset_let(by:)` with `v1` as receiver and `unit_x` as argument.

*Note: This examples reveals that a method `T.foo(bar:)` is just sugar for a free function `foo(self:bar:)`.*

For conciseness, `self` can be omitted from most expressions in a method.
Therefore, we can rewrite `Vector2.offset_let(by:)` as follows:

```val
type Vector2 {
  // ...
  public fun offset_let(by delta: Vector2) -> Vector2 {
    Vector2(x: x + delta.x, y: y + delta.y)
  }
}
```

Just like for other parameters, the default passing convention of the receiver is `let`.
Other passing  conventions must be specified explicitly before the return type annotation of the method signature:

```val
type Vector2 {
  // ...
  public fun offset_inout(by delta: Vector2) inout -> Vector2 {
    &x += delta.x
    &y += delta.x
  }
}
```

A call to a method whose receiver is passed `inout` requires the expression of the receiver to be prefixed by an ampersand.

#### Method bundles

When multiple methods relate to the same functionality but differs only in the passing convention of their receiver, they can be grouped in a single *bundle*.

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
  &v1.offset(by: unit_x)
  print(v1)
  
  let v2 = v1.offset(by: unit_x)
  print(v2)
}
```

In the program above, the method `Vector2.offset(by:)` defining three variants.
Each variant correspond to an implementation of the same behavior, for a different receiver convention.

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

Just like methods, subscripts and member subscripts can bindle multiple implementations to represent different variant of the same functionality depending on the context in which the subscript is being used.

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
You such situations, you can bundle multiple implementations together:

```
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  let   { if y < x { x } else { y } }
  inout { if y < x { &x } else { &y } }
}
```

#### `set` subscripts

A `set` subscript does not project any value.
Instead, it used when the value produced by a subscript needs not to be used, but only assigned to a new value.

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
So rather than applying the `inout` variant, the compiler will choses to apply the `set` variant.

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
