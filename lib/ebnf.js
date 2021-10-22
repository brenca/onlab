const Lexer = require('./lexer')
const crypto = require('crypto')
const uuid = require('uuid/v4')
const fast = require('./faster')
const { Serializable } = require('./serializable')

const State = {
  LHS: 1,
  RHS: 2,
  GROUP: 3
}

const BNF = require('./bnf.js')
const EBNF = { }
const RegExpMatcher = /\/([^\/]+)\/([a-z]*)/iu

EBNF.parse = function(ebnf, parent) {
  const EBNFLexer = new Lexer()
  EBNFLexer.addTokenClasses([
    new Lexer.TokenClass('comment', /\/\/.*(\n|$)/iu),
    new Lexer.TokenClass('rule-name', /[a-z]+[a-z0-9_\-]*/iu),
    new Lexer.TokenClass('string-literal', /"[^"]*"/iu),
    new Lexer.TokenClass('string-literal', /'[^']*'/iu),
    new Lexer.TokenClass('regexp', RegExpMatcher),
    new Lexer.TokenClass('declarator', /=/iu),
    new Lexer.TokenClass('group-start', /\(/iu),
    new Lexer.TokenClass('group-end', /\)/iu),
    new Lexer.TokenClass('modifier', /[\?\+\*]/iu),
    // new Lexer.TokenClass('associativity', /=(left|right)=/iu),
    // new Lexer.TokenClass('precedence', /\+[0-9]+\+/iu),
    new Lexer.TokenClass('separator', /\|/iu),
  ])

  class EBNFRuleReference {
    constructor(name, type) {
      this.name = name
      this.type = type
    }
  }

  const EBNFRuleList = []
  class EBNFRule {
    constructor(name) {
      this.name = name
      this.subrules = [[]]
      EBNFRuleList.push(this)
    }

    newSubrules() {
      this.subrules.push([])
    }

    currentSubrules() {
      return this.subrules[this.subrules.length - 1]
    }

    addSubrule(rule) {
      this.currentSubrules().push(rule)
    }

    get lastSubrule() {
      const csr = this.currentSubrules()
      return csr[csr.length - 1]
    }

    set lastSubrule(rule) {
      const csr = this.currentSubrules()
      csr[csr.length - 1] = rule
    }

    getReference() {
      return new EBNFRuleReference(this.name, this.constructor.name)
    }
  }

  class EBNFGroup extends EBNFRule {
    constructor() {
      super(`[GROUP]-${uuid()}`)
    }
  }

  class EBNFModifiedRule extends EBNFRule {
    constructor(base, modifier) {
      switch (modifier) {
        case '?': {
          super(`[OPTIONAL]-${uuid()}`)
          this.addSubrule(base)
          this.newSubrules()
          this.addSubrule(new EBNFEpsilonTerminal())
        } break
        case '+': {
          super(`[LIST]-${uuid()}`)
          this.addSubrule(base)
          this.newSubrules()
          this.addSubrule(base)
          this.addSubrule(this.getReference())
        } break
        case '*': {
          const list = new EBNFModifiedRule(base, '+')
          return new EBNFModifiedRule(list.getReference(), '?')
        } break
      }
    }
  }

  class EBNFRegExp {
    constructor(regexp) {
      this.regexp = regexp
    }
  }

  class EBNFTerminal {
    constructor(value) {
      this.value = value
    }
  }

  class EBNFEpsilonTerminal extends EBNFTerminal {
    constructor() {
      super('')
    }
  }

  class EBNFTerminalRule extends EBNFRule {
    constructor(value) {
      const terminal = value.slice(1, -1)

      if (terminal.length === 1) {
        return new EBNFTerminal(terminal)
      } else {
        super(`[TERMINALS]-${uuid()}`)
        terminal.split('').forEach(char => {
          this.addSubrule(new EBNFTerminal(char))
        })
      }
    }
  }

  const stateStack = [ State.LHS ]
  const ruleStack = []

  const lastState = () => stateStack[stateStack.length - 1]
  const lastRule = () => ruleStack[ruleStack.length - 1]

  const tokenized = EBNFLexer.tokenize(ebnf)
  tokenized.tokens = tokenized.tokens.filter(
    token => token.class.name !== 'comment')

  let currentRule = null
  for (let i = 0; i < tokenized.tokens.length; i++) {
    const getToken = (j = 0) => tokenized.tokens[i + j]

    const isRuleStart = (x = 0) => {
      return getToken(x) && getToken(x).class.name === 'rule-name' &&
        getToken(x + 1) && getToken(x + 1).class.name === 'declarator'
    }

    const dealWithBasicStuff = () => {
      switch (getToken().class.name) {
        case 'rule-name': {
          lastRule().addSubrule(new EBNFRuleReference(getToken().value))
        } break
        case 'separator': {
          lastRule().newSubrules()
        } break
        case 'string-literal': {
          const terminal = new EBNFTerminalRule(getToken().value)
          if (terminal instanceof EBNFTerminalRule) {
            lastRule().addSubrule(terminal.getReference())
          } else {
            lastRule().addSubrule(terminal)
          }
        } break
        case 'regexp': {
          lastRule().addSubrule(new EBNFRegExp(getToken().value))
        } break
        case 'modifier': {
          if (lastRule().lastSubrule.type === 'EBNFModifiedRule') {
            throw new Error('Two modifiers = bad')
          } else {
            const modifiedRule = new EBNFModifiedRule(lastRule().lastSubrule,
              getToken().value)
            lastRule().lastSubrule = modifiedRule.getReference()
          }
        } break
        default:
          throw new Error('This should never happen')
      }
    }

    switch (lastState()) {
      case State.LHS: {

        if (isRuleStart()) {
          ruleStack.push(new EBNFRule(getToken().value))
          stateStack.push(State.RHS)
          i++
        }

      } break

      case State.RHS: {

        switch (getToken().class.name) {
          case 'group-start': {
            const newGroup = new EBNFGroup()
            lastRule().addSubrule(newGroup.getReference())
            ruleStack.push(newGroup)

            stateStack.push(State.GROUP)
          } break
          case 'group-end': {
            throw new Error('Invalid group end')
          } break
          default:
            dealWithBasicStuff()
        }

        if (isRuleStart(1)) {
          stateStack.pop()
        }

      } break

      case State.GROUP: {

        if (isRuleStart(1)) {
          throw new Error('Unterminated group')
        } else {
          switch (getToken().class.name) {
            case 'group-start': {
              stateStack.push(State.GROUP)
            } break
            case 'group-end': {
              stateStack.pop()
              ruleStack.pop()
            } break
            default:
              dealWithBasicStuff()
          }
        }

      } break
      default:

    }
  }

  const RULES = EBNFRuleList.map(rule => {
    return new BNF.Rule(rule.name, rule.subrules)
  }).concat(parent ? fast.map(parent.lexer.CLASSES, c => {
    return new BNF.Rule('Token-' + c.name, c)
  }) : [])

  const findRule = name => RULES.find(rule => rule.name === name)
  const regexpRules = []
  RULES.forEach(rule => {
    rule.subrules = rule.subrules.map(subruleList => {
      return subruleList.map(subrule => {
        if (subrule instanceof EBNFTerminal) {
          return new BNF.Terminal(subrule.value)
        } else if (subrule instanceof EBNFRegExp) {
          const regexpRule = new BNF.RegExp(subrule.regexp)
          regexpRules.push(regexpRule)
          return regexpRule
        } else if (subrule instanceof EBNFRuleReference) {
          const referenced = findRule(subrule.name)
          if (referenced) {
            return referenced
          } else {
            throw new Error(`Can't find that rule '${subrule.name}'`)
          }
        } else {
          console.log(subrule);
          throw new Error(`Internal parser error at BNF parsing`)
        }
      })
    })
  })

  const EOF = findRule('Token-EOF')
  EOF.nullable = true
  RULES.unshift(new BNF.Rule('#S',[[RULES[0], EOF]]))

  return RULES.concat(regexpRules)
}

module.exports = EBNF
