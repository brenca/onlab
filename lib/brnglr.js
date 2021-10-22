const crypto = require('crypto')
const fast = require('./faster')
const {
  Serializable,
  SerializableLookupArray,
  SerializableLookupSet
} = require('./serializable')

const BNF = require('./bnf.js')
const LALR1 = require('./lalr1.js')
const SPPF = require('./sppf.js')

const EPSILON_HASH = crypto.createHash('md5').update('').digest('hex')
const BRNGLR = { }

const DefaultResolvers = [
  (node, packed) => {
    const packedArcs = packed.flattenArcs()
    const operatorIndex =
      fast.findIndex(packedArcs, arc => arc.asOperator() !== null)

    if (operatorIndex === undefined){
      return true
    }

    const operator = packedArcs[operatorIndex].asOperator()

    let child = (() => {
      switch (operator.assoc) {
        case 'left': {
          return packedArcs[operatorIndex + 1]
        } break
        case 'right': {
          return packedArcs[operatorIndex - 1]
        } break
        default:
          return null
      }
    })()

    if (child === null) {
      return true
    } else {
      const checkChildArcs = (arcs) => {
        const childOperatorIndex =
          arcs.findIndex(arc => arc.asOperator() !== null)

        if (childOperatorIndex === -1) {
          return true
        }

        const childOperator = arcs[childOperatorIndex].asOperator()

        if (childOperator.precedence === operator.precedence) {
          return false
        } else {
          return true
        }
      }

      if (child.hasPacked()) {
        return fast.reduce(
          child.flattenArcs(),
          (acc, grandchild) => acc && checkChildArcs(
            grandchild.flattenArcs()
          ),
          true
        )
      } else {
        return checkChildArcs(child.flattenArcs())
      }
    }
  },
  (node, packed) => {
    const packedArcs = packed.flattenArcs()
    const operatorIndex =
      fast.findIndex(packedArcs, arc => arc.asOperator() !== null)

    if (operatorIndex === undefined){
      return true
    }

    const operator = packedArcs[operatorIndex].asOperator()

    return fast.reduce(packedArcs, (acc, child) => {
      if (!acc) {
        return false
      }

      if (child.item !== node.item) {
        return true
      }

      const checkChildArcs = (arcs) => {
        const childOperatorIndex =
          arcs.findIndex(arc => arc.asOperator() !== null)

        if (childOperatorIndex === -1) {
          return true
        }

        const childOperator = arcs[childOperatorIndex].asOperator()

        if (childOperator.precedence > operator.precedence) {
          return false
        } else {
          return true
        }
      }

      if (child.hasPacked()) {
        return fast.reduce(
          child.flattenArcs(),
          (acc, grandchild) => acc && checkChildArcs(
            grandchild.flattenArcs()
          ),
          true
        )
      }

      return checkChildArcs(child.flattenArcs())
    }, true)
  },
  (node, packed) => {
    if (node.item.name.startsWith('[LIST]')) {
      const subrules = node.action.subrules
      if (subrules.length > 0 && subrules[0].nullable) {
        return subrules.length === 1
      }
    }

    return true
  }
]

BRNGLR.GraphStackNode = class BRNGLRGraphStackNode extends Serializable {
  constructor(itemSet = null) {
    super()
    this.itemSet = itemSet
    this.arcs = new SerializableLookupArray()
    this.arcLabels = []
  }

  serialize() {
    return {
      itemSet: this.itemSet,
      arcs: this.arcs,
      arcLabels: this.arcLabels
    }
  }

  deserialize(object) {
    this.itemSet = object.$data.itemSet
    this.arcs = object.$data.arcs
    this.arcLabels = object.$data.arcLabels
  }

  get canAccept() {
    return this.itemSet.canAccept
  }
}
Serializable.registerSubclass(BRNGLR.GraphStackNode)

function createEpsilonSPPFs(RULES) {
  const regexpRules = fast.filter(RULES, rule => rule instanceof BNF.RegExp)
  const realRules = fast.filter(RULES, rule => rule instanceof BNF.Rule
    && !rule.tokenClass)
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

  const nullables = fast.concat(fast.filter(fast.concat(realRules, regexpRules),
    rule => rule.nullable), fast.find(RULES, rule => rule.name === 'Token-EOF'))

  const ESPPFMap = { }
  const epsilonSPPF = new SPPF.EpsilonNode()
  ESPPFMap[epsilonSPPF.item.SID] = epsilonSPPF

  if (nullables.length > 0) {
    fast.forEach(nullables, rule => {
      const nullableSPPF = new SPPF.SymbolNode({
        rule, i: null, dot: null
      }, 0, 0)
      nullableSPPF.arcs.push(epsilonSPPF)
      ESPPFMap[nullableSPPF.item.SID] = nullableSPPF
    })

    fast.forEach(realRules, rule => {
      const EpsilonSPPFNode = ESPPFMap[rule.SID]
      let requiredNullableParts = []
      let nullableWholeSubrules = []

      fast.forEach(rule.subrules, (rules, index) => {
        // A little hacky tbh
        if (rule.name.startsWith('[LIST]') && index === 1)
          return

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
          if (ESPPFMap[r.SID]) {
            RNPNode.arcs.push(ESPPFMap[r.SID])
          } else {
            throw new Error(`Internal parser error while building ` +
              `required right-nullable parts`)
          }
        })
        ESPPFMap[fast.hash(rules)] = RNPNode
      })

      if (nullableWholeSubrules.length > 0) {
        EpsilonSPPFNode.arcs.reset()

        if (nullableWholeSubrules.length === 1) {
          fast.forEach(nullableWholeSubrules[0].rules, r => {
            if (ESPPFMap[r.SID]) {
              EpsilonSPPFNode.arcs.push(ESPPFMap[r.SID])
            } else if (!(r instanceof BNF.RegExp || r.isEpsilonRule())) {
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
              if (ESPPFMap[r.SID]) {
                NWSNode.arcs.push(ESPPFMap[r.SID])
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

BRNGLR.setup = (RULES) => {
  const rule = (name) => fast.find(RULES, r => r.name === name)

  const ESPPFMAP = createEpsilonSPPFs(RULES)
  const ITEMSETS = LALR1.ItemSetArray.init(rule('#S'))

  return { ESPPFMAP, ITEMSETS }
}

BRNGLR.parse = (RULES, ESPPFMAP, ITEMSETS, code, resolvers = []) => {
  const Resolvers = DefaultResolvers.concat(resolvers)
  const testResolvers = (z, arc) => Resolvers.reduce(
    (acc, test) => acc && test(z, arc), true)

  console.log('parsing')
  const getESPPFroot = (hash) => {
    return ESPPFMAP[hash]
  }

  const actionsForNode = (node, input, inputIndex) => {
    let actions = []
    const index = inputIndex > input.length
      ? input.length : inputIndex

    fast.forEach(node.itemSet.actions, action => {
      if (action instanceof LALR1.Accept) {
        actions.push(action)
      } else if (action.input.match(input[index - 1])) {
        actions.push(action)
      }
    })

    return actions
  }

  const EPSILON = getESPPFroot(EPSILON_HASH)
  let SPPFroot = null
  let recognized = false
  let ambiguous = false
  let inputIndex = 0

  if (code.length === 0) {
    if (fast.some(ITEMSETS.get(0).actions, a => a instanceof LALR1.Accept)) {
      recognized = true
      SPPFroot = getESPPFroot(
        fast.find(RULES, r => r.name === '#S').SID
      )
    }
  } else {
    const starter = new BRNGLR.GraphStackNode(ITEMSETS.get(0))

    code = (() => {
      const EOF = fast.find(RULES, r => r.name === 'Token-EOF')
      EOF.near = () => '[EOF]'
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

    let Xm = new LALR1.ItemSet()
    let U = new SerializableLookupArray(new SerializableLookupArray(starter))
    for (let i = 0; i < code.length; i++)
      U.push(new SerializableLookupArray())
    let R = []
    let Q = []
    const actions = actionsForNode(starter, code, 1)
    fast.forEach(actions, action => {
      if (action instanceof LALR1.Shift) {
        Q.push({ node: starter, action })
      } else if (action instanceof LALR1.Reduce && action.m === 0) {
        R.push({ node: starter, action, f: action.f, y: EPSILON })
      }
    })

    const completeReduction = (node, action, c, inputIndex, N) => {
      const z = (() => {
        let ret = fast.find(N, n =>
          n.action.rule === action.rule && n.left === c)
        if (!ret) {
          ret = new SPPF.SymbolNode(action.item, c, inputIndex)
          N.push(ret)
        }
        return ret
      })()

      const pls = fast.filter(node.itemSet.gotos, goto =>
        goto.input.equals(action.rule))
      fast.forEach(pls, pl => {
        const ws = U.get(inputIndex).filter(u => u.itemSet === pl.to)
        if (ws.length > 0) {
          fast.forEach(ws, w => {
            if (w.arcs.indexOfItem(node) < 0) {
              w.arcs.push(node)
              w.arcLabels.push(z)
              if (action.m > 0) {
                fast.forEach(actionsForNode(
                    w, code, inputIndex + 1
                  ), act => {
                    if (act instanceof LALR1.Reduce && act.m > 0) {
                      R.push({ node, action: act, f: act.f, y: z })
                    }
                  }
                )
              }
            }
          })
        } else {
          const w = new BRNGLR.GraphStackNode(pl.to)
          U.get(inputIndex).push(w)
          w.arcs.push(node)
          w.arcLabels.push(z)
          const nextActions = actionsForNode(
            w, code, inputIndex + 1
          )

          fast.forEach(nextActions, act => {
            if (act instanceof LALR1.Shift) {
              Q.push({ node: w, action: act })
            } else if (act instanceof LALR1.Reduce) {
              if (act.m === 0) {
                R.push({ node: w, action: act, f: act.f, y: EPSILON })
              } else if (action.m !== 0) {
                R.push({ node, action: act, f: act.f, y: z })
              }
            }
          })
        }
      })
    }

    const addChildren = (z, alfa, f, action) => {
      if (f !== EPSILON_HASH)
        alfa.push(getESPPFroot(f))

      if (!z.packs(alfa)) {
        const alfaPacker = z.arcs.find(arc => {
          if (arc instanceof SPPF.PackedNode) {
            return arc.packs(alfa)
          }
          return false
        })

        if (!alfaPacker) {
          if (z.arcs.length === 0) {
            fast.forEach(alfa, a => { z.arcs.push(a) })
          } else {
            const originalArcs = z.flattenArcs()
            if (!z.arcs.find(
              a => a instanceof SPPF.PackedNode
            )) {
              const packing = new SPPF.PackedNode(z.action)
              packing.arcs.reset(z.arcs)
              if (testResolvers(z, packing)) {
                z.arcs.reset([packing])
              } else {
                z.arcs.reset([])
              }
            }

            const packing = new SPPF.PackedNode(action)
            fast.forEach(alfa, a => { packing.arcs.push(a) })
            if (z.arcs.length > 0) {
              if (testResolvers(z, packing)) {
                z.arcs.push(packing)
                ambiguous = true
              } else {
                z.arcs.reset(originalArcs)
              }
            } else {
              z.arcs.reset(alfa)
            }
          }
        }
      }
    }

    let length = code.length
    for (; inputIndex < length && U.get(inputIndex).length > 0; inputIndex++) {
      let N = []
      let I = []
      while (R.length > 0) { // Reducer
        let { node, action, f, y } = R.pop()

        if (action.m === 0) {
          const pls = fast.filter(node.itemSet.gotos, goto =>
            goto.input.equals(action.rule))
          fast.forEach(pls, pl => {
            const ws = U.get(inputIndex).filter(u => u.itemSet === pl.to)
            if (ws.length > 0) {
              fast.forEach(ws, w => {
                if (w.arcs.indexOfItem(node) < 0) {
                  w.arcs.push(node)
                  w.arcLabels.push(getESPPFroot(action.f))
                }
              })
            } else {
              const w = new BRNGLR.GraphStackNode(pl.to)
              U.get(inputIndex).push(w)
              w.arcs.push(node)
              w.arcLabels.push(getESPPFroot(action.f))
              const nextActions = actionsForNode(
                w, code, inputIndex + 1
              )

              fast.forEach(nextActions, act => {
                if (act instanceof LALR1.Shift) {
                  Q.push({ node: w, action: act })
                } else if (act instanceof LALR1.Reduce && act.m === 0) {
                  R.push({ node: w, action: act, f: act.f, y: EPSILON })
                }
              })
            }
          })
        } else if (action.m === 1) {
          const c = U.indexOfItem(node)
          completeReduction(node, action, c, inputIndex, N)
          const z = fast.find(N, n =>
            n.action.rule === action.rule && n.left === c)
          addChildren(z, [y], f, action)
        } else if (action.m === 2) {
          node.arcs.forEach((arc, i) => {
            const c = U.indexOfItem(arc)
            completeReduction(arc, action, c, inputIndex, N)
            const z = fast.find(N, n =>
              n.action.rule === action.rule && n.left === c)
            addChildren(z, [node.arcLabels[i], y], f, action)
          })
        } else {
          let w = U.get(inputIndex).find(u => u.itemSet === Xm)
          if (!w) {
            w = new BRNGLR.GraphStackNode(Xm)
            U.get(inputIndex).push(w)
          }

          node.arcs.forEach((arc, i) => {
            const c = U.indexOfItem(arc)
            let z = fast.find(I, i =>
              i.action === action &&
              i.alfa === action.m - 2 &&
              i.left === c)
            if (!z) {
              z = new SPPF.IntermediateNode(action, action.m - 2,
                c, inputIndex)
              I.push(z)
            }

            if (w.arcs.indexOfItem(arc) < 0) {
              w.arcs.push(arc)
              w.arcLabels.push(z)
              const act = new LALR1.Reduce(action)
              act.m--
              R.push({ node: arc, action: act, f: EPSILON_HASH, y: z })
            }

            addChildren(z, [node.arcLabels[i], y], f, action)
          })
        }
      }

      // Shifter
      let Qn = []

      let z = new SPPF.TerminalNode(
        code[inputIndex], inputIndex, inputIndex + 1)
      while (Q.length > 0) {
        let { node, action } = Q.pop()

        let w = U.get(inputIndex + 1).find(
          u => u.itemSet === action.itemSet)
        if (w) {
          w.arcs.push(node)
          w.arcLabels.push(z)
          fast.forEach(actionsForNode(
              w, code, inputIndex + 2
            ), act => {
              if (act instanceof LALR1.Reduce && act.m > 0) {
                R.push({ node, action: act, f: act.f, y: z })
              }
            }
          )
        } else {
          w = new BRNGLR.GraphStackNode(action.itemSet)
          U.get(inputIndex + 1).push(w)
          w.arcs.push(node)
          w.arcLabels.push(z)

          const nextActions = actionsForNode(
            w, code, inputIndex + 2
          )

          fast.forEach(nextActions, act => {
            if (act instanceof LALR1.Shift) {
              Qn.push({ node: w, action: act })
            } else if (act instanceof LALR1.Reduce) {
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

    const accepts = U.get(code.length).find(u => u.canAccept)

    if (accepts) {
      recognized = true
      const root = accepts.arcs.get(0)
      SPPFroot = root.arcLabels[
        root.arcs.findIndex(arc => arc === starter)
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

  return {
    root: SPPFroot,
    ambiguous
  }
}

module.exports = BRNGLR
