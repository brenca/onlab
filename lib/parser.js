const Lexer = require('./lexer')
const crypto = require('crypto')
const fast = require('./faster')

function parseBNF(bnf) {
  const starters = '<"\'+='
  const enders = '>"\'+='

  let separate = (text) => {
    let rules = [[]], last = -1

    // parse iteratively by character because of characters with sepcial
    // meaning (which can still be part of a string literal)
    fast.forEach(text.split(''), (v, i) => {
      if (v === '|' && last < 0) {
        rules.push([])
      } else if (fast.indexOf(starters, v) >= 0 && last < 0) {
        last = i
      } else if (fast.indexOf(enders, v) >= 0 && last >= 0 &&
          fast.indexOf(starters, text[last]) === fast.indexOf(enders, v)) {
        switch (text[last]) {
          case `<`: {
            let name = text.substring(last + 1, i)
            if (!name.match(/^[a-z]+[a-z0-9-]*$/i))
              throw Error('Invalid BNF')
            rules[rules.length - 1].push(name)
          } break
          case `=`: {
            let assoc = text.substring(last + 1, i)
            const lastrule = rules[rules.length - 1]
            lastrule[lastrule.length - 1].assoc = assoc
          } break
          case `+`: {
            let precedence = text.substring(last + 1, i)
            const lastrule = rules[rules.length - 1]
            lastrule[lastrule.length - 1].precedence = precedence
          } break
          case `"`: case `'`: {
            const terminals = text.substring(last + 1, i)
            if (terminals.length === 0) {
              rules[rules.length - 1].push(
                new Parser.BNFTerminal('')
              )
            } else {
              fast.forEach(terminals.split(''), terminal => {
                rules[rules.length - 1].push(
                  new Parser.BNFTerminal(terminal)
                )
              })
            }
          } break
        }
        last = -1
      } else if (last === -1 && !v.match(/\s/)) {
        throw Error('Invalid BNF')
      }
    })

    return rules
  }

  // split by lines and merge multi line rules into one line
  let splitAndMerge = (bnf) => {
    let rules = []

    fast.forEach(bnf.split(/\r?\n/), (v, i) => {
      v = v.replace(/(^\s+)|(\s+$)/g, "")

      if (v.match(/::=/)) rules.push(v)
      else rules[rules.length - 1] += " " + v
    })

    return fast.filter(rules, d => {
      return d.length > 0 && d.match(/::=/)
    })
  }

  // map all lines into their respective rules and add rules from Lexer
  let withoutCommentLines = bnf.replace(/\n\s*\/\/.*\n/g, '\n')
  this._rules = fast.map(splitAndMerge(withoutCommentLines), definition => {
    let m = definition.replace(/\s+/g, " ").match(/^<(.+)> ::= (.+)$/i)
    if (!m[1].match(/^[a-z]+[a-z0-9-]*$/i))
      throw Error('Invalid BNF')
    return new Parser.BNFRule(m[1], separate(m[2]))
  }).concat(fast.map(this._parent.lexer._classes, c => {
    return new Parser.BNFRule('Token-' + c.name, c)
  }))
  // add special starter rule for grammar
  this._rules.unshift(new Parser.BNFRule('#S', [[this._rules[0].name]]))

  // match the rule names to the rule references in the subrule lists
  this._rules = fast.map(this._rules, rule => {
    rule.subrules = fast.map(rule.subrules, subruleSequence => {
      return fast.map(subruleSequence, name => {
        if (typeof name === 'string' || name instanceof String) {
          let subrule = this._findRule(name)
          if (subrule === undefined)
            throw ReferenceError('"' + name + '" is not a valid rule')
          return subrule
        } else if (name instanceof Parser.BNFRule
            || name instanceof Parser.BNFTerminal) {
          return name
        } else throw TypeError('"' + name + '" is not a ' +
                               'Parser.BNFRule or Parser.BNFTerminal')
      })
    })
    return rule
  })
}

function createEpsilonSPPFs() {
  const realRules = fast.filter(this._rules, rule => !rule.tokenClass)
  let changed
  do {
    changed = 0
    fast.forEach(realRules, rule => {
      if (!rule.nullable && fast.some(rule.subrules, subrules => {
        return !fast.some(subrules, subrule => !subrule.nullable)
      })) {
        rule.nullable = true
        changed++
      }
    })
  } while (changed > 0)

  const nullables = fast.filter(realRules, rule => {
    return rule.nullable
  })

  const epsilonSPPF = new Parser._SPPFEpsilonNode()
  epsilonSPPF.left = 0
  epsilonSPPF.right = 0
  this._epsilonSPPFMap[epsilonSPPF.item.hash()] = epsilonSPPF

  if (nullables.length > 0) {
    fast.forEach(nullables, rule => {
      const nullableSPPF = new Parser._SPPFSymbolNode({
        rule, i: null, dot: null
      }, 0, 0)
      nullableSPPF.arcs.push(epsilonSPPF)
      this._epsilonSPPFMap[nullableSPPF.item.hash()] = nullableSPPF
    })

    fast.forEach(realRules, rule => {
      const EpsilonSPPFNode = this._epsilonSPPFMap[rule.hash()]
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
        const RNPNode = new Parser._SPPFRNPNode(rules, null)
        fast.forEach(rules, r => {
          if (this._epsilonSPPFMap[r.hash()]) {
            RNPNode.arcs.push(this._epsilonSPPFMap[r.hash()])
          } else {
            throw new Error('No nullable rule in map for ' +
              'required nullable part')
          }
        })
        this._epsilonSPPFMap[rules.hash()] = RNPNode
      })

      if (nullableWholeSubrules.length > 0) {
        EpsilonSPPFNode.arcs = []

        if (nullableWholeSubrules.length === 1) {
          fast.forEach(nullableWholeSubrules[0].rules, r => {
            if (this._epsilonSPPFMap[r.hash()]) {
              EpsilonSPPFNode.arcs.push(this._epsilonSPPFMap[r.hash()])
            } else {
              throw new Error('No nullable rule in map for ' +
                'required nullable part')
            }
          })
        } else {
          fast.forEach(nullableWholeSubrules, subrule => {
            const NWSNode = new Parser._SPPFPackedNode({
              rule: EpsilonSPPFNode.action.rule,
              i: subrule.index,
              dot: subrule.rules.length
            })

            fast.forEach(subrule.rules, r => {
              if (this._epsilonSPPFMap[r.hash()]) {
                NWSNode.arcs.push(this._epsilonSPPFMap[r.hash()])
              } else {
                throw new Error('No nullable rule in map for ' +
                  'required nullable part')
              }
            })
            EpsilonSPPFNode.arcs.push(NWSNode)
          })
        }
      }
    })
  }
}

// finds the canonical collection of LR(0) items and the
// translation table elements
function findItemSets() {
  let isItemSetStarter = (item) => {
    return fast.some(this._itemSets, set => {
      return set.items[0].equals(item)
    })
  }

  let getItemSetsForItem = (item) => {
    return fast.filter(this._itemSets, set => {
      return fast.some(set.items, i => i.equals(item))
    })
  }

  let start = new Parser._LR0Item(this._findRule('#S'), 0, 0)
  this._itemSets = [new Parser._LR0ItemSet(start, this._rules)]

  let index = 0
  while (true) {
    fast.forEach(this._itemSets[index].getAfterDotSet(), ad => {
      let itemsBefore = this._itemSets[index].createItemsWithDotBefore(ad)

      fast.some(itemsBefore, i => {
        if (!fast.some(this._itemSets, s => {
          return fast.some(s.items, it => {
            return it.equals(i)
          })
        })) {
          this._itemSets.push(new Parser._LR0ItemSet(
            itemsBefore,
            this._rules
          ))
          return true
        }
      })
    })
    index++
    if (index >= this._itemSets.length) break
  }

  fast.forEach(this._itemSets, set => {
    fast.forEach(set.getAfterDotSet(), ad => {
      let sets = []
      fast.forEach(set.createItemsWithDotBefore(ad), idb => {
        fast.forEach(getItemSetsForItem(idb), s => {
          sets.push(s)
        })
      })
      sets = [...new Set(sets)]

      fast.forEach(sets, s => {
        set.translationTable.push({
          input: ad,
          set: s
        })
      })
    })
  })
}

// finds the extended grammar elements
function findExtendedGrammar() {
  this._egitems = []
  this._egrules = []

  let createOrGetEGItem = (from, to, rule) => {
    let item = new Parser._ExtendedGrammarItem(from, to, rule)
    let existing = fast.find(this._egitems, egi => {
      return egi.equals(item)
    })

    if (!existing) {
      this._egitems.push(item)
      return item
    }
    return existing
  }

  let findFromTo = (set, input) => {
    let from = set
    let ts = fast.filter(set.translationTable, t => {
      return t.input.equals(input)
    })

    return fast.map(ts, t => {
      return {
        from: set,
        to: t.set
      }
    })
  }

  let items = []
  fast.forEach(this._itemSets, set => {
    fast.forEach(set.items, item => {
      if (item.dot === 0) {
        items.push({
          set: set,
          item: item
        })
      } else {
        let rightHandSide = item.rule.subrules[item.i]
        let allEpsilon = true
        for (let i = 0; i < item.dot; i++) {
          allEpsilon = allEpsilon || rightHandSide[i].isEpsilonRule()
        }
        if (allEpsilon) {
          items.push({
            set: set,
            item: item
          })
        }
      }
    })
  })

  fast.forEach(items, item => {
    fast.forEach(findFromTo(item.set, item.item.rule), ft => {
      let leftHandSide = createOrGetEGItem(ft.from, ft.to, item.item.rule)

      let rightHandSides = [[]]
      fast.forEach(item.item.rule.subrules[item.item.i], sr => {
        let nrightHandSides = []
        fast.forEach(rightHandSides, rightHandSide => {
          let s = rightHandSide.length > 0 ?
            rightHandSide[rightHandSide.length - 1].to : item.set

          fast.forEach(findFromTo(s, sr), ft => {
            if (ft.to !== undefined) {
              let nrightHandSide = rightHandSide.slice()
              nrightHandSide.push(createOrGetEGItem(ft.from, ft.to, sr))
              nrightHandSides.push(nrightHandSide)
            }
          })

          if (sr.isEpsilonRule()) {
            let nrightHandSide = rightHandSide.slice()
            nrightHandSide.push(createOrGetEGItem(s, s, sr))
            nrightHandSides.push(nrightHandSide)
          }
        })
        rightHandSides = nrightHandSides
      })

      fast.forEach(rightHandSides, rightHandSide => {
        this._egrules.push(new Parser._ExtendedGrammarRule(
          leftHandSide, rightHandSide, item.item.i))
      })
    })
  })
}

// calculates the first sets for each extended grammar rule
function calculateFirsts() {
  let first = (egitem) => {
    let getLHSEGRulesForEGItem = (egitem) => {
      return fast.filter(this._egrules, r => {
        return r.leftHandSide.equals(egitem)
      })
    }

    if (egitem.rule instanceof Parser.BNFTerminal
        || egitem.rule.tokenClass !== undefined) {
      egitem.firsts = [egitem.rule]
      return 0
    }

    let changed = 0

    fast.forEach(getLHSEGRulesForEGItem(egitem), egrule => {
      if (egrule.rightHandSide[0].rule.isTerminalRule()) {
        const isInFirsts = fast.contains(egrule.rightHandSide[0].rule,
          egrule.leftHandSide.firsts)
        if (!isInFirsts) {
          changed++
          egrule.leftHandSide.firsts.push(egrule.rightHandSide[0].rule)
        }
      } else {
        if(!fast.some(egrule.rightHandSide, r => {
          if (r.rule instanceof Parser.BNFRule) {
            let hasEpsilon = false

            fast.forEach(r.firsts, f => {
              if (!f.isEpsilonRule()) {
                if (!fast.contains(f, egrule.leftHandSide.firsts)) {
                  changed++
                  egrule.leftHandSide.firsts.push(f)
                }
              } else {
                hasEpsilon = true
              }
            })

            return !hasEpsilon
          } else {
            if (!fast.contains(r.rule, egrule.leftHandSide.firsts)) {
              changed++
              egrule.leftHandSide.firsts.push(r.rule)
            }
            return !r.rule.isEpsilonRule()
          }
        })) {
          let epsilon = new Parser.BNFTerminal('')
          if (!fast.contains(epsilon, egrule.leftHandSide.firsts)) {
            changed++
            egrule.leftHandSide.firsts.push(epsilon)
          }
        }
      }
    })

    return changed
  }

  let changed
  do {
    changed = 0
    fast.forEach(this._egitems, egitem => {
      changed += first(egitem)
    })
  } while (changed > 0)
}

// calculates the follow sets for each extended grammar rule
function calculateFollows() {
  let follow = (egitem) => {
    let getRHSEGRulesForEGItem = (egitem) => {
      let matching = []
      let rules_length = this._egrules.length
      for (let i = 0; i < rules_length; i++) {
        let r = this._egrules[i]
        let rightHandSide_length = r.rightHandSide.length
        for (let j = 0; j < rightHandSide_length; j++) {
          if (r.rightHandSide[j].equals(egitem)){
            matching.push(r)
            break
          }
        }
      }
      return matching
    }

    if (egitem.rule instanceof Parser.BNFTerminal
        || egitem.rule.tokenClass !== undefined) {
      egitem.follows = []
      return 0
    }

    let changed = 0

    fast.forEach(getRHSEGRulesForEGItem(egitem), egrule => {
      let index = fast.indexOf(egrule.rightHandSide, egitem)
      if (index === egrule.rightHandSide.length - 1) {

        fast.forEach(egrule.leftHandSide.follows, f => {
          if (f.isEpsilonRule()) return
          if (!fast.contains(f, egitem.follows)) {
            changed++
            egitem.follows.push(f)
          }
        })
      } else {
        let firsts = egrule.rightHandSide[index + 1].firsts

        let hasEpsilon = false
        fast.forEach(firsts, f => {
          if (f.isEpsilonRule()) {
            hasEpsilon = true
          } else if (!fast.contains(f, egitem.follows)) {
            changed++
            egitem.follows.push(f)
          }
        })

        if (hasEpsilon) {
          fast.forEach(egrule.leftHandSide.follows, f => {
            if (!fast.contains(f, egitem.follows)) {
              changed++
              egitem.follows.push(f)
            }
          })
        }
      }
    })

    return changed
  }

  this._egitems[0].follows.push(this._findRule('Token-EOF'))

  let changed
  do {
    changed = 0
    fast.forEach(this._egitems, egitem => {
      changed += follow(egitem)
    })
  } while (changed > 0)
}

// based on the follow sets and the extended grammar items, calculates the
// action/goto table elements. merges the mergable items of the extended
// grammar
function calculateActionsAndGotos() {
  fast.forEach(this._itemSets, set => {
    set._actions = []
    set._gotos = []

    fast.forEach(set.translationTable, t => {
      if (t.input instanceof Parser.BNFRule
          && t.input.tokenClass === undefined) {
        if (!fast.some(set._gotos, g => g.input === t.input)) {
          set._gotos.push(new Parser._Goto(t.input, t.set))
        }
      } else {
        set._actions.push(new Parser._Shift(t.input, t.set))
      }
    })

    if (fast.some(set.items, item => {
      if (item.rule.name === '#S') {
        if (item.dot === item.rule.subrules.length) {
          return true
        } else if (set === this._itemSets[0]) {
          let subrules = item.rule.subrules[item.i]
          let dot = item.dot
          let allNullable = true
          while (dot < subrules.length) {
            allNullable = allNullable && subrules[dot].nullable
            dot++
          }
          return allNullable
        }
      }
    })) {
      set._actions.push(new Parser._Accept(this._findRule('Token-EOF')))
    }
  })

  fast.forEach(this._egrules, mr => {
    fast.forEach(mr.leftHandSide.follows, follow => {
      if (mr.getFinalSet() !== undefined) {
        let reduceRules = fast.filter(mr.getFinalSet().items, item => {
          if (item.dot === item.rule.subrules[item.i].length) {
            return true
          } else {
            let subrules = item.rule.subrules[item.i]
            let dot = item.dot
            let allNullable = true
            while (dot < subrules.length) {
              allNullable = allNullable && subrules[dot].nullable
              dot++
            }
            return allNullable
          }
          return false
        })

        if (reduceRules.length !== 0) {
          fast.forEach(reduceRules, reduceRule => {
            if (reduceRule.rule.name === "#S") return
            let m = reduceRule.dot
            let sr = reduceRule.rule.subrules[reduceRule.i][m - 1]
            while (sr && sr.isEpsilonRule()) {
              m--
              sr = reduceRule.rule.subrules[reduceRule.i][m - 1]
            }

            const f = m === 0 ? reduceRule.rule.hash()
              : this._getEpsilonSPPFIndexForRHS(reduceRule, m)

            let red = new Parser._Reduce(follow, reduceRule, m, f)
            if (!fast.some(mr.getFinalSet()._actions, a => a.equals(red))) {
              mr.getFinalSet()._actions.push(red)
            }
          })
        }
      }
    })
  })
}

class Parser {
  constructor(parent, bnf) {
    this._parent = parent
    this._rules = []
    this._epsilonSPPFMap = { }
    if (bnf !== undefined) {
      this.setupFromBNF(bnf)
      this.setup()
    }
  }

  setupFromBNF(bnf) {
    parseBNF.apply(this, [bnf])
    this.setup()
  }

  setup() {
    createEpsilonSPPFs.apply(this)
    findItemSets.apply(this)
    findExtendedGrammar.apply(this)
    calculateFirsts.apply(this)
    calculateFollows.apply(this)
    calculateActionsAndGotos.apply(this)
  }

  _getEpsilonSPPFRoot(hash) {
    return this._epsilonSPPFMap[hash]
  }

  _getEpsilonSPPFIndexForRHS(rul, m) {
    const rightHandSide = rul.rule.subrules[rul.i]
    if (rightHandSide.length > 0 &&
        rightHandSide[rightHandSide.length - 1].nullable) {
      let x = rightHandSide.length
      for (; x > 0 && rightHandSide[x - 1].nullable; x--) { }
      const sliced = rightHandSide.slice(x > m ? x : m)
      if (sliced.length > 0) {
        return fast.hash(sliced)
      }
    }

    return (new Parser.BNFTerminal('')).hash()
  }

  _findRule(name) {
    return fast.find(this._rules, r => { return r.name === name })
  }

  _addEOFToInput(input) {
    let EOF = this._findRule('Token-EOF')
    let lastInput = input[input.length - 1]
    if (lastInput !== undefined) {
      EOF.position = lastInput.position
      EOF.position.char += lastInput.value.length
    } else {
      EOF.position = { line: 0, char: 0, absolute: 0, length: 0 }
    }
    input.push(EOF)

    return input
  }

  _actionsForNode(node, input, inputIndex) {
    let actions = []

    fast.forEach(node.itemSet._actions, action => {
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

  // parses the code into an AST
  parse(code) {
    const EPSILON_HASH = (new Parser.BNFTerminal('')).hash()
    const EPSILON = this._getEpsilonSPPFRoot(EPSILON_HASH)
    let SPPFroot = null
    let recognized = false
    let inputIndex = 0

    if (code.length === 0) {
      if (fast.some(this._itemSets[0]._actions, a =>
        a instanceof Parser._Accept && a.input.name === 'Token-EOF'
      )) {
        recognized = true
        SPPFroot = this._getEpsilonSPPFRoot(this._findRule('#S').hash())
      }
    } else {
      const starter = new Parser._GraphStackNode(this._itemSets[0])
      code = this._addEOFToInput(code)
      let Xm = new Parser._LR0ItemSet()
      let U = [[starter]]
      for (let i = 0; i < code.length; i++)
        U.push([])
      let R = []
      let Q = []
      const actions = this._actionsForNode(starter, code, 1)
      fast.forEach(actions, action => {
        if (action instanceof Parser._Shift) {
          Q.push({ node: starter, action })
        } else if (action instanceof Parser._Reduce && action.m === 0) {
          R.push({ node: starter, action, f: action.f, y: EPSILON })
        }
      })

      const completeReduction = (node, action, c, inputIndex, N) => {
        const pl = fast.find(node.itemSet._gotos, goto =>
          goto.input.equals(action.rule))
        let z = (() => {
          let ret = fast.find(N, n =>
            n.action.rule === action.rule && n.left === c)
          if (!ret) {
            ret = new Parser._SPPFSymbolNode(
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
              fast.forEach(this._actionsForNode(
                  w, code, inputIndex + 1
                ), act => {
                  if (act instanceof Parser._Reduce && act.m > 0) {
                    R.push({ node, action: act, f: act.f, y: z })
                  }
                }
              )
            }
          }
        } else {
          w = new Parser._GraphStackNode(pl.to)
          U[inputIndex].push(w)
          w.arcs.push(node)
          w.arcLabels.push(z)
          const nextActions = this._actionsForNode(
            w, code, inputIndex + 1
          )

          fast.forEach(nextActions, act => {
            if (act instanceof Parser._Shift) {
              Q.push({ node: w, action: act })
            } else if (act instanceof Parser._Reduce) {
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
          alfa.push(this._getEpsilonSPPFRoot(f))

        if (!z.packs(alfa)) {
          const alfaPacker = fast.find(z.arcs, arc => {
            if (arc instanceof Parser._SPPFPackedNode) {
              return arc.packs(alfa)
            }
            return false
          })

          if (!alfaPacker) {
            if (z.arcs.length === 0) {
              fast.forEach(alfa, a => { z.arcs.push(a) })
            } else {
              if (!fast.find(z.arcs,
                a => a instanceof Parser._SPPFPackedNode
              )) {
                const packing = new Parser._SPPFPackedNode(z.action)
                packing.arcs = z.arcs
                z.arcs = [packing]
              }

              const packing = new Parser._SPPFPackedNode(action)
              z.arcs.push(packing)
              fast.forEach(alfa, a => { packing.arcs.push(a) })
            }
          }
        }
      }

      try {
        let length = code.length
        for (; inputIndex < length && U[inputIndex].length > 0; inputIndex++) {
          let N = []
          let I = []
          while (R.length > 0) { // Reducer
            let { node, action, f, y } = R.pop()

            if (action.m === 0) {
              const pl = fast.find(node.itemSet._gotos, goto =>
                goto.input.equals(action.rule))
              let w = fast.find(U[inputIndex], u => u.itemSet === pl.to)

              if (w) {
                if (fast.indexOf(w.arcs, node) < 0) {
                  w.arcs.push(node)
                  w.arcLabels.push(this._getEpsilonSPPFRoot(action.f))
                }
              } else {
                w = new Parser._GraphStackNode(pl.to)
                U[inputIndex].push(w)
                w.arcs.push(node)
                w.arcLabels.push(this._getEpsilonSPPFRoot(action.f))
                const nextActions = this._actionsForNode(
                  w, code, inputIndex + 1
                )

                fast.forEach(nextActions, act => {
                  if (act instanceof Parser._Shift) {
                    Q.push({ node: w, action: act })
                  } else if (act instanceof Parser._Reduce && act.m === 0) {
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
                w = new Parser._GraphStackNode(Xm)
                U[inputIndex].push(w)
              }

              const act = new Parser._Reduce(action.input,
                action._internalRule, action.m - 1, action.f)
              fast.forEach(node.arcs, (arc, i) => {
                const c = fast.findIndex(U, Uc => fast.indexOf(Uc, arc) >= 0)
                let z = fast.find(I, i =>
                  i.action === action &&
                  i.alfa === action.m - 1 &&
                  i.left === c)
                if (!z) {
                  z = new Parser._SPPFIntermediateNode(action, action.m - 1,
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

            let z = new Parser._SPPFTerminalNode(
              code[inputIndex], inputIndex, inputIndex + 1)
            while (Q.length > 0) {
              let { node, action } = Q.pop()

              let w = fast.find(U[inputIndex + 1],
                u => u.itemSet === action._itemSet)
              if (w) {
                w.arcs.push(node)
                w.arcLabels.push(z)
                fast.forEach(this._actionsForNode(
                    w, code, inputIndex + 2
                  ), act => {
                    if (act instanceof Parser._Reduce && act.m > 0)
                      R.push({ node, action: act, f: act.f, y: z })
                  }
                )
              } else {
                w = new Parser._GraphStackNode(action._itemSet)
                U[inputIndex + 1].push(w)
                w.arcs.push(node)
                w.arcLabels.push(z)

                const nextActions = this._actionsForNode(
                  w, code, inputIndex + 2
                )

                fast.forEach(nextActions, act => {
                  if (act instanceof Parser._Shift) {
                    Qn.push({ node: w, action: act })
                  } else if (act instanceof Parser._Reduce) {
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

      } catch (e) {
        console.log(e)
      }
    }

    if (!recognized) {
      const lastChecked = code[inputIndex - 1]
      console.log(`${lastChecked.position.line}:${lastChecked.position.char} - `
        + `Recognition stopped at "${lastChecked.value}"`);
    }
    return recognized ? SPPFroot : false
  }
}

Parser._SPPFNode = class {
  constructor(hash = undefined) {
    this.arcs = []
    this.hash = hash ? hash : crypto.createHash('md5').update(
        crypto.randomBytes(20).toString('hex')
      ).digest('hex')
  }

  packs(alfa) {
    return alfa.length === this.arcs.length &&
      fast.reduce(alfa, (a, x, i) => a && x.equals(this.arcs[i]), true)
  }

  equals(other) {
    return this.hash === other.hash
  }

  toString() {
    return 'NOT_IMPLEMENTED'
  }

  dotStyle() {
    return ''
  }

  asOperator() {
    return null
  }

  _copyArcs(decisions, other) {
    if (decisions[other.hash] !== undefined) {
      const hash = decisions[other.hash].shift()

      other.arcs = fast.map(fast.find(this.arcs
        ,arc => arc.hash === hash).arcs
        , arc => arc.clone(decisions))
    } else {
      other.arcs = fast.map(this.arcs, arc => arc.clone(decisions))
    }

    return other
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.j, this.hash))
  }
}

Parser._SPPFIntermediateNode = class extends Parser._SPPFNode {
  constructor(action, alfa, left, right, hash = undefined) {
    super(hash)
    this.action = action
    this.alfa = alfa
    this.left = left
    this.right = right
  }

  toString() {
    const rule = `'${this.action.rule.name}' ::= ${
      fast.map(this.action.rule.subrules[this.action.i], (rule, i) => {
        return `'${(rule.name || rule.value || `Ɛ`)}'` + (i === this.alfa ?
          '●' : '')
      }).join(' ')
    }`

    const extent = (this.left !== undefined && this.right !== undefined) ?
      `, ${this.left}, ${this.right}` : ''

    return `(${rule}${extent})`
  }

  dotStyle() {
    return `shape="box"`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.action, this.alfa, this.left, this.right, this.hash))
  }
}

Parser._SPPFPackedNode = class extends Parser._SPPFNode {
  constructor(action, arcs, hash = undefined) {
    super(hash)
    this.action = action
    try {
      if (arcs.constructor.name === 'Array') {
        this.arcs = arcs
      }
    } catch (e) { }
  }

  toString() {
    const rule = `${this.action.rule.name} ::= ${
      fast.map(this.action.rule.subrules[this.action.i], (rule, i) => {
        return (rule.name || rule.value || 'Ɛ') + (i + 1 === this.action.dot ?
          '●' : '')
      }).join(' ')
    }`

    return `${rule}`
  }

  dotStyle() {
    return `shape="oval"`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.action, this.arcs))
  }
}

Parser._SPPFSymbolNode = class extends Parser._SPPFNode {
  constructor(action, left, right, hash = undefined) {
    super(hash)

    this.action = action
    this.left = left
    this.right = right
  }

  asOperator() {
    if (this.action.i === null)
      return null

    const subrules = this.action.rule.subrules[this.action.i]
    if (subrules.length === 1 && subrules[0].isOperator())
      return subrules[0]

    return null
  }

  get item() {
    return this.action.rule || this.action
  }

  toString() {
    const extent = (this.left !== undefined && this.right !== undefined) ?
      `, ${this.left}, ${this.right}` : ''
    return `('${this.item.name}'${extent})`
  }

  dotStyle() {
    return `shape="box" style="rounded"`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.action, this.left, this.right, this.hash))
  }
}

Parser._SPPFRNPNode = class extends Parser._SPPFNode {
  constructor(rules, hash = undefined) {
    super(hash)
    this.rules = rules
  }

  dotStyle() {
    return `shape="box" style="rounded"`
  }

  toString() {
    return `('${fast.map(this.rules, rule => rule.name).join('')}')`
  }
}

Parser._SPPFTerminalNode = class extends Parser._SPPFNode {
  constructor(item, left, right, hash = undefined) {
    super(hash)
    this.item = item
    this.left = left
    this.right = right
  }

  toString() {
    const extent = (this.left !== undefined && this.right !== undefined) ?
      `, ${this.left}, ${this.right}` : ''
    return `('${this.item.value}'${extent})`
  }

  dotStyle() {
    return `shape="box" style="rounded"`
  }

  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.item, this.left, this.right, this.hash))
  }
}

Parser._SPPFEpsilonNode = class extends Parser._SPPFTerminalNode {
  constructor() {
    super(new Parser.BNFTerminal(''))
  }

  toString() {
    return '(Ɛ, 0, 0)'
  }
}

Parser._GraphStackNode = class {
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
Parser._Action = class {
  constructor(input) {
    this.input = input
  }

  equals(other) {
    return other.input.equals(this.input)
  }
}

// accept action, marks success
Parser._Accept = class _Accept extends Parser._Action {
  constructor(input) {
    super(input)
  }

  equals(other) {
    return other instanceof Parser._Accept
      && super.equals(other)
  }
}

// reduce action
Parser._Reduce = class _Reduce extends Parser._Action {
  constructor(input, rule, m, f) {
    super(input)
    this._internalRule = rule
    this.m = m
    this.f = f
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
    return other instanceof Parser._Reduce
      && other._internalRule === this._internalRule
      && super.equals(other)
  }
}

// shift action
Parser._Shift = class _Shift extends Parser._Action {
  constructor(input, itemSet) {
    super(input)
    this._itemSet = itemSet
  }

  equals(other) {
    return other instanceof Parser._Shift
      && other.itemSet === this.itemSet
      && super.equals(other)
  }
}

// goto element of the action/goto table
Parser._Goto = class extends Parser._Action {
  constructor(input, to) {
    super(input)
    this.to = to
  }

  equals(other) {
    return other instanceof Parser._Goto
      && other.to === this.to
      && super.equals(other)
  }
}

Parser._ExtendedGrammarRule = class {
  constructor(leftHandSide, rightHandSide, i) {
    this.leftHandSide = leftHandSide
    this.rightHandSide = rightHandSide
    this.i = i
  }

  isMergeableWith(other) {
    if (other.leftHandSide.rule.equals(this.leftHandSide.rule)
        && other.getFinalSet() === this.getFinalSet()) {
      return true
    } else {
      return false
    }
  }

  getFinalSet() {
    return this.rightHandSide[this.rightHandSide.length - 1].to
  }
}

Parser._ExtendedGrammarItem = class {
  constructor(from, to, rule) {
    this.from = from
    this.to = to
    this.rule = rule
    this.firsts = []
    this.follows = []
  }

  equals(item) {
    return this.from === item.from
        && this.to === item.to
        && this.rule.equals(item.rule)
  }
}

let lr0ID = 0
Parser._LR0ItemSet = class {
  constructor(starter, rules) {
    this.id = lr0ID++
    this.items = []
    this.translationTable = []
    this._actions = []

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
        dotbefore.push(new Parser._LR0Item(item.rule, item.i, item.dot + 1))
      } else if (item.getRuleAferDot() === undefined && rule === undefined) {
        dotbefore.push(new Parser._LR0Item(item.rule, item.i, item.dot + 1))
      }
    })
    return dotbefore
  }

  expand(rules) {
    let pushed = 0
    fast.forEach(this.items, item => {
      let afterdot = item.getRuleAferDot()
      if (afterdot !== undefined
          && afterdot instanceof Parser.BNFRule
          && !this.isIncluded(afterdot)) {
        fast.forEach(afterdot.subrules, (sr, index) => {
          this.items.push(new Parser._LR0Item(afterdot, index, 0))
          pushed ++
        })
      }
    })

    if (pushed > 0) this.expand(rules)
    fast.forEach(this.items, item => item.check())
  }

  get canAccept() {
    return fast.some(this._actions, action => action instanceof Parser._Accept)
  }
}

Parser._LR0Item = class {
  constructor(rule, i, dot) {
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

Parser._RuleTerminalBase = class {
  isEpsilonRule() {
    return false
  }

  isTerminalRule() {
    return false
  }

  isOperator() {
    return false
  }

  equals(other) {
    return false
  }
}

Parser.BNFRule = class extends Parser._RuleTerminalBase {
  constructor(name, subrules) {
    super()
    this.name = name
    if (subrules instanceof Lexer.TokenClass) {
      this.tokenClass = subrules
      this.subrules = []
    } else {
      this.subrules = subrules
    }
    this.nullable = false
  }

  isTerminalRule() {
    return this.tokenClass !== undefined
  }

  equals(other) {
    return other instanceof Parser.BNFRule && this.name === other.name
      && (!this.tokenClass || (this.tokenClass === other.tokenClass))
  }

  id() {
    return `BNFRule_${this.name}`
  }

  hash() {
    return crypto.createHash('md5').update(this.name).digest('hex')
  }
}

Parser.BNFTerminal = class extends Parser._RuleTerminalBase {
  constructor(value) {
    super()
    this.value = value
  }

  isTerminalRule() {
    return true
  }

  isEpsilonRule() {
    return this.value === ''
  }

  get nullable() {
    return this.isEpsilonRule()
  }

  equals(other) {
    return other instanceof Parser.BNFTerminal && (this.value === other.value)
  }

  isOperator() {
    return this.precedence !== undefined ||
           this.assoc !== undefined
  }

  id() {
    return `BNFTerminal_${this.value}`
  }

  hash() {
    return crypto.createHash('md5').update(this.value).digest('hex')
  }
}

class BNFSet {
  constructor(bnfarray) {
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

Parser.SyntaxError = class extends Error {
  constructor(message, position, extra) {
    const _constructMessage = (message, position, extra) => {
      if (position) {
        message += ' - at :' + (position.line + 1) + ':' + (position.char + 1)
      }
      if (extra) {
        message += '\n' + extra
      }
      return message
    }

    super(_constructMessage(message, position, extra))
    this.name = 'SyntaxError'
    this.position = position
    this.extra = extra
  }
}

module.exports = Parser
