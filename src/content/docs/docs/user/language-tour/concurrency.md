---
title: Concurrency
---

> :warning: The concurrency approach of Hylo is still under design. This document only presents our current plans. Anything is still subject to change.

### Principles

Concurrency in Hylo is based on the following principles:

* Concurrent code has the same syntax/semantics as non-concurrent code.
  * No function colouring (e.g., marking functions with `async`).
  * No different abstractions for expressing concurrency (e.g., `actor` abstractions)
* Concurrency needs to be structured.
  * Following the main ideas from [Structured Programming](#user-content-fn-1)[^1], we mean the following by _structured concurrency_:
    * Use of abstractions as building blocks.
    * Ability to use recursive decomposition of the program.
    * Ability to use local reasoning.
    * Soundness and completeness: all concurrent programs can be safely modeled in the concurrency model.
  * See [this article](https://accu.org/journals/overload/30/168/overload168.pdf#page=11) for more details on _structured concurrency_.
* Functions encapsulate concurrency.
  * Concurrency can be expressed with the help of simple functions.
  * One doesn't need to understand the implementation of a function to understand how concurrency affects the outer code.
  * Functions have one entry point and one exit point, regardless of the concurrency expressed in it.
* The user shall focus on expressing the constraints between work items.
  * There is no need for low-level synchronization primitives, like mutexes and semaphores.
* User can understand and control the costs associated with concurrency.
  * Understanding how the application uses `spawn` abstractions and how it interacts with the non-Hylo code is enough to understand the costs associated with concurrency.
  * Hylo allows the user to fully customize the handling of concurrency.

### Hello, concurrent world

```hylo
fun main() {
  var handle = spawn(() => print("Hello, concurrent world!"))
  // do some other things
  handle.await()
}
```

This code will print `Hello, concurrent world!` and will do this (most likely) from a different OS thread .

### Under the hood: thread inversion

Let's have a slightly more complicated example:

```hylo
fun do_greet(): Int {
  print("Hello, concurrent world!")
  return 17
}
fun prime_number(): Int {
  13
}
fun concurrent_greeting() {
  var handle = spawn(do_greet)
  let x = prime_number()
  let y = handle.await() // switching threads
  return x + y
}
fun main() {
  print(concurrent_greeting())
}
```

The above code will print:

```
Hello, concurrent world!
30
```

The `spawn` on line 6 will create a new thread of execution and call `do_greet()` on that thread. On multi-core machines, this may be executed in parallel with the call to `prime_number()`. The call to `await` will join the two threads; it will return the value produced by the spawned thread in the context of the original thread.

Assuming that there are two OS threads for this program, the call to `await` will not block any of these threads. Instead, it will continue on the OS thread that finishes last. In our example, this is most probably the spawn thread. This leads to an interesting arrangement: the OS thread on which  `concurrent_greeting()` finishes is different than the OS thread on which this function is started. We call this _thread inversion_.

The OS thread that starts `concurrent_greeting()` will be returned to the middleware when `await` is called and can be reused to run other work items, thus avoiding the main performance problems associated with the classic thread & locks model.

### Concurrent sort example

The following code shows a basic implementation of a quick-sort algorithm that can take advantage of multicore systems:

```hylo
fun my_concurrent_sort(_ a: inout ArraySlice<Element>) {
  if a.count < size_threshold {
    // Use serial sort under a certain threshold.
    a.sort()
  } else {
    // Partition the data, such as elements [0, mid) < [mid] <= [mid+1, n).
    let mid = sort_partition(&a)
    inout (lhs, rhs) = &a.split(at: mid)
    &rhs.drop_first(1)

    // Spawn work to sort the right-hand side.
    let handle = spawn(() => my_concurrent_sort(&rhs))
    // Execute the sorting on the left side, on the current thread.
    my_concurrent_sort(&lhs)
    // We are done when both sides are done.
    handle.await()
  }
}

fun sort_partition(_ a: inout ArraySlice<Element>): Int {
    let mid_value = median9(a)
    return a.partition(by: (val) => val > mid_value)
}
fun median9(_ a: inout ArraySlice<Element>) -> Element { ... } 
```

We break the initial array into two parts, based on a pivot element. All the elements in the left side are less or equal to the pivot element, and all the elements on the right side are greater than the pivot element. This operation is happening on a single thread. Then, we sort the two slices of the array recursively; in this case, sorting the left side happens concurrently with the sorting of the right side.

Please note that the concurrency middleware won't just create OS threads for each `spawn` invocation. For an efficient utilisation of the resources, the number of OS threads is typically equal to the number of cores that the target hardware has. The user just specifies the concurrent behaviour of the application (which work items can work concurrently with others) and the concurrency middleware ensures the proper arrangement of work on the hardware.

The code allows the user to clearly express concurrency constraints:

* partition of the elements need to happen serially and before the two sides will be sorted
* the two sides can be sorted in parallel.

Although the algorithm runs a significant chunk of work serially, the performance boost into a multicore system comes from the division of the work in two chunks that can be executed concurrently. As we will quickly break those work chunks into halves again, we would soon create work for all the cores in the system.

The user will get performance improvements of the concurrent algorithm when the number of elements in each tile is large, and when we have sufficient tiles to cover the hardware threads.

### Bulk execution

In the previous examples, we could only fork a thread of execution into two threads of executions. While this is enough from a theoretical perspective, in practice we want to to create multiple threads of executions from a single invocation. Here is a simple example on how can this be achieved:

```hylo
fun greet(_ index: Int) {
  print("Hello, from thread ${index}")
}
fun main() {
  let handle = spawn(bulk: 19, greet)
  handle.await()
}
```

This will call the `greet()` function 19 times with numbers from 0 to 18. The `await()` call ensures that all spawned computations complete before ending the function `main()`.

### Custom schedulers

By default, the concurrency middleware comes with a scheduler that dispatches incoming work to a pool of OS threads. The number of OS threads created depends on the actual number of hardware threads available on the target platform. This type of scheduler is optimised for executing CPU-intensive work.

However, the user can customise the scheduler used for spawning work, and provide version that are more optimised for things like I/O, networking, GPU, executing on different machines, etc. Here is an example:

```hylo
let io_scheduler = ...
let file_content = (spawn(scheduler: io_scheduler, read_from_file)).await()
```

In this example, the actual reading from file happens on a different scheduler and will not block any of the threads associated with the default CPU scheduler. The thread that executes the code will be suspended at line 2 until the data is read from the file. The code will continue to execute on the thread provided by the given scheduler. To get back to one of the threads of the default scheduler, one can write:

```hylo
let io_scheduler = ...
let file_content = (spawn(scheduler: io_scheduler, read_from_file)).await()
default_scheduler().activate() // switching threads
...
```

On line 3, we are actually switching threads. The old thread is released back to the `ioScheduler`, while a new thread from the default scheduler is used to continue the work.

### Cancellation

#### Caller stops spawned work

Sometimes it's useful to cancel an already-running operation. Here is an example:

```hylo
let handle = spawn(fun(s: StopToken) {
  for i in 1... {
    if s.stop_requested() {
      break
    }
    print("working")
    sleep(seconds: 1)
  }
})
// do some other work concurrently
sleep(seconds: 3)
// cancel the spawned work
handle.request_stop()
```

The above code will print `working` several times (roughly 3 times), and then complete. The spawned work will stop as soon as `stop_requested()` on line 3 returns `true`, which will happen after `request_stop()` is executed.

Dropping the handle returned by `spawn` indicates that the caller is no longer interested in the completion of the spawned work, thus a stop signal will be sent. The following code behaves the same to the previous code snippet:

```hylo
let handle = spawn(fun(s: StopToken) {
  for i in 1... {
    if s.stop_requested() {
      break
    }
    print("working")
    sleep(seconds: 1)
  }
})
// do some other work concurrently
sleep(seconds: 3)
// cancel the spawned work
sink(handle)
```

#### Spawned work stops while the caller still expects value

There is another case that involves cancellation: the spawned work is stopped without the caller knowledge. The caller still expects a value from the spawned work, and that value will never be produced; an exception will be used to signal the absence of the return value. Here is an example:

```hylo
fun read_data(from c: FileContext) throws -> Buffer {
  var result: Buffer
  while c.needs_more_data() {
    do {
      &result.append(try c.read_data())
    } catch {
      c.interrupted()
      throw CancelledError()
    }
  }
  return result
}

let handle = spawn(scheduler:ioScheduler, fun() -> Buffer { readData(c) })
...
do {
  let fileContent = try handle.await()
} catch {
  // report I/O error
}
```

### HTTP server example

Let's discuss an example that is drawn from real-life, and that covers control flow. We are trying to build an HTTP server driver, in which we need to dispatch work when a new request comes on a new connection.

```hylo
fun handle_incoming_connection(_ connection: HttpConnection) {
  do {
    // Read the HTTP request from the socket.
    let request = try get_request(connection)
    request.validate()
    // Handle the request.
    let response = try handle_request(request)
    // Send back the response.
    send_response(response)
  } catch InvalidRequestError(let details) {
    send_response(BadRequestResponse(details), to: connection)
  } catch CancelledError {
    send_response(GatewayTimeoutResponse(), to: connection)
  } catch {
    send_response(InternalServerErrorResponse(), to: connection)
  }
}
```

At the first glance, there is no concurrency expressed in this code. This is because the concurrency concerns are encapsulated in the called function. The three main functions here, `get_request()`, `handle_request()`, and `send_response` are all doing concurrent work.

```hylo
fun get_request(_ connection: inout HttpConnection) throws: HttpRequest {
  // Do the reading on the network I/O scheduler.
  net_scheduler.activate()
  // Read the incoming data in chunks, and parse the request while doing it.
  var parser: HttpRequestParser
  var buffer = MemBuffer(1024*1024)
  while !parser.is_complete {
    let n = connection.read(to: &buffer) // may be an async operation
    &parser.parse_packet(buffer, of_size: n)
  }
  // Done reading; switch now to main scheduler.
  main_scheduler.activate()
  return parser.request
}

fun handle_request(_ request: HttpRequest) throws {
  if request.path == "/isalive" {
    return OkResponse(content: "still breathing")
  }
  
  // Perform any processing on a different scheduler.
  processing_scheduler.activate()
  
  switch request.path {
  case "/isalive":
    return OkResponse(content: "still breathing")
  case "/lengthy":
    // May involve other, more specialized, schedulers.
    // Most probably will use multiple threads.
    return process_lengthy_operation(request)
  }
  
  // Get back to the main scheduler.
  main_scheduler.activate()
}

fun send_response(_ response: HttpResponse, connection: inout HttpConnection) throws {
  // Do the writing on the network I/O scheduler.
  net_scheduler.activate()
  // Get buffers out of the response, and send them as packets over the network.
  let buffers: ResponseBuffers(response)
  for buffer in buffers {
    &connection.write(buffer) // may be an async operation
  }
  // Done writing; switch now to main scheduler
  main_scheduler.activate()
}
```

In this example, we've shown how we can use the most appropriate scheduler to execute a given work. We might have a scheduler for doing network I/O (reading & writing), a scheduler to perform the main logic of analysing the request, and a scheduler that is used for actually processing the request. While processing the request, we may involve other types of schedulers, and, most probably, multiple threads may be used to speed up the execution of the request. Having multiple schedulers ensures control on different parts of the application; the user is able to fine-tune the level of concurrency exposed by the application.

As with previous examples, controlling concurrency is straightforward for the user. They just need to express what concurrency constraints apply to different parts of the code; in this case by specifying which scheduler a particular code needs to run.

[^1]: O.-J. Dahl, E. W. Dijkstra, C. A. R. Hoare, _Structured Programming_, Academic Press Ltd., 1972
