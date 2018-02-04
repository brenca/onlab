const Lexer = require('./lexer')
const crypto = require('crypto')
Array.prototype = require('./array')

const md5 = value => {
  return crypto.createHash('md5').update(value).digest('hex')
}

const generateId = () => {
  return md5(crypto.randomBytes(20).toString('hex'))
}

// helper function to determine if an item is in an array
function _isInArray(x, a) {
  return a.fastSome(y => {
    if (y.equals) {
      return y.equals(x)
    }
    return y === x
  })
}

class Parser {
  constructor(parent, bnf) {
    this._parent = parent
    // for bnf parsing
    this._starters = '<"\'+='
    this._enders   = '>"\'+='
    this._rules = []
    this._disambiguators = {}
    this._epsilonSPPFMap = { }
    if (bnf !== undefined)
      this.fromBNF(bnf)
  }

  addDisambiguator(ruleName, func) {
    if (!this._disambiguators[ruleName]) this._disambiguators[ruleName] = []
    this._disambiguators[ruleName].push(func)
  }

  _disambiguate(node) {
    if (!node.node || !node.node.rule) return false
    let funcList = this._disambiguators[node.node.rule.name]
    if (!funcList) return false
    return funcList.fastSome(func => func(node))
  }

  // parses the BNF grammar that it gets as a parameter into Parser.BNFRules and
  // Parser.BNFTerminals
  fromBNF(bnf) {
    let separate = (text) => {
      let rules = [[]], last = -1

      // parse iteratively by character because of characters with sepcial
      // meaning (which can still be part of a string literal)
      text.split('').fastForEach((v, i) => {
        if (v === '|' && last < 0) rules.push([])
        else if (this._starters.indexOf(v) >= 0 && last < 0) last = i
        else if (this._enders.indexOf(v) >= 0 && last >= 0 &&
            this._starters.indexOf(text[last]) === this._enders.indexOf(v)) {
          switch (text[last]) {
            case '<': {
              let name = text.substring(last + 1, i)
              if (!name.match(/^[a-z]+[a-z0-9-]*$/i))
                throw Error('Invalid BNF')
              rules[rules.length - 1].push(name)
            } break
            case '=': { 
              let assoc = text.substring(last + 1, i)
              const lastrule = rules[rules.length - 1]
              lastrule[lastrule.length - 1].assoc = assoc
            } break
            case '+': {
              let precedence = text.substring(last + 1, i)
              const lastrule = rules[rules.length - 1]
              lastrule[lastrule.length - 1].precedence = precedence
            } break
            case '"': case '\'': {
              const terminals = text.substring(last + 1, i)
              if (terminals.length === 0) {
                rules[rules.length - 1].push(
                  new Parser.BNFTerminal('')
                )
              } else {
                terminals.split('').forEach(terminal => {
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

      bnf.split(/\r?\n/).fastForEach((v, i) => {
        v = v.replace(/(^\s+)|(\s+$)/g, "")

        if (v.match(/::=/)) rules.push(v)
        else rules[rules.length - 1] += " " + v
      })

      return rules.fastFilter(d => {
        return d.length > 0 && d.match(/::=/)
      })
    }

    // map all lines into their respective rules and add rules from Lexer
    let withoutCommentLines = bnf.replace(/\n\s*\/\/.*\n/g, '\n')
    this._rules = splitAndMerge(withoutCommentLines).fastMap(definition => {
      let m = definition.replace(/\s+/g, " ").match(/^<(.+)> ::= (.+)$/i)
      if (!m[1].match(/^[a-z]+[a-z0-9-]*$/i))
        throw Error('Invalid BNF')
      return new Parser.BNFRule(m[1], separate(m[2]))
    }).concat(this._parent.lexer._classes.fastMap(c => {
      return new Parser.BNFRule('Token-' + c.name, c)
    }))
    // add special starter rule for grammar
    this._rules.unshift(new Parser.BNFRule('#S', [[this._rules[0].name]]))
    
    // match the rule names to the rule references in the subrule lists
    this._rules = this._rules.fastMap(rule => {
      rule.subrules = rule.subrules.fastMap(subruleSequence => {
        return subruleSequence.fastMap(name => {
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

    const realRules = this._rules.fastFilter(rule => !rule.tokenClass)
    let changed
    do {
      changed = 0
      realRules.fastForEach(rule => {
        if (!rule.nullable && rule.subrules.fastSome(subrules => {
          return !subrules.fastSome(subrule => !subrule.nullable)
        })) {
          rule.nullable = true
          changed++
        }
      })
    } while (changed > 0)

    const nullables = realRules.filter(rule => {
      return rule.nullable
    })

    if (nullables.length > 0) {
      const epsilonSPPF = new Parser._SPPFEpsilonNode()
      this._epsilonSPPFMap[epsilonSPPF.item.hash()] = epsilonSPPF

      nullables.forEach(rule => {
        const nullableSPPF = new Parser._SPPFSymbolNode(rule, null, null)
        nullableSPPF.arcs.push(epsilonSPPF)
        this._epsilonSPPFMap[nullableSPPF.item.hash()] = nullableSPPF
      })

      let requiredNullableParts = []
      realRules.forEach(rule => {
        rule.subrules.forEach(subrules => {
          if (subrules[subrules.length - 1].nullable) {
            let x = subrules.length
            for (; x > 0 && subrules[x - 1].nullable; x--) { }
            if (x > 0) {
              let nullableParts = [subrules[subrules.length - 1]]
              for (let i = subrules.length - 2; i >= x; i--) {
                nullableParts.unshift(subrules[i])
                requiredNullableParts.push(nullableParts.slice())
              }
            }
          }
        })
      })

      requiredNullableParts.forEach(rules => {
        const RNPSPPF = new Parser._SPPFRNPNode(rules, null)
        rules.forEach(rule => {
          if (this._epsilonSPPFMap[rule.hash()])
            RNPSPPF.arcs.push(this._epsilonSPPFMap[rule.hash()])
          else
            throw new Error('No nullable rule in map for require nullable part')
        })
        this._epsilonSPPFMap[rules.hash()] = RNPSPPF
      })
    }

    this._findItemSets()
    this._findExtendedGrammar()
    this._calculateFirsts()
    this._calculateFollows()
    this._calculateActionsAndGotos()
  }

  _getEpsilonSPPFRoot(hash) {
    return this._epsilonSPPFMap[hash]
  }

  _getEpsilonSPPFIndexForRHS(rhs, m) {
    if (rhs.length > 0 && rhs[rhs.length - 1].nullable) {
      let x = rhs.length
      for (; x > 0 && rhs[x - 1].nullable; x--) { }
      if (x > 0) {
        const sliced = rhs.slice(x > m ? x : m)
        if (sliced.length > 0)
          return sliced.hash()
      }
    }

    return (new Parser.BNFTerminal('')).hash()
  }

  _findRule(name) {
    return this._rules.fastFind(r => { return r.name === name })
  }

  // finds the canonical collection of LR(0) items and the
  // translation table elements
  _findItemSets() {
    let isItemSetStarter = (item) => {
      return this._itemSets.fastSome(set => {
        return set.items[0].equals(item)
      })
    }

    let getItemSetsForItem = (item) => {
      return this._itemSets.fastFilter(set => {
        return set.items.fastSome(i => i.equals(item))
      })
    }

    let start = new Parser._LR0Item(this._findRule('#S'), 0, 0)
    this._itemSets = [new Parser._LR0ItemSet(start, this._rules)]

    let index = 0
    while (true) {
      this._itemSets[index].getAfterDotSet().fastForEach(ad => {
        let itemsBefore = this._itemSets[index].createItemsWithDotBefore(ad)

        itemsBefore.fastSome(i => {
          if (!this._itemSets.fastSome(s => {
            return s.items.fastSome(it => {
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

    this._itemSets.fastForEach(set => {
      set.getAfterDotSet().fastForEach(ad => {
        let sets = []
        set.createItemsWithDotBefore(ad).fastForEach(idb => {
          getItemSetsForItem(idb).fastForEach(s => {
            sets.push(s)
          })
        })
        sets = [...new Set(sets)]

        sets.fastForEach(s => {
          set.translationTable.push({
            input: ad,
            set: s
          })
        })
      })
    })
  }

  // finds the extended grammar elements
  _findExtendedGrammar() {
    this._egitems = []
    this._egrules = []

    let createOrGetEGItem = (from, to, rule) => {
      let item = new Parser._ExtendedGrammarItem(from, to, rule)
      let existing = this._egitems.fastFind(egi => {
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
      let ts = set.translationTable.fastFilter(t => {
        return t.input.equals(input)
      })

      if (ts.length === 0) {
        return [{
          from: set,
          to: undefined
        }]
      } else {
        return ts.fastMap(t => {
          return {
            from: set,
            to: t.set
          }
        })
      }
    }

    let items = []
    this._itemSets.fastForEach(set => {
      set.items.fastForEach(item => {
        if (item.dot === 0) {
          items.push({
            set: set,
            item: item
          })
        } else {
          let rhs = item.rule.subrules[item.i]
          let allEpsilon = true
          for (let i = 0; i < item.dot; i++) {
            allEpsilon = allEpsilon || rhs[i].isEpsilonRule()
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

    items.fastForEach(item => {
      findFromTo(item.set, item.item.rule).fastForEach(ft => {
        let lhs = createOrGetEGItem(ft.from, ft.to, item.item.rule)

        let rhss = [[]]
        item.item.rule.subrules[item.item.i].fastForEach(sr => {
          let nrhss = []
          rhss.fastForEach(rhs => {
            let s = rhs.length > 0 ? rhs[rhs.length - 1].to : item.set

            findFromTo(s, sr).fastForEach(ft => {
              if (ft.to !== undefined) {
                let nrhs = rhs.slice()
                nrhs.push(createOrGetEGItem(ft.from, ft.to, sr))
                nrhss.push(nrhs)
              }
            })

            if (sr.isEpsilonRule()) {
              let nrhs = rhs.slice()
              nrhs.push(createOrGetEGItem(s, s, sr))
              nrhss.push(nrhs)
            }
          })
          rhss = nrhss
        })

        rhss.fastForEach(rhs => {
          this._egrules.push(new Parser._ExtendedGrammarRule(lhs, rhs, item.item.i))
        })
      })
    })
  }

  // calculates the first sets for each extended grammar rule
  _calculateFirsts() {
    let first = (egitem) => {
      let getLHSEGRulesForEGItem = (egitem) => {
        return this._egrules.fastFilter(r => {
          return r.lhs.equals(egitem)
        })
      }

      if (egitem.rule instanceof Parser.BNFTerminal
          || egitem.rule.tokenClass !== undefined) {
        egitem.firsts = [egitem.rule]
        return 0
      }

      let changed = 0

      getLHSEGRulesForEGItem(egitem).fastForEach(egrule => {
        if (egrule.rhs[0].rule.isTerminalRule()) {
          if (!_isInArray(egrule.rhs[0].rule, egrule.lhs.firsts)) {
            changed++
            egrule.lhs.firsts.push(egrule.rhs[0].rule)
          }
        } else {
          if(!egrule.rhs.fastSome(r => {
            if (r.rule instanceof Parser.BNFRule) {
              let hasEpsilon = false

              r.firsts.fastForEach(f => {
                if (!f.isEpsilonRule()) {
                  if (!_isInArray(f, egrule.lhs.firsts)) {
                    changed++
                    egrule.lhs.firsts.push(f)
                  }
                } else {
                  hasEpsilon = true
                }
              })

              return !hasEpsilon
            } else {
              if (!_isInArray(r.rule, egrule.lhs.firsts)) {
                changed++
                egrule.lhs.firsts.push(r.rule)
              }
              return !r.rule.isEpsilonRule()
            }
          })) {
            let epsilon = new Parser.BNFTerminal('')
            if (!_isInArray(epsilon, egrule.lhs.firsts)) {
              changed++
              egrule.lhs.firsts.push(epsilon)
            }
          }
        }
      })

      return changed
    }

    let changed
    do {
      changed = 0
      this._egitems.fastForEach(egitem => {
        changed += first(egitem)
      })
    } while (changed > 0)
  }

  // calculates the follow sets for each extended grammar rule
  _calculateFollows() {
    let follow = (egitem) => {
      let getRHSEGRulesForEGItem = (egitem) => {
        let matching = []
        let rules_length = this._egrules.length
        for (let i = 0; i < rules_length; i++) {
          let r = this._egrules[i]
          let rhs_length = r.rhs.length
          for (let j = 0; j < rhs_length; j++) {
            if (r.rhs[j].equals(egitem)){
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

      getRHSEGRulesForEGItem(egitem).fastForEach(egrule => {
        let index = egrule.rhs.indexOf(egitem)
        if (index === egrule.rhs.length - 1) {

          egrule.lhs.follows.fastForEach(f => {
            if (f.isEpsilonRule()) return
            if (!_isInArray(f, egitem.follows)) {
              changed++
              egitem.follows.push(f)
            }
          })
        } else {
          let firsts = egrule.rhs[index + 1].firsts

          let hasEpsilon = false
          firsts.fastForEach(f => {
            if (f.isEpsilonRule()) {
              hasEpsilon = true
            } else if (!_isInArray(f, egitem.follows)) {
              changed++
              egitem.follows.push(f)
            }
          })

          if (hasEpsilon) {
            egrule.lhs.follows.fastForEach(f => {
              if (!_isInArray(f, egitem.follows)) {
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
      this._egitems.fastForEach(egitem => {
        changed += follow(egitem)
      })
    } while (changed > 0)
  }

  // based on the follow sets and the extended grammar items, calculates the
  // action/goto table elements. merges the mergable items of the extended
  // grammar
  _calculateActionsAndGotos() {
    this._itemSets.fastForEach(set => {
      set._actions = []
      set._gotos = []

      set.translationTable.fastForEach(t => {
        if (t.input instanceof Parser.BNFRule
            && t.input.tokenClass === undefined) {
          if (!set._gotos.fastSome(g => g.input === t.input)) {
            set._gotos.push(new Parser._Goto(t.input, t.set))
          }
        } else {
          set._actions.push(new Parser._Shift(t.input, t.set))
        }
      })

      if (set.items.fastSome(item => {
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

    this._egrules.fastForEach(mr => {
      mr.lhs.follows.fastForEach(follow => {
        if (mr.getFinalSet() !== undefined) {
          let rulz = mr.getFinalSet().items.fastFilter(item => {
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

          if (rulz.length !== 0) {
            rulz.fastForEach(rul => {
              if (rul.rule.name === "#S") return
              let m = rul.dot
              let sr = rul.rule.subrules[rul.i][m - 1]
              while (sr && sr.isEpsilonRule()) {
                m--
                sr = rul.rule.subrules[rul.i][m - 1]
              }

              const f = m === 0 ? rul.rule.hash()
                : this._getEpsilonSPPFIndexForRHS(rul.rule.subrules[rul.i], m)

              let reduce = new Parser._Reduce(follow, rul.rule, rul.i, m, f)
              if (!mr.getFinalSet()._actions.fastSome(a => a.equals(reduce)))
                mr.getFinalSet()._actions.push(reduce)
            })
          }
        }
      })
    })
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

    node.itemSet._actions.fastForEach(action => {
      if (action.input.value !== undefined) {
        if (action.input.value === input[inputIndex - 1].value)
          actions.push(action)
      } else if (action.input.tokenClass !== undefined) {
        if (action.input.tokenClass === input[inputIndex - 1].tokenClass ||
            action.input.tokenClass === input[inputIndex - 1].class) {
          actions.push(action)
        }
      }
    })

    return actions
  }

  _pathsOfLengthFromNode(node, n, paths = [[node]]) {
    if (n >= 1) {
      return [].concat.apply([], node.arcs.fastMap(neighbour => {
        return [].concat.apply([], paths.fastMap(path => {
          return this._pathsOfLengthFromNode(
            neighbour, n - 1, [path.concat(neighbour)])
        }))
      })).fastFilter((item, i, array) => {
        return !array.fastFind((item2, i2) => {
          return i !== i2 && i > i2 && !item.fastFind((x, m) => {
            return item2[m] !== x
          })
        })
      })
    } else {
      return paths
    }
  }

  // parses the code into an AST
  parse(code) {
    const EPSILON_HASH = (new Parser.BNFTerminal('')).hash()
    const EPSILON = this._getEpsilonSPPFRoot(EPSILON_HASH)
    let SPPFroot = null
    let recognized = false

    if (code.length === 0) {
      if (this._itemSets[0]._actions.fastSome(
        a => a instanceof Parser._Accept && a.input.name === 'Token-EOF'
      )) {
        recognized = true
        SPPFroot = this._getEpsilonSPPFRoot(this._findRule('#S').hash())
      }
    } else {
      const starter = new Parser._GraphStackNode(this._itemSets[0])
      code = this._addEOFToInput(code)
      let U = [[starter]]
      for (let i = 0; i < code.length; i++)
        U.push([])
      let R = []
      let Q = []
      const actions = this._actionsForNode(starter, code, 1)
      actions.fastForEach(action => {
        if (action instanceof Parser._Shift) {
          Q.push({ node: starter, action })
        } else if (action instanceof Parser._Reduce && action.m === 0) {
          R.push({ node: starter, action, f: action.f, y: EPSILON })
        }
      })

      try {
        let length = code.length
        let inputIndex = 0
        for (; inputIndex < length && U[inputIndex].length > 0; inputIndex++) {
          let N = []
          while (R.length > 0) { // Reducer
            let { node, action, f, y } = R.pop()
            let m = action.m > 0 ? action.m - 1 : 0

            let ym
            if (action.m !== 0) ym = y
            let paths = this._pathsOfLengthFromNode(node, m)
            paths.fastForEach(path => {
              let edgeLabels = path.reduce((acc, x, i) => {
                const label = x.arcLabels[x.arcs.indexOf(path[i + 1])]
                return label ? acc.concat(label) : acc
              }, []).reverse().concat(ym).filter(l => !!l)

              let z
              let x = path[path.length - 1]

              let pl = x.itemSet._gotos.fastFind(
                goto => goto.input.equals(action.rule)
              )

              if (action.m === 0) {
                z = this._getEpsilonSPPFRoot(f)
              } else {
                const c = U.fastFindIndex(Uc => {
                  return Uc.indexOf(x) >= 0
                })

                z = N.fastFind(n => {
                  return n.item === action.rule && n.j === c
                })
                if (!z) {
                  z = new Parser._SPPFSymbolNode(action.rule, action.i, c)
                  N.push(z)
                }
              }

              if (pl) {
                let w = U[inputIndex].fastFind(u => u.itemSet === pl.to)
                if (w) {
                  if (w.arcs.indexOf(x) < 0) {
                    w.arcs.push(x)
                    w.arcLabels.push(z)
                    if (action.m > 0) {
                      this._actionsForNode(
                        w, code, inputIndex + 1
                      ).fastForEach(act => {
                        if (act instanceof Parser._Reduce && act.m > 0)
                          R.push({ node: x, action: act, f: act.f, y: z })
                      })
                    }
                  }
                } else {
                  w = new Parser._GraphStackNode(pl.to)
                  U[inputIndex].push(w)
                  w.arcs.push(x)
                  w.arcLabels.push(z)
                  const nextActions = this._actionsForNode(
                    w, code, inputIndex + 1
                  )

                  nextActions.fastForEach(act => {
                    if (act instanceof Parser._Shift) {
                      Q.push({ node: w, action: act })
                    } else if (act instanceof Parser._Reduce) {
                      if (act.m === 0) {
                        R.push({ node: w, action: act, f: act.f, y: EPSILON })
                      } else if (action.m !== 0) {
                        R.push({ node: x, action: act, f: act.f, y: z })
                      }
                    }
                  })
                }
              }

              // Add children
              if (action.m !== 0) {
                let alfa = edgeLabels
                if (f !== EPSILON_HASH)
                  alfa = alfa.concat(this._getEpsilonSPPFRoot(f))
                if (!z.packs(alfa)) {
                  const alfaPacker = z.arcs.find(arc => {
                    if (arc instanceof Parser._SPPFPackedNode) {
                      return arc.packs(alfa)
                    }
                    return false
                  })

                  if (!alfaPacker) {
                    if (z.arcs.length === 0) {
                      alfa.fastForEach(a => { z.arcs.push(a) })
                    } else {
                      if (!z.arcs.find(
                          a => a instanceof Parser._SPPFPackedNode)) {
                        const packing = new Parser._SPPFPackedNode()
                        packing.arcs = z.arcs
                        z.arcs = [packing]
                      }

                      const packing = new Parser._SPPFPackedNode()
                      z.arcs.push(packing)
                      alfa.fastForEach(a => { packing.arcs.push(a) })
                    }
                  }
                }
              }
            })
          }

          // Shifter
          if (inputIndex !== code.length - 1) {
            let Qn = []

            let z = new Parser._SPPFTerminalNode(code[inputIndex], inputIndex)
            while (Q.length > 0) {
              let { node, action } = Q.pop()

              let w = U[inputIndex + 1].fastFind(
                u => u.itemSet === action._itemSet)
              if (w) {
                w.arcs.push(node)
                w.arcLabels.push(z)
                this._actionsForNode(
                  w, code, inputIndex + 2
                ).fastForEach(act => {
                  if (act instanceof Parser._Reduce && act.m > 0)
                    R.push({ node, action: act, f: act.f, y: z })
                })
              } else {
                w = new Parser._GraphStackNode(action._itemSet)
                U[inputIndex + 1].push(w)
                w.arcs.push(node)
                w.arcLabels.push(z)

                const nextActions = this._actionsForNode(
                  w, code, inputIndex + 2
                )

                nextActions.fastForEach(act => {
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

        const accepts = U[code.length - 1].fastFind(u => u.canAccept)
        if (accepts) {
          recognized = true
          SPPFroot =
            accepts.arcLabels[accepts.arcs.findIndex(arc => arc === starter)]
        }

      } catch (e) {
        console.log(e)
      }
    }

    // console.log(recognized)
    // console.log(SPPFroot)
    // console.log(SPPFroot.arcs)
    //
    // let index = 0
    // const sppfprint = (root, prefix = '') => {
    //   const i = index++
    //   prefix = prefix + '.' + index
    //   console.log(prefix, root.item ? root.item.name || root.item.value || root.item : 'Packed', root.j)
    //   if (root.arcs) {
    //     root.arcs.forEach(arc => sppfprint(arc, prefix))
    //   }
    // }
    // sppfprint(SPPFroot)

    return recognized ? SPPFroot : false
  }
}

Parser._SPPFNode = class {
  constructor(j, hash = undefined) {
    this.arcs = []
    this.j = j
    this.hash = hash || generateId()
  }

  packs(alfa) {
    return alfa.length === this.arcs.length && alfa.reduce((a, x, i) => {
      const y = this.arcs[i]
      return a && x.item === y.item && x.j === y.j
    }, true)
  }
  
  asOperator() {
    return null
  }
  
  _copyArcs(decisions, other) {
    other.arcs = this.arcs.fastMap(arc => arc.clone(decisions))
    
    if (decisions[other.hash] !== undefined)
      other.arcs = other.arcs[decisions[other.hash]].arcs
    
    return other
  }
  
  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.j, this.hash))
  }
}

Parser._SPPFPackedNode = class extends Parser._SPPFNode {
  constructor() {
    super(null)
  }
}

Parser._SPPFSymbolNode = class extends Parser._SPPFNode {
  constructor(symbol, sub, j, hash = undefined) {
    super(j, hash)
    this.subruleIndex = sub
    this.item = symbol
  }
  
  asOperator() {
    if (this.subruleIndex === null) 
      return null
    
    const subrules = this.item.subrules[this.subruleIndex]
    if (subrules.length === 1 && subrules[0].isOperator())
      return subrules[0]

    return null
  }
  
  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.item, this.subruleIndex, this.j, this.hash))
  }
}

Parser._SPPFRNPNode = class extends Parser._SPPFSymbolNode {
  constructor(nullableParts, j) {
    super(nullableParts, j)
  }
}

Parser._SPPFTerminalNode = class extends Parser._SPPFNode {
  constructor(terminal, j, hash = undefined) {
    super(j, hash)
    this.item = terminal
  }
  
  clone(decisions = {}) {
    return this._copyArcs(decisions, new this.constructor(
      this.item, this.j, this.hash))
  }
}

Parser._SPPFEpsilonNode = class extends Parser._SPPFTerminalNode {
  constructor() {
    super(new Parser.BNFTerminal(''), null)
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
    return other instanceof Parser._Accept && super.equals(other)
  }
}

// reduce action
Parser._Reduce = class _Reduce extends Parser._Action {
  constructor(input, rule, i, m, f) {
    super(input)
    this.rule = rule
    this.i = i
    this.m = m
    this.f = f
  }

  equals(other) {
    return other instanceof Parser._Reduce
      && other.rule === this.rule
      && other.i === this.i
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
    return super.equals(other) && other instanceof Parser._Goto
      && other.to === this.to
  }
}

Parser._ExtendedGrammarRule = class {
  constructor(lhs, rhs, i) {
    this.lhs = lhs
    this.rhs = rhs
    this.i = i
  }

  isMergeableWith(egr) {
    if (egr.lhs.rule.equals(this.lhs.rule)
        && egr.getFinalSet() === this.getFinalSet()) {
      return true
    } else {
      return false
    }
  }

  getFinalSet() {
    return this.rhs[this.rhs.length - 1].to
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
    return this.items.fastFind(i => {
      let epsilonLength = 0
      let rhs = i.rule.subrules[i.i]
      while (rhs[epsilonLength] && rhs[epsilonLength].isEpsilonRule()) {
        epsilonLength++
      }

      return i.rule.equals(rule) && i.dot <= epsilonLength
    }) !== undefined
  }

  getAfterDotSet() {
    let afterdot = []
    this.items.fastForEach(item => {
      afterdot.push(item.getRuleAferDot())
    })
    return [...new BNFSet(afterdot)]
  }

  createItemsWithDotBefore(rule) {
    let dotbefore = []
    this.items.fastForEach(item => {
      if (item.getRuleAferDot() === rule) {
        dotbefore.push(new Parser._LR0Item(item.rule, item.i, item.dot + 1))
      }
    })
    return dotbefore
  }

  expand(rules) {
    let pushed = 0
    this.items.fastForEach(item => {
      let afterdot = item.getRuleAferDot()
      if (afterdot !== undefined
          && afterdot instanceof Parser.BNFRule
          && !this.isIncluded(afterdot)) {
        afterdot.subrules.fastForEach((sr, index) => {
          this.items.push(new Parser._LR0Item(afterdot, index, 0))
          pushed ++
        })
      }
    })

    if (pushed > 0) this.expand(rules)
    this.items.fastForEach(item => item.check())
  }

  get canAccept() {
    return this._actions.fastSome(action => action instanceof Parser._Accept)
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
    return md5(this.name)
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
    return md5(this.value)
  }
}

class BNFSet {
  constructor(bnfarray) {
    let uniq = {}
    bnfarray.fastFilter(item => item !== undefined).fastForEach(bnf => {
      if (uniq[bnf.id()] === undefined) {
        uniq[bnf.id()] = [bnf]
      } else if(!uniq[bnf.id()].fastSome(b => b.equals(bnf))) {
        uniq[bnf.id()].push(bnf)
      }
    })
    this.array = [].concat.apply([], Object.values(uniq))
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
