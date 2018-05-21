const Lexer = require('./lexer')
const crypto = require('crypto')
const fast = require('./faster')

const BNF = require('./bnf.js')
const BRNGLR = require('./brnglr.js')

class Parser {
  constructor(parent, bnf) {
    this._parent = parent
    if (bnf !== undefined) {
      this.setupFromBNF(bnf)
    }
  }

  setupFromBNF(bnf) {
    const RULES = BNF.parse(bnf, this._parent)
    this.setup(RULES)
  }

  setup(RULES) {
    const { ESPPFMAP, ITEMSETS } = BRNGLR.setup(RULES)

    // override original parse
    this.parse = (code) => {
      return BRNGLR.parse(RULES, ESPPFMAP, ITEMSETS, code)
    }
  }

  parse() {
    throw new Error(`Parser.setup() must be called before parse can begin`)
  }

  static get SPPF() {
    return require('./sppf.js')
  }
}

module.exports = Parser
