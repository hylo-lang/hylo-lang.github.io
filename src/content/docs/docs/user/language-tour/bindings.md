---
title: Bindings
---

The object denoted by a mutable binding can be modified, whereas that of an immutable binding cannot.

Immutable bindings are declared with `let` and can be initialized with the `=` operator. It is not possible to modify the bound object during the lifetime of the binding.

```hylo error-preview
public fun main() {
  let gravity = 9.81
  ~~&gravity~~ = 11.2 //! error: cannot assign, `gravity` is a `let` binding
}
```

Mutable bindings are typically declared with `var`.

```hylo
public fun main() {
  var length = 1
  &length = 2
  print(length) // 2
}
```

Bindings declared with `inout` are also mutable but operate differently. They _project_ the value of an object, or part of its value, mutably.

```hylo
public fun main() {
  var point = (x: 0.0, y: 1.0)
  inout x = &point.x
  &x = 3.14
  print(point) // (x: 3.14, y: 1.0)
}
```

Note however that such a projection is not a reference in the usual sense; it has full ownership over the value it projects, which cannot be accessed except through that projection.

### Lifetime

The _lifetime_ of a binding denotes the region of the program where the value of that binding is accessed. The lifetime always ends after the last expression in which the binding occurs. For example, the lifetime of `weight` ends after the first call to `print` in the program below:

```hylo
public fun main() {
  let weight = 1.0
  print(weight) // 1.0
  let length = 2.0
  print(length) // 2.0
}
```

Some operations are said to be _consuming_, because they force-end the lifetime of a binding. In other words, they _must_ be the last use of the consumed binding. For example, assigning into a `var` binding consumes the source of the assignment. Similarly, tuple initialization consumes the source values.

```hylo
public fun main() {
  let weight = 1.0
  let base_length = 2.0
  var length = base_length // <----------------------------------------------------+
  &length += 3.0           //                                                      |
  let measurements = (     //                                                      |
    w: weight,             // <-----------------------------------------------+    |
    l: length)             //                                                 |    |
  print(weight)            // error: `weight` used after being consumed here -+    |
                           //                                                      |
  print(base_length)       // error: `base_length` used after being consumed here -+
}
```

The program above is illegal because the values of `weight` and `base_length` are used after being consumed to initialize other objects. The Hylo compiler will suggest that you change the code to consume _copies_ of `weight` and `base_length` instead, and will offer to insert these copies for you. This design follows from two of Hylo's core principles:

1. **Copies are explicit by default**. Languages that copy most values implicitly (C++, Swift, R, …) often do so at great expense to performance, and avoiding implicit copies can itself incur a great expense in code size, in code and language complexity, and in development speed. Fortunately, Hylo naturally needs far fewer copies than other languages, so explicit copies in code are always salient rather than “noisy.” (For code where implicit copying is appropriate, Hylo offers a scoped `@implicitcopy` directive).
2. **Distinct bindings and distinct objects have _independent_ values**. Languages that allow two accessible names to bind to the same mutable object (JavaScript, Python, Ruby, Lua, parts of C++ and Swift) are prone to hidden interactions, race conditions, and easily scale up into systems that can't be documented, tested, or understood. Hylo allows access to a mutable value through exactly one binding at any given time.
