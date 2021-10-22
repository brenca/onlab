const Lexer = require('./lexer')
const crypto = require('crypto')
const uuid = require('uuid/v4')
const fast = require('./faster')
const { Serializable } = require('./serializable')

const BNF = { }
const RegExpMatcher = /\/([^\/]+)\/([a-z]*)/iu

BNF.parse = function(bnf, parent) {
  const BNFLexer = new Lexer()
  BNFLexer.addTokenClasses([
    new Lexer.TokenClass('comment', /\/\/.*(\n|$)/iu),
    new Lexer.TokenClass('rule-name', /<[a-z]+[a-z0-9-]*>/iu),
    new Lexer.TokenClass('rule-decl', /::=/iu),
    new Lexer.TokenClass('string', /"[^"]*"/iu),
    new Lexer.TokenClass('string', /'[^']*'/iu),
    new Lexer.TokenClass('regexp', RegExpMatcher),
    new Lexer.TokenClass('associativity', /=(left|right)=/iu),
    new Lexer.TokenClass('precedence', /\+[0-9]+\+/iu),
    new Lexer.TokenClass('separator', /\|/iu),
  ])

  const parseToken = (token) => {
    switch (token.class.name) {
      case 'rule-name':
      case 'string':
      case 'associativity':
      case 'precedence': {
        return token.value.slice(1, -1)
      } break
      case 'separator': {
        return token.value
      } break
    }
  }

  class RuleReference extends Serializable {
    constructor(token) {
      super()
      this.token = token
    }

    serialize() {
      return {
        token: this.token
      }
    }

    deserialize(object) {
      this.token = object.$data.token
    }

    get name() {
      return parseToken(this.token)
    }
  }
  Serializable.registerSubclass(RuleReference)

  const tokenized = BNFLexer.tokenize(bnf)
  if (!tokenized.success) {
    const rest = tokenized.rest.value.match(/^(.*)(\n|$)/i)[1]
    const code = rest.substr(0, 10)

    throw new Error(`${
      tokenized.rest.position.line
    }:${
      tokenized.rest.position.char
    } Could not parse BNF definition near '${
      code.length === 10 ? `${code}...` : code
    }'`)
  } else {
    const throwTokenError = (token) => {
      throw new Error(`${
        token.position.line
      }:${
        token.position.char
      } Could not parse BNF definition near '${
        token.near()
      }'`)
    }

    const regexprules = []
    const rules = fast.map(fast.reduce(fast.filter(tokenized.tokens, token => {
      return fast.indexOf(['EOL', 'comment'], token.class.name) === -1
    }), (acc, token, i, tokens) => {
      if (i + 1 < tokens.length && tokens[i + 1].class.name === 'rule-decl') {
        acc.push({
          leftHandSide: token,
          rightHandSide: []
        })
      } else if (token.class.name !== 'rule-decl') {
        const lastRule = acc[acc.length - 1]
        if (lastRule !== undefined) {
          const lastRHS = lastRule.rightHandSide[
            lastRule.rightHandSide.length - 1]
          switch (token.class.name) {
            case 'associativity': {
              lastRHS.assoc = parseToken(token)
            } break
            case 'precedence': {
              lastRHS.precedence = parseToken(token)
            } break
            default: {
              lastRule.rightHandSide.push(token)
            }
          }
        } else {
          throwTokenError(token)
        }
      }

      return acc
    }, []), rule => {
      const rightHandSides = fast.reduce(rule.rightHandSide, (acc, token) => {
        if (token.class.name === 'separator') {
          acc.push([])
        } else {
          const lastRHS = acc[acc.length - 1]
          if (lastRHS !== undefined) {
            if (token.class.name === 'string') {
              const tokenValue = parseToken(token)
              if (tokenValue.length === 0) {
                lastRHS.push(new BNF.Terminal(''))
              } else {
                tokenValue.split('').forEach(value => {
                  const terminal = new BNF.Terminal(value)
                  // TODO: revisit this solution, maybe bind these to rules instead of terminals to allow longer operators
                  terminal.assoc = token.assoc
                  terminal.precedence = token.precedence
                  lastRHS.push(terminal)
                })
              }
            } else if (token.class.name === 'regexp') {
              try {
                const regexp = new BNF.RegExp(token.value)
                regexprules.push(regexp)
                lastRHS.push(regexp)
              } catch (e) {
                throwTokenError(token)
              }
            } else if (token.class.name === 'rule-name') {
              lastRHS.push(new RuleReference(token))
            } else {
              throwTokenError(token)
            }
          } else {
            throwTokenError(token)
          }
        }

        return acc
      }, [[]])

      return new BNF.Rule(parseToken(rule.leftHandSide), rightHandSides)
    }).concat(fast.map(parent.lexer.CLASSES, c => {
      return new BNF.Rule('Token-' + c.name, c)
    }))
    const EOF = rules.find(rule => rule.name === 'Token-EOF')
    EOF.nullable = true
    rules.unshift(new BNF.Rule('#S',[[rules[0], EOF]]))

    return fast.map(rules, rule => {
      rule.subrules = fast.map(rule.subrules, subrules => {
        return fast.map(subrules, rule => {
          if (rule instanceof BNF.Rule) {
            return rule
          } else if (rule instanceof BNF.Terminal) {
            return rule
          } else if (rule instanceof BNF.RegExp) {
            return rule
          } else if (rule instanceof RuleReference) {
            const subrule = fast.find(rules, r => r.name === rule.name)
            if (subrule === undefined) {
              throw new Error(`${
                rule.token.position.line
              }:${
                rule.token.position.char
              } Referenced BNF rule named <${
                rule.name
              }> not found`)
            }
            return subrule
          } else {
            throw new Error(`Internal parser error at BNF parsing`)
          }
        })
      })

      return rule
    }).concat(regexprules)
  }
}

BNF.Base = class BNFBase extends Serializable {
  constructor(sid) {
    super(sid)
  }

  match(value) {
    return false
  }

  isEpsilonRule() {
    return false
  }

  isTerminalRule() {
    return false
  }

  isOperator() {
    return false
  }

  printable() {
    return ''
  }

  toString() {
    return this.printable()
  }
}
Serializable.registerSubclass(BNF.Base)

BNF.Rule = class BNFRule extends BNF.Base {
  constructor(name, subrules) {
    super(name ? uuid({
      random: crypto.createHash('md5').update(name).digest()
    }) : undefined)
    this.name = name
    if (subrules instanceof Lexer.TokenClass) {
      this.tokenClass = subrules
      this.subrules = []
    } else {
      this.subrules = subrules
    }
    this.nullable = false
  }

  serialize() {
    return {
      name: this.name,
      subrules: this.subrules,
      tokenClass: this.tokenClass,
      nullable: this.nullable
    }
  }

  deserialize(object) {
    this.$name = object.$data.name
    this.subrules = object.$data.subrules
    this.tokenClass = object.$data.tokenClass
    this.nullable = object.$data.nullable
  }

  get name() {
    return this.$name
  }

  set name(name) {
    this.$name = name
    if (this.name) {
      this.SID = uuid({
        random: crypto.createHash('md5').update(this.name).digest()
      })
    }
  }

  match(value) {
    return this.tokenClass === value.tokenClass
      || this.tokenClass === value.class
  }

  isTerminalRule() {
    return this.tokenClass !== undefined
  }

  printable() {
    return `'${this.name}'`
  }

  id() {
    return `BNFRule_${this.name}`
  }
}
Serializable.registerSubclass(BNF.Rule)

BNF.Terminal = class BNFTerminal extends BNF.Base {
  constructor(value) {
    super(value !== undefined ? uuid({
      random: crypto.createHash('md5').update(value).digest()
    }) : undefined)
    this.value = value
  }

  serialize() {
    return {
      value: this.$value,
      precedence: this.precedence,
      assoc: this.assoc
    }
  }

  deserialize(object) {
    this.$value = object.$data.value
    this.precedence = object.$data.precedence
    this.assoc = object.$data.assoc
  }

  get value() {
    return this.$value
  }

  set value(value) {
    this.$value = value
    if (this.value !== undefined) {
      this.SID = uuid({
        random: crypto.createHash('md5').update(this.value).digest()
      })
    }
  }

  match(value) {
    return this.isEpsilonRule() || this.value === value.value
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

  isOperator() {
    return this.precedence !== undefined ||
           this.assoc !== undefined
  }

  printable() {
    return `'${this.value}'`
  }

  id() {
    return `BNFTerminal_${this.value}`
  }
}
Serializable.registerSubclass(BNF.Terminal)

BNF.RegExp = class BNFRegExp extends BNF.Base {
  constructor(value) {
    super(undefined)
    this.RegExp = value
  }

  serialize() {
    return {
      source: this.$regexp.source,
      flags: this.$regexp.flags
    }
  }

  deserialize(object) {
    this.$regexp = new RegExp(object.$data.source, object.$data.flags)
  }

  get name() {
    return this.value
  }

  get value() {
    return `/${this.RegExp.source}/${this.RegExp.flags}`
  }

  get RegExp() {
    return this.$regexp
  }

  set RegExp(value) {
    if (value instanceof RegExp) {
      this.$regexp = value
    } else {
      const matcher = RegExpMatcher.exec(value)
      this.$regexp = new RegExp(matcher[1], matcher[2])
    }

    if (this.value !== undefined) {
      this.SID = uuid({
        random: crypto.createHash('md5').update(this.value).digest()
      })
    }
  }

  match(value) {
    return this.RegExp.exec(value.value) !== null
  }

  isTerminalRule() {
    return true
  }

  isEpsilonRule() {
    return false
  }

  get nullable() {
    // return false
    return this.RegExp.exec('') !== null
  }

  printable() {
    return `${this.value}`
  }

  id() {
    return `BNFRegExp_${this.value}`
  }
}
Serializable.registerSubclass(BNF.RegExp)

module.exports = BNF
