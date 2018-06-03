const fast = require('./faster')
const { Serializable } = require('./serializable')

const BNF = require('./bnf.js')

const LR0 = { }
let ID = 0

LR0.ItemSet = class LR0ItemSet extends Serializable {
  constructor(starter, rules) {
    super()
    this.id = ID++
    this.items = []
    this.translationTable = []
    this.actions = []

    if (starter !== undefined && rules !== undefined) {
      if (starter.constructor !== Array)
        this.add(starter)
      else
        this.items = starter
      this.expand(rules)
    }
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

  getAfterDotSet() {
    let afterdot = []
    fast.forEach(this.items, item => {
      afterdot.push(item.getRuleAferDot())
    })
    return [...new BNFSet(afterdot)]
  }

  createItemsWithDotBefore(rule) {
    let dotbefore = []
    fast.forEach(this.items, item => {
      if (item.getRuleAferDot() !== undefined &&
          item.getRuleAferDot().equals(rule)) {
        dotbefore.push(new LR0.Item(item.rule, item.i, item.dot + 1))
      } else if (item.getRuleAferDot() === undefined && rule === undefined) {
        dotbefore.push(new LR0.Item(item.rule, item.i, item.dot + 1))
      }
    })
    return dotbefore
  }

  expand(rules) {
    let pushed = 0
    fast.forEach(this.items, item => {
      let afterdot = item.getRuleAferDot()
      if (afterdot !== undefined
          && afterdot instanceof BNF.Rule
          && !this.isIncluded(afterdot)) {
        fast.forEach(afterdot.subrules, (sr, index) => {
          this.items.push(new LR0.Item(afterdot, index, 0))
          pushed ++
        })
      }
    })

    if (pushed > 0) this.expand(rules)
    fast.forEach(this.items, item => item.check())
  }

  get canAccept() {
    return fast.some(this.actions, action => action.accepts())
  }
}
Serializable.registerSubclass(LR0.ItemSet)

LR0.Item = class LR0Item extends Serializable {
  constructor(rule, i, dot) {
    super()
    this.rule = rule
    this.i = i
    this.dot = dot
  }

  getRuleAferDot() {
    return this.rule.subrules[this.i][this.dot]
  }

  check() {
    if (this.getRuleAferDot() && this.getRuleAferDot().isEpsilonRule()) {
      this.dot++
    }
  }

  equals(item) {
    return this.rule.equals(item.rule)
        && this.i === item.i
        && this.dot === item.dot
  }
}
Serializable.registerSubclass(LR0.Item)

class BNFSet extends Serializable {
  constructor(bnfarray) {
    super()
    let uniq = {}
    fast.forEach(fast.filter(bnfarray, item => item !== undefined), bnf => {
      if (uniq[bnf.id()] === undefined) {
        uniq[bnf.id()] = [bnf]
      } else if(!fast.some(uniq[bnf.id()], b => b.equals(bnf))) {
        uniq[bnf.id()].push(bnf)
      }
    })
    this.array = fast.concat(...Object.values(uniq))
    return this
  }

  *[Symbol.iterator]() {
    yield* this.array
  }
}
Serializable.registerSubclass(BNFSet)

module.exports = LR0
