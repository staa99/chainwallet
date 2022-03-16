export interface PQNode<T> {
  priority: number
  value: T
}

class Heap<T> {
  array: PQNode<T>[]
  comparator: (a: number, b: number) => number

  constructor(comparator: (a: PQNode<T>, b: PQNode<T>) => number) {
    this.array = []
    this.comparator = (i1, i2) => {
      const value = comparator(this.array[i1], this.array[i2])
      if (Number.isNaN(value)) {
        throw new Error(
          `Comparator should evaluate to a number. Got ${value} when comparing ${this.array[i1]} with ${this.array[i2]}`
        )
      }
      return value
    }
  }

  /**
   * Insert element
   * @runtime O(log n)
   */
  add(value: PQNode<T>): void {
    this.array.push(value)
    this.bubbleUp()
  }

  /**
   * Retrieves, but does not remove, the head of this heap
   * @runtime O(1)
   */
  peek(): PQNode<T> {
    return this.array[0]
  }

  /**
   * Retrieves and removes the head of this heap, or returns null if this heap is empty.
   * @runtime O(log n)
   */
  remove(index = 0): PQNode<T> | undefined {
    if (!this.size) return undefined
    this.swap(index, this.size - 1) // swap with last
    const value = this.array.pop() // remove element
    this.bubbleDown(index)
    return value
  }

  /**
   * Returns the number of elements in this collection.
   * @runtime O(1)
   */
  get size() {
    return this.array.length
  }

  /**
   * Move new element upwards on the heap, if it's out of order
   * @runtime O(log n)
   */
  bubbleUp() {
    let index = this.size - 1
    const parent = (i: number) => Math.ceil(i / 2 - 1)
    while (parent(index) >= 0 && this.comparator(parent(index), index) > 0) {
      this.swap(parent(index), index)
      index = parent(index)
    }
  }

  /**
   * After removal, moves element downwards on the heap, if it's out of order
   * @runtime O(log n)
   */
  bubbleDown(index = 0) {
    let curr = index
    const left = (i: number) => 2 * i + 1
    const right = (i: number) => 2 * i + 2
    const getTopChild = (i: number) =>
      right(i) < this.size && this.comparator(left(i), right(i)) > 0 ? right(i) : left(i)

    while (left(curr) < this.size && this.comparator(curr, getTopChild(curr)) > 0) {
      const next = getTopChild(curr)
      this.swap(curr, next)
      curr = next
    }
  }

  /**
   * Swap elements on the heap
   * @runtime O(1)
   */
  swap(i1: number, i2: number) {
    const temp = this.array[i1]
    this.array[i1] = this.array[i2]
    this.array[i2] = temp
  }
}

export class PriorityQueue<T> extends Heap<T> {
  constructor(
    iterable = [],
    comparator = (a: PQNode<T>, b: PQNode<T>) => a.priority - b.priority
  ) {
    super(comparator)
    Array.from(iterable).forEach((el) => this.add(el))
  }

  /**
   * Add data to the Queue with Priority
   */
  enqueue(value: PQNode<T>): void {
    super.add(value)
  }

  /**
   * Remove from the queue the element with the highest priority.
   */
  dequeue(): PQNode<T> | undefined {
    return super.remove()
  }
}
