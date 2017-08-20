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

Array.prototype.fastSome = function(fn) {
  let results = []
  let array = this
  let length = this.length
  
  for (let i = 0; i < length; i++) {
    if (fn(array[i], i, array)) return true
  }
  
  return false
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
    if (x instanceof Parser.BNFTerminal) return y.value === x.value
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
    if (bnf !== undefined)
      this.fromBNF(bnf)
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
              rules[rules.length - 1].push(
                new Parser.BNFTerminal(text.substring(last + 1, i))
              )
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
    this._rules = splitAndMerge(withoutCommentLines).map(definition => {
      let m = definition.replace(/\s+/g, " ").match(/^<(.+)> ::= (.+)$/i)
      if (!m[1].match(/^[a-z]+[a-z0-9-]*$/i))
        throw Error('Invalid BNF')
      return new Parser.BNFRule(m[1], separate(m[2]))
    }).concat(this._parent.lexer._classes.map(c => {
      return new Parser.BNFRule('Token-' + c.name, c)
    }))
    // add special starter rule for grammar
    this._rules.unshift(new Parser.BNFRule('#S', [[this._rules[0].name]]))
    
    // match the rule names to the rule references in the subrule lists
    this._rules = this._rules.map(rule => {
      rule.subrules = rule.subrules.map(subruleSequence => {
        return subruleSequence.map(name => {
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
    
    this._findItemSets()
    this._findExtendedGrammar()
    this._calculateFirsts()
    this._calculateFollows()
    this._calculateActionsAndGotos()

    let profile = profiler.stopProfiling()
    profile.export(function(error, result) {
      fs.writeFileSync('profile.cpuprofile', result)
      profile.delete();
    })
  }
  
  _findRule(name) {
    return this._rules.find(r => { return r.name === name })
  }
  
  // finds the canonical collection of LR(0) items and the 
  // translation table elements
  _findItemSets() {
    let isItemSetStarter = (item) => {
      return this._itemSets.fastSome(set => {
        return set.items[0].equals(item)
      })
    }
    
    let getItemSetForItem = (item) => {
      let ret = undefined
      
      this._itemSets.fastSome(set => {
        set.items.fastSome(i => {
          if (i.equals(item)) {
            ret = set
            return true
          }
        })
      })
      
      return ret
    }
    
    let start = new Parser._LR0Item(this._findRule('#S'), 0, 0)
    this._itemSets = [new Parser._LR0ItemSet(start, this._rules)]
    
    let index = 0
    while (true) {
      this._itemSets[index].getAfterDotSet().fastForEach(ad => {
        let itemsBefore = this._itemSets[index].createItemsWithDotBefore(ad)
        
        if (!itemsBefore.fastSome(i => isItemSetStarter(i))) {
          this._itemSets.push(new Parser._LR0ItemSet(
            itemsBefore, 
            this._rules
          ))
        }
      })
      index++
      if (index >= this._itemSets.length) break
    }
    
    this._itemSets.fastForEach(set => {
      set.getAfterDotSet().fastForEach(ad => {
        let sets = []
        set.createItemsWithDotBefore(ad).fastForEach(idb => {
          sets.push(getItemSetForItem(idb))
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
      let existing = this._egitems.find(egi => {
        return egi.equals(item)
      })
      
      if (!existing) {
        this._egitems.push(item)
        return item
      }
      return existing
    }
    
    let findFromTo = (set, input) => {
      if (set === undefined) throw Error('ambiguous grammar')
      let from = set
      let ts = set.translationTable.fastFilter(t => {
        return t.input === input
      })
      
      if (ts.length === 0) {
        return [{
          from: set,
          to: undefined
        }]
      } else {
        return ts.map(t => {
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
              return true
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
              break;
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
            if (!_isInArray(f, egitem.follows)) {
              changed++
              egitem.follows.push(f)
            }
          })
        } else {
          let firsts = egrule.rhs[index + 1].firsts
          
          let hasEpsilon = false
          firsts.fastForEach(f => {
            if (!_isInArray(f, egitem.follows)) {
              changed++
              egitem.follows.push(f)
            }
            if (f.isEpsilonRule()) {
              hasEpsilon = true
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
        let similar = this._egrules.fastFilter(r => {
          return egr.isMergeableWith(r)
        })
        
        if (!mergedRules.fastSome(mr => {
          return mr.rule === similar[0].lhs.rule 
              && mr.finalSet === similar[0].getFinalSet()
        })) {
          mergedRules.push({
            rule: similar[0].lhs.rule,
            i: similar[0].i,
            follows: [...new Set([].concat.apply([], similar.map(s => { 
              return s.lhs.follows 
            })))],
            finalSet: similar[0].getFinalSet()
          })
        }
      })
      
      return mergedRules
    }
    
    this._itemSets.fastForEach(set => {
      set._actions = []
      set._gotos = []
      
      set.translationTable.fastForEach(t => { 
        if (t.input instanceof Parser.BNFRule 
            && t.input.tokenClass === undefined) {
          set._gotos.push(new Parser._Goto(t.input, t.set))
        } else {
          set._actions.push(new Parser._Shift(t.input, t.set))
        }
      })
      
      if (set.items.fastSome(item => {
        if (item.rule.name === '#S'
            && item.dot === item.rule.subrules.length) {
          return true
        }
      })) {
        set._actions.push(new Parser._Accept(this._findRule('Token-EOF')))
      }
    })
    
    mergeEGRules().fastForEach(mr => {
      mr.follows.fastForEach(f => {
        if (mr.finalSet !== undefined) {
          let action = mr.finalSet._actions.find(a => {
            return a.input === f
          })
          
          if (action === undefined)
            mr.finalSet._actions.push(new Parser._Reduce(f, mr.rule, mr.i))
          else {
            if (action instanceof Parser._Reduce)
              throw Error("reduce-reduce conflict")
            else if (!(action instanceof Parser._Accept)) {
              mr.finalSet._actions.push(new Parser._Reduce(f, mr.rule, mr.i))
            }
          }  
        }
      })
    })
  }
  
  // parses the code into an AST
  parse(code) {  
    let determineWhatToDo = () => {
      let stack = this._state.stack
      
      let action = stack._actions.find(a => {
        if (a.input.value !== undefined) {
          let equals = !a.input.value.split('').fastSome((c, i) => {
            return c !== this._state.input[i].value
          })
          
          if (equals && a.input.value.length > 0) return a
        } else if (a.input.tokenClass !== undefined) {
          if (a.input.tokenClass === this._state.input[0].tokenClass)
            return a
          if (a.input.tokenClass === this._state.input[0].class)
            return a
        }
      })
      
      if (action === undefined) {
        action = stack._actions.find(a => {
          if (a.input.value !== undefined) {
            if (a.input.value.length === 0)
              return a
          }
        })
      }
      
      if (action === undefined) {
        if (this._state.input[0].tokenClass instanceof Lexer.EOFTokenClass) {
          throw new Parser.SyntaxError(
            'Unexpected end of input', 
            this._state.input[0].position, 
            this._state.input[0]
          )
        }
        
        throw new Parser.SyntaxError(
          'Unexpected input "' + this._state.input[0].value + '"', 
          this._state.input[0].position, 
          this._state.input[0]
        )
      }
      
      return action
    }

    this._state = new Parser._StateTree(this, code, this._itemSets[0])
    
    try {
      while(determineWhatToDo().execute(this)) {
        // skip empty lines
        while (this._state.input[0].class instanceof Lexer.EOLTokenClass) {
          this._state.input.shift()
        }
      }
    } catch (e) {
      if (this._state.index > code.length)
        throw new Parser.SyntaxError('Unexpected end of file')
      throw e
    }
    
    this._state.nodes.fastForEach(o => {
      o.reduce()
    })
    
    return this._state.nodes
  }
}

Parser._StateTree = class {
  constructor(parser, input, rootSet) {    
    let EOF = parser._findRule('Token-EOF')
    EOF.position = input[input.length - 1].position
    EOF.position.char += input[input.length - 1].value.length
    
    this.input = input.concat([EOF])
    this.index = 0
    this.nodes = []
    
    this.root = new Parser._StateTreeNode(rootSet, null)
    this.stack = this.root
  }
  
  push(itemSet) {
    let newTop = new Parser._StateTreeNode(itemSet, this.stack)
    this.stack.addChild(newTop)
    this.stack = newTop
  }
  
  pop(num) {
    for (let i = 0; i < num; i++) {
      this.stack.parent.removeChild(this.stack)
      this.stack = this.stack.parent
    }
    this.stack.children = []
  }
}

Parser._StateTreeNode = class {
  constructor(itemSet, parent) {
    this.itemSet = itemSet
    this.parent = parent
    this.children = []
  }
  
  get _gotos() {
    return this.itemSet._gotos
  }
  
  get _actions() {
    return this.itemSet._actions
  }
  
  addChild(child) {
    this.children.push(child)
    
    return this
  }
  
  removeChild(child) {
    let index = this.children.indexOf(child)
    this.children.splice(index, 1)
    
    return this
  }
}

// parse tree and AST node
Parser.Node = class {
  constructor(rule, children, i = 0) {
    this.rule = rule
    this.ruleHierarchy = [rule]
    this.i = i
    this.children = children
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
  
  execute(parser) {}
}

// accept action, marks success
Parser._Accept = class extends Parser._Action {
  constructor(input) {
    super(input)
  }
  
  execute(parser) {
    return false
  }
}

// reduce action
Parser._Reduce = class extends Parser._Action {
  constructor(input, rule, i) {
    super(input)
    this.rule = rule
    this.i = i
  }
  
  execute(parser) {
    let num = this.rule.subrules[this.i].length
    parser._state.pop(num)
      
    let d = parser._state.nodes.splice(
      parser._state.nodes.length - num, 
      parser._state.nodes.length)
    
    let newNode = new Parser.Node(this.rule, d, this.i)
    parser._state.nodes.push(newNode)

    let goto = parser._state.stack._gotos.find(
      g => {
        return g.input === this.rule
      }
    )
    
    if (goto === undefined) {
      throw new Parser.SyntaxError('Unexpected token "' + 
        (parser._state.input[0].name || parser._state.input[0].value) + '"',
        parser._state.input[0].position
      )
    }
    return goto.execute(parser)
  }
}

// shift action
Parser._Shift = class extends Parser._Action {
  constructor(input, itemSet) {
    super(input)
    this._itemSet = itemSet
  }
  
  execute(parser) {
    parser._state.push(this._itemSet)
    if (this.input.value === undefined || this.input.value.length === 1) {
      parser._state.index++
      parser._state.nodes.push(new Parser.Node(parser._state.input.shift(), []))
    } else {
      let val = ''
      let position = parser._state.input[0].position
      this.input.value.split('').fastForEach(c => {
        parser._state.index++
        val += parser._state.input.shift().value
      })
      parser._state.nodes.push(new Parser.Node({
        skipped: 0,
        value: val,
        position,
        class: {
          name: null
        }
      }, []))
    }
    return true
  }
}

// goto element of the action/goto table
Parser._Goto = class extends Parser._Action {
  constructor(input, to) {
    super(input)
    this.to = to
  }
  
  execute(parser) {
    parser._state.push(this.to)
    return true
  }
}

Parser._ExtendedGrammarRule = class {
  constructor(lhs, rhs, i) {
    this.lhs = lhs
    this.rhs = rhs
    this.i = i
  }
  
  isMergeableWith(egr) {
    if (egr.lhs.rule === this.lhs.rule 
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
        && this.rule === item.rule
  }
}

Parser._LR0ItemSet = class {
  constructor(starter, rules) {
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
    return this.items.find(i => { 
      return i.rule === rule && i.dot === 0 
    }) !== undefined
  }
  
  getAfterDotSet() {
    let afterdot = []
    this.items.fastForEach(item => {
      afterdot.push(item.getRuleAferDot())
    })
    
    return [...new Set(afterdot)].sort((a, b) => {
      if (a instanceof Parser.BNFTerminal) return -1
      if (b instanceof Parser.BNFTerminal) return 1
      return 0
    }).fastFilter(item => item !== undefined)
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
  
  equals(item) {
    return this.rule === item.rule 
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
  }
  
  isTerminalRule() {
    return this.tokenClass !== undefined
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