const fast = require('./faster')
const crypto = require('crypto')
const uuid = require('uuid/v4')
const { Serializable, SLArray } = require('./serializable')

const BNF = require('./bnf.js')

const LR1 = { }
let ID = 0

LR1.ItemSetArray = class LR1ItemSetArray extends SLArray {
  constructor() {
    return super(...arguments)
  }

  startersOf(items) {
    const SID = uuid({
      random: crypto.createHash('md5').update(
        fast.map(items, s => s.SID).join('')
      ).digest()
    })

    return this[this.indexOfItem({ SID })]
  }
}
Serializable.registerSubclass(LR1.ItemSetArray)

LR1.ItemSet = class LR1ItemSet extends Serializable {
  constructor(starter, rules) {
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
    this.translationTable = []
    this.actions = []

    if (starter !== undefined && rules !== undefined) {
      if (starter.constructor !== Array) {
        this.add(starter)
      } else {
        this.items = starter
      }

      this.expand(rules)

      const follows = fast.reduce(this.items, (follows, item) => {
        follows[item.SID] = new SLArray()
        if (item.lookahead) {
          follows[item.SID].push(item.lookahead)
        }

        return follows
      }, { })

      const epsilon = new BNF.Terminal('')
      let changed
      do {
        changed = false
        fast.forEach(this.items, item => {
          if (item.dot === 0) {
            fast.forEach(this.items, other => {
              if (item.rule.equals(other.getRuleAfterDot())) {
                let n = 0
                let delta
                do {
                  delta = other.getRuleAfterDot(++n)
                  if (delta) {
                    fast.forEach(delta.firsts, f => {
                      if (follows[item.SID].indexOfItem(f) < 0) {
                        changed = true
                        follows[item.SID].push(f)
                      }
                    })
                  }
                } while (delta && delta.firsts.indexOfItem(epsilon) >= 0)

                if (!delta) {
                  fast.forEach(follows[other.SID], f => {
                    if (follows[item.SID].indexOfItem(f) < 0) {
                      changed = true
                      follows[item.SID].push(f)
                    }
                  })
                }
              }
            })
          }
        })
      } while (changed)

      const items = new SLArray()
      fast.forEach(this.items, item => {
        fast.forEach(follows[item.SID], follow => {
          items.push(new LR1.Item(item.rule, item.i, item.dot, follow))
        })
      })
      this.items = items
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

  advanceDot() {
    const items = { }
    const inputs = new SLArray()

    fast.forEach(this.items, item => {
      const a = item.getRuleAfterDot()
      if (a === undefined) return
      if (!items[a.SID]) {
        items[a.SID] = []
        inputs.push(a)
      }

      items[a.SID].push(new LR1.Item(
        item.rule, item.i, item.dot + 1, item.lookahead
      ))
    })

    return { items, inputs }
  }

  expand(rules) {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]

      let afterdot = item.getRuleAfterDot()
      if (afterdot !== undefined
          && afterdot instanceof BNF.Rule
          && !this.isIncluded(afterdot)) {
        fast.forEach(afterdot.subrules, (sr, index) => {
          const n = new LR1.Item(afterdot, index, 0)

          this.items.push(n)
        })
      }
    }
  }

  get canAccept() {
    return this.accepts
  }
}
Serializable.registerSubclass(LR1.ItemSet)

LR1.Item = class LR1Item extends Serializable {
  constructor(rule, i, dot, lookahead) {
    try {
      super(uuid({
        random: crypto.createHash('md5').update(
          `${rule.SID}${i}${dot}${
            lookahead ? lookahead.SID : ''
          }`
        ).digest()
      }))
    } catch (e) {
      super()
    }

    this._rule = rule
    this._i = i
    this._dot = dot
    this._lookahead = lookahead
  }

  calculateSID() {
    this.SID = uuid({
      random: crypto.createHash('md5').update(
        `${this.rule.SID}${this.i}${this.dot}${
          this.lookahead ? this.lookahead.SID : ''
        }`
      ).digest()
    })
  }

  get rule() {
    return this._rule
  }

  set rule(rule) {
    this._rule = rule
    this.calculateSID()
  }

  get i() {
    return this._i
  }

  set i(i) {
    this._i = i
    this.calculateSID()
  }

  get dot() {
    return this._dot
  }

  set dot(dot) {
    this._dot = dot
    this.calculateSID()
  }

  get lookahead() {
    return this._lookahead
  }

  set lookahead(lookahead) {
    this._lookahead = lookahead
    calculateSID()
  }

  getRuleAfterDot(n = 0) {
    return this.rule.subrules[this.i][this.dot + n]
  }

  check() {
    let n = 0
    while (this.getRuleAfterDot(n) && this.getRuleAfterDot(n).isEpsilonRule()) {
      n++
    }
    if (n > 0) {
      this.dot += n
    }
  }
}
Serializable.registerSubclass(LR1.Item)

module.exports = LR1
