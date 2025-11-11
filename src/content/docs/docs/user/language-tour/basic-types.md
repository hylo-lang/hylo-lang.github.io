---
title: Basic types
---

Hylo is statically typed: the type of a binding must always match the type of the object it is bound to. For instance, it is impossible to assign a floating point number to an integer binding:

```hylo error-preview
public fun main() {
  var length = 1
  &length = ~~2.3~~ //! error: expected type `Int`, found `Float64`
}
```

The type of a binding is determined at declaration. If an initializing expression is present, such as in all previous examples, the binding is given the type of that expression. Alternatively, we can state the type of a binding explicitly:

```hylo
public fun main() {
  var weight: Float64 = 1.0
  &weight = 2.3
  print(weight) // 2.3
}
```

The type of an expression can be retrieved, without evaluating the expression, using `type(of:)`:

```hylo
public fun main() {
  let weight = 2.3
  print(type(of: weight)) // Float64
  print(type(of: "Hey!")) // String
}
```

Hylo's standard library defines the types that are most commonly used, including numeric types (e.g., `Int`, `Float64`), text strings (`String`), Booleans (`Bool`), and types to represent data structures. The remainder of this section gives an overview of the most important ones.

### Booleans, numbers, and strings

A [Boolean](https://en.wikipedia.org/wiki/Boolean\_data\_type) is a value that is either `true` or `false`. In Hylo, those are represented by the type `Bool`:

```hylo
public fun main() {
  let is_two_greater_than_one = 2 > 1
  print(type(of: is_two_greater_than_one)) // Bool
}
```

Integer numbers are typically represented by the type `Int`, which represents a machine-size integer (usually 64 bits on modern computers). Hylo also provides types to represent integers of different sizes and signedness. For example, `UInt16` represents a 16-bit unsigned number and `Int8` a 8-bit signed number, independently of the machine for which the program is compiled.

_Note: The type `Int` should be preferred unless you need a different variant for a specific reason (e.g., representing a hardware register, storage optimization)._ _This convention aids code consistency and interoperability._

Floating point numbers are represented by the types `Float32` and `Float64`, denoting [IEEE](https://en.wikipedia.org/wiki/IEEE\_754) single and double-precision values respectively.

_Note: For the same reasons as `Int` should be preferred for every integer value, `Float64` should be preferred for any floating-point value._

Hylo does not support any kind of implicit conversion between numeric types. For example, the following program is illegal:

```hylo error-preview
public fun main() {
  let n = 3.2
  let m = 8
  print(~~n * m~~) //! error: cannot pass value of type 'Int' to parameter 'let Float64'
}
```

All numeric conversions must be written explicitly by calling the appropriate initializer. For example, we can fix the program above by converting `m` to `Float64` before the multiplication:

```hylo
public fun main() {
  let n = 3.2
  let m = 8
  print(n * Float64(m)) // 25.6
}
```

By default, integer literals are interpreted as `Int` and floating-point as `Float64`. However, a literal may be interpreted as a different type depending on the context in which it appears:

```hylo
public fun main() {
  var n: Float64 = 2
  &n *= 10
  print(n) // prints 20.0
}
```

In the above example, `n` is explicitly declared to have type `Float64`. As a result, the compiler infers its initializer as an expression of type `Float64` rather than `Int`. Similarly, the compiler infers that the literal on the right hand side of `*=` should be interpreted as a floating-point number.

_Note: the ampersand in `&n += 10` indicates that `n` is being mutated in-place._ _We will come back to it later._

Text is represented by the type `String` and has two literal forms. Simple string literals are sequences of characters surrounded by double quotes on a single line (e.g., `"Hello, World!"`). Multiline literals are surrounded by sequences of three double quotes on either side and may contain new lines.

```hylo
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

The first new-line delimiter in a multiline string literal is not part of the value of that literal if it immediately succeeds the opening delimiter. The last new-line delimiter that is succeeded by a contiguous sequence of inline spaces followed by the closing delimiter is called the indentation marker. The indentation marker and the succeeding inline spaces specify the indentation pattern of the literal and are not part of its value.

For example, in the program above, the indentation pattern is defined as two spaces. Therefore, the value of `text` starts with "C'est" and ends with "rayons."

Strings can be mutated in place in Hylo:

```hylo
public fun main() {
  var text = "Hello, "
  &text.append("World!")  // <=== HERE
  print(text)             // Hello, World!
}
```

### Tuples

A tuple is a composition of zero or more values, each of which can have any type. It can be created with a comma-separated list of values, enclosed in parentheses, and each value can (optionally) be labeled. Of course, tuples can contain other tuples.

```hylo
public fun main() {
  let circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  print(circle)
}
```

_The elements of a tuple are laid out contiguously in memory, with potential padding to account for alignment._

The elements of a tuple are accessed by appending `.n` to a tuple expression, where `n` denotes the `n`th element of the tuple, stating at zero. An element can also be referred to by its label, if any.

```hylo
public fun main() {
  var circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  &circle.0.1 = 3.6
  print(circle.origin) // (x: 6.3, y: 3.6)
}
```

The values of a tuple can be unpacked to local bindings through a process called "destructuring". Irrelevant elements can be ignored by using an underscore:

```hylo
public fun main() {
  let circle = (origin: (x: 6.3, y: 1.0), radius: 2.3)
  
  // Bind to px to circle.origin.x and r to circle.radius,
  // ignoring circle.origin.y
  let (origin: (x: px, y: _), radius: r) = circle
  
  print((px, r))  // (6.3, 2.3)
}
```

### Buffers, arrays, and slices

A buffer is a fixed-size collection of homogeneous elements laid out contiguously in memory. It can be created with a comma-separated list of values, enclosed in square brackets. The elements of a buffer can be accessed by _subscripting_ a buffer expression with an integer index:

```hylo
public fun main() {
  let triangle = [
    (x: 0.0, y: 0.0),
    (x: 1.0, y: 0.0),
    (x: 0.0, y: 1.0),
  ]
  print(triangle[1]) // (x: 1.0, y: 0.0)
}
```

_Note: indexing a buffer outside of its bounds is either caught as a compile-time error, or causes the program to terminate at runtime._

The type of a buffer is written either `T[n]` or `Buffer<T, n>`, where `T` is a type and `n` the number of elements in the buffer. All elements of a buffer must be initialized at the same time as the buffer itself, either by the means of a buffer literal expression, as in the program above, or by calling a buffer _initializer_:

```hylo
typealias Point = {x: Float64, y: Float64}
public fun main() {
  var triangle = Point[3](fun(i) { (x: Float64(i), y: 0.0) }) // <== HERE
  &triangle[1].y = 2.5
  print(triangle[1]) // (x: 1.0, y: 2.5)
}
```

In the program above, `triangle` is created by calling `Buffer.init(_:)`, which initializes each individual element with the result of a call to a function that accepts the element's index. Here, the value passed to that initializer is a closure that returns points whose x-component are equal to the element's index.

An array is like a buffer that can be resized dynamically:

```hylo
typealias Point = {x: Float64, y: Float64}
public fun main() {
  var points = Array<Point>()
  print(points.count())            // 0
  &points.append((x: 6.3, y: 1.0)) // <== HERE
  print(points.count())            // 1
}
```

Passing a range of indices to any collection's subscript creates a slice. A slice is a projection of a sub-part of a collection that can be accessed for reading and or writing.

```hylo
public fun main() {
  let numbers = [0, 1, 2, 3, 4]
  print(numbers[2 ..< 4]) // [2, 3]
}
```

### Structures

Just like a tuple, a structure is a container composed of zero or more heterogeneous values. Unlike a tuple, however, a structure offers a finer control over the visibility and mutability of its elements.

A structure is declared with the keyword `type` and contains typed properties declared as bindings:

```hylo
type Matrix3 {
  public var components: Float64[3][3]
  public memberwise init
}
```

The type declaration above defines a type `Matrix3` with a single property of type `Float64[3][3]`. The second declaration exposes the default memberwise initializer of the type, allowing us to create matrices by calling `Matrix3.init(components:)`:

```hylo
type Matrix3 {
  public var components: Float64[3][3]
  public memberwise init
}

public fun main() {
  var m = Matrix3(components: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ])
  &m.components[0][0] = 1.0
  &m.components[1][1] = 1.0
  &m.components[2][2] = 1.0
  print(m)
}
```

In the program above, `m.components` can only be modified because `m` is a mutable binding **and** the `Matrix3` property `components` is declared with `var`. Had that property been declared with `let`, the components of the matrix would remain immutable once the matrix had finished initializing, even though `m` is mutable.

Members that are not declared `public` cannot be accessed outside of the scope of a structure. As we uncover more advanced constructs, we will show how to exploit that feature to design clean and safe APIs.

A structure can also define static properties. Those are not part of structure instances. Instead, they represent global bindings defined in the namespace of the structure.

Static properties are declared with `static`. They can only be declared with `let` and are therefore always immutable:

```hylo
type Matrix3 {
  // ...
  public static let zero = Matrix3(components: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ])
}

public fun main() {
  print(Matrix3.zero)
}
```

### Unions

Two or more types can form a union type, also known as a [sum type](https://en.wikipedia.org/wiki/Tagged\_union). In Hylo, a union is a supertype of all its element types, so any element type can be used in an expression where the union type is expected:

```hylo
public fun main() {
  var x: Union<Int, String> = "Hello, World!"
  print(x) // Hello, World!
  &x = 42
  print(x) // 42
}
```

It is often convenient to create (generic) type aliases to denote unions. For example, Hylo's standard library defines [optionals](https://en.wikipedia.org/wiki/Option\_type) as follows:

```hylo
public typealias Optional<T> = Union<T, Nil<T>>
public type Nil<T>: Linear {
  public init() {}
}
```

Here, the type `Nil` is an empty structure used only to mark the absence of a `T`. The type `Optional<T>` is the union of any type `T` and `Nil`, which can be used to indicate that a particular value might be absent.
