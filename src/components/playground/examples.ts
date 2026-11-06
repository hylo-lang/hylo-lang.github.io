/**
 * The example programs: those the full-screen playground offers to start from, which the home
 * page shows one after another. Each says what it does when run, which `examples.test.ts` checks
 * with the compiler the site is built with.
 *
 * The standard library has no printing yet: a program reports its result as its exit status, or
 * checks it with `precondition`.
 */
import { withoutErrorPreview } from '../error-preview';
import type { Expectation } from './snippet';

/** An example program. */
export interface Example {
  name: string;
  /**
   * The code, with an error preview's markup if `errorPreview` (see `error-preview-plugin.ts`):
   * squiggles under code between `~~`, and messages in `//!` comments.
   */
  source: string;
  /** Whether `source` marks the errors the compiler reports, as an error preview. */
  errorPreview?: boolean;
  expect: Expectation;
}

/** Returns the code of `example`, without the markup of an error preview. */
export const exampleCode = (example: Example): string =>
  example.errorPreview ? withoutErrorPreview(example.source) : example.source;

export const EXAMPLES: readonly Example[] = [
  {
    name: 'Factorial',
    expect: { kind: 'exit', status: 120 },
    source: `// There is no \`print\` yet: a program reports its result through its exit
// status, here 120, or checks what it expects with \`precondition\`.
//
// \`n\` is a \`sink\` parameter: the function owns its argument, so it may count
// it down. Every mutation is marked with \`&\`.
fun factorial(n: sink Int) -> Int {
  var result = 1
  while n > 1 {
    &result *= n
    &n -= 1
  }
  return result
}

public fun main() -> Int32 {
  Int32(factorial(5))
}
`,
  },
  {
    name: 'Fibonacci',
    expect: { kind: 'exit', status: 55 },
    source: `// \`if\` is an expression, so it can be the whole body of a function. \`n\` is a
// \`let\` parameter, so returning it takes an explicit copy.
fun fibonacci(n: Int) -> Int {
  if n < 2 { n.copy() } else { fibonacci(n - 1) + fibonacci(n - 2) }
}

public fun main() -> Int32 {
  Int32(fibonacci(10))
}
`,
  },
  {
    name: 'Parameter conventions',
    expect: { kind: 'ok' },
    source: `// A parameter's convention says what the function may do with its argument.

/// Returns \`x + 1\`. \`x\` is \`let\`, the default: it can only be read.
fun successor(x: Int) -> Int { x + 1 }

/// Adds one to \`x\`, in place.
fun increment(x: inout Int) { &x += 1 }

/// Initializes \`x\` to zero. \`x\` is uninitialized before the call.
fun clear(x: set Int) { &x = 0 }

/// Returns \`x\`, consuming it.
fun take(x: sink Int) -> Int { x }

public fun main() {
  var n: Int
  clear(&n)
  increment(&n)
  precondition(successor(n) == 2)

  let m = take(n)
  // \`n\` has been consumed, so reading it here would be an error, but it can be
  // initialized again.
  clear(&n)
  precondition(m == 1)
  precondition(n == 0)
}
`,
  },
  {
    name: 'Sink methods',
    expect: { kind: 'ok' },
    source: `// \`Order\` isn't \`Deinitializable\`: it can't just be dropped, it has to be
// consumed by one of its \`sink\` methods. The compiler checks every path.
struct Order is Movable {
  var items: Int
  memberwise init

  /// Adds an item to the order.
  fun add() inout {
    &self.items += 1
  }

  /// Ships the order, returning how many items it had.
  fun ship() sink -> Int {
    self.items
  }
}

public fun main() {
  var order = Order(items: 0)
  &order.add()
  &order.add()
  precondition(order.ship() == 2)

  // \`order\` has been consumed: \`&order.add()\` here would be an error. So would
  // leaving out the call to \`ship\`.
}
`,
  },
  {
    name: 'Consumption checks',
    expect: { kind: 'error' },
    errorPreview: true,
    source: `/// A computer that must be explicitly shut down using a sink method.
struct Computer is Movable {
  public var ram: Int
  public memberwise init

  public fun shutdown() sink {
    // Consumes \`self\` by consuming its parts.
    _ = self.ram
  }
}

fun never_shut_down() {
  var computer = Computer(ram: 64)
~~}~~ //! Cannot deinitialize \`computer\`

fun shut_down_maybe() {
  var computer = Computer(ram: 64)
  if random_bool() {
    computer.shutdown()
  }
~~}~~ //! Cannot deinitialize \`computer\` [if the branch is not taken]

fun shut_down_repeatedly() {
  var computer = Computer(ram: 64)
  while random_bool() {
    ~~computer.shutdown()~~ //! Use of consumed object [in the second iteration]
  }
~~}~~ //! Cannot deinitialize \`computer\` [if the loop never runs]

fun random_bool() -> Bool {
  return false // Generated using a fair dice roll % 2.
}
`,
  },
  {
    name: 'Subscripts',
    expect: { kind: 'ok' },
    source: `// A subscript projects a value instead of returning it: the caller accesses
// the value in place, without copying it, until it is done with it.

// A bundle of variants: the compiler picks one by how the projection is used.
subscript min(x: auto Int, y: auto Int) auto -> Int {
  let   { if y > x { yield x } else { yield y } }
  inout { if y > x { yield &x } else { yield &y } }
}

// The code after \`yield\` runs once the caller is done with the projection.
subscript clamped(x: inout Int) inout -> Int {
  var y = x
  yield &y
  &x = if y > 100 { 100 } else { y }
}

public fun main() {
  var a = 50
  var b = 30

  // Writes to the smaller of the two, through the \`inout\` variant.
  &min[&a, &b] = 40
  precondition(b == 40)

  // A projection can be bound to a name, and lasts until its last use.
  inout c = &clamped[&a]
  &c = 1000
  &c += 1
  precondition(a == 100)

  // Reads through the \`let\` variant.
  precondition(min[a, b] == 40)
}
`,
  },
  {
    name: 'Member subscripts',
    expect: { kind: 'ok' },
    source: `struct Duration is Deinitializable {
  var seconds: Int
  memberwise init

  /// The duration in whole minutes.
  ///
  /// Writing to it rounds the duration down to whole minutes: the \`inout\`
  /// variant projects a temporary, and updates \`self\` once the caller is done
  /// with it.
  subscript minutes() auto -> Int {
    let { yield self.seconds / 60 }
    inout {
      var m = self.seconds / 60
      yield &m
      &self.seconds = m * 60
    }
  }
}

public fun main() {
  var d = Duration(seconds: 150)
  precondition(d.minutes[] == 2)

  &d.minutes[] += 1
  precondition(d.seconds == 180)
}
`,
  },
  {
    name: 'Auto subscripts',
    expect: { kind: 'ok' },
    source: `/// A temperature.
struct Temperature is Deinitializable {
  /// The value of \`self\` in kelvins.
  var kelvins: Int
  memberwise init

  /// The value of \`self\` in degrees Celsius.
  ///
  /// An \`auto\` subscript is a bundle of variants, of which the compiler picks
  /// one by how the projection is used: \`let\` to read it, \`inout\` to modify it.
  /// The value in degrees Celsius isn't stored: the \`inout\` variant projects a
  /// temporary, and converts it back to kelvins once the caller is done with it.
  subscript celsius() auto -> Int {
    let { yield self.kelvins - 273 }
    inout {
      var c = self.kelvins - 273
      yield &c
      &self.kelvins = c + 273
    }
  }
}

public fun main() {
  var t = Temperature(kelvins: 273)
  precondition(t.celsius[] == 0)

  // Bound to a name, the projection lasts until its last use, after which
  // \`t.kelvins\` is updated.
  inout c = &t.celsius[]
  &c = 100
  precondition(t.kelvins == 373)
}
`,
  },
  {
    name: 'Method bundles',
    expect: { kind: 'ok' },
    source: `/// A value that counts how many times it has been assigned to.
struct Tracked is Deinitializable {
  public var value: Int
  public var assignments: Int

  public init(value: sink Int) {
    &self.value = value
    &self.assignments = 0
  }
}

given Tracked is Movable {
  public fun take_value(from source: sink Self) auto {
    // Moving into uninitialized storage initializes it.
    set {
      &self.value = source.value
      &self.assignments = 0
    }
    // Moving into initialized storage assigns to it.
    inout {
      &self.value = source.value
      &self.assignments += 1
    }
  }
}

public fun main() {
  var a = Tracked(1)
  var b = Tracked(2)
  var c = Tracked(3)

  var s: Tracked
  &s = a
  &s = b
  &s = c

  precondition(s.value == 3)
  precondition(s.assignments == 2)
}
`,
  },
  {
    name: 'Traits',
    expect: { kind: 'ok' },
    source: `trait Shape {
  fun area() -> Int
}

struct Square is Shape & Deinitializable {
  var side: Int
  memberwise init

  fun area() -> Int { self.side * self.side }
}

struct Rectangle is Deinitializable {
  var width: Int
  var height: Int
  memberwise init
}

// A conformance can be declared apart from its type, even in another module.
given Rectangle is Shape {
  fun area() -> Int { self.width * self.height }
}

/// Returns the total area of \`a\` and \`b\`, which may be shapes of different types.
fun total_area<T is Shape, U is Shape>(a: T, b: U) -> Int {
  a.area() + b.area()
}

public fun main() {
  precondition(total_area(Square(side: 3), Rectangle(width: 2, height: 5)) == 19)
}
`,
  },
  {
    name: 'Extensions',
    expect: { kind: 'ok' },
    source: `// Types can be extended after the fact, even those of other modules, such as
// the standard library's \`Int\`: with new members, and with new conformances.

extension Int {
  /// Returns \`self\` multiplied by itself.
  fun squared() -> Int { self * self }
}

trait Measurable {
  /// Returns the size of \`self\`.
  fun size() -> Int
}

// The standard library knows nothing of \`Measurable\`, but \`Int\` and \`Bool\` can
// conform to it anyway.
given Int is Measurable {
  fun size() -> Int { self.abs() }
}

given Bool is Measurable {
  fun size() -> Int { if self { 1 } else { 0 } }
}

/// Returns the total size of \`a\` and \`b\`.
fun total_size<T is Measurable, U is Measurable>(a: T, b: U) -> Int {
  a.size() + b.size()
}

public fun main() {
  precondition(5.squared() == 25)
  precondition(total_size(-3, true) == 4)
}
`,
  },
  {
    name: 'Default implementations',
    expect: { kind: 'ok' },
    source: `/// A sequence of integers that can be read by position.
trait Sequence {
  /// Returns the number of elements.
  fun count() -> Int

  /// Returns the element at position \`i\`, which is less than \`count()\`.
  fun element(at i: Int) -> Int

  /// Returns the sum of the elements, and whether it was computed by this
  /// default implementation.
  ///
  /// Every sequence gets this implementation, which reads each element in turn,
  /// unless it provides its own.
  fun sum() -> {Int, Bool} {
    var total = 0
    var i = 0
    while i < self.count() {
      &total += self.element(at: i)
      &i += 1
    }
    return (total, true)
  }
}

/// \`value\`, \`times\` times over.
struct Repetition is Sequence & Deinitializable {
  var value: Int
  var times: Int
  memberwise init

  fun count() -> Int { self.times.copy() }
  fun element(at i: Int) -> Int { self.value.copy() }
}

/// The integers from \`start\` up to, but not including, \`end\`.
struct Range is Sequence & Deinitializable {
  var start: Int
  var end: Int
  memberwise init

  fun count() -> Int { self.end - self.start }
  fun element(at i: Int) -> Int { self.start + i }

  // The sum of a range has a closed form: no need to read every element.
  fun sum() -> {Int, Bool} { ((self.start + self.end - 1) * self.count() / 2, false) }
}

/// Returns the average of the elements of \`s\`, which is not empty.
fun average<T is Sequence>(s: T) -> Int {
  s.sum().0 / s.count()
}

/// Returns whether the sum of \`s\` is computed by the default implementation.
fun sums_by_default<T is Sequence>(s: T) -> Bool {
  s.sum().1
}

public fun main() {
  let r = Repetition(value: 7, times: 3)
  precondition(r.sum().0 == 21)
  precondition(r.sum().1)

  let n = Range(start: 1, end: 101)
  precondition(n.sum().0 == 5050)
  precondition(!n.sum().1)

  // Generic code calls the implementation of each type: \`Range\`'s own \`sum\`.
  precondition(average(Range(start: 1, end: 11)) == 5)
  precondition(sums_by_default(r))
  precondition(!sums_by_default(n))
}
`,
  },
  {
    name: 'Scoped conformances',
    expect: { kind: 'ok' },
    source: `trait Priced {
  fun price() -> Int
}

/// Returns the price of \`a\` and \`b\` together.
fun total<T is Priced>(a: T, b: T) -> Int {
  a.price() + b.price()
}

struct Sale {
  // A conformance declared in a scope exists only there. In \`Sale\`, a number is
  // priced at half its value; elsewhere, \`Int\` isn't \`Priced\` at all, and
  // \`total(10, 20)\` would be an error in \`main\`.
  given Int is Priced {
    fun price() -> Int { self / 2 }
  }

  static fun checkout() -> Int { total(10, 20) }
}

public fun main() {
  precondition(Sale.checkout() == 15)
}
`,
  },
  {
    name: 'Implicit values',
    expect: { kind: 'ok' },
    source: `/// A tax rate, in percent.
struct TaxRate is Deinitializable {
  var percent: Int
  memberwise init
}

// \`rate\` is an implicit parameter: callers don't pass it, the compiler finds a
// value of its type among the givens in scope.
fun with_tax<where let rate: TaxRate>(price: Int) -> Int {
  price + price * rate.percent / 100
}

// Inside \`total\`, \`rate\` is itself a given, so \`with_tax\` receives it implicitly.
fun total<where let rate: TaxRate>(a: Int, b: Int) -> Int {
  with_tax(a) + with_tax(b)
}

public fun main() {
  given TaxRate = TaxRate(percent: 20)
  precondition(total(100, 50) == 180)
}
`,
  },
  {
    name: 'Existentialization',
    expect: { kind: 'ok' },
    source: `// \`depth\` calls itself with a bigger type each time: \`Bool\`, then \`{Bool, Bool}\`,
// then \`{{Bool, Bool}, {Bool, Bool}}\`, and so on. A compiler that monomorphizes
// generics, copying their code for each type they are used with, as C++ and Rust
// compilers do, can't compile this. Hylo compiles \`depth\` once, as
// \`depth(_:).existentialized\` in the IR, and passes the type at run time.
fun depth<T>(n: Int) -> Int {
  if n == 0 { 0 } else { depth<{T, T}>(n - 1) + 1 }
}

public fun main() {
  precondition(depth<Bool>(10) == 10)
}
`,
  },
];
