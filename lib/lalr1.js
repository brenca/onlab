const fast = require('./faster')
const crypto = require('crypto')
const uuid = require('uuid/v4')
const {
  Serializable,
  SerializableLookupArray,
  SerializableLookupSet
} = require('./serializable')

const BNF = require('./bnf.js')
const EPSILON_HASH = crypto.createHash('md5').update('').digest('hex')

const LALR1 = { }
let ID = 0

const digraph = (X, R, G, F) => {
  const N = { }
  X.forEach(x => {
    N[x.SID] = 0
    x[F] = new SerializableLookupSet()
  })
  const STACK = []

  const TOPV = () => STACK[STACK.length - 1]

  const traverse = (x) => {
    STACK.push(x)
    const D = STACK.length
    N[x.SID] = D
    x[F] = x[G]

    for (let i = 0; i < x[R].length; i++) {
      const y = x[R][i]
      if (N[y.SID] === 0) {
        traverse(y)
      }
      N[x.SID] = Math.min(N[x.SID], N[y.SID])
      x[F] = SerializableLookupSet.union(x[F], y[F])
    }

    if (N[x.SID] === D) {
      do {
        N[TOPV().SID] = Infinity
        TOPV()[F] = x[F]
      } while (!x.equals(STACK.pop()))
    }
  }

  for (let i = 0; i < X.length; i++) {
    if (N[X.get(i).SID] === 0) {
      traverse(X.get(i))
    }
  }
}

const gatherLookback = (item, set, n = 0) => {
  const input = item.getRuleAfterDot(- (n + 1))
  if (!input) {
    return new SerializableLookupSet(set.$transitions.byInput(item.rule))
  }

  return fast.reduce(
    set.$reverseTransitions.byInput(input),
    (acc, transition) => {
      return acc.union(
        gatherLookback(item, transition.from, n + 1)
      )
    },
    new SerializableLookupSet()
  )
}

class Entry extends Serializable {
  constructor(rule, set) {
    super(uuid({
      random: crypto.createHash('md5').update(
        `${rule.SID} ${set.SID}`
      ).digest()
    }))
    this.rule = rule
    this.set = set
  }

  serialize() {
    return {
      rule: this.rule,
      set: this.set
    }
  }

  deserialize(object) {
    this.rule = object.$data.rule
    this.set = object.$data.set
  }
}
Serializable.registerSubclass(Entry)

const findIncludes = (item, set) => {
  const traverse = (set, i) => {
    const rule = item.subrules[i]
    if (!rule) {
      return new SerializableLookupSet()
    }

    const result = new SerializableLookupSet()
    if (i >= item.$lastNonNullable) {
      result.push(new Entry(rule, set))
    }

    const $transitions = set.$transitions.byInput(rule)
    if ($transitions.length > 0) {
      return fast.reduce($transitions, (acc, transition) => {
        return acc.union(traverse(transition.to, i + 1))
      }, result)
    } else {
      return result
    }
  }

  return traverse(set, 0).reduce((acc, entry) => {
    return acc.union(new SerializableLookupSet(entry.set.$transitions.byInput(entry.rule)))
  }, new SerializableLookupSet())
}

LALR1.StateTransition = class LALR1StateTransition extends Serializable {
  constructor(input, from, to) {
    super()
    this.input = input
    this.from = from
    this.to = to
    this.$INCLUDES = []
  }

  serialize() {
    return {
      input: this.input,
      from: this.from,
      to: this.to
    }
  }

  deserialize(object) {
    this.input = object.$data.input
    this.from = object.$data.from
    this.to = object.$data.to
  }

  get DR() {
    if (!this.$dr) {
      this.$dr = new SerializableLookupSet()
      this.to.$transitions.terminal.forEach(transition => {
        if (!transition.input.isEpsilonRule()) {
          this.$dr.push(transition.input)
        }
      })
    }

    return this.$dr
  }

  get READS() {
    if (!this.$reads) {
      this.$reads = new SerializableLookupSet()
      this.to.$transitions.nonterminal.forEach(transition => {
        if (transition.input.nullable) {
          this.$reads.push(transition)
        }
      })
    }

    return this.$reads
  }

  toString() {
    if (this.input.isTerminalRule()) {
      return `(${this.from.id}, ${this.input.value} {${this.to.id}})`
    } else {
      return `(${this.from.id}, ${this.input.name} {${this.to.id}})`
    }
  }

  equals(other) {
    return this.input.equals(other.input)
        && this.from.equals(other.from)
        && this.to.equals(other.to)
  }
}
Serializable.registerSubclass(LALR1.StateTransition)

LALR1.ItemSetArray = class LALR1ItemSetArray extends SerializableLookupArray {
  constructor() {
    super(...arguments)
    if (arguments.length > 0) {
      this.expand()
    }
  }

  static init(StarterItem) {
    return new LALR1.ItemSetArray(
      new LALR1.ItemSet(LALR1.StartItem.create(StarterItem))
    )
  }

  expand() {
    for (let i = 0; i < this.length; i++) {
      const other = this.get(i)
      const { items, inputs } = other.advanceDot()

      inputs.forEach(input => {
        const itemsBefore = items[input.SID]

        let set = this.startersOf(itemsBefore)
        if (!set) {
          set = new LALR1.ItemSet(itemsBefore)
          this.push(set)
        }

        const transition = new LALR1.StateTransition(input, other, set)
        other.$transitions.add(transition)
        set.$reverseTransitions.add(transition)
      })
    }

    const includes = () => {
      this.forEach(itemset => {
        fast.forEach(itemset.itemsWithRuleBeforeNullables, item => {
          fast.forEach(itemset.$transitions.byInput(item.rule), transition => {
            findIncludes(item, itemset).forEach(include => {
              include.$INCLUDES.push(transition)
            })
          })
        })
      })
    }

    includes()

    const ntt = this.nonterminalTransitions
    digraph(this.nonterminalTransitions, 'READS', 'DR', '$Read')
    digraph(this.nonterminalTransitions, '$INCLUDES', '$Read', '$FOLLOW')

    const actions = () => {
      const StarterItem = this.get(0).items[0].rule
      this.forEach(set => {
        set.actions = set.$transitions.terminal.reduce(
          (result, entry) => fast.concat(
            result, new LALR1.Shift(entry.input, entry.to)),
          []
        )

        set.gotos = set.$transitions.nonterminal.reduce(
          (result, entry) => fast.concat(
            result, new LALR1.Goto(entry.input, entry.to)),
          []
        )

        fast.forEach(set.$dotAtEnd, item => {
          const LOOKBACK = gatherLookback(item, set)
          const LA = LOOKBACK.reduce((acc, lookback) => {
            return acc.union(lookback.$FOLLOW)
          }, new SerializableLookupSet())

          if (item.rule.equals(StarterItem)) {
            set.actions.push(new LALR1.Accept())
            set.accepts = true
          } else {
            LA.forEach(lookahead => {
              set.actions.push(new LALR1.Reduce(lookahead, item))
            })
          }
        })
      })
    }

    actions()
  }

  get nonterminalTransitions() {
    if (!this.$nonterminalTransitions) {
      this.$nonterminalTransitions = this.reduce(
        (acc, set) => acc.union(set.$transitions.nonterminal),
        new SerializableLookupSet()
      )
    }
    return this.$nonterminalTransitions
  }

  startersOf(items) {
    const SID = uuid({
      random: crypto.createHash('md5').update(
        fast.map(items, s => s.SID).join('')
      ).digest()
    })

    return this.get(this.indexOfItem({ SID }))
  }

  add(value, index) {
    super.add(value, index)
  }
}
Serializable.registerSubclass(LALR1.ItemSetArray)

LALR1.TransitionTable = class LALR1TransitionTable {
  constructor() {
    this.terminal = new SerializableLookupSet()
    this.nonterminal = new SerializableLookupSet()
    this.terminalIndex = { }
    this.nonterminalIndex = { }
  }

  add(transition) {
    if (transition.input.isTerminalRule()) {
      this.terminal.push(transition)
      if (!this.terminalIndex[transition.input.SID]) {
        this.terminalIndex[transition.input.SID] =
          new SerializableLookupSet()
      }
      this.terminalIndex[transition.input.SID].push(
        this.terminal.indexOfItem(transition))
    } else {
      this.nonterminal.push(transition)
      if (!this.nonterminalIndex[transition.input.SID]) {
        this.nonterminalIndex[transition.input.SID] =
          new SerializableLookupSet()
      }
      this.nonterminalIndex[transition.input.SID].push(
        this.nonterminal.indexOfItem(transition))
    }
  }

  byInput(input) {
    if (input.isTerminalRule()) {
      return (this.terminalIndex[input.SID] || new SerializableLookupSet())
        .map(index => this.terminal.get(index))
    } else {
      return (this.nonterminalIndex[input.SID] || new SerializableLookupSet())
        .map(index => this.nonterminal.get(index))
    }
  }
}

LALR1.ItemSet = class LALR1ItemSet extends Serializable {
  constructor(starter) {
    if (!starter) {
      super()
    } else {
      const SID = (() => {
        if (!starter) {
          return uuid()
        } else if (starter.constructor !== Array) {
          return uuid({
            random: crypto.createHash('md5').update(
              starter.SID
            ).digest()
          })
        } else {
          return uuid({
            random: crypto.createHash('md5').update(
              fast.map(starter, s => s.SID).join('')
            ).digest()
          })
        }
      })()

      super(SID)
      this.id = ID++
      this.items = []
      this.accepts = false

      this.$transitions = new LALR1.TransitionTable()
      this.$reverseTransitions = new LALR1.TransitionTable()

      this.actions = []
      this.$dotAtEnd = []
      this.$ruleBeforeNullables = []

      if (starter !== undefined) {
        if (starter.constructor !== Array) {
          this.add(starter)
        } else {
          this.items = starter
        }

        this.expand()
      }
    }
  }

  serialize() {
    return {
      id: this.id,
      items: this.items,
      accepts: this.accepts,
      actions: this.actions,
      gotos: this.gotos
    }
  }

  deserialize(object) {
    this.id = object.$data.id
    this.items = object.$data.items
    this.accepts = object.$data.accepts
    this.actions = object.$data.actions
    this.gotos = object.$data.gotos
  }

  get itemsWithRuleBeforeNullables() {
    return this.$ruleBeforeNullables
  }

  add(item) {
    this.items.push(item)
  }

  isIncluded(rule) {
    return fast.find(this.items, i => {
      let eL = 0
      let rightHandSide = i.rule.subrules[i.i]
      while (rightHandSide[eL] && rightHandSide[eL].isEpsilonRule()) {
        eL++
      }

      return i.rule.equals(rule) && i.dot <= eL
    }) !== undefined
  }

  advanceDot() {
    const items = { }
    const inputs = new SerializableLookupArray()

    fast.forEach(this.items, item => {
      const a = item.getRuleAfterDot()
      if (a === undefined) return
      if (!items[a.SID]) {
        items[a.SID] = []
        inputs.push(a)
      }

      items[a.SID].push(item.advanceDot())
    })

    return { items, inputs }
  }

  expand() {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]

      let allNullable = true
      for (let i = item.dot; i < item.subrules.length; i++) {
        allNullable = allNullable && item.subrules[i].nullable
        if (!allNullable) break
      }
      if (allNullable) {
        this.$dotAtEnd.push(item)
      }

      if (item.getRuleBeforeNullables()) {
        this.$ruleBeforeNullables.push(item)
      }

      let afterdot = item.getRuleAfterDot()
      if (afterdot !== undefined
          && afterdot instanceof BNF.Rule
          && !this.isIncluded(afterdot)) {
        fast.forEach(afterdot.subrules, (sr, index) => {
          const n = new LALR1.Item(afterdot, index, 0)

          this.items.push(n)
        })
      }
    }
  }

  get canAccept() {
    return this.accepts
  }

  toString() {
    return this.items.map(item => {
      return `${item.toString()}`
    }).join('\n')
  }
}
Serializable.registerSubclass(LALR1.ItemSet)

LALR1.Item = class LALR1Item extends Serializable {
  constructor(rule, i, dot) {
    if (!rule) {
      super()
    } else {
      try {
        super(uuid({
          random: crypto.createHash('md5').update(
            `${rule.SID}${i}${dot}`
          ).digest()
        }))
      } catch (e) {
        super()
      }

      this.RULE = rule
      this.I = i
      this.DOT = dot

      const subrules = this.rule.subrules[this.i]
      let index = subrules.length - 1
      while (index >= 0 && subrules[index].nullable) {
        index--
      }
      this.$lastNonNullable = index
    }
  }

  serialize() {
    return {
      rule: this.RULE,
      i: this.I,
      dot: this.DOT
    }
  }

  deserialize(object) {
    this.RULE = object.$data.rule
    this.I = object.$data.i
    this.DOT = object.$data.dot
  }

  advanceDot() {
    return new this.constructor(this.rule, this.i, this.dot + 1)
  }

  calculateSID() {
    this.SID = uuid({
      random: crypto.createHash('md5').update(
        `${this.rule.SID}${this.i}${this.dot}`
      ).digest()
    })
  }

  get rule() {
    return this.RULE
  }

  set rule(rule) {
    this.RULE = rule
    this.calculateSID()
  }

  get i() {
    return this.I
  }

  set i(i) {
    this.I = i
    this.calculateSID()
  }

  get dot() {
    return this.DOT
  }

  set dot(dot) {
    this.DOT = dot
    this.calculateSID()
  }

  getRuleBeforeNullables() {
    return this.rule.subrules[this.i][this.$lastNonNullable]
  }

  getRuleAfterDot(n = 0) {
    return this.rule.subrules[this.i][this.dot + n]
  }

  get subrules() {
    return this.rule.subrules[this.i]
  }

  isDotAtEnd() {
    return this.dot === this.rule.subrules[this.i].length
  }

  toString() {
    return `${this.rule.name} -> ${
      this.rule.subrules[this.i].map((rule, i) => {
        return `${
          this.dot === i ? '.' : ''
        }${rule.printable().replace(/^'(.*)'$/, '$1')}`
      }).join(' ')
    }${ this.isDotAtEnd() ? '.' : '' }`
  }
}
Serializable.registerSubclass(LALR1.Item)

LALR1.StartItem = class LALR1StartItem extends LALR1.Item {
  constructor(rule, i, dot) {
    super(rule, i, dot)
  }

  static create(rule) {
    const start = new LALR1.StartItem(rule, 0, 0)
    return start
  }
}
Serializable.registerSubclass(LALR1.StartItem)

// element of the action/goto table
LALR1.Action = class LALR1Action extends Serializable {
  constructor(input) {
    super()
    this.input = input
  }

  equals(other) {
    return other.input.equals(this.input)
  }

  accepts() {
    return false
  }
}
Serializable.registerSubclass(LALR1.Action)

// accept action, marks success
LALR1.Accept = class LALR1Accept extends LALR1.Action {
  constructor(input) {
    super(input)
  }

  serialize() {
    return {
      input: this.input
    }
  }

  deserialize(object) {
    this.input = object.$data.input
  }

  equals(other) {
    return other instanceof LALR1.Accept
      && super.equals(other)
  }

  accepts() {
    return true
  }
}
Serializable.registerSubclass(LALR1.Accept)

// reduce action
LALR1.Reduce = class LALR1Reduce extends LALR1.Action {
  constructor(input, rule) {
    if (input instanceof LALR1.Reduce) {
      const other = input

      super(other.input)
      this.INTERNAL_RULE = other.INTERNAL_RULE
      this.m = other.m
      this.f = other.f
    } else {
      super(input)
      this.INTERNAL_RULE = rule
    }
  }

  serialize() {
    return {
      input: this.input,
      internalRule: this.INTERNAL_RULE,
      m: this.m,
      f: this.f
    }
  }

  deserialize(object) {
    this.input = object.$data.input
    this.INTERNAL_RULE = object.$data.internalRule
    this.m = object.$data.m
    this.f = object.$data.f
  }

  get subrules() {
    return this.rule.subrules[this.INTERNAL_RULE.i]
  }

  get m() {
    if (this.M === undefined) {
      let m = this.INTERNAL_RULE.dot - 1
      for (;m >= 0 && this.subrules[m].isEpsilonRule(); m--) { }
      this.M = m + 1
    }

    return this.M
  }

  set m(value) {
    this.M = value
    return this
  }

  get f() {
    if (this.F === undefined) {
      if (this.m === 0) {
        this.F = this.rule.SID
      } else {
        const lastSubrule = this.subrules[this.subrules.length - 1]
        if (this.subrules.length > 0 && lastSubrule.nullable) {
          const nullableTailStart = () => {
            let x = this.subrules.length - 2
            for (; x >= 0 && this.subrules[x].nullable; x--) { }
            return x + 1
          }

          const sliced = this.subrules.slice(
            Math.max(nullableTailStart(), this.m))
          if (sliced.length > 0) {
            this.F = fast.hash(sliced)
          } else {
            this.F = EPSILON_HASH
          }
        } else {
          this.F = EPSILON_HASH
        }
      }
    }

    return this.F
  }

  set f(value) {
    this.F = value
    return this
  }

  get item() {
    return this.INTERNAL_RULE
  }

  get rule() {
    return this.INTERNAL_RULE.rule
  }

  get i() {
    return this.INTERNAL_RULE.i
  }

  get dot() {
    return this.INTERNAL_RULE.dot
  }

  equals(other) {
    return other instanceof LALR1.Reduce
      && other.INTERNAL_RULE === this.INTERNAL_RULE
      && super.equals(other)
  }
}
Serializable.registerSubclass(LALR1.Reduce)

// shift action
LALR1.Shift = class LALR1Shift extends LALR1.Action {
  constructor(input, itemSet) {
    super(input)
    this.ITEMSET = itemSet
  }

  serialize() {
    return {
      input: this.input,
      itemset: this.ITEMSET
    }
  }

  deserialize(object) {
    this.input = object.$data.input
    this.ITEMSET = object.$data.itemset
  }

  get itemSet() {
    return this.ITEMSET
  }

  equals(other) {
    return other instanceof LALR1.Shift
      && other.ITEMSET.equals(this.ITEMSET)
      && super.equals(other)
  }
}
Serializable.registerSubclass(LALR1.Shift)

// goto element of the action/goto table
LALR1.Goto = class LALR1Goto extends LALR1.Action {
  constructor(input, to) {
    super(input)
    this.to = to
  }

  serialize() {
    return {
      input: this.input,
      to: this.to
    }
  }

  deserialize(object) {
    this.input = object.$data.input
    this.to = object.$data.to
  }

  equals(other) {
    return other instanceof LALR1.Goto
      && other.to === this.to
      && super.equals(other)
  }
}
Serializable.registerSubclass(LALR1.Goto)

module.exports = LALR1
