---
title: Functions and methods
---

Functions are blocks of reusable code that performs a single action, or group of related actions. They are an essential tool for managing the complexity of a program as it grows.

_Note: Though Hylo should not be considered a functional programming language, functions are first-class citizens, and functional programming style is well-supported. In fact, Hylo's mutable value semantics can be freely mixed with purely functional code without eroding that code's local reasoning properties_

### Free functions

A function declaration is introduced with the `fun` keyword, followed by the function's name, its signature, and finally its body:

```hylo
typealias Vector2 = {x: Float64, y: Float64}

fun norm(_ v: Vector2) -> Float64 {
  Float64.sqrt(v.x * v.x + v.y * v.y)
}

public fun main() {
  let velocity = (x: 3.0, y: 4.0)
  print(norm(velocity)) // 5.0
}
```

The program above declares a function named `norm` that accepts a 2-dimensional vector (represented as a pair of `Float64`) and returns its norm, or length.

A function's signature describes its parameter and return types. The return type of a function that does not return any value, like `main` above, may be omitted. Equivalently we can explicitly specify that the return type is `Void`.

A function is called using its name followed by its arguments and any argument labels, enclosed in parentheses. Here, `norm` is called to compute the norm of the vector `(x: 3.0, y: 4.0)` with the expression `norm(velocity)`.

Notice that the name of the parameter to that function is prefixed by an underscore (i.e., `_`), signaling that the parameter is unlabeled. If this underscore were omitted, a call to `norm` would require its argument to be labeled by the parameter name `v`.

You can specify a label different from the parameter name by replacing the underscore with an identifier. This feature can be used to create APIs that are clear and economical at the use site, especially for functions that accept multiple parameters:

```hylo
typealias Vector2 = {x: Float64, y: Float64}

fun scale(_ v: Vector2, by factor: Vector2) -> Vector2 {
  (x: v.x * factor.x, y: v.y * factor.y)
}

let extent = (x: 4, y: 7)
let half = (x: 0.5, y: 0.5)

let middle = scale(extent, by: half)
```

Argument labels are also useful to distinguish between different variants of the same operation.

```hylo
typealias Vector2 = {x: Float64, y: Float64}

fun scale(_ v: Vector2, by factor: Vector2) -> Vector2 {
  (x: v.x * factor.x, y: v.y * factor.y)
}
fun scale(_ v: Vector2, uniformly_by factor: Float64) -> Vector2 {
  (x: v.x * factor, y: v.y * factor)
}
```

The two `scale` functions above are similar, but not identical. The first accepts a vector as the scaling factor, the second a scalar, a difference that is captured in the argument labels. Argument labels are part of the full function name, so the first function can be referred to as `scale(_,by:)` and the second as `scale(_,uniformly_by:)`. In fact, Hylo does not support type-based overloading, so the _only_ way for two functions to share the same base name is to have different argument labels. _Note: many of the use cases for type-based overloading in other languages can best be handled by using method bundles._

A function with multiple statements that does not return `Void` must execute one `return` statement each time it is called.

```hylo
fun round(_ n: Float64, digits: Int) -> Float64 {
  let factor = 10.0 ^ Float64(digits)
  return (n * factor).round() / factor
}
```

To avoid warnings from the compiler, every non-`Void` value returned from a function must either be used, or be explicitly discarded by binding it to `_`.

```hylo
fun round(_ n: Float64, digits: Int) -> Float64 {
  let factor = 10.0 ^ Float64(digits)
  return (n * factor).round() / factor
}

public fun main() {
  _ = round(3.14159, 3) // explicitly discards the result of `round(_:digits:)`
}
```

Function parameters can have default values, which can be omitted at the call site:

```hylo
fun round(_ n: Float64, digits: Int = 3) -> Float64 {
  let factor = 10.0 ^ Float64(digits)
  return (n * factor).round() / factor
}

let pi2 = round(pi, digits: 2) // pi rounded to 2 digits
let pi3 = round(pi)            // pi rounded to 3 digits, the default.
```

_Note: A default argument expression is evaluated at each call site._

### Parameter passing conventions

A parameter passing convention describes how an argument is passed from caller to callee. In Hylo, there are four: `let`, `inout`, `sink` and `set`. In the next series of examples, we will define four corresponding functions to offset this 2-dimensional vector type:

```hylo
typealias Vector2 = {x: Float64, y: Float64}
```

We will also show how Hylo's parameter passing conventions relate to other programming languages, namely C++ and Rust.

#### **`let` parameters**

Let's start with the `let` convention. Parameter passing conventions are always written before the parameter type:

```hylo
fun offset_let(_ v: let Vector2, by delta: let Vector2) -> Vector2 {
  (x: v.x + delta.x, y: v.y + delta.y)
}
```

`let` is the default convention, so the declaration above is equivalent to

```hylo
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  (x: v.x + delta.x, y: v.y + delta.y)
}
```

`let` parameters are (notionally) passed by value, and are truly immutable. The compiler wouldn't allow us to modify `v` or `delta` inside the body of `offset_let` if we tried:

```hylo error-preview
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  ~~&v.x~~ += delta.x  //! error: v is immutable
  ~~&v.y~~ += delta.y
  return v
}
```

\[Recall that `&` is simply a marker required by Hylo when a value is mutated]

Though `v` cannot be modified, `Vector2` is copyable, so we can copy `v` into a mutable variable and modify _that_.

```hylo
fun offset_let(_ v: Vector2, by delta: Vector2) -> Vector2 {
  var temporary = v.copy()
  &temporary.x += delta.x
  &temporary.y += delta.y
  return temporary
}
```

In fact, when it issues the error about `v` being immutable, the compiler will suggest a rewrite equivalent to the one above (and in the right IDE, will offer to perform the rewrite for you).

The compiler also ensures that `v` and `delta` can't be modified by any other means during the call: their values are truly independent of everything else in the program, preventing all possibility of data races and allowing us to reason locally about everything that happens in the body of `offset_let`. It provides this guarantee in part by ensuring that nothing can modify the arguments _passed to_ `offset_let` while the function executes which allows arguments to be passed without making any copies.

A C++ developer can understand the `let` convention as _pass by `const` reference_, but with the additional static guarantee that there is no way the referenced parameters can be modified during the call.

```cpp
Vector2 offset_let(Vector2 const& v, Vector2 const& delta) {
  return Vector2 { v.x + delta.x, v.y + delta.y };
}
```

For example, in the C++ version of our function, `v` and `delta` _could_ be modified by another thread while `offset_let` executes, causing a data race. For a single-threaded example, just imagine adding a `std::function` parameter that is called in the body; that parameter might have captured a mutable reference to the argument and could (surprisingly!) modify `v` or `delta` through it.

A Rust developer can understand a `let` parameter as a _pass by immutable borrow_, with exactly the same guarantees:

```rust
fn offset_let(v: &Vector2, delta: &Vector2) -> Vector2 {
  Vector2 { x: v.x + delta.x, y: v.y + delta.y }
}
```

The only difference between an immutable borrow in Rust and a `let` in Hylo is that the language encourages the programmer to think of a `let` parameter as being passed by value.

The `let` convention does not transfer ownership of the argument to the callee, meaning, for example, that without first copying it, a `let` parameter can't be returned, or stored anywhere that outlives the call.

```hylo error-preview
fun duplicate(_ v: Vector2) -> Vector2 {
  return ~~v~~  //! error: `v` cannot escape; return `v.copy()` instead.
}
```

#### **`inout` parameters**

The `inout` convention enables mutation across function boundaries, allowing a parameter's value to be modified in place:

```hylo
fun offset_inout(_ target: inout Vector2, by delta: Vector2) {
  &target.x += delta.x
  &target.y += delta.y
}
```

Again, the compiler imposes some restrictions and offers guarantees in return. First, arguments to `inout` parameters must be mutable and marked with an ampersand (`&`) at the call site:

```hylo
fun main() {
  var v = (x: 3, y: 4)               // v is mutable.
  offset_inout(&v, by: (x: 1, y: 1)) // ampersand indicates mutation.
}
```

_Note: You can probably guess now why the `+=` operator's left operand is always prefixed by an ampersand:_ _the type of `Float64.infix+=` is `(inout Float64, Float64) -> Void`._

Second, `inout` arguments must be unique: they can only be passed to the function in one parameter position.

```hylo error-preview
fun main() {
  var v = (x: 3, y: 4) 
  offset_inout(~~&v~~, by: ~~v~~) //! error: overlapping `inout` access to `v`; 
}                         //! pass `v.copy()` as the second argument instead.
```

The compiler guarantees that the behavior of `target` in the body of `offset_inout` is as though it had been declared to be a local `var`, with a value that is truly independent from everything else in the program: only `offset_inout` can observe or modify `target` during the call. Just as with the immutability of `let` parameters, this independence upholds local reasoning and guarantees freedom from data races.

A C++ developer can understand the `inout` convention as _pass by reference_, with the additional static guarantee of exclusive access through the reference to the referenced object:

```cpp
void offset_inout(Vector2& target, Vector2 const& delta) {
  target.x += delta.x
  target.y += delta.y
}
```

In the C++ version of `offset_inout`, as before, the parameters may be accessible to other threads, opening the possibility of a data race. Also, the two parameters can overlap, and again a simple variation on our function is enough to demonstrate why that might be a problem:

```cpp
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

A Rust developer can understand an `inout` parameter as a _pass by mutable borrow_, with exactly the same guarantees:

```rust
fn offset_inout(target: &mut Vector2, delta: &Vector2) {
  target.x += delta.x;
  target.y += delta.y;
}
```

Again, the only difference is one of perspective: Hylo encourages you to think of `inout` parameters as though they are passed by “move-in/move-out,” and indeed the semantics are the same except that no data actually moves in memory.

Just as with `let` parameters, `inout` parameters are not owned by the callee, and their values cannot escape the callee without first being copied.

**The Fine Print: Temporary Destruction**

Although `inout` parameters are required to be valid at function entry and exit, a callee is entitled to do anything with the value of such parameters, including destroying them, as long as it puts a value back before returning:

```hylo
fun offset_inout(_ v: inout Vector2, by delta: Vector2) {
  let temporary = v.copy()
  v.deinit()
  // `v` is not bound to any value here
  v = (x: temporary.x + delta.x, y: temporary.y + delta.y)
}
```

In the example above, `v.deinit()` explicitly deinitializes the value of `v`, leaving it unbound. Thus, trying to access its value would constitute an error caught at compile time. Nonetheless, since `v` is reinitialized before the function returns, the compiler is satisfied.

_Note: A Rust developer can understand explicit deinitialization as a call to `drop`._ _However, explicit deinitialization always consumes the value, even if its type is copyable._

#### **`sink` parameters**

The `sink` convention indicates a transfer of ownership, so unlike previous examples the parameter _can_ escape the lifetime of the callee.

```hylo
fun offset_sink(_ base: sink Vector2, by delta: Vector2) -> Vector2 {
  &base.x += delta.x
  &base.y += delta.y
  return base        // OK; base escapes here!
}
```

Just as with `inout` parameters, the compiler enforces that arguments to `sink` parameters are unique. Because of the transfer of ownership, though, the argument becomes inaccessible in the caller after the callee is invoked.

```hylo error-preview
fun main() {
  let v = (x: 1, y: 2)
  print(offset_sink(v, (x: 3, y: 5)))  // prints (x: 4, y: 7)
  print(~~v~~) //! error: v was consumed in the previous line;
}          //! to use v here, pass v.copy() to offset_sink.
```

A C++ developer can understand the `sink` convention as similar in intent to _pass by rvalue reference_. In fact it's more like pass-by-value where the caller first invokes `std::move` on the argument, because ownership of the argument is transferred at the moment of the function call.

```cpp
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

In Hylo, the lifetime of a moved-from value ends, rather than being left accessible in an indeterminate state.

A Rust developer can understand a `sink` parameter as a _pass by move_. If the source type is copyable it is as though it first assigned to a unique reference, so the move is forced:

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

The `sink` and `inout` conventions are closely related; so much so that `offset_sink` can be written in terms of `offset_inout`, and vice versa.

```hylo
fun offset_sink2(_ v: sink Vector2, by delta: Vector2) -> Vector2 {
  offset_inout(&v, by: delta)
  return v
}

fun offset_inout2(_ v: inout Vector2, by delta: Vector2) {
  v = offset_sink(v, by: delta)
}
```

#### **`set` parameters**

The `set` convention lets a callee initialize an uninitialized value. The compiler will only accept uninitialized objects as arguments to a set parameter.

```hylo error-preview
fun init_vector(_ target: set Vector2, x: sink Float64, y: sink Float64) {
  target = (x: x, y: y)
}

public fun main() {
  var v: Vector2
  init_vector(&v, x: 1.5, y: 2.5)
  print(v)                         // (x: 1.5, y: 2.5)
  init_vector(~~&v~~, x: 3, y: 7).     //! error: 'v' is already initialized
}
```

A C++ developer can understand the `set` convention in terms of the placement new operator, with the guarantee that the storage in which the new value is being created starts out uninitialized, and ends up initialized.

```cpp
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

A method is a function associated with a particular type, called the **receiver**, on which it primarily operates. Method declaration syntax is the same as that of a free function, except that a method is always declared in the scope of its receiver type, and the receiver parameter is omitted.

```hylo
type Vector2 {
  public var x: Float64
  public var y: Float64
  public memberwise init

  public fun offset_let(by delta: Vector2) -> Vector2 { // <== HERE
    Vector2(x: self.x + delta.x, y: self.y + delta.y)
  }
}
```

The program above declares `Vector2`, a structure with a method, `offset_let(by:)`, which is nearly identical to the similarly named free function we declared in the section on parameter passing conventions. The difference is that its first parameter, a `Vector2` instance, has become implicit and is now named `self`.

For concision, `self` can be omitted from most expressions in a method. Therefore, we can rewrite `offset_let` this way:

```hylo
type Vector2 {
  // ...
  public fun offset_let(by delta: Vector2) -> Vector2 {
    Vector2(x: x + delta.x, y: y + delta.y)
  }
}
```

A method is usually accessed as a member of the receiver instance that forms its implicit first parameter, a syntax that binds that instance to the method:

```hylo
public fun main() {
  let unit_x = Vector2(x: 1.0, y: 0.0)
  let v1 = Vector2(x: 1.5, y: 2.5)
  let v2 = v1.offset_let(by: unit_x)  // <== HERE
  print(v2)
}
```

When the method is accessed through its type, instead of through an instance, we get a regular function with an explicit self parameter, so we could have made this equivalent call in the marked line above:

```hylo
  let v2 = Vector2.offset_let(self: v1, by: unit_x)
```

As usual, the default passing convention of the receiver is `let`. Other passing conventions must be specified explicitly, just after the closing parenthesis of the method's parameter list. In the following example, `self` is passed `inout`, making this a mutating method:

```hylo
type Vector2 {
  // ...
  public fun offset_inout(by delta: Vector2) inout -> Vector2 {
    &x += delta.x
    &y += delta.x
  }
}
```

In a call to an `inout` method like the one above, the receiver expression is marked with an ampersand, to indicate it is being mutated:

```hylo
fun main() {
  var y = Vector2(x: 3, y: 4)
  &y.offset_inout(by: Vector2(x: 7, y: 11)) // <== HERE
  print(y)
}
```

#### **Method bundles**

When multiple methods have the same functionality but differ only in the passing convention of their receiver, they can be grouped into a single _bundle_.

```hylo
type Vector2 {
  public var x: Float64
  public var y: Float64
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
  &v1.offset(by: unit_x)           // 1. inout

  print(v1.offset(by: unit_x))     // 2. let
  
  let v2 = v1.offset(by: unit_x)   // 3. sink
  print(v2)
}
```

In the program above, the method `Vector2.offset(by:)` defines three variants, each corresponding to an implementation of the same behavior, for a different receiver convention.

_Note: A method bundle can not declare a `set` variant as it does not make sense to operate on a receiver that has not been initialized yet._

At the call site, the compiler determines the variant to apply depending on the context of the call. In this example, the first call applies the `inout` variant as the receiver has been marked for mutation. The second call applies the `let` variant as the structure is reused (without mutation). The third call applies the `sink` variant as the structure is no longer used afterwards.

Thanks to the link between the `sink` and `inout` conventions, the compiler is able to synthesize one implementation from the other. Further, the compiler can also synthesize a `sink` variant from a `let` one.

This feature can be used to avoid code duplication in cases where custom implementations of the different variants do not offer any performance benefit, or where performance is not a concern. For example, in the case of `Vector2.offset(by:)`, it is sufficient to write the following declaration and let the compiler synthesize the missing variants.

```hylo
type Vector2 {
  // ...
  public fun offset(by delta: Vector2) -> Vector2 {
    let { Vector2(x: x + delta.x, y: y + delta.y) }
  }
}
```

#### **Static methods**

A type can be used as a namespace for global functions that relate to that type. For example, the function `Float64.random(in:using:)` is a global function declared in the namespace of `Float64`.

A global function declared in the namespace of a type is called a _static method_. Static methods do not have an implicit receiver parameter. Instead, they behave just like regular global functions.

A static method is declared with `static`:

```hylo
type Vector2 {
  // ...
  public static fun random(in range: Range<Float64>) -> Vector2 {
    Vector2(x: Float64.random(in: range), y: Float64.random(in: range))
  }
}
```

When the return type of a static method matches the type declared by its namespace, the latter can be omitted if the compiler can infer it from the context of the expression:

```hylo
public fun main() {
  let v1 = Vector2(x: 0.0, y: 0.0)
  let v2 = v1.offset(by: .random(in: 0.0 ..< 10.0))
  print(v2)
}
```

### Closures

Functions are first-class citizens in Hylo, meaning that they be assigned to bindings, passed as arguments or returned from functions, like any other value. When a function is used as a value, it is called a _closure_.

```hylo
fun round(_ n: Float64, digits: Int) -> Float64 {
  let factor = 10.0 ^ Float64(digits)
  return (n * factor).round() / factor
}

public fun main() {
  let f = round(_:digits:)
  print(type(of: f)) // (_: Float64, digits: Int) -> Float64
}
```

Some methods of the standard library use closures to implement certain algorithms. For example, the type `T[n]` has a method `reduce(into:_:)` that accepts a closure as second argument to describe how its elements should be combined.

```hylo
fun combine(_ partial_result: inout Int, _ element: Int) {
  &partial_result += element
}

public fun main() {
  let sum = [1, 2, 3].reduce(into: 0, combine)
  print(sum)
}
```

_Note: The method `Int.infix+=` has the same type as `combine(_:_:)` in this example._ _Therefore, we could have written `numbers.reduce(into: 0, Int.infix+=)`._

When the sole purpose of a function is to be used as a closure, it may be more convenient to write it inline, as a closure expression. Such an expression resembles a function declaration, but has no name. Further, the types of the parameters and/or the return type can be omitted if the compiler can infer those from the context.

```hylo
public fun main() {
  let sum = [1, 2, 3].reduce(into: 0, fun(_ partial_result, _ element) {
    &partial_result += element
  })
  print(sum)
}
```

#### **Closure captures**

A function can refer to bindings that are declared outside of its own scope. When it does so, it is said to create _captures_. There exists three kind of captures: `let`, `inout` and `sink`.

A `let` capture occurs when a function accesses a binding immutably. For example, in the program below, the closure passed to `map(_:)` creates a `let` capture on `offset`.

```hylo
public fun main() {
  let offset = 2
  let result = [1, 2, 3].map(fun(_ n) { n + offset })
  print(result) // [3, 4, 5]
}
```

An `inout` capture occurs when a function accesses a binding mutably. For example, in the program below, the closure passed to `for_each(_:)` creates an `inout` capture on `sum`.

```hylo
public fun main() {
  var sum = 0
  let result = [1, 2, 3].for_each(fun(_ n) { &sum += n })
  print(sum) // 6
}
```

A `sink` capture occurs when a function acts as a sink for a value at its declaration. Such a capture must be defined explicitly in a capture list. For example, in the program below, `counter` is assigned to a closure that returns integers in incrementing order every time it is called. The closure keeps track of its own state with a `sink` capture.

```hylo
public fun main() {
  var counter = fun[var i = 0]() inout -> Int {
    defer { &i += 1 }
    return i.copy()
  }
  print(&counter()) // 0
  print(&counter()) // 1
}
```

_Note: The signature of the closure must be annotated with `inout` because calling it modifies its own state (i.e., the values that it had captured)._ _Further, a call to `counter` must be prefixed by an ampersand to signal mutation._
