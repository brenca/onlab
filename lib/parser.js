const Lexer = require('./lexer');

Array.prototype.fastFilter = function(fn) {
  let results = []
  let array = this
  let length = this.length
  let item = null
  
  for (let i = 0; i < length; i++) {
    item = array[i]
    if (fn(item, i, array)) results.push(item)
  }

  return results
}

Array.prototype.fastMap = function(fn) {
  let results = []
  let array = this
  let length = this.length
  
  for (let i = 0; i < length; i++) {
    results.push(fn(array[i], i, array))
  }

  return results
}

Array.prototype.fastSome = function(fn) {
  let results = []
  let array = this
  let length = this.length
  
  for (let i = 0; i < length; i++) {
    if (fn(array[i], i, array)) return true
  }
  
  return false
}

Array.prototype.fastFind = function(fn) {
  let results = []
  let array = this
  let length = this.length
  
  for (let i = 0; i < length; i++) {
    if (fn(array[i], i, array)) return array[i]
  }
  
  return undefined
}

Array.prototype.fastForEach = function(fn, thisArg) {
  let array = this
  let length = this.length
  
  for (let i = 0; i < length; i++) {
    if (thisArg) {
      fn.call(thisArg, array[i], i, array)
    } else {
      fn(array[i], i, array)
    }
  }
  
  return this
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
    this._starters = '<"\''
    this._enders   = '>"\''
    this._rules = []
    this._disambiguators = {}
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
    const profiler = require('@risingstack/v8-profiler')
    const fs = require('fs')
    profiler.startProfiling('profile', true)
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
            case '<':
              let name = text.substring(last + 1, i)
              if (!name.match(/^[a-z]+[a-z0-9-]*$/i))
                throw Error('Invalid BNF')
              rules[rules.length - 1].push(name)
              break
            case '"': case '\'':
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
              break
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
    
    this._findItemSets()
    this._findExtendedGrammar()
    this._calculateFirsts()
    this._calculateFollows()
    this._calculateActionsAndGotos()
    
    // console.log('Item sets');
    // console.log('-----------------------------------');
    // this._itemSets.fastForEach(set => {
    //   console.log(`${set.id}:\n${set.items.fastMap(item => {
    //     return `${item.rule.name} -> ${item.rule.subrules[item.i].fastMap((sr, i) => {
    //       return (i === item.dot ? '.' : '') + (sr.name || `'${sr.value}'`)
    //     }).join(' ')} ${(item.rule.subrules[item.i].length === item.dot ? '.' : '')}`
    //   }).join('\n')}\n`)
    //   console.log(set._actions);
    //   console.log(set._gotos);
    //   console.log('-----------------------------------');
    // });

    let profile = profiler.stopProfiling()
    profile.export(function(error, result) {
      fs.writeFileSync('profile.cpuprofile', result)
      profile.delete();
    })
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
    let mergeEGRules = () => {
      let mergedRules = []
      
      this._egrules.fastForEach(egr => {
        mergedRules.push({
          rule: egr.lhs.rule,
          i: egr.i,
          firsts: egr.lhs.firsts,
          follows: egr.lhs.follows,
          finalSet: egr.getFinalSet()
        })
      })
      
      // this._egrules.fastForEach(egr => {
      //   let similar = this._egrules.fastFilter(r => {
      //     return egr.isMergeableWith(r)
      //   })
      //   
      //   if (!mergedRules.fastSome(mr => {
      //     return mr.rule === similar[0].lhs.rule 
      //         && mr.finalSet === similar[0].getFinalSet()
      //   })) {
      //     mergedRules.push({
      //       rule: similar[0].lhs.rule,
      //       i: similar[0].i,
      //       firsts: [...new BNFSet([].concat.apply([], similar.fastMap(s => {
      //         return s.lhs.firsts 
      //       })))],
      //       follows: [...new BNFSet([].concat.apply([], similar.fastMap(s => {
      //         return s.lhs.follows 
      //       })))],
      //       finalSet: similar[0].getFinalSet()
      //     })
      //   }
      // })
      
      return mergedRules
    }
    
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
    
    // this._egrules.fastForEach(mr => {
    //   let item = mr
    //   console.log(`${item.getFinalSet().id} : ${item.lhs.rule.name} -> ${item.lhs.rule.subrules[item.i].fastMap((sr, i) => {
    //     return (i === item.dot ? '.' : '') + (sr.name || `'${sr.value}'`)
    //   }).join(' ')} ${(item.lhs.rule.subrules[item.i].length === item.dot ? '.' : '')}`);
    //   console.log(mr.lhs.firsts.fastMap(rule => rule.name || rule.value));
    // })
    
    mergeEGRules().fastForEach(mr => {
      // let item = mr
      // console.log(`${item.finalSet.id} : ${item.rule.name} -> ${item.rule.subrules[item.i].fastMap((sr, i) => {
      //   return (i === item.dot ? '.' : '') + (sr.name || `'${sr.value}'`)
      // }).join(' ')} ${(item.rule.subrules[item.i].length === item.dot ? '.' : '')}`);
      // console.log(mr.nullable);
      // console.log(mr.firsts.fastMap(rule => rule.name || rule.value));
      // console.log(mr.follows.fastMap(rule => rule.name || rule.value));
      
      mr.follows.fastForEach(f => {
        if (mr.finalSet !== undefined) {
          let rulz = mr.finalSet.items.fastFilter(item => {
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
              let reduce = new Parser._Reduce(f, rul.rule, rul.i, m)
              if (!mr.finalSet._actions.fastSome(a => a.equals(reduce)))
                mr.finalSet._actions.push(reduce)
            })
          }
        }
      })
      
      // mr.follows.fastForEach(f => {
      //   if (mr.finalSet !== undefined) {
      //     let rul = mr.finalSet.items.fastSome(item => {
      //       return mr.rule.equals(item.rule) 
      //         && mr.i === item.i 
      //         && item.dot === item.rule.subrules[item.i].length
      //     })
      //     
      //     if (rul) {
      //       let reduce = new Parser._Reduce(f, mr.rule, mr.i)
      //       if (mr.rule.name === "#S") return
      //       if (!mr.finalSet._actions.fastSome(a => a.equals(reduce)))
      //         mr.finalSet._actions.push(reduce)
      //     }
      //   }
      // })
    })
    
    // console.log('---------------------------------------------');
    // console.log('Items');
    // this._egitems.fastForEach(egitem => {
    //   console.log(`${egitem.from.id} ${egitem.rule.name || egitem.rule.value} ${egitem.to ? egitem.to.id : '$'}`);
    //   console.log('Firsts:  ', egitem.firsts.fastMap(item => item.name || item.value));
    //   console.log('Follows: ', egitem.follows.fastMap(item => item.name || item.value));
    //   console.log('---------------------------------------------');
    // })
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
  
  // _actionsForNode(node, input) {
  //   let inputIndex = node.inputIndex
  //   let actions = {
  //     reduce: {
  //       normal: [],
  //       epsilon: [],
  //       eof: []
  //     },
  //     shift: {
  //       normal: [],
  //       epsilon: [],
  //       eof: []
  //     },
  //     accept: {
  //       normal: [],
  //       epsilon: [],
  //       eof: []
  //     }
  //   }
  //   
  //   const categorize = a => {
  //     let type = a.input.isEpsilonRule() ? 'epsilon' : 'normal'
  //     if (a.input === this._findRule('Token-EOF')) type = 'eof'
  //     if (a instanceof Parser._Shift) {
  //       return actions.shift[type].push(a)
  //     } else if (a instanceof Parser._Reduce) {
  //       return actions.reduce[type].push(a)
  //     } else {
  //       return actions.accept[type].push(a)
  //     }
  //   }
  //   
  //   node.itemSet._actions.fastForEach(action => {
  //     if (action.input.value !== undefined) {
  //       let equals = !action.input.value.split('').fastSome((c, i) => {
  //         return !input[inputIndex + i] || c !== input[inputIndex + i].value
  //       })
  //       
  //       if (equals) categorize(action)
  //     } else if (action.input.tokenClass !== undefined) {
  //       if (input[inputIndex] && 
  //           (action.input.tokenClass === input[inputIndex].tokenClass ||
  //           action.input.tokenClass === input[inputIndex].class)) {
  //         categorize(action)
  //       }
  //     }
  //   })
  //   
  //   const hasEpsilonRules = 
  //     Object.values(actions).reduce((a,b) => a + b.epsilon.length, 0) > 0
  //   
  //   actions.shift = actions.shift.normal.concat(actions.shift.epsilon,
  //     hasEpsilonRules ? [] : actions.shift.eof)
  //   actions.reduce = actions.reduce.normal.concat(
  //     actions.reduce.epsilon.fastFilter(
  //       r1 => !actions.reduce.normal.fastSome(r2 => {
  //         return r1.rule === r2.rule && r1.i === r2.i
  //       })
  //     ), hasEpsilonRules ? [] : actions.reduce.eof
  //   )
  //   actions.accept = actions.accept.normal.concat(actions.accept.epsilon,
  //     hasEpsilonRules ? [] : actions.accept.eof)
  //   
  //   return actions.shift.concat(actions.reduce, actions.accept)
  // }
  
  _actionsForNode(node, input, inputIndex) {
    let actions = []
    // let inputIndex = node.inputIndex
    
    // console.log(this._nodeAtDistance(node, 1).fastMap(n => n.action));
    // console.log(node);
    // console.log('-+');
    // console.log(node.arcs);
    // console.log('-+-+-+-+');
    // let canReachSelf = false
    // this._nodeAtDistance(node, 2).fastForEach(n => {
    //   canReachSelf = canReachSelf || (n.action && node.action ? n.action.equals(node.action) && n.itemSet === node.itemSet : false)
    // })
    
    let testAction = (action) => {
      // console.log(action);
      // console.log(node.action);
      // console.log('-+');
      // console.log(node.arcs.fastMap(n => n.action));
      // if (!node.arcs.fastSome(arc => {
      //   return arc.action !== null && action.equals(arc.action)
      // })) {
        actions.push(action)
      // }
    }
    
    node.itemSet._actions.fastForEach(action => {
      if (action.input.value !== undefined) {
        if (action.input.value === input[inputIndex - 1].value) testAction(action)
      } else if (action.input.tokenClass !== undefined) {
        if (action.input.tokenClass === input[inputIndex - 1].tokenClass ||
            action.input.tokenClass === input[inputIndex - 1].class) {
          testAction(action)
        }
      }
    })
    
    // console.log(input[inputIndex - 1]);
    // console.log(node.itemSet._actions);
    // console.log('++++++++++++++++++++++');
    // console.log(actions);
    // console.log('----------------------');
    
    return actions
  }
  
  _nodeAtEndOfPathOfLength(node, n, seen = [node]) {
    if (n >= 1) {
      return [].concat.apply([], node.arcs.filter(
        arc => seen.indexOf(arc) < 0
      ).fastMap(neighbour => {
        return this._nodeAtEndOfPathOfLength(
          neighbour, n - 1, seen.concat(neighbour))
      }))
    } else {
      return seen
    }
  }
  
  _nodeAtDistance(node, n) {
    if (n > 1) {
      return [].concat.apply([], node.arcs.fastMap(neighbour => {
        return this._nodeAtDistance(neighbour, n - 1)
      }))
    } else if (n === 1) {
      return node.arcs
    } else {
      return [node]
    }
  }
  
  // parses the code into an AST
  parse(code) {
    let recognized = false
    
    if (code.length === 0) {
      if (this._itemSets[0]._actions.fastSome(
        a => a instanceof Parser._Accept && a.input.name === 'Token-EOF'
      )) {
        recognized = true
      }
    } else {
      const root = new Parser._GraphNode(this._itemSets[0])
      code = this._addEOFToInput(code)
      let U = [[root]]
      for (let i = 0; i < code.length; i++)
        U.push([])
      let R = []
      let Q = []
      const actions = this._actionsForNode(root, code, 1)
      actions.fastForEach(action => {
        if (action instanceof Parser._Shift) {
          Q.push({ node: root, action })
        } else if (action instanceof Parser._Reduce && action.m === 0) {
          R.push({ node: root, action })
        }
      })
      
      try {
        let length = code.length
        for (let inputIndex = 0; inputIndex < length && U[inputIndex].length > 0; inputIndex++) {
          // console.log('Rl: ', R.length);
          // console.log(R.fastMap(r => r.action));
          while (R.length > 0) { // Reducer
            let { node, action } = R.pop()
            let m = action.m > 0 ? action.m - 1 : 0
            let asd = this._nodeAtEndOfPathOfLength(node, m)
            let dsa = [...new Set(asd)]
            dsa.fastForEach(x => {
              let pl = x.itemSet._gotos.fastFind(
                goto => goto.input.equals(action.rule)
              )
              if (pl) {
                let w = U[inputIndex].fastFind(u => u.itemSet === pl.to)
                if (w) {
                  if (w.arcs.indexOf(x) < 0) {
                    w.arcs.push(x)
                    if (action.m > 0) {
                      this._actionsForNode(
                        w, code, inputIndex + 1
                      ).fastForEach(act => {
                        if (act instanceof Parser._Reduce && act.m > 0)
                          R.push({ node: x, action: act })
                      })
                    }
                  }
                } else {
                  w = new Parser._GraphNode(pl.to)
                  U[inputIndex].push(w)
                  w.arcs.push(x)
                  const nextActions = this._actionsForNode(
                    w, code, inputIndex + 1
                  )
                  
                  // let ph = nextActions.fastFind(
                  //   action => action instanceof Parser._Shift)
                  // if (ph) Q.push({ node: w, action: ph })
                  nextActions.fastForEach(act => {
                    if (act instanceof Parser._Shift) {
                      Q.push({ node: w, action: act })
                    } else if (act instanceof Parser._Reduce) {
                      if (act.m === 0) {
                        R.push({ node: w, action: act })
                      } else if (action.m > 0) {
                        R.push({ node: x, action: act })
                      }
                    }
                  })
                }
              } else {
                // if (action instanceof Parser._Accept)
                //   recognized = true
                // throw new Error('no goto')
              }
            })
          }
          
          // console.log('Ql: ', Q.length);
          // console.log(Q.fastMap(r => r.action));
          // Shifter
          if (inputIndex !== code.length - 1) {
            let Qn = []
            // console.log(Q.length);
            // console.log(Q);
            while (Q.length > 0) {
              let { node, action } = Q.pop()
              
              let w = U[inputIndex + 1].fastFind(u => u.itemSet === action._itemSet)
              if (w) {
                w.arcs.push(node)
                this._actionsForNode(
                  w, code, inputIndex + 2
                ).fastForEach(act => {
                  if (act instanceof Parser._Reduce && act.m > 0)
                    R.push({ node, action: act })
                })
              } else {
                w = new Parser._GraphNode(action._itemSet)
                U[inputIndex + 1].push(w)
                w.arcs.push(node)
                
                const nextActions = this._actionsForNode(
                  w, code, inputIndex + 2
                )
                // console.log(nextActions);
                
                // let ph = nextActions.fastFind(
                //   action => action instanceof Parser._Shift)
                // if (ph) Qn.push({ node: w, action: ph })
                nextActions.fastForEach(act => {
                  if (act instanceof Parser._Shift) {
                    Qn.push({ node: w, action: act })
                  } else if (act instanceof Parser._Reduce) {
                    if (act.m > 0) {
                      R.push({ node, action: act })
                    } else {
                      R.push({ node: w, action: act })
                    }
                  }
                })
              }
            }
            Q = Qn
          }
          // console.log(U[inputIndex + 1]);
        }
        // console.log(code.length);
        // console.log('U : ', U[code.length - 1].fastMap(u => u.itemSet._actions));
        
        if (U[code.length - 1].fastSome(u => {
          return u.itemSet._actions.fastSome(
            action => action instanceof Parser._Accept
          )
        })) {
          recognized = true
        }
        
      } catch (e) {
        console.log(e)
      }
    }
    
    console.log(recognized)
    return []
  }
}

Parser._GraphNode = class {
  constructor(itemSet = null, action = null, inputIndex = 0) {
    this.action = action
    this.itemSet = itemSet
    this.arcs = []
    this.inputIndex = inputIndex
  }
  
  get accepted() {
    return this.action && this.action instanceof Parser._Accept
  }
}

Parser._InputGraphNode = class extends Parser._GraphNode {
  constructor(value = '', position = 0, index) {
    super(null, null, index)
    this.value = value
    this.position = position
  }
}


// parse tree and AST node
Parser.Node = class {
  constructor(rule, children, i = 0) {
    this.rule = rule
    this.ruleHierarchy = [rule]
    this.i = i
    this.children = children
    this.children.fastForEach(child => { child.parent = this })
  }
  
  reducedChildren() {
    return this.children.fastFilter(c => {
      return c.rule instanceof Parser.BNFRule
    })
  }
  
  get position() {
    if (this.rule.position) {
      return this.rule.position
    } else {
      return this.children[0].position
    }
  }
  
  reduce() {
    while (this.children.length === 1) {
      this.rule = this.children[0].rule
      this.ruleHierarchy.push(this.rule)
      this.children = this.children[0].children
    }
    
    this.children.fastForEach(c => {
      c.reduce()
    })
    
    this.children = this.children.fastFilter(c => {
      return c.rule.value === undefined || c.rule.value.length > 0
    })
  }
}

// element of the action/goto table
Parser._Action = class {
  constructor(input) {
    this.input = input
  }
  
  execute(stack) {}
  
  equals(other) {
    return other.input.equals(this.input)
  }
}

// accept action, marks success
Parser._Accept = class _Accept extends Parser._Action {
  constructor(input) {
    super(input)
  }
  
  execute(stack) {
    return [false]
  }
  
  equals(other) {
    return other instanceof Parser._Accept && super.equals(other)
  }
}

// reduce action
Parser._Reduce = class _Reduce extends Parser._Action {
  constructor(input, rule, i, m) {
    super(input)
    this.rule = rule
    this.i = i
    this.m = m
  }
  
  execute(stackTop) {
    let num = this.rule.subrules[this.i].length
    let inputIndex = stackTop.inputIndex
    let { nodes, stack } = stackTop.pop(num)

    let gotos = stack._gotos.fastFilter(
      g => {
        return g.input.equals(this.rule) && stack.itemSet !== g.to
      }
    )
    
    // console.log(stack.itemSet);
    // console.log('----gotos-----');
    // console.log(gotos);
    
    if (gotos.length === 0) {
      throw new Parser.SyntaxError('Unexpected token "' + 
        (stack.getInput().name || stack.getInput().value) + '"',
        stack.getInput().position
      )
    }
    
    return gotos[0].execute(
      stack, new Parser.Node(this.rule, nodes, this.i), inputIndex)
    
    return [].concat.apply([], gotos.fastMap(
      goto => goto.execute(
        stack, new Parser.Node(this.rule, nodes, this.i), inputIndex)
      )
    )
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
  
  execute(input, inputIndex) {
    if (this.input.value === undefined || this.input.value.length === 1) {
      return {
        value: input[inputIndex].value,
        position: input[inputIndex].position
      }
    } else if (this.input.isEpsilonRule()) {
      let position = input[inputIndex] ? input[inputIndex].position : 0
      return {
        value: this.input.value,
        position
      }
    } else {
      let val = ''
      let position = input[inputIndex] ? input[inputIndex].position : 0
      let i = 0
      this.input.value.split('').fastForEach(() => {
        val += input[inputIndex] ? input[inputIndex + i].value : ''
        i++
      })
      return {
        value: val,
        position
      }
    }
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
  
  execute(stack, node, inputIndex) {
    let newTop = stack.push(this.to)
    newTop.inputIndex = inputIndex
    newTop.node = node
    return [newTop]
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
  
  id() {
    return `BNFTerminal_${this.value}`
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