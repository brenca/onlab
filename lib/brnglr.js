const crypto = require('crypto')
const fast = require('./faster')

const BNF = require('./bnf.js')
const EG = require('./eg.js')
const LR0 = require('./lr0.js')
const SPPF = require('./sppf.js')

const EPSILON_HASH = crypto.createHash('md5').update('').digest('hex')
const BRNGLR = { }

BRNGLR.GraphStackNode = class {
  constructor(itemSet = null) {
    this.itemSet = itemSet
    this.arcs = []
    this.arcLabels = []
  }

  get canAccept() {
    return this.itemSet.canAccept
  }
}

// element of the action/goto table
BRNGLR.Action = class {
  constructor(input) {
    this.input = input
  }

  equals(other) {
    return other.input.equals(this.input)
  }

  accepts() {
    return false
  }
}

// accept action, marks success
BRNGLR.Accept = class Accept extends BRNGLR.Action {
  constructor(input) {
    super(input)
  }

  equals(other) {
    return other instanceof BRNGLR.Accept
      && super.equals(other)
  }

  accepts() {
    return true
  }
}

// reduce action
BRNGLR.Reduce = class Reduce extends BRNGLR.Action {
  constructor(input, rule, m, f) {
    if (input instanceof BRNGLR.Reduce) {
      const other = input

      super(other.input)
      this._internalRule = other._internalRule
      this.m = other.m
      this.f = other.f
    } else {
      super(input)
      this._internalRule = rule
    }
  }

  get subrules() {
    return this.rule.subrules[this._internalRule.i]
  }

  get m() {
    if (this.M === undefined) {
      let m = this._internalRule.dot - 1
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
        this.F = this.rule.hash()
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

  get rule() {
    return this._internalRule.rule
  }

  get i() {
    return this._internalRule.i
  }

  get dot() {
    return this._internalRule.dot
  }

  equals(other) {
    return other instanceof BRNGLR.Reduce
      && other._internalRule === this._internalRule
      && super.equals(other)
  }
}

// shift action
BRNGLR.Shift = class Shift extends BRNGLR.Action {
  constructor(input, itemSet) {
    super(input)
    this._itemSet = itemSet
  }

  equals(other) {
    return other instanceof BRNGLR.Shift
      && other.itemSet === this.itemSet
      && super.equals(other)
  }
}

// goto element of the action/goto table
BRNGLR.Goto = class extends BRNGLR.Action {
  constructor(input, to) {
    super(input)
    this.to = to
  }

  equals(other) {
    return other instanceof BRNGLR.Goto
      && other.to === this.to
      && super.equals(other)
  }
}

function createEpsilonSPPFs(RULES) {
  const realRules = fast.filter(RULES, rule => !rule.tokenClass)
  const markNullables = () => {
    return fast.reduce(realRules, (changed, rule) => {
      if (!rule.nullable && fast.some(rule.subrules, subrules => {
        return !fast.some(subrules, subrule => !subrule.nullable)
      })) {
        rule.nullable = true
        return changed + 1
      }
      return changed
    }, 0)
  }
  while (markNullables() > 0) { }

  const nullables = fast.filter(realRules, rule => {
    return rule.nullable
  })

  const ESPPFMap = { }
  const epsilonSPPF = new SPPF.EpsilonNode()
  ESPPFMap[epsilonSPPF.item.hash()] = epsilonSPPF

  if (nullables.length > 0) {
    fast.forEach(nullables, rule => {
      const nullableSPPF = new SPPF.SymbolNode({
        rule, i: null, dot: null
      }, 0, 0)
      nullableSPPF.arcs.push(epsilonSPPF)
      ESPPFMap[nullableSPPF.item.hash()] = nullableSPPF
    })

    fast.forEach(realRules, rule => {
      const EpsilonSPPFNode = ESPPFMap[rule.hash()]
      let requiredNullableParts = []
      let nullableWholeSubrules = []

      fast.forEach(rule.subrules, (rules, index) => {
        if (rules[rules.length - 1].nullable) {
          let x = rules.length
          for (; x > 0 && rules[x - 1].nullable; x--) { }

          if (x > 0) {
            let nullableParts = []
            for (let i = rules.length - 1; i >= x; i--) {
              nullableParts.unshift(rules[i])
              requiredNullableParts.push(nullableParts.slice())
            }
          } else {
            nullableWholeSubrules.push({ rules, index })
          }
        }
      })

      fast.forEach(requiredNullableParts, rules => {
        const RNPNode = new SPPF.RightNullablePartNode(rules, null)
        fast.forEach(rules, r => {
          if (ESPPFMap[r.hash()]) {
            RNPNode.arcs.push(ESPPFMap[r.hash()])
          } else {
            throw new Error(`Internal parser error while building ` +
              `required right-nullable parts`)
          }
        })
        ESPPFMap[fast.hash(rules)] = RNPNode
      })

      if (nullableWholeSubrules.length > 0) {
        EpsilonSPPFNode.arcs = []

        if (nullableWholeSubrules.length === 1) {
          fast.forEach(nullableWholeSubrules[0].rules, r => {
            if (ESPPFMap[r.hash()]) {
              EpsilonSPPFNode.arcs.push(ESPPFMap[r.hash()])
            } else {
              throw new Error(`Internal parser error while building ` +
                `required right-nullable parts`)
            }
          })
        } else {
          fast.forEach(nullableWholeSubrules, subrule => {
            const NWSNode = new SPPF.PackedNode({
              rule: EpsilonSPPFNode.action.rule,
              i: subrule.index,
              dot: subrule.rules.length
            })

            fast.forEach(subrule.rules, r => {
              if (ESPPFMap[r.hash()]) {
                NWSNode.arcs.push(ESPPFMap[r.hash()])
              } else {
                throw new Error(`Internal parser error while building ` +
                  `required right-nullable parts`)
              }
            })
            EpsilonSPPFNode.arcs.push(NWSNode)
          })
        }
      }
    })
  }

  return ESPPFMap
}

// finds the canonical collection of LR(0) items and the
// translation table elements
function findItemSets(RULES, starterItem) {
  const ITEMSETS = [new LR0.ItemSet(
    new LR0.Item(starterItem, 0, 0), RULES
  )]

  const isItemSetStarter = (item) => {
    return fast.some(ITEMSETS, set => set.items[0].equals(item))
  }

  const getItemSetsForItem = (item) => {
    return fast.filter(ITEMSETS,
      set => fast.some(set.items, i => i.equals(item)))
  }

  for (let i = 0; i < ITEMSETS.length; i++) {
    fast.forEach(ITEMSETS[i].getAfterDotSet(), ad => {
      const itemsBefore = ITEMSETS[i].createItemsWithDotBefore(ad)
      fast.some(itemsBefore, itemBefore => {
        if (!fast.some(ITEMSETS, s => fast.some(
          s.items,
          item => item.equals(itemBefore)
        ))) {
          ITEMSETS.push(new LR0.ItemSet(itemsBefore, RULES))
          return true
        }
      })
    })
  }

  fast.forEach(ITEMSETS, set => {
    fast.forEach(set.getAfterDotSet(), input => {

      fast.apply(
        Array.prototype.push,
        set.translationTable,
        fast.map([...new Set(fast.reduce(
          set.createItemsWithDotBefore(input),
          (sets, items) => sets.concat(getItemSetsForItem(items)),
          []
        ))], set => new Object({ input, set }))
      )
    })
  })

  return ITEMSETS
}

// finds the extended grammar elements
function findExtendedGrammar(ITEMSETS) {
  const EGITEMS = []

  const getExtendedGrammarItem = (from, to, rule) => {
    const itemToGet = new EG.Item(from, to, rule)
    const existing = fast.find(EGITEMS, item => item.equals(itemToGet))

    if (existing) {
      return existing
    } else {
      EGITEMS.push(itemToGet)
      return itemToGet
    }
  }

  const stateTransitionFromInput = (from, input) => {
    return fast.map(
      fast.filter(from.translationTable, entry => entry.input.equals(input)),
      entry => new Object({ from, to: entry.set })
    )
  }

  const getEGItems = () => {
    const items = []
    fast.forEach(ITEMSETS, set => {
      fast.forEach(set.items, item => {
        if (item.dot === 0 || fast.some(
          item.rule.subrules[item.i],
          (rule, i) => i < item.dot && rule.isEpsilonRule()
        )) {
          items.push({ set, item })
        }
      })
    })
    return items
  }

  EGRULES = fast.reduce(getEGItems(), (acc, egitem) => {
    return fast.concat(acc, fast.reduce(
      stateTransitionFromInput(egitem.set, egitem.item.rule),
      (acc, stateTransition) => {
        const leftHandSide = getExtendedGrammarItem(
          stateTransition.from,
          stateTransition.to,
          egitem.item.rule
        )

        const getRightHandSides = () => {
          const subrules = egitem.item.rule.subrules[egitem.item.i]
          const doOneIteration = (rightHandSides, subrule) => {
            const extendedRightHandSides = []

            fast.forEach(rightHandSides, rightHandSide => {
              const endSet = rightHandSide.length > 0
                ? rightHandSide[rightHandSide.length - 1].to
                : egitem.set

              if (subrule.isEpsilonRule()) {
                extendedRightHandSides.push(fast.concat(
                  rightHandSide.slice(),
                  getExtendedGrammarItem(endSet, endSet, subrule)
                ))
              }

              fast.forEach(
                stateTransitionFromInput(endSet, subrule),
                stateTransition => {
                  if (stateTransition.to !== undefined) {
                    extendedRightHandSides.push(fast.concat(
                      rightHandSide.slice(),
                      getExtendedGrammarItem(
                        stateTransition.from,
                        stateTransition.to,
                        subrule
                      )
                    ))
                  }
                }
              )
            })

            return extendedRightHandSides
          }

          return fast.reduce(subrules, (rightHandSides, subrule) => {
            return doOneIteration(rightHandSides, subrule)
          }, [[]])
        }

        return fast.concat(acc, fast.map(
          getRightHandSides(),
          rightHandSide => new EG.Rule(
            leftHandSide, rightHandSide, egitem.item.i)
        ))
      },
      []
    ))
  }, [])

  return { EGRULES, EGITEMS }
}

const isTerminal = (egitem) => egitem.rule instanceof BNF.Terminal
  || egitem.rule.tokenClass !== undefined

// calculates the first sets for each extended grammar rule
function calculateFirsts(EGRULES, EGITEMS) {
  const getLHSEGRulesForEGItem = (egitem) => fast.filter(EGRULES,
    rule => rule.leftHandSide.equals(egitem))

  const findFirsts = (egitem) => {
    if (isTerminal(egitem)) {
      egitem.firsts = [ egitem.rule ]
      return 0
    }

    return fast.reduce(getLHSEGRulesForEGItem(egitem), (changed, egrule) => {
      const getLHSFirsts = () => {
        const firsts = []

        const ifNotInThenPush = (first) => {
          if (!fast.contains(first, egrule.leftHandSide.firsts)) {
            firsts.push(first)
          }
        }

        if (egrule.rightHandSide[0].rule.isTerminalRule()) {
          ifNotInThenPush(egrule.rightHandSide[0].rule)
        } else {
          if(fast.some(egrule.rightHandSide, RHSRule => {
            if (RHSRule.rule instanceof BNF.Rule) {
              return fast.reduce(RHSRule.firsts, (hasEpsilon, first) => {
                if (!first.isEpsilonRule()) {
                  ifNotInThenPush(first)
                }
                return hasEpsilon || first.isEpsilonRule()
              }, false)
            } else {
              ifNotInThenPush(RHSRule.rule)
              return RHSRule.rule.isEpsilonRule()
            }
          })) {
            ifNotInThenPush(new BNF.Terminal(''))
          }
        }

        return firsts
      }

      const firsts = getLHSFirsts()
      fast.apply(Array.prototype.push, egrule.leftHandSide.firsts, firsts)
      return changed + firsts.length
    }, 0)
  }

  const doOneIteration = () => {
    return fast.reduce(EGITEMS,
      (changed, egitem) => changed + findFirsts(egitem), 0)
  }

  while (doOneIteration() > 0) { }
}

// calculates the follow sets for each extended grammar rule
function calculateFollows(EGRULES, EGITEMS, EOFToken) {
  const getRHSEGRulesForEGItem = (egitem) => {
    return fast.reduce(EGRULES, (matching, egrule) => {
      if (fast.some(egrule.rightHandSide, item => item.equals(egitem))) {
        return fast.concat(matching, egrule)
      } else {
        return matching
      }
    }, [])
  }

  const findFollows = (egitem) => {
    if (isTerminal(egitem)) {
      egitem.follows = []
      return 0
    }

    return fast.reduce(getRHSEGRulesForEGItem(egitem), (changed, egrule) => {
      const getRHSFollows = () => {
        const follows = []

        const ifNotInThenPush = (follow) => {
          if (!fast.contains(follow, egitem.follows)) {
            follows.push(follow)
          }
        }

        const RHS = egrule.rightHandSide
        const RHSIndex = fast.indexOf(RHS, egitem)

        if (RHSIndex === RHS.length - 1) {
          fast.forEach(egrule.leftHandSide.follows, follow => {
            if (!follow.isEpsilonRule()) {
              ifNotInThenPush(follow)
            }
          })
        } else {
          if (fast.reduce(RHS[RHSIndex + 1].firsts, (hasEpsilon, first) => {
            if (!first.isEpsilonRule()) {
              ifNotInThenPush(first)
            }
            return hasEpsilon || first.isEpsilonRule()
          }, false)) {
            fast.forEach(egrule.leftHandSide.follows, follow => {
              ifNotInThenPush(follow)
            })
          }
        }

        return follows
      }

      const follows = getRHSFollows()
      fast.apply(Array.prototype.push, egitem.follows, follows)
      return changed + follows.length
    }, 0)
  }

  EGITEMS[0].follows.push(EOFToken)

  const doOneIteration = () => {
    return fast.reduce(EGITEMS,
      (changed, egitem) => changed + findFollows(egitem), 0)
  }

  while (doOneIteration() > 0) { }
}

// based on the follow sets and the extended grammar items, calculates the
// action/goto table elements. merges the mergable items of the extended
// grammar
function calculateActionsAndGotos(EGRULES, ITEMSETS, EOFToken) {
  fast.forEach(ITEMSETS, set => {
    const isRealBNFRule = (rule) => rule instanceof BNF.Rule
      && rule.tokenClass === undefined
    const gotoExists = (gotos, entry) => fast.some(gotos,
      goto => goto.input === entry.input)

    const { actions, gotos } = fast.reduce(
      set.translationTable,
      (result, entry) => {
        if (isRealBNFRule(entry.input)) {
          if (!gotoExists(result.gotos, entry)){
            result.gotos.push(new BRNGLR.Goto(entry.input, entry.set))
          }
        } else {
          result.actions.push(new BRNGLR.Shift(entry.input, entry.set))
        }

        return result
      },
      { actions: [], gotos: [] }
    )

    if (fast.some(set.items, item => {
      if (item.rule.name === '#S') {
        if (item.dot === item.rule.subrules.length) {
          return true
        } else if (set === ITEMSETS[0]) {
          return fast.reduce(item.rule.subrules[item.i].slice(item.dot),
            (allNullable, subrule) => allNullable && subrule.nullable, true)
        } else {
          return false
        }
      } else {
        return false
      }
    })) {
      actions.push(new BRNGLR.Accept(EOFToken))
    }

    fast.assign(set, { actions, gotos })
  })

  fast.forEach(EGRULES, mr => {
    fast.forEach(mr.leftHandSide.follows, follow => {
      // TODO: maybe re-add mr.getFinalSet() !== undefined

      fast.forEach(mr.getFinalSet().items, item => {
        if (fast.reduce(
          item.rule.subrules[item.i].slice(item.dot),
          (allNullable, subrule) => allNullable && subrule.nullable,
          true
        )) {
          if (item.rule.name !== '#S') {
            const reduce = new BRNGLR.Reduce(follow, item)
            if (!fast.some(mr.getFinalSet().actions, a => a.equals(reduce))) {
              mr.getFinalSet().actions.push(reduce)
            }
          }
        }
      })
    })
  })
}

BRNGLR.setup = (RULES) => {
  const rule = (name) => fast.find(RULES, r => r.name === name)
  const StarterItem = rule('#S')
  const EOFToken = rule('Token-EOF')

  const ESPPFMAP = createEpsilonSPPFs(RULES)
  const ITEMSETS = findItemSets(RULES, StarterItem)
  const { EGRULES, EGITEMS } = findExtendedGrammar(ITEMSETS)
  calculateFirsts(EGRULES, EGITEMS)
  calculateFollows(EGRULES, EGITEMS, EOFToken)
  calculateActionsAndGotos(EGRULES, ITEMSETS, EOFToken)

  return { ESPPFMAP, ITEMSETS }
}

BRNGLR.parse = (RULES, ESPPFMAP, ITEMSETS, code) => {
  const getESPPFroot = (hash) => {
    return ESPPFMAP[hash]
  }

  const actionsForNode = (node, input, inputIndex) => {
    let actions = []

    fast.forEach(node.itemSet.actions, action => {
      if (action.input.value !== undefined) {
        if (action.input.value === input[inputIndex - 1].value) {
          actions.push(action)
        }
      } else if (action.input.tokenClass !== undefined) {
        if (action.input.tokenClass === input[inputIndex - 1].tokenClass ||
            action.input.tokenClass === input[inputIndex - 1].class) {
          actions.push(action)
        }
      }
    })

    return actions
  }

  const EPSILON = getESPPFroot(EPSILON_HASH)
  let SPPFroot = null
  let recognized = false
  let inputIndex = 0

  if (code.length === 0) {
    if (fast.some(ITEMSETS[0].actions, a =>
      a instanceof BRNGLR.Accept && a.input.name === 'Token-EOF'
    )) {
      recognized = true
      SPPFroot = getESPPFroot(
        fast.find(RULES, r => r.name === '#S').hash()
      )
    }
  } else {
    const starter = new BRNGLR.GraphStackNode(ITEMSETS[0])

    code = (() => {
      const EOF = fast.find(RULES, r => r.name === 'Token-EOF')
      let lastInput = code[code.length - 1]
      if (lastInput !== undefined) {
        EOF.position = lastInput.position
        EOF.position.char += lastInput.value.length
      } else {
        EOF.position = { line: 0, char: 0, absolute: 0, length: 0 }
      }
      code.push(EOF)

      return code
    })()

    let Xm = new LR0.ItemSet()
    let U = [[starter]]
    for (let i = 0; i < code.length; i++)
      U.push([])
    let R = []
    let Q = []
    const actions = actionsForNode(starter, code, 1)
    fast.forEach(actions, action => {
      if (action instanceof BRNGLR.Shift) {
        Q.push({ node: starter, action })
      } else if (action instanceof BRNGLR.Reduce && action.m === 0) {
        R.push({ node: starter, action, f: action.f, y: EPSILON })
      }
    })

    const completeReduction = (node, action, c, inputIndex, N) => {
      const pl = fast.find(node.itemSet.gotos, goto =>
        goto.input.equals(action.rule))
      let z = (() => {
        let ret = fast.find(N, n =>
          n.action.rule === action.rule && n.left === c)
        if (!ret) {
          ret = new SPPF.SymbolNode(
            action._internalRule, c, inputIndex)
          N.push(ret)
        }
        return ret
      })()

      let w = fast.find(U[inputIndex], u => u.itemSet === pl.to)
      if (w) {
        if (fast.indexOf(w.arcs, node) < 0) {
          w.arcs.push(node)
          w.arcLabels.push(z)
          if (action.m > 0) {
            fast.forEach(actionsForNode(
                w, code, inputIndex + 1
              ), act => {
                if (act instanceof BRNGLR.Reduce && act.m > 0) {
                  R.push({ node, action: act, f: act.f, y: z })
                }
              }
            )
          }
        }
      } else {
        w = new BRNGLR.GraphStackNode(pl.to)
        U[inputIndex].push(w)
        w.arcs.push(node)
        w.arcLabels.push(z)
        const nextActions = actionsForNode(
          w, code, inputIndex + 1
        )

        fast.forEach(nextActions, act => {
          if (act instanceof BRNGLR.Shift) {
            Q.push({ node: w, action: act })
          } else if (act instanceof BRNGLR.Reduce) {
            if (act.m === 0) {
              R.push({ node: w, action: act, f: act.f, y: EPSILON })
            } else if (action.m !== 0) {
              R.push({ node, action: act, f: act.f, y: z })
            }
          }
        })
      }
    }

    const addChildren = (z, alfa, f, action) => {
      if (f !== EPSILON_HASH)
        alfa.push(getESPPFroot(f))

      if (!z.packs(alfa)) {
        const alfaPacker = fast.find(z.arcs, arc => {
          if (arc instanceof SPPF.PackedNode) {
            return arc.packs(alfa)
          }
          return false
        })

        if (!alfaPacker) {
          if (z.arcs.length === 0) {
            fast.forEach(alfa, a => { z.arcs.push(a) })
          } else {
            if (!fast.find(z.arcs,
              a => a instanceof SPPF.PackedNode
            )) {
              const packing = new SPPF.PackedNode(z.action)
              packing.arcs = z.arcs
              z.arcs = [packing]
            }

            const packing = new SPPF.PackedNode(action)
            z.arcs.push(packing)
            fast.forEach(alfa, a => { packing.arcs.push(a) })
          }
        }
      }
    }

    let length = code.length
    for (; inputIndex < length && U[inputIndex].length > 0; inputIndex++) {
      let N = []
      let I = []
      while (R.length > 0) { // Reducer
        let { node, action, f, y } = R.pop()

        if (action.m === 0) {
          const pl = fast.find(node.itemSet.gotos, goto =>
            goto.input.equals(action.rule))
          let w = fast.find(U[inputIndex], u => u.itemSet === pl.to)

          if (w) {
            if (fast.indexOf(w.arcs, node) < 0) {
              w.arcs.push(node)
              w.arcLabels.push(getESPPFroot(action.f))
            }
          } else {
            w = new BRNGLR.GraphStackNode(pl.to)
            U[inputIndex].push(w)
            w.arcs.push(node)
            w.arcLabels.push(getESPPFroot(action.f))
            const nextActions = actionsForNode(
              w, code, inputIndex + 1
            )

            fast.forEach(nextActions, act => {
              if (act instanceof BRNGLR.Shift) {
                Q.push({ node: w, action: act })
              } else if (act instanceof BRNGLR.Reduce && act.m === 0) {
                R.push({ node: w, action: act, f: act.f, y: EPSILON })
              }
            })
          }
        } else if (action.m === 1) {
          const c = fast.findIndex(U, Uc => fast.indexOf(Uc, node) >= 0)
          completeReduction(node, action, c, inputIndex, N)
          const z = fast.find(N, n =>
            n.action.rule === action.rule && n.left === c)
          addChildren(z, [y], f, action)
        } else if (action.m === 2) {
          fast.forEach(node.arcs, (arc, i) => {
            const c = fast.findIndex(U, Uc => fast.indexOf(Uc, arc) >= 0)
            completeReduction(arc, action, c, inputIndex, N)
            const z = fast.find(N, n =>
              n.action.rule === action.rule && n.left === c)
            addChildren(z, [node.arcLabels[i], y], f, action)
          })
        } else {
          let w = fast.find(U[inputIndex], u => u.itemSet === Xm)
          if (!w) {
            w = new BRNGLR.GraphStackNode(Xm)
            U[inputIndex].push(w)
          }

          const act = new BRNGLR.Reduce(action)
          act.m--

          fast.forEach(node.arcs, (arc, i) => {
            const c = fast.findIndex(U, Uc => fast.indexOf(Uc, arc) >= 0)
            let z = fast.find(I, i =>
              i.action === action &&
              i.alfa === action.m - 1 &&
              i.left === c)
            if (!z) {
              z = new SPPF.IntermediateNode(action, action.m - 1,
                c, inputIndex)
              I.push(z)
            }

            if (fast.indexOf(w.arcs, arc) < 0) {
              w.arcs.push(arc)
              w.arcLabels.push(z)
              R.push({ node: arc, action: act, f: EPSILON_HASH, y: z })
            }

            addChildren(z, [node.arcLabels[i], y], f, action)
          })
        }
      }

      // Shifter
      if (inputIndex !== code.length - 1) {
        let Qn = []

        let z = new SPPF.TerminalNode(
          code[inputIndex], inputIndex, inputIndex + 1)
        while (Q.length > 0) {
          let { node, action } = Q.pop()

          let w = fast.find(U[inputIndex + 1],
            u => u.itemSet === action._itemSet)
          if (w) {
            w.arcs.push(node)
            w.arcLabels.push(z)
            fast.forEach(actionsForNode(
                w, code, inputIndex + 2
              ), act => {
                if (act instanceof BRNGLR.Reduce && act.m > 0)
                  R.push({ node, action: act, f: act.f, y: z })
              }
            )
          } else {
            w = new BRNGLR.GraphStackNode(action._itemSet)
            U[inputIndex + 1].push(w)
            w.arcs.push(node)
            w.arcLabels.push(z)

            const nextActions = actionsForNode(
              w, code, inputIndex + 2
            )

            fast.forEach(nextActions, act => {
              if (act instanceof BRNGLR.Shift) {
                Qn.push({ node: w, action: act })
              } else if (act instanceof BRNGLR.Reduce) {
                if (act.m > 0) {
                  R.push({ node, action: act, f: act.f, y: z })
                } else {
                  R.push({ node: w, action: act, f: act.f, y: EPSILON })
                }
              }
            })
          }
        }
        Q = Qn
      }
    }

    const accepts = fast.find(U[code.length - 1], u => u.canAccept)
    if (accepts) {
      recognized = true
      SPPFroot = accepts.arcLabels[
        fast.findIndex(accepts.arcs, arc => arc === starter)
      ]
    }
  }

  if (!recognized) {
    const lastChecked = code[inputIndex - 1]

    if (lastChecked) {
      throw new Error(`${
        lastChecked.position.line
      }:${
        lastChecked.position.char
      } Parsing failed at '${
        lastChecked.near()
      }'`)
    } else {
      throw new Error(`0:0 Parsing failed at the beginning of the source`)
    }
  }

  return SPPFroot
}

module.exports = BRNGLR
