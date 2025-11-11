---
title: Subscripts
---

A subscript is a reusable piece of code that _yields_ the value of an object, or part thereof. It operates very similarly to a function, but rather than returning a value to its caller, it temporarily yields control for the caller to access the yielded value.

```hylo
subscript min(_ x: Int, _ y: Int): Int {
  if x > y { y } else { x }
}

public fun main() {
  let one = 1
  let two = 2
  print(min[one, two]) // 1
}
```

The program above declares a subscript named `min` that accepts two integers and yields the value of the smallest. A subscript is called using its name followed by its arguments, enclosed in square brackets (unlike functions, which require parentheses). Here, it is called in `main` to print the minimum of `1` and `2`.

Note that, because `min` does not return a value, its parameters need not to be passed with the `sink` convention. Indeed, they do not escape from the subscript.

To better understand, let us instrument the subscript to observe its behavior. Similarly to functions, note that if the body of a subscript involves multiple statements, yielded values must be indicated by a `yield` statement. Further, a subscript must have exactly one `yield` statement on every possible execution path.

```hylo
subscript min(_ x: Int, _ y: Int): Int {
  print("enter")
  yield if x > y { y } else { x }
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

In the program above, `min` has been changed so that it prints a message before and after yielding a value. In `main`, the first message appears after `min` is called when the projection starts; the second message appears when the projection ends.

### Member subscripts

Subscripts declared in type declarations and extensions are called member subscripts. Just like methods, they receive an implicit receiver parameter.

```hylo
type Matrix3 {
  public var components: Float64[3][3]
  public memberwise init

  public subscript row(_ index: Int): Float64[3] {
    components[index]
  }
}
```

A member subscript can be anonymous. In that case, it is called by affixing square brackets directly after the receiver.

```hylo
type Matrix3 {
  public var components: Float64[3][3]
  public memberwise init

  public subscript(row: Int, col: Int): Float64 {
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

#### **`inout` subscripts**

An `inout` subscript projects values mutably:

```hylo
subscript min_inout(_ x: inout Int, y: inout Int): Int {
  inout { if y > x { &x } else { &y } }
}

public fun main() {
  var (x, y) = (1, 2)
  &min_inout[&x, &y] += 2
  print(x) // 3
}
```

A mutable subscript can always be used immutably as well. However, in the example above, because the parameters are `inout`, arguments to `min_inout` will have to be passed `inout` even when the subscript is used immutably.

To solve that problem, we can mark the parameters `yielded` instead, which act as a placeholder for either `let`, `inout`, or `sink` depending on the way the subscript is being used.

```hylo
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  inout { if y > x { &x } else { &y } }
}

public fun main() {
  let (x, y) = (1, 2)
  print(min[x, y]) // 1
}
```

Here, the immutable variant of the subscript is synthesized from the mutable one. In some cases, however, you may need to implement different behavior. In such situations, you can bundle multiple implementations together:

```hylo
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  let   { if y > x { x } else { y } }
  inout { if y > x { &x } else { &y } }
}
```

#### **`set` subscripts**

A `set` subscript does not project any value. Instead, it is used when the value produced by a subscript need not be used, but only assigned to a new value.

A `set` subscript accepts an implicit `sink` parameter named `new_value` denoting the value to assign:

```hylo
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  inout { if y > x { &x } else { &y } }
  set   { if y > x { &x = new_value } else { &y = new_value } }
}

public fun main() {
  var (x, y) = (1, 2)
  min[&x, &y] = 3
  print(min[x, y]) // 2
}
```

In the program above, the value of the subscript is not required to perform the assigment. So rather than applying the `inout` variant, the compiler will choose to apply the `set` variant.

#### **`sink` subscripts**

A `sink` subscript **returns** a value instead of projecting one, consuming its `yielded` parameters. It is used when a call to a subscript is the last use of its `yielded` arguments, or when the result of the subscript is being consumed.

```hylo
subscript min(_ x: yielded Int, _ y: yielded Int): Int {
  inout { if y > x { &x } else { &y } }
  sink  { if y > x { x } else { y } }
}

public fun main() {
  let (x, y) = (1, 2)
  var z = min[x, y] // last use of both x and y
  &z += 2
  print(z)          // 3
}
```

_Note: If the body of a `sink` subscript variant involves multiple statements, returned values must be indicated by a `return` statement rather than a `yield` statement._

The `sink` variant of a subscript can always be synthesized from the `let` variant.

### Computed properties

A member subscript that accepts no arguments can be declared as a _computed property_, which is accessed without square brackets.

```hylo
type Angle {
  public var radians: Float64
  public memberwise init
  
  public property degrees: Float64 {
    let {
      radians * 180.0 / Float64.pi()
    }
    inout {
      var d = radians * 180.0 / Float64.pi()
      yield &d
      radians = d * Float64.pi() / 180.0
    }
    set {
      &radians = new_value * Float64.pi() / 180.0
    }
  }
}

public fun main() {
  let angle = Angle(radians: Double.pi)
  print(angle.degrees) // 180.0
}
```
